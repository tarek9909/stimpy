import { Prisma, PrismaClient } from '@prisma/client';

export { Prisma, PrismaClient };

/** Anything you can run queries on: the client or an interactive-transaction client. Services accept either. */
export type Db = PrismaClient | Prisma.TransactionClient;
export type Tx = Prisma.TransactionClient;

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl, log: ['warn', 'error'] });
}

/** Parses a JSON column that must hold a string array (e.g. `images`, `details`). */
export function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Raw SQL is allowed ONLY for (1) atomic stock updates and (2) the order-number counter, both in services/.
 * Everything else uses the typed Prisma API.
 */
export const isUniqueViolation = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
