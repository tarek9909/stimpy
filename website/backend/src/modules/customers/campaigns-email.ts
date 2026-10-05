import type { AppContext } from '../../context';
import { now } from '../../lib/clock';
import type { Db } from '../../lib/db';

export async function refreshCampaignCounts(db: Db, campaignId: number): Promise<void> {
  const groups = await db.campaignRecipient.groupBy({ by: ['status'], where: { campaignId }, _count: { _all: true } });
  const counts = new Map(groups.map((group) => [group.status, group._count._all]));
  const sentCount = counts.get('SENT') ?? 0;
  const failedCount = counts.get('FAILED') ?? 0;
  const pending = (counts.get('QUEUED') ?? 0) > 0;
  const ready = (counts.get('READY') ?? 0) > 0;
  const status = pending ? 'QUEUED' : ready ? 'READY' : failedCount && sentCount ? 'PARTIAL' : failedCount ? 'FAILED' : 'COMPLETED';
  await db.campaignSend.update({ where: { id: campaignId }, data: { sentCount, failedCount, status, completedAt: pending || ready ? null : now() } });
}

/** Mirrors queued email delivery onto its campaign recipient; ordinary order email logs have no matching recipient. */
export async function syncCampaignEmail(
  ctx: AppContext,
  emailLogId: number,
  status: 'SENT' | 'FAILED' | 'SKIPPED',
  error?: string | null,
  sentAt?: Date | null,
): Promise<void> {
  const recipient = await ctx.prisma.campaignRecipient.findUnique({ where: { emailLogId }, select: { id: true, campaignId: true, status: true } });
  if (!recipient) return;
  if (recipient.status !== status) {
    await ctx.prisma.campaignRecipient.update({ where: { id: recipient.id }, data: { status, error: error ?? null, sentAt: sentAt ?? null } });
    if (status === 'SKIPPED') await ctx.prisma.campaignSend.update({ where: { id: recipient.campaignId }, data: { skippedCount: { increment: 1 } } });
  }
  await refreshCampaignCounts(ctx.prisma, recipient.campaignId);
}
