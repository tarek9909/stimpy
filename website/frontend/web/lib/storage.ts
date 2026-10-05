/**
 * Every localStorage / sessionStorage access goes through here: in-app browsers (Instagram, Facebook)
 * and private windows throw on access or when the quota is full. Failures degrade to an in-memory map
 * for the page lifetime (state-and-errors 2.3, checkout-and-order-flow 1.2).
 */

type Kind = 'local' | 'session';

const memory: Record<Kind, Map<string, string>> = { local: new Map(), session: new Map() };
const warned: Record<Kind, boolean> = { local: false, session: false };

function backing(kind: Kind): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** True when the browser really persists data of this kind (probe write). */
export function storageAvailable(kind: Kind = 'local'): boolean {
  const s = backing(kind);
  if (!s) return false;
  try {
    const probe = '__stimpy_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function readStored(kind: Kind, key: string): string | null {
  if (memory[kind].has(key)) return memory[kind].get(key) ?? null;
  const s = backing(kind);
  if (s) {
    try {
      return s.getItem(key);
    } catch {
      /* fall through to memory */
    }
  }
  return memory[kind].get(key) ?? null;
}

/** Drop one fallback value after a real cross-tab storage event so the persisted last write wins. */
export function forgetMemoryStored(kind: Kind, key: string): void {
  memory[kind].delete(key);
}

/** Returns false when the value could only be kept in memory. */
export function writeStored(kind: Kind, key: string, value: string): boolean {
  const s = backing(kind);
  if (s) {
    try {
      s.setItem(key, value);
      memory[kind].delete(key);
      return true;
    } catch {
      if (!warned[kind]) {
        warned[kind] = true;
        // eslint-disable-next-line no-console -- one quiet diagnostic
        console.warn(`[stimpy:web] ${kind}Storage is unavailable; data is kept in memory only.`);
      }
    }
  }
  memory[kind].set(key, value);
  return false;
}

export function removeStored(kind: Kind, key: string): void {
  memory[kind].delete(key);
  const s = backing(kind);
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Test helper: forget the in-memory fallbacks. */
export function resetMemoryStorage(): void {
  memory.local.clear();
  memory.session.clear();
  warned.local = false;
  warned.session = false;
}
