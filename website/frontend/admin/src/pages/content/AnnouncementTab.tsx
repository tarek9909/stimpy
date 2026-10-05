import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Skeleton, useToast } from '@stimpy/ui';
import { Button } from '@stimpy/ui';
import { AdminForm } from '../../components/form/AdminForm';
import { SwitchField, TextField } from '../../components/form/Field';
import { FormSection } from '../../components/form/FormSection';
import { useFormDraft } from '../../components/form/useFormDraft';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useUnsavedChangesGuard } from '../../lib/unsavedChanges';
import { useContentBlock, useSaveContent, type AnnouncementBlock } from './api';

/** `https://...` or a site-relative path with a single leading slash; `javascript:` and every other scheme are rejected. */
export const LINK_RE_HTTPS = /^https:\/\/[^\s/]+[^\s]*$/i;
export const LINK_RE_PATH = /^\/(?!\/)[^\s]*$/;
export const isSafeLink = (v: string): boolean => LINK_RE_HTTPS.test(v) || LINK_RE_PATH.test(v);

export const announcementSchema = z
  .object({
    enabled: z.boolean(),
    text: z.string().max(120, 'Use at most 120 characters.'),
    linkUrl: z.string().max(500, 'Use at most 500 characters.'),
  })
  .superRefine((v, ctx) => {
    if (v.enabled && v.text.trim() === '') ctx.addIssue({ code: 'custom', path: ['text'], message: 'Enter the announcement text, or switch it off.' });
    const link = v.linkUrl.trim();
    if (link !== '' && !isSafeLink(link)) ctx.addIssue({ code: 'custom', path: ['linkUrl'], message: 'Use an https:// link or a path starting with /.' });
  });
type Values = z.infer<typeof announcementSchema>;

const toValues = (a: AnnouncementBlock): Values => ({ enabled: a.enabled, text: a.text, linkUrl: a.linkUrl ?? '' });

export function toAnnouncementBody(v: Values): AnnouncementBlock {
  return { enabled: v.enabled, text: v.text.trim(), linkUrl: v.linkUrl.trim() === '' ? null : v.linkUrl.trim() };
}

function AnnouncementForm({ initial }: { initial: AnnouncementBlock }) {
  const toast = useToast();
  const save = useSaveContent('announcement');
  const defaults = useMemo(() => toValues(initial), [initial]);
  const form = useForm<Values>({ resolver: zodResolver(announcementSchema), defaultValues: defaults, mode: 'onSubmit', reValidateMode: 'onChange' });
  const guard = useUnsavedChangesGuard(form.formState.isDirty);
  const draft = useFormDraft(form);
  const v = useWatch({ control: form.control });
  const shownText = (v.text ?? '').trim();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {draft.banner}
      <AdminForm
        id="announcement-form"
        form={form}
        className="flex flex-col gap-4"
        onSubmit={async (values) => {
          const saved = await save.mutateAsync(toAnnouncementBody(values));
          draft.clear();
          form.reset(toValues(saved));
          toast.success('Announcement saved.');
        }}
      >
        <FormSection title="Announcement bar" description="A black strip above the website header.">
          <SwitchField name="enabled" label="Show on the website" />
          <TextField name="text" label="Text" maxLength={120} autoComplete="off" hint="Up to 120 characters. Required while it is shown." />
          <TextField name="linkUrl" label="Link" optional autoComplete="off" type="text" inputMode="url" hint="https://... or a page of the site such as /shop. Leave empty for no link." />
        </FormSection>
        <div>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting || save.isPending}>
            Save announcement
          </Button>
        </div>
      </AdminForm>
      <section aria-labelledby="ann-preview" className="flex flex-col gap-2">
        <h2 id="ann-preview" className="text-h5">Preview</h2>
        <div className="flex min-h-10 items-center justify-center bg-ink px-4 py-2 text-center text-body-sm text-white" data-testid="announcement-preview">
          {shownText ? <span className={v.linkUrl?.trim() ? 'underline underline-offset-4' : undefined}>{shownText}</span> : <span className="opacity-70">Your announcement appears here</span>}
        </div>
        {!v.enabled ? <p className="text-body-sm text-fg-muted">Switched off: the bar is hidden on the website.</p> : null}
      </section>
      {guard.dialog}
    </div>
  );
}

/** Content -> Announcement bar (dashboard-pages 13.1). */
export function AnnouncementTab() {
  const q = useContentBlock('announcement');
  return (
    <QueryBoundary query={q} skeleton={<Skeleton variant="rect" className="h-72" />}>
      {(a) => <AnnouncementForm initial={a} />}
    </QueryBoundary>
  );
}
