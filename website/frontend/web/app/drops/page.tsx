import type { Metadata } from 'next';
import { Button, EmptyState, Section, TextLink } from '@stimpy/ui';
import { getBusinessTimezone } from '@/lib/business';
import { must } from '@/lib/api-server';
import { getContentSafe, getDrops } from '@/lib/data';
import { pageMetadata } from '@/lib/seo';
import { ArchiveDropCard, CurrentDropBanner, UpcomingDropCard } from '@/features/drops/DropsList';
import { Instagram, Sparkles } from '@/components/icons';

/** ISR 10 s: drop state changes with the clock (the API itself caches `GET /drops` for 10 s). */
export const revalidate = 10;

export async function generateMetadata(): Promise<Metadata> {
  const drops = await getDrops().catch(() => null);
  const first = drops?.live ?? drops?.upcoming[0] ?? null;
  return pageMetadata({
    title: 'Drops: limited Stimpies, never restocked',
    description: "Current and upcoming Stimpy drops. When a drop sells out, it won't return.",
    path: '/drops',
    image: first?.teaserImage ?? null,
  });
}

export default async function DropsPage() {
  const [drops, tz, content] = await Promise.all([must(() => getDrops()), getBusinessTimezone(), getContentSafe()]);
  const { live, upcoming, archive } = drops;
  const nothingAnnounced = !live && upcoming.length === 0;
  const instagram = content?.business.instagramUrl ?? null;

  return (
    <>
      <Section tone="white" heading="Drops" headingLevel={1} className={live ? '!pb-0' : undefined}>
        {nothingAnnounced ? (
          <EmptyState
            icon={<Sparkles width={32} height={32} />}
            title="No drops announced yet"
            text="Follow us on Instagram to hear first."
            action={
              instagram ? (
                <Button href={instagram} variant="dark" leftIcon={<Instagram width={20} height={20} aria-hidden="true" />}>
                  Follow on Instagram
                </Button>
              ) : undefined
            }
          />
        ) : !live ? (
          <EmptyState
            icon={<Sparkles width={32} height={32} />}
            title="No drop is live right now"
            text="The next one is below."
          />
        ) : (
          <p className="max-w-prose text-lead text-fg-muted">Limited Stimpies. When a drop sells out, it won&apos;t return.</p>
        )}
      </Section>

      {live ? <CurrentDropBanner drop={live} timeZone={tz} /> : null}

      {upcoming.length > 0 ? (
        <Section tone="white" heading="Upcoming" zipIn zipFrom="black">
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((d) => (
              <li key={d.id}>
                <UpcomingDropCard drop={d} timeZone={tz} />
              </li>
            ))}
          </ul>
        </Section>
      ) : !nothingAnnounced ? (
        <Section tone="white" heading="Upcoming">
          <EmptyState title="Nothing scheduled yet" text="The next drop is coming. Follow us to hear first." />
        </Section>
      ) : null}

      <Section tone="cream" heading="Archive">
        {archive.length === 0 ? (
          <EmptyState title="The archive starts with Drop 01" />
        ) : (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {archive.map((d) => (
              <li key={d.id}>
                <ArchiveDropCard drop={d} />
              </li>
            ))}
          </ul>
        )}
        {instagram ? (
          <p className="mt-8 text-body-sm">
            <TextLink href={instagram}>Follow the next drop on Instagram</TextLink>
          </p>
        ) : null}
      </Section>
    </>
  );
}
