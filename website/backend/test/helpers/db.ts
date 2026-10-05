import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;
let tables: string[] | null = null;

export const testDatabaseUrl = (): string => process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;

/** One shared client per test file (module instance). Pool size is enough for concurrency tests. */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    const url = new URL(testDatabaseUrl());
    if (!/test/i.test(url.pathname)) throw new Error(`Refusing to use non-test database "${url.pathname}" in tests.`);
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '20');
    prisma = new PrismaClient({ datasourceUrl: url.toString() });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma?.$disconnect();
  prisma = null;
}

/**
 * Empties every table (except Prisma's migration table) in one batch with FK checks off. DELETE on near-empty tables is
 * much faster than TRUNCATE (which is DDL). Auto-increment counters are NOT reset: never assert on literal ids.
 */
export async function resetDb(db: PrismaClient = getPrisma()): Promise<void> {
  if (!tables) {
    const rows = await db.$queryRaw<{ name: string }[]>`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
    tables = rows.map((r) => r.name);
  }
  await db.$transaction([
    db.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0'),
    ...tables.map((t) => db.$executeRawUnsafe(`DELETE FROM \`${t}\``)),
    db.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1'),
  ]);
}
