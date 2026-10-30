import type { BuilderView } from '../types';

export interface ShareParams {
  colorId: number | null;
  stimpie: string | null;
  stimpie2: string | null;
  /** Full ordered selection, including repeated slugs for Stimpies-only offers. */
  stimpies: string[];
  pack: string | null;
  mode: 'hoodie-only' | 'hoodie-set' | 'stimpie-only' | null;
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
  const listRaw = one(raw, 'stimpies');
  const stimpies = listRaw
    ? listRaw.split(',').flatMap((rawToken) => {
        const token = rawToken.trim().toLowerCase();
        const compact = /^([a-z0-9][a-z0-9-]{0,80}):([1-9]\d{0,6})$/.exec(token);
        if (compact && SLUG.test(compact[1]!)) return Array.from({ length: Math.min(200, Number(compact[2])) }, () => compact[1]!);
        return SLUG.test(token) ? [token] : [];
      }).slice(0, 200)
    : [];
  const modeRaw = one(raw, 'mode')?.toLowerCase();
  const view = one(raw, 'view')?.toLowerCase();
  const stimpie = slug('stimpie');
  const stimpie2 = slug('stimpie2');
  return {
    colorId,
    stimpie: stimpies[0] ?? stimpie,
    stimpie2: stimpies[1] ?? stimpie2,
    stimpies: stimpies.length ? stimpies : [stimpie, stimpie2].filter((v): v is string => !!v),
    pack: slug('pack'),
    mode: modeRaw === 'hoodie-only' || modeRaw === 'hoodie-set' || modeRaw === 'stimpie-only' ? modeRaw : null,
    view: view === '2d' || view === '3d' ? view : null,
  };
}

export interface ShareState {
  colorId: number | null;
  stimpie: string | null;
  stimpie2?: string | null;
  /** Full ordered selection. Repeated slugs encode multiple units of one design. */
  stimpies?: readonly string[];
  pack?: string | null;
  mode?: 'hoodie-only' | 'hoodie-set' | 'stimpie-only' | null;
  view?: BuilderView | null;
}

/** Query string (without `?`) for the current selection. Keys with no value are omitted. */
export function buildShareQuery(state: ShareState): string {
  const q = new URLSearchParams();
  if (state.colorId !== null) q.set('color', String(state.colorId));
  const stimpies = state.stimpies?.length ? state.stimpies : [state.stimpie, state.stimpie2].filter((v): v is string => !!v);
  if (stimpies.length > 2 || state.mode === 'stimpie-only') {
    const counts = new Map<string, number>();
    for (const slug of stimpies) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    q.set('stimpies', [...counts].map(([slug, qty]) => `${slug}:${qty}`).join(','));
  }
  else {
    if (stimpies[0]) q.set('stimpie', stimpies[0]);
    if (stimpies[1]) q.set('stimpie2', stimpies[1]);
  }
  if (state.pack) q.set('pack', state.pack);
  if (state.mode) q.set('mode', state.mode);
  if (state.view) q.set('view', state.view);
  return q.toString();
}

/** `<base>?color=..&stimpie=..` (base is e.g. `https://stimpy.example/builder`). */
export function buildShareUrl(base: string, state: ShareState): string {
  const q = buildShareQuery(state);
  return q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base;
}
