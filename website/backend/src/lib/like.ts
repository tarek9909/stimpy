/**
 * Prisma's `contains` passes the text to `LIKE '%text%'` without escaping, so `%` and `_` typed by a user would act as
 * wildcards. Escape them (MySQL's default escape character is the backslash) before using text in `contains`.
 */
const BACKSLASH = String.fromCharCode(92);
export const likeEscape = (s: string): string => s.split(BACKSLASH).join(BACKSLASH + BACKSLASH).replace(/[%_]/g, (c) => BACKSLASH + c);
