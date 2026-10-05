import { createHash, randomBytes } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import type { AdminSession, AdminUser } from '@prisma/client';
import type { AppContext } from '../context';
import { AppError } from '../lib/errors';
import { DAY, addMs, now } from '../lib/clock';
import { RATE_RULES, rateLimiter } from '../lib/rate-limiter';

export const SESSION_COOKIE = 'stimpy_session';
/** Sliding window: each use extends expiry to now + 7 days ... */
export const SESSION_SLIDING_MS = 7 * DAY;
/** ... but never beyond 30 days after login. */
export const SESSION_ABSOLUTE_MS = 30 * DAY;
export const MIN_PASSWORD_LENGTH = 12;

// Argon2id (the library default algorithm) with OWASP-recommended cost: 19 MiB, 2 passes, 1 lane.
const ARGON_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string): Promise<string> => argonHash(password, ARGON_OPTIONS);

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password);
  } catch {
    return false;
  }
}

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const newToken = (): string => randomBytes(32).toString('base64url');

let dummyHash: Promise<string> | null = null;
/** Verified against when the e-mail is unknown, so unknown-email and wrong-password take the same time. */
const getDummyHash = (): Promise<string> => (dummyHash ??= hashPassword('not-a-real-password-for-timing-only'));

export type PublicUser = { id: number; email: string; name: string; role: AdminUser['role'] };
export const toPublicUser = (u: AdminUser): PublicUser => ({ id: u.id, email: u.email, name: u.name, role: u.role });

/** A short list of passwords that satisfy the length rule but are still unacceptable. Compared case-insensitively. */
const COMMON_PASSWORDS = new Set([
  'password1234', 'password12345', 'password123456', 'passw0rd1234', 'passwordpassword', '123456789012', '1234567890123',
  '12345678901234', '123123123123', '111111111111', '000000000000', 'aaaaaaaaaaaa', 'qwertyuiop12', 'qwertyuiop123',
  'qwertyuiopas', 'qwertyuiop[]', '1q2w3e4r5t6y', 'qazwsxedcrfv', 'asdfghjkl123', 'zxcvbnm12345', 'abcdefghijkl',
  'abc123456789', 'iloveyou1234', 'welcome12345', 'letmein12345', 'changeme1234', 'changemechangeme', 'administrator',
  'administrator1', 'admin1234567', 'adminadmin12', 'stimpy123456', 'stimpystimpy', 'stimpypassword', 'monkey123456',
  'football1234', 'baseball1234', 'dragon123456', 'master123456', 'sunshine1234', 'princess1234', 'trustno1trustno1',
  'superman1234', 'whatever1234', 'freedom12345', 'starwars1234', 'lebanon12345', 'beirut123456', 'stimpy-dev-password-1',
]);

export const isCommonPassword = (p: string): boolean => COMMON_PASSWORDS.has(p.toLowerCase());

const INVALID_CREDENTIALS = 'Email or password is incorrect.';

export type LoginInput = { email: string; password: string; ip: string; userAgent?: string };

/**
 * Login: rate limited per IP and per e-mail, generic failure, equal timing for unknown e-mail.
 * Returns the raw token (to be put in the cookie once) and the user.
 */
export async function login(ctx: AppContext, input: LoginInput): Promise<{ token: string; user: AdminUser; session: AdminSession }> {
  const emailKey = input.email.trim().toLowerCase();
  rateLimiter.enforce(RATE_RULES.loginIp, input.ip);
  rateLimiter.enforce(RATE_RULES.loginEmail, emailKey);

  const user = await ctx.prisma.adminUser.findUnique({ where: { email: input.email.trim() } });
  const ok = await verifyPassword(user ? user.passwordHash : await getDummyHash(), input.password);
  if (!user || !ok) throw new AppError('UNAUTHENTICATED', 401, INVALID_CREDENTIALS);

  rateLimiter.reset(RATE_RULES.loginEmail, emailKey);
  const created = await createSession(ctx, user.id, input.userAgent);
  return { ...created, user };
}

export async function createSession(ctx: AppContext, userId: number, userAgent?: string): Promise<{ token: string; session: AdminSession }> {
  const token = newToken();
  const t = now();
  const session = await ctx.prisma.adminSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: addMs(t, SESSION_SLIDING_MS),
      absoluteExpiresAt: addMs(t, SESSION_ABSOLUTE_MS),
      lastUsedAt: t,
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
    },
  });
  return { token, session };
}

/**
 * Resolves a cookie token to a live session and slides its expiry. Returns null when the token is unknown or the
 * session is past its sliding or absolute expiry (the expired row is deleted).
 */
export async function authenticate(ctx: AppContext, token: string | undefined): Promise<{ user: AdminUser; session: AdminSession } | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const row = await ctx.prisma.adminSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row) return null;
  const t = now();
  if (row.expiresAt <= t || row.absoluteExpiresAt <= t) {
    await ctx.prisma.adminSession.deleteMany({ where: { id: row.id } });
    return null;
  }
  const slid = new Date(Math.min(addMs(t, SESSION_SLIDING_MS).getTime(), row.absoluteExpiresAt.getTime()));
  const { user, ...sessionRow } = row;
  const session = await ctx.prisma.adminSession.update({ where: { id: row.id }, data: { expiresAt: slid, lastUsedAt: t } }).catch(() => ({ ...sessionRow, expiresAt: slid, lastUsedAt: t }));
  return { user, session };
}

/** Ends the session behind a token (no error if it does not exist). */
export async function endSession(ctx: AppContext, token: string | undefined): Promise<void> {
  if (!token) return;
  await ctx.prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export type ChangePasswordInput = { userId: number; sessionId: number; currentPassword: string; newPassword: string };

/**
 * Wrong current password => VALIDATION_ERROR on `currentPassword` (never 401). Ends every OTHER session of the user.
 */
export async function changePassword(ctx: AppContext, input: ChangePasswordInput): Promise<void> {
  rateLimiter.enforce(RATE_RULES.changePassword, String(input.userId));
  const user = await ctx.prisma.adminUser.findUnique({ where: { id: input.userId } });
  if (!user) throw AppError.unauthenticated();
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw AppError.validation({ currentPassword: 'Current password is incorrect.' });
  }
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    throw AppError.validation({ newPassword: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  if (isCommonPassword(input.newPassword)) {
    throw AppError.validation({ newPassword: 'That password is too common. Choose a different one.' });
  }
  if (input.newPassword === input.currentPassword) {
    throw AppError.validation({ newPassword: 'Choose a password different from the current one.' });
  }
  const passwordHash = await hashPassword(input.newPassword);
  await ctx.prisma.$transaction([
    ctx.prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash } }),
    ctx.prisma.adminSession.deleteMany({ where: { userId: user.id, NOT: { id: input.sessionId } } }),
  ]);
  rateLimiter.reset(RATE_RULES.changePassword, String(input.userId));
}

/** Deletes sessions past their sliding or absolute expiry. Returns how many were removed (job: session-cleanup). */
export async function deleteExpiredSessions(ctx: AppContext): Promise<number> {
  const t = now();
  const r = await ctx.prisma.adminSession.deleteMany({
    where: { OR: [{ expiresAt: { lte: t } }, { absoluteExpiresAt: { lte: t } }] },
  });
  return r.count;
}

/** Creates or updates an admin user (used by the seed and scripts/create-admin.ts). */
export async function upsertAdminUser(
  ctx: AppContext,
  input: { email: string; password: string; name?: string },
  opts: { updatePassword: boolean },
): Promise<{ user: AdminUser; created: boolean }> {
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  const existing = await ctx.prisma.adminUser.findUnique({ where: { email: input.email } });
  if (existing) {
    if (!opts.updatePassword) return { user: existing, created: false };
    const user = await ctx.prisma.adminUser.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(input.password), ...(input.name ? { name: input.name } : {}) },
    });
    return { user, created: false };
  }
  const user = await ctx.prisma.adminUser.create({
    data: { email: input.email, name: input.name ?? 'Owner', role: 'OWNER', passwordHash: await hashPassword(input.password) },
  });
  return { user, created: true };
}
