import type { Prisma } from '@prisma/client';
import type { AppContext } from '../../context';
import { AppError } from '../../lib/errors';
import { iso } from '../../lib/dates';
import { toPage, toSkipTake, type Page, type PageQuery } from '../../lib/http';
import { EMAIL_TEMPLATES, WHATSAPP_TEMPLATES } from '../../lib/templates-catalog';
import { renderTemplate } from '../../lib/template';
import { enqueueEmail, loadEmailTemplate, renderEmail, sampleEmailValues } from '../../services/email-queue';
import { sampleValues } from '../../services/template-values';

export type EmailTemplateDto = { key: string; name: string; subject: string; body: string; enabled: boolean; placeholders: string[] };
export type WhatsappTemplateDto = { key: string; name: string; body: string; placeholders: string[] };

/** Every `{...}` token in `text` whose name is not in `allowed` (so `{Foo}`, `{}` and `{foo-bar}` are rejected too). */
export function invalidPlaceholders(text: string, allowed: readonly string[]): string[] {
  const bad = new Set<string>();
  for (const m of text.matchAll(/\{([^{}\n]*)\}/g)) if (!allowed.includes(m[1]!)) bad.add(`{${m[1]}}`);
  return [...bad];
}

const emailDef = (key: string) => EMAIL_TEMPLATES.find((t) => t.key === key);
const waDef = (key: string) => WHATSAPP_TEMPLATES.find((t) => t.key === key);

function requireEmailDef(key: string) {
  const def = emailDef(key);
  if (!def) throw AppError.notFound('Email template not found.');
  return def;
}

const unknownMsg = (bad: string[], allowed: readonly string[]): string =>
  `Unknown placeholder${bad.length > 1 ? 's' : ''} ${bad.join(', ')}. Use ${allowed.map((p) => `{${p}}`).join(', ')}.`;

// ---------------------------------------------------------------- email templates

export async function listEmailTemplates(ctx: AppContext): Promise<EmailTemplateDto[]> {
  const rows = await ctx.prisma.emailTemplate.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return EMAIL_TEMPLATES.map((d) => {
    const r = byKey.get(d.key);
    return { key: d.key, name: r?.name ?? d.name, subject: r?.subject ?? d.subject, body: r?.body ?? d.body, enabled: r?.enabled ?? true, placeholders: [...d.placeholders] };
  });
}

export async function updateEmailTemplate(
  ctx: AppContext,
  key: string,
  input: { subject: string; body: string; enabled: boolean },
): Promise<EmailTemplateDto> {
  const def = requireEmailDef(key);
  const fields: Record<string, string> = {};
  if (/[\r\n]/.test(input.subject)) fields.subject = 'The subject must be one line.';
  else {
    const bad = invalidPlaceholders(input.subject, def.placeholders);
    if (bad.length) fields.subject = unknownMsg(bad, def.placeholders);
  }
  const badBody = invalidPlaceholders(input.body, def.placeholders);
  if (badBody.length) fields.body = unknownMsg(badBody, def.placeholders);
  if (Object.keys(fields).length) throw AppError.validation(fields);

  const row = await ctx.prisma.emailTemplate.upsert({
    where: { key },
    create: { key, name: def.name, subject: input.subject, body: input.body, enabled: input.enabled },
    update: { subject: input.subject, body: input.body, enabled: input.enabled },
  });
  return { key: row.key, name: row.name, subject: row.subject, body: row.body, enabled: row.enabled, placeholders: [...def.placeholders] };
}

/** Preview of saved or unsaved text through the real layout with sample data. Lenient on unknown placeholders (they render empty): the server is strict on save. */
export async function previewEmailTemplate(ctx: AppContext, key: string, input: { subject?: string; body?: string }): Promise<{ subject: string; text: string; html: string }> {
  requireEmailDef(key);
  const saved = await loadEmailTemplate(ctx.prisma, key);
  return renderEmail(ctx, { subject: input.subject ?? saved!.subject, body: input.body ?? saved!.body, values: await sampleEmailValues(ctx) });
}

/** Test send of the SAVED template with sample data. Ignores both switches, still goes through the queue and the log. */
export async function sendTestEmail(ctx: AppContext, key: string, to: string): Promise<{ id: number }> {
  requireEmailDef(key);
  const queued = await enqueueEmail(ctx, ctx.prisma, { to, template: key, values: await sampleEmailValues(ctx), force: true });
  if (!queued) throw AppError.validation({ to: 'Enter a valid email address.' });
  return queued;
}

// ---------------------------------------------------------------- whatsapp templates

export async function listWhatsappTemplates(ctx: AppContext): Promise<WhatsappTemplateDto[]> {
  const rows = await ctx.prisma.whatsappTemplate.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return WHATSAPP_TEMPLATES.map((d) => {
    const r = byKey.get(d.key);
    return { key: d.key, name: r?.name ?? d.name, body: r?.body ?? d.body, placeholders: [...d.placeholders] };
  });
}

export async function updateWhatsappTemplates(ctx: AppContext, items: { key: string; body: string }[]): Promise<WhatsappTemplateDto[]> {
  const fields: Record<string, string> = {};
  const seen = new Set<string>();
  items.forEach((it, i) => {
    const def = waDef(it.key);
    if (!def) fields[`${i}.key`] = `Unknown template. Use ${WHATSAPP_TEMPLATES.map((t) => t.key).join(', ')}.`;
    else {
      if (seen.has(it.key)) fields[`${i}.key`] = 'Each template may appear once.';
      seen.add(it.key);
      const bad = invalidPlaceholders(it.body, def.placeholders);
      if (bad.length) fields[`${i}.body`] = unknownMsg(bad, def.placeholders);
    }
  });
  if (Object.keys(fields).length) throw AppError.validation(fields);
  await ctx.prisma.$transaction(
    items.map((it) => {
      const def = waDef(it.key)!;
      return ctx.prisma.whatsappTemplate.upsert({ where: { key: it.key }, create: { key: it.key, name: def.name, body: it.body }, update: { body: it.body } });
    }),
  );
  return listWhatsappTemplates(ctx);
}

/** Sample rendering of a WhatsApp template (used by tests and the dashboard sample preview if needed). */
export const renderWhatsappSample = (ctx: AppContext, body: string, tz: string): string => renderTemplate(body, sampleValues(ctx.config.webUrl, tz));

// ---------------------------------------------------------------- email log

export type EmailLogQuery = PageQuery & { status?: 'PENDING' | 'SENT' | 'FAILED'; orderId?: number; template?: string };
export type EmailLogItem = {
  id: number;
  at: string;
  to: string;
  template: string;
  subject: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  error: string | null;
  orderNumber: string | null;
};

export async function listEmailLog(ctx: AppContext, q: EmailLogQuery): Promise<Page<EmailLogItem>> {
  const where: Prisma.EmailLogWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.orderId !== undefined ? { orderId: q.orderId } : {}),
    ...(q.template ? { templateKey: q.template } : {}),
  };
  const [total, rows] = await Promise.all([
    ctx.prisma.emailLog.count({ where }),
    ctx.prisma.emailLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(q),
      select: { id: true, createdAt: true, toEmail: true, templateKey: true, subject: true, status: true, attempts: true, error: true, order: { select: { number: true } } },
    }),
  ]);
  return toPage(
    rows.map((r) => ({
      id: r.id,
      at: iso(r.createdAt),
      to: r.toEmail,
      template: r.templateKey,
      subject: r.subject,
      status: r.status,
      attempts: r.attempts,
      error: r.error,
      orderNumber: r.order?.number ?? null,
    })),
    total,
    q,
  );
}
