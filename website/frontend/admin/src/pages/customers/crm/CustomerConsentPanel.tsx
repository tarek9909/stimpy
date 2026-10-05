import { Banner } from '@stimpy/ui';
import { useFormatters } from '../../../lib/format';

/** Presentation models populated from generated customer/subscriber schemas. */
export interface ConsentChannelView {
  label: string;
  granted: boolean;
  updatedAt?: string | null;
}

export interface DropSignupView {
  key: string;
  channel: string;
  dropName: string | null;
  signedUpAt: string;
}

export function CustomerConsentPanel({
  channels,
  unsubscribedAt,
  signups,
}: {
  channels: readonly ConsentChannelView[];
  unsubscribedAt?: string | null;
  signups: readonly DropSignupView[];
}) {
  const f = useFormatters();
  return (
    <section aria-labelledby="customer-consent-heading" className="rounded-lg border border-base bg-surface-base p-4">
      <h2 id="customer-consent-heading" className="mb-3 text-h5">Consent & drop sign-ups</h2>
      {unsubscribedAt ? (
        <Banner variant="warning" className="mb-3" title="Unsubscribed">
          Email unsubscribe received <time dateTime={unsubscribedAt} title={f.dateTime(unsubscribedAt)}>{f.dateTime(unsubscribedAt)}</time>.
        </Banner>
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-2">
        {channels.map((channel) => (
          <div key={channel.label} className="rounded-md border border-line p-3">
            <dt className="text-body-sm font-medium">{channel.label}</dt>
            <dd className={`mt-1 text-body-sm font-semibold ${channel.granted ? 'text-fg-success' : 'text-fg-muted'}`}>
              {channel.granted ? 'Consented' : 'No consent'}
            </dd>
            {channel.updatedAt ? (
              <dd className="mt-1 text-xs text-fg-muted">
                Updated <time dateTime={channel.updatedAt} title={f.dateTime(channel.updatedAt)}>{f.dateTime(channel.updatedAt)}</time>
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-line pt-3">
        <h3 className="mb-2 text-body-sm font-semibold">Drop sign-ups</h3>
        {signups.length ? (
          <ul aria-label="Linked drop sign-ups" className="flex flex-col gap-2">
            {signups.map((signup) => (
              <li key={signup.key} className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-body-sm">
                <span>{signup.dropName ?? 'Any drop'} · {signup.channel}</span>
                <time dateTime={signup.signedUpAt} title={f.dateTime(signup.signedUpAt)} className="text-fg-muted">{f.dateTime(signup.signedUpAt)}</time>
              </li>
            ))}
          </ul>
        ) : <p className="text-body-sm text-fg-muted">No linked drop sign-ups.</p>}
      </div>
    </section>
  );
}
