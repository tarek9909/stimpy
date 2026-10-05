import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
export const REAL_GLB = resolve(REPO_ROOT, 'website/backend/seed-assets/models/hoodie.glb');
export const TMP = resolve(process.env.E2E_TMP_DIR ?? resolve(tmpdir(), 'stimpy-e2e-files'));
mkdirSync(TMP, { recursive: true });

/** Rebuilds a GLB after `mutate` edited its JSON chunk (the BIN chunk is kept). Used to make deliberately invalid models. */
export function tamperedGlb(name: string, mutate: (json: Record<string, unknown>) => void): string {
  const bytes = new Uint8Array(readFileSync(REAL_GLB));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen))) as Record<string, unknown>;
  mutate(json);
  let text = JSON.stringify(json);
  while (new TextEncoder().encode(text).length % 4) text += ' ';
  const jsonBytes = new TextEncoder().encode(text);
  const binOff = 20 + jsonLen + ((4 - (jsonLen % 4)) % 4);
  const binLen = dv.getUint32(binOff, true);
  const bin = bytes.subarray(binOff + 8, binOff + 8 + binLen);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true);
  o.setUint32(4, 2, true);
  o.setUint32(8, total, true);
  o.setUint32(12, jsonBytes.length, true);
  o.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const bo = 20 + jsonBytes.length;
  o.setUint32(bo, bin.length, true);
  o.setUint32(bo + 4, 0x004e4942, true);
  out.set(bin, bo + 8);
  const path = `${TMP}/${name}.glb`;
  writeFileSync(path, out);
  return path;
}

export function notAGlb(name: string): string {
  const path = `${TMP}/${name}.glb`;
  writeFileSync(path, 'this is plain text, not a model');
  return path;
}
