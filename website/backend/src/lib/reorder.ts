import type { Prisma } from '@prisma/client';
import { AppError } from './errors';
import type { Db } from './db';

/**
 * `PUT .../order` helper shared by hoodies, packs and FAQs. `{ ids }` must be exactly the full set of existing ids
 * (no duplicates, none unknown, none missing) else VALIDATION_ERROR on `ids`; positions become 1..n.
 */
export function assertFullIdList(ids: number[], existing: number[]): void {
  if (new Set(ids).size !== ids.length) throw AppError.validation({ ids: 'Each id may appear only once.' });
  const have = new Set(existing);
  const unknown = ids.filter((i) => !have.has(i));
  if (unknown.length) throw AppError.validation({ ids: `Unknown id(s): ${unknown.join(', ')}.` });
  if (ids.length !== existing.length) throw AppError.validation({ ids: 'Send the full list of ids in the new order.' });
}

export async function applyOrder(
  db: { $transaction: (ops: Prisma.PrismaPromise<unknown>[]) => Promise<unknown> },
  ids: number[],
  existing: number[],
  update: (id: number, position: number) => Prisma.PrismaPromise<unknown>,
): Promise<void> {
  assertFullIdList(ids, existing);
  await db.$transaction(ids.map((id, i) => update(id, i + 1)));
}

export type { Db };
