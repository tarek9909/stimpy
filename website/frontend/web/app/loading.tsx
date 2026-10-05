import { Section, Skeleton, SkeletonGroup } from '@stimpy/ui';

/** Route-level skeleton: a heading, a hero block and three cards, shaped like the content that replaces them. */
export default function Loading() {
  return (
    <Section tone="white">
      <SkeletonGroup label="Loading the page">
        <Skeleton variant="text" lines={1} className="mb-6 max-w-xs [&>div]:h-9" />
        <Skeleton ratio="16 / 9" className="mb-8 max-h-96 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6">
          <Skeleton variant="card" ratio="4 / 5" />
          <Skeleton variant="card" ratio="4 / 5" />
          <Skeleton variant="card" ratio="4 / 5" className="hidden md:block" />
        </div>
      </SkeletonGroup>
    </Section>
  );
}
