import { Section, Skeleton, SkeletonGroup } from '@stimpy/ui';

/** Shop: heading, tab bar and six cards (Stimpie ratio keeps the grid steady either way). */
export default function ShopLoading() {
  return (
    <Section tone="white">
      <SkeletonGroup label="Loading the shop">
        <Skeleton variant="text" lines={1} className="mb-6 max-w-[8rem] [&>div]:h-9" />
        <Skeleton className="mb-6 h-12 max-w-sm" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="card" ratio="4 / 5" />
          ))}
        </div>
      </SkeletonGroup>
    </Section>
  );
}
