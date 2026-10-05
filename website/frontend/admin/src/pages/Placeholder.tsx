import { Construction } from 'lucide-react';
import { EmptyState } from '@stimpy/ui';
import { PageHeader } from '../components/PageHeader';

/**
 * Stand-in for a section that is built by another dashboard engineer. Replace the default export
 * of `pages/<area>/index.tsx` with the real page (it receives every sub-path of its area, so it
 * can declare its own nested `<Routes>`).
 */
export function PlaceholderPage({ title, note }: { title: string; note?: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<Construction size={32} />} title="Coming soon" text={note ?? 'This section is being built.'} />
    </>
  );
}
