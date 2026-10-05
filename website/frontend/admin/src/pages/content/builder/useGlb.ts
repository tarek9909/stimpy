import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { validateHoodieGlb, type GlbReport } from '../../../lib/glbValidator';

export interface GlbState {
  report: GlbReport | null;
  loading: boolean;
  /** The file could not be fetched or read at all. */
  failed: string | null;
  /** Remember the bytes of a file the person just picked (parsed before the upload finishes). */
  pick: (file: File) => void;
  /** Tie the picked bytes to the URL the upload returned, so no re-download is needed. */
  attach: (url: string) => void;
}

/**
 * Parses the model in the browser and validates it against builder.md 7.1 (`lib/glbValidator`). New files are parsed from the
 * chosen `File`; a model that is already saved is downloaded once from its upload URL (public, CORS-enabled).
 */
export function useGlb(url: string | null, panelMesh: string): GlbState {
  const cache = useRef(new Map<string, ArrayBuffer>());
  const pending = useRef<Promise<ArrayBuffer> | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const pick = useCallback((file: File) => {
    pending.current = file.arrayBuffer();
  }, []);
  const attach = useCallback((u: string) => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    void p.then((buf) => {
      cache.current.set(u, buf);
      setVersion((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    if (!url || cache.current.has(url)) {
      setFailed(null);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(null);
    fetch(url, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        cache.current.set(url, buf);
        setVersion((v) => v + 1);
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setFailed("Couldn't download the model to check it.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [url]);

  const report = useMemo(() => {
    const buf = url ? cache.current.get(url) : undefined;
    if (!buf) return null;
    try {
      return validateHoodieGlb(buf, { panelMesh });
    } catch {
      return { ok: false, errors: ['The file could not be read as a GLB.'], warnings: [], stats: { sizeBytes: buf.byteLength } } satisfies GlbReport;
    }
    // `version` re-runs this when the cache changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, panelMesh, version]);

  return { report, loading, failed, pick, attach };
}
