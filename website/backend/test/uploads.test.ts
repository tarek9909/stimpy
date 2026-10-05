import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { useTestApp, type TestClient, type TestResponse } from './helpers/app';
import { sniffFileType, svgProblem, glbProblem } from '../src/services/uploads';

const t = useTestApp();

type Err = { error: { code: string; fields?: Record<string, string>; details: { maxBytes?: number; allowed?: string[] } | null } };
type UploadBody = { id: number; url: string; mime: string; sizeBytes: number; width: number | null; height: number | null };

const SEED_GLB = join(__dirname, '..', 'seed-assets', 'models', 'hoodie.glb');

/** Hand-built multipart body (the harness client posts raw payloads). */
function form(file: { name?: string; data: Buffer; field?: string; type?: string } | null, fields: Record<string, string> = {}): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----stimpytest' + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? 'file'}"; filename="${file.name ?? 'a.bin'}"\r\nContent-Type: ${file.type ?? 'application/octet-stream'}\r\n\r\n`));
    parts.push(file.data, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

async function upload(c: TestClient, data: Buffer, o: { name?: string; type?: string; purpose?: string; field?: string } = {}): Promise<TestResponse> {
  const { payload, headers } = form({ data, name: o.name, type: o.type, field: o.field }, o.purpose ? { purpose: o.purpose } : {});
  return c.request('POST', '/admin/uploads', { payload, headers });
}

const admin = async (): Promise<TestClient> => (await t.adminClient()).client;
const stored = (url: string): string => join(t.config.uploadDir, new URL(url).pathname.replace(/^\/uploads\//, ''));

const png = (w: number, h: number, alpha = false) =>
  sharp({ create: { width: w, height: h, channels: alpha ? 4 : 3, background: alpha ? { r: 255, g: 0, b: 0, alpha: 0.4 } : { r: 10, g: 120, b: 200 } } }).png().toBuffer();

/** Smallest structurally valid GLB: header + JSON chunk. */
function glb(extraBytes = 0): Buffer {
  const json = Buffer.from('{"asset":{"version":"2.0"}}   ');
  const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + padded.length + extraBytes;
  const head = Buffer.alloc(20);
  head.write('glTF', 0, 'latin1');
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(total, 8);
  head.writeUInt32LE(padded.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, padded, Buffer.alloc(extraBytes)]);
}

const mp4 = (extra = 64) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2mp41'), Buffer.alloc(extra)]);
const webm = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]), Buffer.from('webm'), Buffer.alloc(32)]);

describe('POST /admin/uploads: access', () => {
  it('401 without a session and 403 for a wrong Origin', async () => {
    const { payload, headers } = form({ data: await png(10, 10) });
    expect((await t.client.request('POST', '/admin/uploads', { payload, headers })).status).toBe(401);
    const { client } = await t.adminClient();
    const wrong = await client.request('POST', '/admin/uploads', { payload, headers, origin: 'http://evil.example' });
    expect(wrong.status).toBe(403);
  });
});

describe('POST /admin/uploads: images', () => {
  it('stores a PNG as WebP with a random name, absolute URL, row in uploads, correct response keys', async () => {
    const c = await admin();
    const res = await upload(c, await png(300, 500), { name: 'My Art.png', type: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.header('cache-control')).toBe('no-store');
    const body = res.json<UploadBody>();
    expect(Object.keys(body).sort()).toEqual(['height', 'id', 'mime', 'sizeBytes', 'url', 'width']);
    expect(body).toMatchObject({ mime: 'image/webp', width: 300, height: 500 });
    expect(body.url).toMatch(/^http:\/\/localhost:4000\/uploads\/\d{4}\/\d{2}\/[0-9a-f]{16}\.webp$/);
    expect(existsSync(stored(body.url))).toBe(true);
    expect((await sharp(readFileSync(stored(body.url))).metadata()).format).toBe('webp');
    expect(body.sizeBytes).toBe(readFileSync(stored(body.url)).length);
    const row = await t.prisma.upload.findUniqueOrThrow({ where: { id: body.id } });
    expect(row).toMatchObject({ url: body.url, mime: 'image/webp', width: 300, height: 500, originalName: 'My Art.png' });
    expect(row.createdBy).not.toBeNull();
    expect(row.path).not.toContain('My');
  });

  it('two uploads of the same file get different random names', async () => {
    const c = await admin();
    const data = await png(50, 50);
    const a = (await upload(c, data)).json<UploadBody>();
    const b = (await upload(c, data)).json<UploadBody>();
    expect(a.url).not.toBe(b.url);
  });

  it('resizes to at most 2000 px on the long side, keeping the aspect ratio (landscape and portrait), never enlarging', async () => {
    const c = await admin();
    const wide = (await upload(c, await png(4000, 1000))).json<UploadBody>();
    expect(wide).toMatchObject({ width: 2000, height: 500 });
    const tall = (await upload(c, await png(1500, 3000))).json<UploadBody>();
    expect(tall).toMatchObject({ width: 1000, height: 2000 });
    const small = (await upload(c, await png(120, 80))).json<UploadBody>();
    expect(small).toMatchObject({ width: 120, height: 80 });
    const file = await sharp(readFileSync(stored(wide.url))).metadata();
    expect([file.width, file.height]).toEqual([2000, 500]);
  });

  it('JPEG: auto-rotates by EXIF, strips metadata and converts to WebP', async () => {
    const c = await admin();
    const jpeg = await sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 200, g: 50, b: 50 } } })
      .withExif({ IFD0: { Copyright: 'Secret Photographer', Artist: 'Someone' } })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    expect((await sharp(jpeg).metadata()).orientation).toBe(6);
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();
    const res = await upload(c, jpeg, { name: 'photo.jpg', type: 'image/jpeg' });
    expect(res.status).toBe(201);
    const body = res.json<UploadBody>();
    expect(body).toMatchObject({ mime: 'image/webp', width: 200, height: 400 }); // rotated
    const meta = await sharp(readFileSync(stored(body.url))).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(readFileSync(stored(body.url)).includes(Buffer.from('Secret Photographer'))).toBe(false);
  });

  it('a PNG that uses transparency stays PNG; an opaque PNG becomes WebP; a WebP stays WebP', async () => {
    const c = await admin();
    const t1 = (await upload(c, await png(64, 64, true))).json<UploadBody>();
    expect(t1.mime).toBe('image/png');
    expect(t1.url.endsWith('.png')).toBe(true);
    expect((await sharp(readFileSync(stored(t1.url))).metadata()).hasAlpha).toBe(true);
    const o = (await upload(c, await png(64, 64, false))).json<UploadBody>();
    expect(o.mime).toBe('image/webp');
    const w = (await upload(c, await sharp({ create: { width: 30, height: 40, channels: 3, background: '#fff' } }).webp().toBuffer())).json<UploadBody>();
    expect(w).toMatchObject({ mime: 'image/webp', width: 30, height: 40 });
  });

  it('the type is judged by content: a PNG named .exe with a text/plain header is accepted; HTML named .png is refused', async () => {
    const c = await admin();
    expect((await upload(c, await png(20, 20), { name: 'evil.exe', type: 'text/plain' })).status).toBe(201);
    const html = await upload(c, Buffer.from('<html><script>alert(1)</script></html>'), { name: 'x.png', type: 'image/png' });
    expect(html.status).toBe(415);
    const err = html.json<Err>().error;
    expect(err.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(err.details!.allowed).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm', 'model/gltf-binary']);
  });

  it('refuses unsupported types (GIF, PDF, ZIP, plain text, EXE) with 415 and a list of allowed types', async () => {
    const c = await admin();
    const samples: Buffer[] = [
      Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00', 'latin1'),
      Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1'),
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]),
      Buffer.from('hello world'),
      Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1'),
      Buffer.from([0, 0, 0, 0x18, ...Buffer.from('ftypheic')]), // HEIC is not MP4
      Buffer.alloc(5000, 0x41), // unknown after the sniff window
    ];
    for (const data of samples) {
      const res = await upload(c, data, { name: 'file.png', type: 'image/png' });
      expect(res.status, data.toString('latin1', 0, 8)).toBe(415);
      expect(res.json<Err>().error.code).toBe('UNSUPPORTED_FILE_TYPE');
    }
    expect(await t.prisma.upload.count()).toBe(0);
  });

  it('a corrupt image with a valid signature is refused with 415, not a 500', async () => {
    const c = await admin();
    const res = await upload(c, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('this is not really a jpeg at all')]));
    expect(res.status).toBe(415);
  });

  it('an empty file is a VALIDATION_ERROR on file', async () => {
    const c = await admin();
    const res = await upload(c, Buffer.alloc(0));
    expect(res.status).toBe(400);
    expect(res.json<Err>().error.fields).toEqual({ file: expect.any(String) });
  });
});

describe('POST /admin/uploads: size limits', () => {
  it('image over 10 MB is 413 FILE_TOO_LARGE with details.maxBytes (10 MB exactly is fine)', async () => {
    const c = await admin();
    const head = (await png(10, 10)).subarray(0, 8);
    const over = Buffer.concat([head, Buffer.alloc(10 * 1024 * 1024 + 1 - 8)]);
    const res = await upload(c, over, { name: 'big.png', type: 'image/png' });
    expect(res.status).toBe(413);
    expect(res.json<Err>().error).toMatchObject({ code: 'FILE_TOO_LARGE', details: { maxBytes: 10 * 1024 * 1024 } });
    expect(await t.prisma.upload.count()).toBe(0);

    const big = await sharp({ create: { width: 2400, height: 2400, channels: 3, background: '#123456' } }).jpeg({ quality: 100 }).toBuffer();
    const ok = await upload(c, Buffer.concat([big, Buffer.alloc(Math.max(0, 10 * 1024 * 1024 - big.length))]), { name: 'ok.jpg' }); // JPEG with trailing padding, exactly 10 MB
    expect(ok.status).toBe(201);
  });

  it('GLB over 50 MB is 413 with maxBytes 50 MB; MP4 and WebM accept up to 100 MB', async () => {
    const c = await admin();
    const res = await upload(c, glb(50 * 1024 * 1024 + 1), { name: 'big.glb' });
    expect(res.status).toBe(413);
    expect(res.json<Err>().error.details).toEqual({ maxBytes: 50 * 1024 * 1024 });
    const bigVideo = await upload(c, mp4(11 * 1024 * 1024), { name: 'v.mp4' });
    expect(bigVideo.status).toBe(201); // a video may exceed the 10 MB image limit
    expect(bigVideo.json<UploadBody>().sizeBytes).toBeGreaterThan(11 * 1024 * 1024);
  }, 60_000);

  it('video over 100 MB is 413 with maxBytes 100 MB', async () => {
    const c = await admin();
    const res = await upload(c, mp4(100 * 1024 * 1024), { name: 'huge.mp4' });
    expect(res.status).toBe(413);
    expect(res.json<Err>().error.details).toEqual({ maxBytes: 100 * 1024 * 1024 });
  }, 120_000);
});

describe('POST /admin/uploads: video and models', () => {
  it('stores MP4 and WebM unchanged with null width/height', async () => {
    const c = await admin();
    const v = mp4();
    const a = await upload(c, v, { name: 'clip.mp4', type: 'video/mp4' });
    expect(a.status).toBe(201);
    expect(a.json<UploadBody>()).toMatchObject({ mime: 'video/mp4', width: null, height: null, sizeBytes: v.length });
    expect(readFileSync(stored(a.json<UploadBody>().url)).equals(v)).toBe(true);
    const b = await upload(c, webm(), { name: 'clip.webm' });
    expect(b.json<UploadBody>()).toMatchObject({ mime: 'video/webm', width: null, height: null });
    expect(b.json<UploadBody>().url.endsWith('.webm')).toBe(true);
  });

  it('GLB is validated by its magic bytes and header; purpose builder-model fills sizeBytes on the row', async () => {
    const c = await admin();
    const data = existsSync(SEED_GLB) ? readFileSync(SEED_GLB) : glb(100);
    const res = await upload(c, data, { name: 'hoodie.glb', purpose: 'builder-model' });
    expect(res.status).toBe(201);
    const body = res.json<UploadBody>();
    expect(body).toMatchObject({ mime: 'model/gltf-binary', width: null, height: null, sizeBytes: data.length });
    expect(body.url.endsWith('.glb')).toBe(true);
    expect((await t.prisma.upload.findUniqueOrThrow({ where: { id: body.id } })).sizeBytes).toBe(data.length);
    expect(readFileSync(stored(body.url)).equals(data)).toBe(true);
  });

  it('a file that only starts with "glTF" but has a bad header is refused', async () => {
    const c = await admin();
    const bad = glb(10);
    bad.writeUInt32LE(1, 4); // version 1
    expect((await upload(c, bad)).status).toBe(415);
    const wrongLen = glb(10);
    wrongLen.writeUInt32LE(5, 8);
    expect((await upload(c, wrongLen)).status).toBe(415);
    expect((await upload(c, Buffer.from('glTF'))).status).toBe(415);
  });

  it('purpose builder-model refuses anything but a GLB; purpose must be a slug', async () => {
    const c = await admin();
    const res = await upload(c, await png(10, 10), { purpose: 'builder-model' });
    expect(res.status).toBe(415);
    expect(res.json<Err>().error.details).toEqual({ allowed: ['model/gltf-binary'] });
    const bad = await upload(c, await png(10, 10), { purpose: 'Not A Slug!' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.json<Err>().error.fields!)).toEqual(['purpose']);
    expect((await upload(c, await png(10, 10), { purpose: 'artwork' })).status).toBe(201);
  });
});

describe('POST /admin/uploads: SVG', () => {
  const svg = (inner: string, attrs = 'width="120" height="80" viewBox="0 0 120 80"') =>
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- c -->\n<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`);

  it('accepts a plain SVG as-is, reading its declared size', async () => {
    const c = await admin();
    const data = svg('<rect width="10" height="10" fill="#f00"/><use href="#a"/><g id="a"/>');
    const res = await upload(c, data, { name: 'logo.svg', type: 'image/svg+xml' });
    expect(res.status).toBe(201);
    const body = res.json<UploadBody>();
    expect(body).toMatchObject({ mime: 'image/svg+xml', width: 120, height: 80 });
    expect(body.url.endsWith('.svg')).toBe(true);
    expect(readFileSync(stored(body.url)).equals(data)).toBe(true);
    const vbOnly = await upload(c, svg('<rect/>', 'viewBox="0 0 300 150"'));
    expect(vbOnly.json<UploadBody>()).toMatchObject({ width: 300, height: 150 });
  });

  it('refuses SVGs that run script or load external resources', async () => {
    const c = await admin();
    const bad: Record<string, Buffer> = {
      script: svg('<script>alert(1)</script>'),
      'script (upper case)': svg('<SCRIPT >alert(1)</SCRIPT>'),
      'event handler': svg('<rect onload="alert(1)" width="1" height="1"/>'),
      'javascript url': svg('<a href="javascript:alert(1)"><rect/></a>'),
      foreignObject: svg('<foreignObject><div>hi</div></foreignObject>'),
      'external image': svg('<image href="https://evil.example/x.png"/>'),
      'xlink external': svg('<use xlink:href="http://evil.example/a.svg#x"/>'),
      'css url': svg('<rect style="fill:url(https://evil.example/x)"/>'),
      import: svg('<style>@import "https://evil.example/a.css";</style>'),
      entity: Buffer.from('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>'),
    };
    for (const [name, data] of Object.entries(bad)) {
      const res = await upload(c, data, { name: 'x.svg', type: 'image/svg+xml' });
      expect(res.status, name).toBe(415);
      expect(res.json<Err>().error.code).toBe('UNSUPPORTED_FILE_TYPE');
    }
    expect(await t.prisma.upload.count()).toBe(0);
  });
});

describe('POST /admin/uploads: request shape', () => {
  it('rejects a JSON body, a missing file, a wrong field name, a second file and unknown fields with VALIDATION_ERROR', async () => {
    const c = await admin();
    const json = await c.post('/admin/uploads', { file: 'x' });
    expect(json.status).toBe(400);
    expect(json.json<Err>().error.fields).toHaveProperty('file');

    const none = form(null, { purpose: 'artwork' });
    const noFile = await c.request('POST', '/admin/uploads', { payload: none.payload, headers: none.headers });
    expect(noFile.status).toBe(400);
    expect(noFile.json<Err>().error.fields).toHaveProperty('file');

    const wrong = await upload(c, await png(10, 10), { field: 'image' });
    expect(wrong.status).toBe(400);
    expect(wrong.json<Err>().error.fields).toHaveProperty('image');

    const unknown = form({ data: await png(10, 10) }, { colour: 'red' });
    const res = await c.request('POST', '/admin/uploads', { payload: unknown.payload, headers: unknown.headers });
    expect(res.status).toBe(400);
    expect(res.json<Err>().error.fields).toHaveProperty('colour');
  });

  it('purpose may come before or after the file', async () => {
    const c = await admin();
    const boundary = 'xBOUNDARYx';
    const data = glb(20);
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="m.glb"\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nbuilder-model\r\n--${boundary}--\r\n`),
    ]);
    const res = await c.request('POST', '/admin/uploads', { payload: body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
    expect(res.status).toBe(201);
    expect(res.json<UploadBody>().mime).toBe('model/gltf-binary');
  });

  it('a file name with path parts is reduced to its base name and never used on disk (traversal attempt)', async () => {
    const c = await admin();
    const res = await upload(c, await png(10, 10), { name: '../../../etc/passwd.png' });
    expect(res.status).toBe(201);
    const row = await t.prisma.upload.findUniqueOrThrow({ where: { id: res.json<UploadBody>().id } });
    expect(row.originalName).toBe('passwd.png');
    expect(row.path).toMatch(/^\d{4}\/\d{2}\/[0-9a-f]{16}\.webp$/);
  });
});

describe('uploaded files are served', () => {
  it('GET /uploads/... is immutable-cached with CORS * and nosniff', async () => {
    const c = await admin();
    const body = (await upload(c, await png(20, 20))).json<UploadBody>();
    const res = await t.client.get(new URL(body.url).pathname);
    expect(res.status).toBe(200);
    expect(res.header('access-control-allow-origin')).toBe('*');
    expect(res.header('cache-control')).toContain('immutable');
    expect(res.header('cache-control')).toContain('max-age=31536000');
    expect(res.header('x-content-type-options')).toBe('nosniff');
  });
});

describe('sniffing helpers', () => {
  it('sniffFileType / svgProblem / glbProblem unit checks', () => {
    expect(sniffFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(sniffFileType(Buffer.from('<svg xmlns="x"></svg>'))?.mime).toBe('image/svg+xml');
    expect(sniffFileType(Buffer.from('﻿  <?xml version="1.0"?><svg width="1"/>'))?.mime).toBe('image/svg+xml');
    expect(sniffFileType(Buffer.from('<html><svg></svg></html>'))).toBeNull();
    expect(sniffFileType(Buffer.from([]))).toBeNull();
    expect(svgProblem(Buffer.from('<svg><rect fill="#fff"/></svg>'))).toBeNull();
    expect(svgProblem(Buffer.from('<svg><image href="data:image/png;base64,AAAA"/></svg>'))).toBeNull();
    expect(glbProblem(glb(4))).toBeNull();
  });
});
