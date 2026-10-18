import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RotateCcw, Send } from 'lucide-react';
import { Banner, Button, EmptyState, FormField, Input, Modal, Pill, SegmentedControl, Select, Skeleton, Switch, TextLink, Textarea, useToast, cn } from '@stimpy/ui';
import { api, unwrap } from '../../api/client';
import { asApiError, useNotifyError } from '../../api/errors';
import { queryKeys } from '../../api/queryKeys';
import { useSession } from '../../auth/session';
import { DataTable, type Column } from '../../components/DataTable';
import { Pagination } from '../../components/Pagination';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useFormatters } from '../../lib/format';
import { useDebouncedValue, useOnline } from '../../lib/hooks';
import { emailSchemaCheck } from './emailCheck';
import { enumParam, optionalIntParam, paginationParams, optionalStringParam, useUrlState } from '../../lib/urlState';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { useEmailLog, useEmailTemplates, useWhatsappTemplates, type EmailTemplate, type WhatsappTemplate } from './api';
import { asToken, insertAtCursor, renderSample, unknownPlaceholders } from './placeholders';
import { useContentDraft } from './shared';

/** One chip per placeholder of THIS template (chips for other templates are never shown). */
export function PlaceholderChips({ placeholders, onInsert, label = 'Insert placeholder' }: { placeholders: readonly string[]; onInsert: (token: string) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-body-sm font-medium text-fg-muted">{label}</p>
      <ul className="flex flex-wrap gap-2" aria-label="Placeholders">
        {placeholders.map((p) => (
          <li key={p}>
            <button type="button" onClick={() => onInsert(asToken(p))} className="min-h-9 rounded-full border border-control bg-cream px-3 py-1 font-mono text-body-sm hover:brightness-95" data-testid={`chip-${p}`}>
              {asToken(p)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnknownNote({ text, allowed }: { text: string; allowed: readonly string[] }) {
  const bad = unknownPlaceholders(text, allowed);
  if (bad.length === 0) return null;
  return (
    <p className="flex items-start gap-2 rounded-sm bg-butter px-2 py-1 text-body-sm font-medium text-ink" role="status" data-testid="unknown-placeholder">
      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>Not a known placeholder: {bad.join(', ')}. The server rejects it on save.</span>
    </p>
  );
}

interface PreviewData { subject: string; text: string; html: string }

const EMAIL_TEMPLATE_DETAILS: Record<string, { group: string; trigger: string }> = {
  order_received: {
    group: 'Order updates',
    trigger: 'Sent when an order is placed as New. Orders created as Confirmed receive the confirmation email instead.',
  },
  order_confirmed: {
    group: 'Order updates',
    trigger: 'Sent when an order is confirmed, including orders created directly as Confirmed.',
  },
  order_out_for_delivery: {
    group: 'Order updates',
    trigger: 'Sent when an order is marked Out for delivery.',
  },
  order_delivered: {
    group: 'Order updates',
    trigger: 'Sent when an order is marked Delivered.',
  },
  order_cancelled: {
    group: 'Order updates',
    trigger: 'Sent when an order is cancelled.',
  },
  orders_lookup: {
    group: 'Customer requests',
    trigger: 'Sent when a customer asks the storefront to email their recent order numbers.',
  },
  marketing_update: {
    group: 'Campaigns',
    trigger: 'Used for email campaigns after you confirm a campaign for eligible customers.',
  },
};

function Preview({ templateKey, subject, body }: { templateKey: string; subject: string; body: string }) {
  const dSubject = useDebouncedValue(subject, 600);
  const dBody = useDebouncedValue(body, 600);
  const [mode, setMode] = useState<'formatted' | 'text'>('formatted');
  const q = useQuery<PreviewData>({
    queryKey: ['email-preview', templateKey, dSubject, dBody],
    queryFn: () => unwrap(api.POST('/api/v1/admin/email-templates/{key}/preview', { params: { path: { key: templateKey } }, body: { subject: dSubject, body: dBody } })),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: false,
  });
  return (
    <section aria-labelledby="preview-title" className="flex flex-col gap-2 rounded-lg border border-base p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="preview-title" className="text-h6 font-bold">Preview</h3>
        <SegmentedControl aria-label="Preview format" value={mode} onChange={(v) => setMode(v as 'formatted' | 'text')} options={[{ value: 'formatted', label: 'Formatted' }, { value: 'text', label: 'Plain text' }]} />
      </div>
      <p className="text-body-sm text-fg-muted">Sample preview. The real email uses real order data.</p>
      {q.isError ? (
        <Banner variant="warning" action={<Button size="sm" variant="secondary" onClick={() => void q.refetch()}>Retry</Button>}>
          Couldn&apos;t load the preview. You can keep editing and saving.
        </Banner>
      ) : null}
      {q.data ? (
        <div className={cn('flex flex-col gap-2', q.isFetching && 'opacity-60')} aria-busy={q.isFetching}>
          {mode === 'formatted' ? (
            <div className="overflow-hidden rounded-md border border-base bg-[#f4f5f7]" data-testid="rendered-email-preview">
              <div className="border-b border-base bg-white px-4 py-3">
                <p className="mb-2 text-body-sm font-semibold text-fg-muted">Inbox preview · sample message</p>
                <dl className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-body-sm">
                  <dt className="text-fg-muted">From</dt><dd>Stimpy</dd>
                  <dt className="text-fg-muted">To</dt><dd>Rami Haddad (sample)</dd>
                  <dt className="text-fg-muted">Subject</dt><dd className="font-semibold" data-testid="preview-subject">{q.data.subject}</dd>
                </dl>
              </div>
              <div className="p-3 sm:p-5">
                <iframe title="Rendered email appearance" sandbox="" srcDoc={q.data.html} className="mx-auto h-[36rem] w-full max-w-[640px] rounded-md border border-base bg-white shadow-sm" data-testid="preview-frame" />
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-base bg-white">
              <p className="border-b border-base px-4 py-3 text-body font-bold" data-testid="preview-subject">{q.data.subject}</p>
              <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap p-4 text-body-sm" data-testid="preview-text">{q.data.text}</pre>
            </div>
          )}
        </div>
      ) : q.isPending ? (
        <Skeleton variant="rect" className="h-64" />
      ) : null}
    </section>
  );
}

function TestSendDialog({ open, onClose, tpl, dirty, saveFirst }: { open: boolean; onClose: () => void; tpl: EmailTemplate; dirty: boolean; saveFirst: () => Promise<void> }) {
  const session = useSession();
  const toast = useToast();
  const notify = useNotifyError();
  const [to, setTo] = useState(session.user.email);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const problem = emailSchemaCheck(to);
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy(true);
    try {
      if (dirty) await saveFirst();
      await unwrap(api.POST('/api/v1/admin/email-templates/{key}/test', { params: { path: { key: tpl.key } }, body: { to: to.trim() } }));
      toast.success(`Test email queued to ${to.trim()}. It appears in the email log.`);
      onClose();
    } catch (e) {
      const api = asApiError(e);
      if (api?.code === 'VALIDATION_ERROR') setError(api.fields?.to ?? api.message);
      else notify(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={() => (busy ? undefined : onClose())}
      title="Send test email"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} leftIcon={<Send size={18} aria-hidden="true" />} onClick={() => void send()}>{dirty ? 'Save and send test' : 'Send test email'}</Button>
        </>
      }
    >
      <FormField label="Send to" name="test-to" error={error} hint="The test uses sample data and ignores the 'Send automatic emails' switch, so it works even when emails are turned off. It goes through the queue and appears in the email log.">
        <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} autoComplete="off" inputMode="email" />
      </FormField>
      {dirty ? <p className="mt-2 text-body-sm text-fg-muted">You have unsaved changes: the test sends the saved template, so they are saved first.</p> : null}
    </Modal>
  );
}

function TemplateEditor({ tpl, onDirty }: { tpl: EmailTemplate; onDirty: (d: boolean) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useNotifyError();
  const [subject, setSubject] = useContentDraft(tpl.subject);
  const [body, setBody] = useContentDraft(tpl.body);
  const [enabled, setEnabled] = useContentDraft(tpl.enabled);
  const [errors, setErrors] = useState<{ subject?: string; body?: string }>({});
  const [testOpen, setTestOpen] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const last = useRef<'subject' | 'body'>('body');
  const dirty = subject !== tpl.subject || body !== tpl.body || enabled !== tpl.enabled;
  const details = EMAIL_TEMPLATE_DETAILS[tpl.key];
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);

  const save = useMutation({
    mutationFn: (submitted: { subject: string; body: string; enabled: boolean }) => unwrap(api.PUT('/api/v1/admin/email-templates/{key}', { params: { path: { key: tpl.key } }, body: submitted })),
    onSuccess: (saved, submitted) => {
      qc.setQueryData(queryKeys.emailTemplates, (old: EmailTemplate[] | undefined) => old?.map((t) => (t.key === saved.key ? { ...t, ...saved } : t)));
      setSubject((current) => current === submitted.subject ? saved.subject : current);
      setBody((current) => current === submitted.body ? saved.body : current);
      setEnabled((current) => current === submitted.enabled ? saved.enabled : current);
    },
  });
  const doSave = async () => {
    const e: typeof errors = {};
    if (subject.trim() === '') e.subject = 'Enter a subject.';
    else if (subject.length > 200) e.subject = 'Use at most 200 characters.';
    if (body.trim() === '') e.body = 'Enter the message.';
    else if (body.length > 5000) e.body = 'Use at most 5000 characters.';
    setErrors(e);
    if (e.subject || e.body) throw new Error('invalid');
    try {
      await save.mutateAsync({ subject, body, enabled });
    } catch (err) {
      const a = asApiError(err);
      if (a?.code === 'VALIDATION_ERROR') {
        setErrors({ subject: a.fields?.subject, body: a.fields?.body });
        throw err;
      }
      notify(err);
      throw err;
    }
  };
  const insert = (token: string) => {
    if (last.current === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const r = insertAtCursor(subject, el.selectionStart ?? subject.length, el.selectionEnd ?? subject.length, token);
      setSubject(r.value);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.caret, r.caret); });
    } else if (bodyRef.current) {
      const el = bodyRef.current;
      const r = insertAtCursor(body, el.selectionStart ?? body.length, el.selectionEnd ?? body.length, token);
      setBody(r.value);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(r.caret, r.caret); });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 className="text-h4">{tpl.name}</h2>
        <p className="mt-1 text-body-sm text-fg-muted">{details?.trigger ?? 'Customer email template.'}</p>
      </div>
      <div className="flex items-center gap-2">
        <Pill tone="cream" size="sm">{details?.group ?? 'Customer email'}</Pill>
        {details?.group === 'Order updates' ? <span className="text-body-sm text-fg-muted">Automatic order update</span> : null}
      </div>
      <Switch
        label="Send this email"
        checked={enabled}
        onChange={setEnabled}
        description={details?.group === 'Order updates'
          ? 'Off: automatic order updates are skipped. Test emails and manual resends still work.'
          : details?.group === 'Customer requests'
            ? 'Off: customer order lookup emails are skipped. Test emails still work.'
            : 'Off: this template cannot be used for new campaigns. Test emails still work.'}
      />
      <FormField label="Subject" name="tpl-subject" required error={errors.subject}>
        <Input ref={subjectRef} value={subject} maxLength={200} onFocus={() => { last.current = 'subject'; }} onChange={(e) => setSubject(e.target.value)} autoComplete="off" />
      </FormField>
      <UnknownNote text={subject} allowed={tpl.placeholders} />
      <FormField label="Body" name="tpl-body" required error={errors.body} hint="Plain text. Customer details are filled in from the order.">
        <Textarea ref={bodyRef} value={body} rows={12} maxLength={5000} onFocus={() => { last.current = 'body'; }} onChange={(e) => setBody(e.target.value)} className="font-mono" />
      </FormField>
      <UnknownNote text={body} allowed={tpl.placeholders} />
      <PlaceholderChips placeholders={tpl.placeholders} onInsert={insert} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={save.isPending} onClick={() => void doSave().then(() => toast.success('Template saved.')).catch(() => undefined)}>Save template</Button>
        <Button variant="secondary" leftIcon={<Send size={18} aria-hidden="true" />} onClick={() => setTestOpen(true)}>{dirty ? 'Save and send test' : 'Send test email'}</Button>
      </div>
      <p className="text-body-sm text-fg-muted">The email layout and logo are fixed. The only editable branding is the footer text in <TextLink href="/settings?tab=customer-email">Settings &rarr; Customer email</TextLink>.</p>
      <Preview templateKey={tpl.key} subject={subject} body={body} />
      <TestSendDialog open={testOpen} onClose={() => setTestOpen(false)} tpl={tpl} dirty={dirty} saveFirst={doSave} />
    </div>
  );
}

const emailParams = { template: optionalStringParam() };

function EmailTemplates() {
  const q = useEmailTemplates();
  const qc = useQueryClient();
  const notify = useNotifyError();
  const online = useOnline();
  const [{ template }, setP] = useUrlState(emailParams);
  const [dirty, setDirty] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const guard = useUnsavedChangesGuard(dirty);
  const toggle = async (t: EmailTemplate, enabled: boolean) => {
    setToggling(t.key);
    const before = q.data;
    qc.setQueryData(queryKeys.emailTemplates, (old: EmailTemplate[] | undefined) => old?.map((x) => (x.key === t.key ? { ...x, enabled } : x)));
    try {
      const saved = await unwrap(api.PUT('/api/v1/admin/email-templates/{key}', { params: { path: { key: t.key } }, body: { subject: t.subject, body: t.body, enabled } }));
      qc.setQueryData(queryKeys.emailTemplates, (old: EmailTemplate[] | undefined) => old?.map((x) => x.key === saved.key ? saved : x));
    } catch (e) {
      qc.setQueryData(queryKeys.emailTemplates, before);
      notify(e, { fallback: "Couldn't change that. Restored." });
    } finally {
      setToggling(null);
    }
  };
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-96" />}>
      {(templates) => {
        const current = templates.find((t) => t.key === template) ?? templates[0];
        const groups = ['Order updates', 'Customer requests', 'Campaigns'];
        return (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-h4">Customer email templates</h2>
              <p className="mt-1 text-body-sm text-fg-muted">Browse the messages customers receive, when each one is sent, and a rendered sample. Automatic messages also require customer email delivery to be enabled in Settings.</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <nav aria-label="Email templates" className="flex flex-col gap-4">
                {groups.map((group) => {
                  const groupTemplates = templates.filter((t) => EMAIL_TEMPLATE_DETAILS[t.key]?.group === group);
                  if (!groupTemplates.length) return null;
                  return (
                    <section key={group} aria-label={group}>
                      <h3 className="mb-2 text-body-sm font-semibold text-fg-muted">{group}</h3>
                      <ul className="flex flex-col gap-2">
                        {groupTemplates.map((t) => (
                          <li key={t.key} className={cn('flex items-start justify-between gap-2 rounded-md border px-3 py-2', current?.key === t.key ? 'border-2 border-ink bg-cream' : 'border-base')}>
                            <button type="button" className="min-h-11 min-w-0 flex-1 text-left" aria-current={current?.key === t.key ? 'true' : undefined} onClick={() => setP({ template: t.key }, { replace: true })}>
                              <span className="block font-medium">{t.name}</span>
                              <span className="mt-0.5 block text-body-sm text-fg-muted">{EMAIL_TEMPLATE_DETAILS[t.key]?.trigger}</span>
                            </button>
                            <Switch label={<span className="sr-only">{`${t.name} enabled`}</span>} checked={t.enabled} onChange={(v) => void toggle(t, v)} disabled={!online || toggling !== null} className="!min-h-0 !py-0" />
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </nav>
              {current ? <TemplateEditor key={current.key} tpl={current} onDirty={setDirty} /> : null}
            </div>
            {guard.dialog}
          </div>
        );
      }}
    </QueryBoundary>
  );
}

function WhatsappTemplates() {
  const q = useWhatsappTemplates();
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-96" />}>
      {(items) => <WhatsappEditor items={items} />}
    </QueryBoundary>
  );
}

function WhatsappEditor({ items }: { items: WhatsappTemplate[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useNotifyError();
  const savedBodies = useMemo(() => Object.fromEntries(items.map((i) => [i.key, i.body])), [items]);
  const [bodies, setBodies] = useContentDraft(savedBodies);
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const dirty = items.some((i) => bodies[i.key] !== i.body);
  const guard = useUnsavedChangesGuard(dirty);
  const save = useMutation({
    mutationFn: (submitted: Record<string, string>) => unwrap(api.PUT('/api/v1/admin/whatsapp-templates', { body: items.map((i) => ({ key: i.key, name: i.name, body: submitted[i.key] ?? i.body, placeholders: i.placeholders })) })),
    onSuccess: (saved, submitted) => {
      qc.setQueryData(queryKeys.whatsappTemplates, saved);
      setBodies((current) => Object.fromEntries(saved.map((t) => [t.key, current[t.key] === submitted[t.key] ? t.body : current[t.key] ?? t.body])));
      void qc.invalidateQueries({ queryKey: ['orders', 'whatsapp'] });
    },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="text-body-sm text-fg-muted">Used by &lsquo;Message customer on WhatsApp&rsquo;. Nothing is sent automatically.</p>
      {items.map((t) => {
        const value = bodies[t.key] ?? '';
        return (
          <section key={t.key} className="flex flex-col gap-3 rounded-lg border border-base p-4" aria-labelledby={`wa-${t.key}`}>
            <div>
              <h2 id={`wa-${t.key}`} className="text-h5">{t.name}</h2>
              <p className="font-mono text-body-sm text-fg-muted">{t.key}</p>
            </div>
            <FormField label="Message" name={`wa-body-${t.key}`} error={errors[t.key]}>
              <Textarea ref={(el) => { refs.current[t.key] = el; }} rows={4} maxLength={2000} value={value} onChange={(e) => setBodies((b) => ({ ...b, [t.key]: e.target.value }))} />
            </FormField>
            <UnknownNote text={value} allowed={t.placeholders} />
            <PlaceholderChips
              placeholders={t.placeholders}
              onInsert={(token) => {
                const el = refs.current[t.key];
                const r = insertAtCursor(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length, token);
                setBodies((b) => ({ ...b, [t.key]: r.value }));
                requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(r.caret, r.caret); });
              }}
            />
            <div className="rounded-md bg-cream p-3">
              <p className="mb-1 text-body-sm font-medium text-fg-muted">Sample preview</p>
              <p className="whitespace-pre-wrap text-body" data-testid={`wa-sample-${t.key}`}>{renderSample(value)}</p>
            </div>
          </section>
        );
      })}
      <div>
        <Button
          variant="primary"
          loading={save.isPending}
          onClick={async () => {
            const empty = Object.fromEntries(items.filter((i) => (bodies[i.key] ?? '').trim() === '').map((i) => [i.key, 'Enter the message.']));
            setErrors(empty);
            if (Object.keys(empty).length) return;
            try {
              await save.mutateAsync(bodies);
              toast.success('WhatsApp templates saved.');
            } catch (e) {
              const a = asApiError(e);
              if (a?.code === 'VALIDATION_ERROR') {
                const fields = Object.fromEntries(Object.entries(a.fields ?? {}).flatMap(([path, message]) => {
                  const index = /^(\d+)\./.exec(path)?.[1];
                  const key = index === undefined ? path.split('.')[0] : items[Number(index)]?.key;
                  return key && items.some((t) => t.key === key) ? [[key, message]] : [];
                }));
                setErrors(fields);
                if (Object.keys(fields).length === 0) notify(e);
              }
              else notify(e);
            }
          }}
        >
          Save WhatsApp templates
        </Button>
      </div>
      {guard.dialog}
    </div>
  );
}

const logParams = {
  status: enumParam(['all', 'PENDING', 'SENT', 'FAILED'] as const, 'all'),
  template: optionalStringParam(),
  orderId: optionalIntParam(),
  ...paginationParams,
};
const LOG_TEMPLATES = ['order_received', 'order_confirmed', 'order_out_for_delivery', 'order_delivered', 'order_cancelled', 'orders_lookup', 'custom', 'founder_new_order', 'founder_low_stock'];

function StatusPill({ status }: { status: 'PENDING' | 'SENT' | 'FAILED' }) {
  return <Pill tone={status === 'FAILED' ? 'danger' : status === 'SENT' ? 'success' : 'cream'} size="sm">{status === 'FAILED' ? 'Failed' : status === 'SENT' ? 'Sent' : 'Pending'}</Pill>;
}

function EmailLog() {
  const f = useFormatters();
  const qc = useQueryClient();
  const toast = useToast();
  const notify = useNotifyError();
  const [p, setP] = useUrlState(logParams);
  const filters = { status: p.status === 'all' ? undefined : p.status, template: p.template ?? undefined, orderId: p.orderId ?? undefined, page: p.page, pageSize: p.pageSize };
  const q = useEmailLog(filters);
  const failed = useEmailLog({ status: 'FAILED', page: 1, pageSize: 1 });
  const hasPending = q.data?.items.some((r) => r.status === 'PENDING') ?? false;
  useEffect(() => {
    if (!hasPending) return undefined;
    const t = window.setInterval(() => void qc.invalidateQueries({ queryKey: ['email-log'] }), 5000);
    return () => window.clearInterval(t);
  }, [hasPending, qc]);
  const retry = useMutation({ mutationFn: (id: number) => unwrap(api.POST('/api/v1/admin/email-log/{id}/retry', { params: { path: { id } } })) });
  const doRetry = async (id: number) => {
    try {
      await retry.mutateAsync(id);
      toast.success('Retry queued.');
      for (const ms of [3000, 10000]) window.setTimeout(() => void qc.invalidateQueries({ queryKey: ['email-log'] }), ms);
      void qc.invalidateQueries({ queryKey: ['email-log'] });
    } catch (e) {
      notify(e);
    }
  };
  const failedCount = failed.data?.total ?? 0;
  const columns: Column<NonNullable<typeof q.data>['items'][number]>[] = [
    { id: 'at', header: 'Time', priority: 'primary', cell: (r) => <time dateTime={r.at} className="tabular-nums" title={f.dateTime(r.at)}>{f.dateTime(r.at)}</time> },
    { id: 'status', header: 'Status', priority: 'primary', mobileLabel: '', cell: (r) => <StatusPill status={r.status} /> },
    { id: 'to', header: 'To', cell: (r) => <span className="break-all">{r.to}</span> },
    { id: 'template', header: 'Template', cell: (r) => <span className="font-mono text-body-sm">{r.template}</span> },
    { id: 'subject', header: 'Subject', cell: (r) => r.subject },
    { id: 'order', header: 'Order', cell: (r) => (r.orderNumber ? <TextLink href={`/orders?q=${encodeURIComponent(r.orderNumber)}`} className="font-mono">{r.orderNumber}</TextLink> : <span className="text-fg-muted">&mdash;</span>) },
    { id: 'attempts', header: 'Attempts', numeric: true, cell: (r) => r.attempts },
    {
      id: 'error',
      header: 'Error / action',
      mobileLabel: '',
      cell: (r) => (
        <div className="flex flex-col gap-2">
          {r.error ? (
            <details>
              <summary className="cursor-pointer text-body-sm font-medium">Show error</summary>
              <p className="mt-1 whitespace-pre-wrap break-words text-body-sm">{r.error}</p>
            </details>
          ) : null}
          {r.status === 'FAILED' ? (
            <Button variant="secondary" size="sm" leftIcon={<RotateCcw size={16} aria-hidden="true" />} loading={retry.isPending && retry.variables === r.id} onClick={() => void doRetry(r.id)} aria-label={`Retry email to ${r.to}`}>Retry</Button>
          ) : null}
        </div>
      ),
    },
  ];
  const active = (p.status !== 'all' ? 1 : 0) + (p.template ? 1 : 0) + (p.orderId ? 1 : 0);
  return (
    <div className="flex flex-col gap-4">
      {failedCount > 0 && p.status !== 'FAILED' ? (
        <Banner variant="error" action={<Button size="sm" variant="secondary" onClick={() => setP({ status: 'FAILED' })}>Show failed</Button>}>
          {failedCount} {failedCount === 1 ? 'email' : 'emails'} failed.
        </Banner>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-44">
          <label htmlFor="log-status" className="mb-1 block text-body font-medium">Status</label>
          <Select id="log-status" value={p.status} onChange={(e) => setP({ status: e.target.value as typeof p.status })} options={[{ value: 'all', label: 'All' }, { value: 'PENDING', label: 'Pending' }, { value: 'SENT', label: 'Sent' }, { value: 'FAILED', label: 'Failed' }]} />
        </div>
        <div className="w-full sm:w-64">
          <label htmlFor="log-template" className="mb-1 block text-body font-medium">Template</label>
          <Select id="log-template" value={p.template ?? ''} onChange={(e) => setP({ template: e.target.value || null })} options={[{ value: '', label: 'All templates' }, ...LOG_TEMPLATES.map((t) => ({ value: t, label: t }))]} />
        </div>
        {p.orderId ? <Pill tone="cream" size="md">Order id {p.orderId}</Pill> : null}
        {active > 0 ? <Button variant="ghost" onClick={() => setP({ status: 'all', template: null, orderId: null })}>Clear filters</Button> : null}
      </div>
      <DataTable
        caption="Email log"
        columns={columns}
        rows={q.data?.items}
        getRowId={(r) => r.id}
        rowClassName={(r) => (r.status === 'FAILED' ? 'bg-danger/10' : undefined)}
        loading={q.isPending}
        refreshing={q.isFetching && !q.isPending}
        error={q.error}
        onRetry={() => void q.refetch()}
        empty={<EmptyState title={active ? 'No emails match these filters' : 'No emails sent yet'} headingLevel={3} />}
        footer={<Pagination page={p.page} pageSize={p.pageSize} total={q.data?.total ?? 0} onPageChange={(page) => setP({ page })} onPageSizeChange={(pageSize) => setP({ pageSize })} busy={q.isFetching} />}
      />
    </div>
  );
}

const params = { section: enumParam(['email', 'whatsapp', 'log'] as const, 'email') };

/** Content -> Emails (dashboard-pages 13.6): email templates, WhatsApp templates, email log. */
export function EmailsTab() {
  const [{ section }, setP] = useUrlState(params);
  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl aria-label="Email sections" value={section} onChange={(v) => setP({ section: v as 'email' | 'whatsapp' | 'log' })} options={[{ value: 'email', label: 'Email templates' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'log', label: 'Email log' }]} />
      {section === 'email' ? <EmailTemplates /> : null}
      {section === 'whatsapp' ? <WhatsappTemplates /> : null}
      {section === 'log' ? <EmailLog /> : null}
    </div>
  );
}

