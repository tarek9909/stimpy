import { z } from 'zod';
import { MIN_PASSWORD_LENGTH } from '../../services/auth';

export const userSchema = z
  .object({ id: z.number().int(), email: z.string(), name: z.string(), role: z.enum(['OWNER', 'PACKER']) })
  .meta({ id: 'AuthUser' });

export const loginBody = z.strictObject({
  email: z.string().trim().email().max(190),
  password: z.string().min(1).max(200),
});
export const loginResponse = z.object({ user: userSchema });

export const meResponse = z.object({
  user: userSchema,
  /** The earlier of the sliding and the absolute expiry. */
  session: z.object({ expiresAt: z.string() }),
});

export const changePasswordBody = z.strictObject({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`).max(200),
});

export const noContent = z.null().describe('No content');
