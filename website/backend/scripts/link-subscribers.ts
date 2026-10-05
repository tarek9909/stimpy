import { createPrisma } from '../src/lib/db';
import { loadConfigOrExit } from '../src/config';
import { now } from '../src/lib/clock';
import { normalizePhone } from '../src/lib/phone';

/** Idempotently links existing drop subscribers to CRM customers. Dry-run is the default; pass --apply to write. */
export async function linkSubscribers(apply = process.argv.includes('--apply')) {
  const config = loadConfigOrExit();
  const prisma = createPrisma(config.databaseUrl);
  let scanned = 0;
  let matched = 0;
  let linked = 0;
  let cursor = 0;
  try {
    for (;;) {
      const batch = await prisma.subscriber.findMany({
        where: { customerId: null, id: { gt: cursor } },
        orderBy: { id: 'asc' },
        take: 500,
        select: { id: true, contact: true, type: true },
      });
      if (!batch.length) break;
      cursor = batch.at(-1)!.id;
      scanned += batch.length;
      for (const subscriber of batch) {
        const customer = subscriber.type === 'EMAIL'
          ? await prisma.customer.findFirst({ where: { email: subscriber.contact.trim().toLowerCase() }, select: { id: true, emailConsent: true, unsubscribedAt: true } })
          : await prisma.customer.findUnique({ where: { phone: normalizePhone(subscriber.contact) ?? 'INVALID' }, select: { id: true, whatsappConsent: true } });
        if (!customer) continue;
        matched++;
        if (!apply) continue;
        const changed = await prisma.$transaction(async (tx) => {
          const result = await tx.subscriber.updateMany({ where: { id: subscriber.id, customerId: null }, data: { customerId: customer.id } });
          if (!result.count) return false;
          if (subscriber.type === 'EMAIL' && 'unsubscribedAt' in customer) {
            await tx.customer.update({ where: { id: customer.id }, data: { emailConsent: !customer.unsubscribedAt, consentUpdatedAt: now() } });
          } else {
            await tx.customer.update({ where: { id: customer.id }, data: { whatsappConsent: true, consentUpdatedAt: now() } });
          }
          return true;
        });
        if (changed) linked++;
      }
    }
    return { scanned, matched, linked, mode: apply ? 'applied' : 'dry-run' } as const;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith('link-subscribers.ts')) {
  linkSubscribers().then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
