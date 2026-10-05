import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Filters, tabs, search text, sort and page live in the URL (dashboard-pages 1.3) so refresh, back
 * and shared links restore the view. Describe the parameters once with `ParamDef`s:
 *
 *   const defs = { tab: enumParam(['hoodies', 'stimpies'], 'hoodies'), page: intParam(1, { min: 1 }), q: stringParam() };
 *   const [params, setParams] = useUrlState(defs);
 *   setParams({ q: 'abc' });                    // resets page to 1, replaces history entry when asked
 *   setParams({ tab: 'stimpies' }, { replace: true });
 *
 * Values equal to their default are omitted from the URL. Unknown or invalid values fall back to
 * the default (no error page). Changing any parameter other than `page` resets `page`.
 */
export interface ParamDef<T> {
  parse(raw: string | null): T;
  /** `null` removes the parameter. */
  serialize(value: T): string | null;
  equals(a: T, b: T): boolean;
  readonly defaultValue: T;
}

export type ParamDefs = Record<string, ParamDef<unknown>>;
export type ParamValues<D extends ParamDefs> = { [K in keyof D]: D[K] extends ParamDef<infer T> ? T : never };

export function stringParam(defaultValue = ''): ParamDef<string> {
  return {
    defaultValue,
    parse: (raw) => (raw === null ? defaultValue : raw),
    serialize: (v) => (v === '' || v === defaultValue ? null : v),
    equals: (a, b) => a === b,
  };
}

export function intParam(defaultValue: number, opts: { min?: number; max?: number } = {}): ParamDef<number> {
  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = opts;
  return {
    defaultValue,
    parse: (raw) => {
      if (raw === null || !/^-?\d+$/.test(raw)) return defaultValue;
      const n = Number(raw);
      return n >= min && n <= max ? n : defaultValue;
    },
    serialize: (v) => (v === defaultValue ? null : String(v)),
    equals: (a, b) => a === b,
  };
}

export function enumParam<V extends string>(values: readonly V[], defaultValue: V): ParamDef<V> {
  return {
    defaultValue,
    parse: (raw) => (raw !== null && (values as readonly string[]).includes(raw) ? (raw as V) : defaultValue),
    serialize: (v) => (v === defaultValue ? null : v),
    equals: (a, b) => a === b,
  };
}

/** `?holdExpired=true`. Anything else is false. */
export function boolParam(defaultValue = false): ParamDef<boolean> {
  return {
    defaultValue,
    parse: (raw) => (raw === 'true' ? true : raw === 'false' ? false : defaultValue),
    serialize: (v) => (v === defaultValue ? null : String(v)),
    equals: (a, b) => a === b,
  };
}

/** Optional filter: a number or null (e.g. `?areaId=3`). */
export function optionalIntParam(): ParamDef<number | null> {
  return {
    defaultValue: null,
    parse: (raw) => (raw !== null && /^\d+$/.test(raw) ? Number(raw) : null),
    serialize: (v) => (v === null ? null : String(v)),
    equals: (a, b) => a === b,
  };
}

/** Optional string filter: a value or null. */
export function optionalStringParam(): ParamDef<string | null> {
  return {
    defaultValue: null,
    parse: (raw) => (raw === null || raw === '' ? null : raw),
    serialize: (v) => (v === null || v === '' ? null : v),
    equals: (a, b) => a === b,
  };
}

/** `?status=CONFIRMED,PACKED` as a list. */
export function csvParam(defaultValue: string[] = []): ParamDef<string[]> {
  return {
    defaultValue,
    parse: (raw) => (raw === null || raw === '' ? defaultValue : raw.split(',').filter(Boolean)),
    serialize: (v) => (v.length === 0 || v.join(',') === defaultValue.join(',') ? null : v.join(',')),
    equals: (a, b) => a.join(',') === b.join(','),
  };
}

/** Reads every defined parameter from a query string (or URLSearchParams). */
export function readParams<D extends ParamDefs>(search: string | URLSearchParams, defs: D): ParamValues<D> {
  const sp = typeof search === 'string' ? new URLSearchParams(search) : search;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(defs)) out[key] = (defs[key] as ParamDef<unknown>).parse(sp.get(key));
  return out as ParamValues<D>;
}

export interface ApplyOptions {
  /** Name of the page parameter that is reset when something else changes. Default `page`. */
  pageKey?: string;
}

/**
 * Pure: the new query string after applying `patch` on top of `current`. Parameters that are not
 * described by `defs` (e.g. `returnTo`, `highlight`) are preserved untouched.
 */
export function applyParams<D extends ParamDefs>(
  current: URLSearchParams,
  patch: Partial<ParamValues<D>>,
  defs: D,
  { pageKey = 'page' }: ApplyOptions = {},
): URLSearchParams {
  const next = new URLSearchParams(current);
  const keys = Object.keys(patch);
  const resetPage = pageKey in defs && keys.some((k) => k !== pageKey) && !(pageKey in patch);
  const write = (key: string, value: unknown) => {
    const def = defs[key] as ParamDef<unknown> | undefined;
    if (!def) return;
    const serialized = def.serialize(value);
    if (serialized === null) next.delete(key);
    else next.set(key, serialized);
  };
  for (const key of keys) write(key, (patch as Record<string, unknown>)[key]);
  if (resetPage) next.delete(pageKey);
  return next;
}

export interface SetParamsOptions {
  /** `replace` instead of `push`. Use while typing in a search box. */
  replace?: boolean;
}

export function useUrlState<D extends ParamDefs>(
  defs: D,
  options: ApplyOptions = {},
): [ParamValues<D>, (patch: Partial<ParamValues<D>>, opts?: SetParamsOptions) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const values = useMemo(() => readParams(searchParams, defs), [searchParams, defs]);
  const { pageKey } = options;
  const set = useCallback(
    (patch: Partial<ParamValues<D>>, opts: SetParamsOptions = {}) => {
      setSearchParams((prev) => applyParams(prev, patch, defs, { pageKey }), { replace: opts.replace ?? false });
    },
    [defs, pageKey, setSearchParams],
  );
  return [values, set];
}

/** `{ page, pageSize }` the way the API wants them. Pair with `Pagination`. */
export const paginationParams = {
  page: intParam(1, { min: 1 }),
  pageSize: intParam(25, { min: 1, max: 100 }),
} as const;

/** Count of non-default parameters among `keys` (for the "Filters (3)" badge). */
export function countActive<D extends ParamDefs>(values: ParamValues<D>, defs: D, keys: Array<keyof D>): number {
  return keys.filter((k) => {
    const def = defs[k as string] as ParamDef<unknown>;
    return !def.equals(values[k], def.defaultValue);
  }).length;
}

/** The `sort` query value the API wants (`-placedAt` descending) from a column and direction. */
export function toSortParam(field: string, direction: 'asc' | 'desc'): string {
  return direction === 'desc' ? `-${field}` : field;
}

export function fromSortParam(sort: string): { field: string; direction: 'asc' | 'desc' } | null {
  if (!sort) return null;
  return sort.startsWith('-') ? { field: sort.slice(1), direction: 'desc' } : { field: sort, direction: 'asc' };
}
