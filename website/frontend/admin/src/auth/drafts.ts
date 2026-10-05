/**
 * Unsaved-form drafts across a session expiry (auth-and-sessions 2.3). Dirty forms register a
 * getter; when the session ends, each writes its values to `sessionStorage` under
 * `stimpy.draft:<route path>` (JSON, excluding password fields and file objects). After login the
 * page restores it with a banner. Drafts expire after 30 minutes and are removed on successful
 * save, on Discard and on logout. `sessionStorage` access is always wrapped in try/catch.
 */
export const DRAFT_PREFIX = 'stimpy.draft:';
export const DRAFT_TTL_MS = 30 * 60 * 1000;

export type DraftValues = Record<string, unknown>;
type Source = () => DraftValues | null;

const sources = new Map<string, Source>();

/** Registers a dirty form for `path`. Returns the unregister function (call on unmount). */
export function registerDraftSource(path: string, getValues: Source): () => void {
  sources.set(path, getValues);
  return () => {
    if (sources.get(path) === getValues) sources.delete(path);
  };
}

const SECRET_KEY = /pass(word|phrase)?|secret|token/i;

/** Strips secrets and non-serialisable values: password fields, File/Blob, functions. */
export function sanitizeDraft(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof File !== 'undefined' && value instanceof File) return undefined;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined;
  if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((v) => sanitizeDraft(v, depth + 1)).filter((v) => v !== undefined);
  if (typeof value === 'object') {
    const out: DraftValues = {};
    for (const [k, v] of Object.entries(value as DraftValues)) {
      if (SECRET_KEY.test(k)) continue;
      const clean = sanitizeDraft(v, depth + 1);
      if (clean !== undefined) out[k] = clean;
    }
    return out;
  }
  return undefined;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export interface StoredDraft {
  savedAt: number;
  values: DraftValues;
}

export function saveDraft(path: string, values: DraftValues, now: number = Date.now()): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const clean = sanitizeDraft(values) as DraftValues;
    const stored: StoredDraft = { savedAt: now, values: clean };
    s.setItem(DRAFT_PREFIX + path, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

/** Reads a draft; expired or corrupt drafts are deleted and read as null. */
export function readDraft(path: string, now: number = Date.now()): StoredDraft | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(DRAFT_PREFIX + path);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || typeof parsed.savedAt !== 'number' || typeof parsed.values !== 'object' || parsed.values === null) {
      s.removeItem(DRAFT_PREFIX + path);
      return null;
    }
    if (now - parsed.savedAt > DRAFT_TTL_MS) {
      s.removeItem(DRAFT_PREFIX + path);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(path: string): void {
  try {
    storage()?.removeItem(DRAFT_PREFIX + path);
  } catch {
    /* ignore */
  }
}

export function clearAllDrafts(): void {
  const s = storage();
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i += 1) {
      const key = s.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) keys.push(key);
    }
    keys.forEach((k) => s.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** Called by the session-expired flow before navigating: every registered dirty form saves itself. */
export function saveAllDrafts(): void {
  for (const [path, getValues] of sources) {
    try {
      const values = getValues();
      if (values) saveDraft(path, values);
    } catch {
      /* a broken form must not block the redirect */
    }
  }
}
