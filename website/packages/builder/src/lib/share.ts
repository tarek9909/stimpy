import type { BuilderView } from '../types';

export interface ShareParams {
  colorId: number | null;
  stimpie: string | null;
  stimpie2: string | null;
  pack: string | null;
  view: BuilderView | null;
}

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

function one(raw: Raw, key: string): string | undefined {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? undefined;
  const v = raw[key];
  return Array.isArray(v) ? v[0] : v;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** Parse `?color=<id>&stimpie=<slug>&pack=<slug>&stimpie2=<slug>&view=2d|3d`. Invalid values become null (never an error). */
export function parseShareParams(raw: Raw): ShareParams {
  const color = one(raw, 'color');
  const colorId = color && /^\d{1,9}$/.test(color) && Number(color) > 0 ? Number(color) : null;
  const slug = (k: string): string | null => {
    const v = one(raw, k)?.trim().toLowerCase();
    return v && SLUG.test(v) ? v : null;
  };
  const view = one(raw, 'view')?.toLowerCase();
  return {
    colorId,
    stimpie: slug('stimpie'),
    stimpie2: slug('stimpie2'),
    pack: slug('pack'),
    view: view === '2d' || view === '3d' ? view : null,
  };
}

export interface ShareState {
  colorId: number | null;
  stimpie: string | null;
  stimpie2?: string | null;
  pack?: string | null;
  view?: BuilderView | null;
}

/** Query string (without `?`) for the current selection. Keys with no value are omitted. */
export function buildShareQuery(state: ShareState): string {
  const q = new URLSearchParams();
  if (state.colorId !== null) q.set('color', String(state.colorId));
  if (state.stimpie) q.set('stimpie', state.stimpie);
  if (state.pack) q.set('pack', state.pack);
  if (state.stimpie2) q.set('stimpie2', state.stimpie2);
  if (state.view) q.set('view', state.view);
  return q.toString();
}

/** `<base>?color=..&stimpie=..` (base is e.g. `https://stimpy.example/builder`). */
export function buildShareUrl(base: string, state: ShareState): string {
  const q = buildShareQuery(state);
  return q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base;
}
