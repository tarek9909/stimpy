import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { Banner, Button, Input, Modal, Skeleton, Textarea, useToast } from '@stimpy/ui';
import { useNotifyError } from '../../api/errors';
import { useBulkEmail, useBulkPreview, useBulkWhatsapp, type BulkChannel, type BulkTarget } from './api';

type Skipped = { noContact: number; noConsent: number; optedOut: number };
type WaItem = { customerId: number; name: string; to: string; text: string; url: string };

function SkippedNote({ skipped, channel }: { skipped: Skipped; channel: BulkChannel }) {
  const parts = [
    skipped.noContact > 0 ? `${skipped.noContact} without ${channel === 'EMAIL' ? 'an email address' : 'a WhatsApp number'}` : null,
    skipped.noConsent > 0 ? `${skipped.noConsent} without channel consent` : null,
    skipped.optedOut > 0 ? `${skipped.optedOut} who asked not to be messaged` : null,
  ].filter(Boolean);
  return parts.length > 0 ? <p className="text-body-sm text-fg-muted">Skipped: {parts.join(', ')}.</p> : null;
}

/**
 * Bulk email or WhatsApp to the customers in `target` (the selected rows, or everyone matching the filters).
 * The server decides who is reachable; this dialog only shows the preview, takes the message and sends.
 * WhatsApp is never sent automatically: the result is a work-through list of `wa.me` chats.
 */
export function BulkMessageDialog({
  open,
  onClose,
  channel,
  target,
  targetLabel,
}: {
  open: boolean;
  onClose: () => void;
  channel: BulkChannel;
  target: BulkTarget;
  /** "3 selected customers" / "all 42 matching customers" */
  targetLabel: string;
}) {
  const toast = useToast();
  const notify = useNotifyError();
  const preview = useBulkPreview();
  const sendEmail = useBulkEmail();
  const buildWhatsapp = useBulkWhatsapp();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [links, setLinks] = useState<{ items: WaItem[]; skipped: Skipped } | null>(null);
  const [done, setDone] = useState<ReadonlySet<number>>(new Set());

  const targetKey = JSON.stringify(target);
  useEffect(() => {
    if (!open) return;
    setLinks(null);
    setDone(new Set());
    preview.mutate({ target, channel }, { onError: (e) => notify(e, { fallback: "Couldn't check who can be messaged." }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channel, targetKey]);

  const info = preview.data;
  const ready = body.trim().length > 0 && (channel === 'WHATSAPP' || subject.trim().length > 0) && (info?.eligible ?? 0) > 0;
  const sending = sendEmail.isPending || buildWhatsapp.isPending;
  const title = channel === 'EMAIL' ? 'Email customers' : 'WhatsApp customers';

  const submit = () => {
    if (channel === 'EMAIL') {
      sendEmail.mutate(
        { target, subject: subject.trim(), body: body.trim() },
        {
          onSuccess: (r) => {
            toast.success(`${r.queued} ${r.queued === 1 ? 'email' : 'emails'} queued.`);
            onClose();
          },
          onError: (e) => notify(e, { fallback: "Couldn't queue the emails. Try again." }),
        },
      );
    } else {
      buildWhatsapp.mutate(
        { target, text: body.trim() },
        { onSuccess: (r) => setLinks({ items: r.items, skipped: r.skipped }), onError: (e) => notify(e, { fallback: "Couldn't prepare the messages. Try again." }) },
      );
    }
  };

  const remaining = useMemo(() => (links ? links.items.filter((i) => !done.has(i.customerId)).length : 0), [links, done]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={`To ${targetLabel}.`}
      size="lg"
      closeOnBackdrop={!sending}
      footer={
        links ? (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={sending} disabled={!ready}>
              {channel === 'EMAIL' ? `Send to ${info?.eligible ?? 0}` : `Prepare ${info?.eligible ?? 0} chats`}
            </Button>
          </>
        )
      }
    >
      {links ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-sm text-fg-muted">
            Nothing is sent automatically. Open each chat, press send in WhatsApp, then mark it done. {remaining} left.
          </p>
          <SkippedNote skipped={links.skipped} channel="WHATSAPP" />
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-base">
            {links.items.map((i) => {
              const isDone = done.has(i.customerId);
              return (
                <li key={i.customerId} className="flex flex-wrap items-center gap-2 p-3">
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${isDone ? 'text-fg-muted line-through' : ''}`}>{i.name}</span>
                    <span className="block text-body-sm tabular-nums text-fg-muted">{i.to}</span>
                  </span>
                  <Button variant="secondary" size="sm" href={i.url} target="_blank" rel="noopener noreferrer" leftIcon={<ExternalLink size={16} aria-hidden="true" />} onClick={() => setDone((d) => new Set(d).add(i.customerId))}>
                    Open chat
                  </Button>
                  <Button
                    variant={isDone ? 'primary' : 'ghost'}
                    size="sm"
                    aria-pressed={isDone}
                    leftIcon={<Check size={16} aria-hidden="true" />}
                    onClick={() =>
                      setDone((d) => {
                        const next = new Set(d);
                        if (next.has(i.customerId)) next.delete(i.customerId);
                        else next.add(i.customerId);
                        return next;
                      })
                    }
                  >
                    {isDone ? 'Done' : 'Mark done'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {preview.isPending ? (
            <Skeleton variant="text" className="h-12" />
          ) : info ? (
            <div className="flex flex-col gap-1" role="status">
              <p className="text-body">
                <strong>{info.eligible}</strong> of {info.matched} can be {channel === 'EMAIL' ? 'emailed' : 'messaged on WhatsApp'}.
              </p>
              <SkippedNote skipped={info.skipped} channel={channel} />
              {info.overCap > 0 ? (
                <Banner variant="warning">
                  One send covers at most {info.cap} people. {info.overCap} more will not be included; narrow the filters and send again.
                </Banner>
              ) : null}
              {info.eligible === 0 ? <Banner variant="warning">Nobody in this selection can be reached on this channel.</Banner> : null}
            </div>
          ) : null}

          {channel === 'EMAIL' ? (
            <label className="flex flex-col gap-1 text-body-sm font-medium">
              Subject
              <Input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. A new drop is live, {name}" />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-body-sm font-medium">
            Message
            <Textarea value={body} rows={6} maxLength={channel === 'EMAIL' ? 5000 : 1000} showCount onChange={(e) => setBody(e.target.value)} placeholder="Hi {name}, ..." />
          </label>
          <p className="text-body-sm text-fg-muted">
            Use {'{name}'} for the first name and {'{full_name}'} for the full name. A line telling people they can reply "stop" is added automatically; anyone you
            mark as opted out on their profile is never messaged.
          </p>
        </div>
      )}
    </Modal>
  );
}
