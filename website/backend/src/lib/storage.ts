import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';

/**
 * File storage adapter (integrations.md section 6). Local disk now; S3/R2 later only needs another implementation.
 * Stored `path` is relative ("2026/10/ab12cd34ef56ab78.webp"); `url` is always absolute.
 */
export interface Storage {
  /** Stores a buffer under a fresh random path `YYYY/MM/<16 hex>.<ext>`. */
  put(buffer: Buffer, ext: string, mime: string): Promise<{ path: string; url: string }>;
  /** Stores a buffer at an exact path (used by the seed for content-addressed files). */
  putAt(path: string, buffer: Buffer, mime: string): Promise<{ path: string; url: string }>;
  delete(path: string): Promise<void>;
  url(path: string): string;
}

export class LocalStorage implements Storage {
  constructor(
    private readonly rootDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  url(path: string): string {
    return `${this.publicBaseUrl.replace(/\/+$/, '')}/uploads/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  async put(buffer: Buffer, ext: string, mime: string): Promise<{ path: string; url: string }> {
    const d = new Date();
    const path = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(8).toString('hex')}.${ext.replace(/^\./, '')}`;
    return this.putAt(path, buffer, mime);
  }

  async putAt(path: string, buffer: Buffer, _mime: string): Promise<{ path: string; url: string }> {
    const full = this.resolveSafe(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, buffer);
    return { path, url: this.url(path) };
  }

  async delete(path: string): Promise<void> {
    await rm(this.resolveSafe(path), { force: true });
  }

  /** Refuses any path that would escape the upload directory. */
  private resolveSafe(path: string): string {
    const full = normalize(join(this.rootDir, path));
    if (!full.startsWith(normalize(this.rootDir) + sep)) throw new Error('Invalid storage path');
    return full;
  }
}
