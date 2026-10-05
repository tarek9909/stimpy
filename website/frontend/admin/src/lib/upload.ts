import { ApiError, errorFromResponse, type components } from '@stimpy/api-client';
import { getEnv } from '../env';
import { notifySessionExpired } from '../auth/expiry';

/**
 * Upload rules mirrored from the server (auth-and-sessions 6.3, api-reference 5.4). The client
 * checks are a convenience: the server judges by file content and its errors are always shown.
 */
export type UploadKind = 'image' | 'model' | 'video';

export interface UploadRule {
  kind: UploadKind;
  maxBytes: number;
  extensions: string[];
  mimes: string[];
  /** "JPG, PNG, WebP or SVG" */
  typesLabel: string;
  /** Value of the `<input accept>` attribute. */
  accept: string;
  /** Extra sentence shown under the control. */
  note: string;
}

const MB = 1024 * 1024;

export const UPLOAD_RULES: Record<UploadKind, UploadRule> = {
  image: {
    kind: 'image',
    maxBytes: 10 * MB,
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'svg'],
    mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    typesLabel: 'JPG, PNG, WebP or SVG',
    accept: 'image/jpeg,image/png,image/webp,image/svg+xml,.jpg,.jpeg,.png,.webp,.svg',
    note: 'Images larger than 2000 px are resized.',
  },
  video: {
    kind: 'video',
    maxBytes: 100 * MB,
    extensions: ['mp4', 'webm'],
    mimes: ['video/mp4', 'video/webm'],
    typesLabel: 'MP4 or WebM',
    accept: 'video/mp4,video/webm,.mp4,.webm',
    note: 'Keep videos short: they load on phones.',
  },
  model: {
    kind: 'model',
    maxBytes: 50 * MB,
    extensions: ['glb'],
    // Browsers often report .glb as application/octet-stream, so the extension is what counts.
    mimes: ['model/gltf-binary', 'application/octet-stream'],
    typesLabel: '.glb',
    accept: '.glb,model/gltf-binary',
    note: 'Binary glTF (.glb) only.',
  },
};

export function formatBytes(bytes: number): string {
  if (bytes >= MB) {
    const mb = bytes / MB;
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export type FileProblemCode = 'EMPTY' | 'TOO_LARGE' | 'TYPE' | 'GLB_HEADER' | 'MULTIPLE';
export interface FileProblem {
  code: FileProblemCode;
  message: string;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** glTF binary magic: the first four bytes are `glTF` (0x67 0x6C 0x54 0x46). */
async function hasGlbMagic(file: File): Promise<boolean> {
  try {
    const part = file.slice(0, 4);
    const buffer =
      typeof part.arrayBuffer === 'function'
        ? await part.arrayBuffer()
        : await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(part);
          });
    const head = new Uint8Array(buffer);
    return head.length === 4 && head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46;
  } catch {
    return false;
  }
}

/**
 * Client-side checks for one file. Returns the first problem, or null.
 * Extension and MIME type are both consulted: the file passes the type check when EITHER is on the
 * allowed list (a renamed executable still fails on the server, which reads the content).
 */
export async function validateFile(file: File, kind: UploadKind): Promise<FileProblem | null> {
  const rule = UPLOAD_RULES[kind];
  if (file.size === 0) return { code: 'EMPTY', message: 'That file is empty.' };
  const extOk = rule.extensions.includes(extensionOf(file.name));
  const mimeOk = !!file.type && rule.mimes.includes(file.type);
  // octet-stream says nothing about the content: for models only the extension counts.
  const mimeCounts = kind === 'model' ? false : mimeOk;
  if (!extOk && !mimeCounts) {
    return { code: 'TYPE', message: `That file type isn't supported. Use ${rule.typesLabel}.` };
  }
  if (file.size > rule.maxBytes) {
    return { code: 'TOO_LARGE', message: `That file is too large (max ${formatBytes(rule.maxBytes)}).` };
  }
  if (kind === 'model' && !(await hasGlbMagic(file))) {
    return { code: 'GLB_HEADER', message: "That doesn't look like a .glb model file." };
  }
  return null;
}

/** `POST /admin/uploads` response (api-reference 5.4): `{ id, url, mime, sizeBytes, width, height }`. */
export type UploadResult = components['schemas']['Upload'];

export interface UploadOptions {
  /** Optional `purpose` form field (e.g. `builder-model`). */
  purpose?: string;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export type UploadFn = (file: File, options?: UploadOptions) => Promise<UploadResult>;

const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Multipart upload with progress (XMLHttpRequest: `fetch` cannot report upload progress).
 * Cookie included, `Content-Type` left to the browser (it sets the boundary). Failures throw the
 * same `ApiError` as every other call, so 413 / 415 / 429 / 401 follow the global mapping.
 */
export const uploadFile: UploadFn = (file, options = {}) =>
  new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${getEnv().apiBaseUrl}/admin/uploads`;
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.responseType = 'text';

    const form = new FormData();
    form.append('file', file);
    if (options.purpose) form.append('purpose', options.purpose);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) options.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      const headers = new Headers();
      for (const name of ['X-Request-Id', 'Retry-After', 'Content-Type']) {
        const v = xhr.getResponseHeader(name);
        if (v) headers.set(name, v);
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult);
        } catch {
          reject(new ApiError({ status: xhr.status, code: 'BAD_RESPONSE', message: 'The server sent an unexpected response.' }));
        }
        return;
      }
      void errorFromResponse(new Response(xhr.responseText, { status: xhr.status, headers })).then((err) => {
        if (err.code === 'UNAUTHENTICATED') notifySessionExpired({ method: 'POST' });
        reject(err);
      });
    };
    xhr.onerror = () => reject(new ApiError({ status: 0, code: 'NETWORK', message: 'You seem to be offline.' }));
    xhr.ontimeout = () => reject(new ApiError({ status: 0, code: 'TIMEOUT', message: "That's taking longer than usual." }));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException('Upload cancelled', 'AbortError'));
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });

/** Width / height of an uploaded Stimpie artwork against the 0.64 panel (builder.md 7.4). */
export const STIMPIE_PANEL_ASPECT = 0.64;

/** True when the artwork is more than 2 % off the panel aspect (the Builder would crop it). */
export function artworkAspectWarning(width: number | null | undefined, height: number | null | undefined, panelAspect: number = STIMPIE_PANEL_ASPECT): boolean {
  if (!width || !height) return false;
  const ratio = width / height;
  return Math.abs(ratio - panelAspect) / panelAspect > 0.02;
}
