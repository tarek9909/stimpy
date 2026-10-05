/**
 * Prisma's `contains` becomes `LIKE '%text%'` without escaping, so `%` and `_` typed into a search box would act as
 * wildcards. Escape them with MySQL's default escape character (backslash) before using text in `contains`.
 * (WP-A's own copy: `lib/like.ts` `likeEscape` currently returns the literal text "${c}" instead of a backslash.)
 */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => '\\' + c);
