/**
 * Creates (or resets the password of) a dashboard user. No public registration exists.
 *   npm run admin:create                                  uses ADMIN_EMAIL / ADMIN_PASSWORD from the environment
 *   npm run admin:create -- --email a@b.c --password "..." --name "Owner"
 */
import { createContext } from '../src/context';
import { loadConfigOrExit } from '../src/config';
import { MIN_PASSWORD_LENGTH, upsertAdminUser } from '../src/services/auth';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const config = loadConfigOrExit();
const email = arg('email') ?? config.adminEmail;
const password = arg('password') ?? config.adminPassword;
const name = arg('name');

if (!email || !password) {
  console.error('Provide --email and --password (or ADMIN_EMAIL / ADMIN_PASSWORD in the environment).');
  process.exit(1);
}
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

const ctx = createContext(config);
try {
  const { user, created } = await upsertAdminUser(ctx, { email, password, name }, { updatePassword: true });
  console.log(`${created ? 'Created' : 'Updated the password of'} admin ${user.email} (id ${user.id}, role ${user.role}).`);
} finally {
  await ctx.prisma.$disconnect();
}
