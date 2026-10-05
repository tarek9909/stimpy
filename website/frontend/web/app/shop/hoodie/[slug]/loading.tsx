import { Section, Skeleton, SkeletonGroup } from '@stimpy/ui';

export default function HoodieLoading() {
  return (
    <Section tone="white">
      <SkeletonGroup label="Loading the hoodie" className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Skeleton ratio="4 / 5" />
        <div className="flex flex-col gap-4">
          <Skeleton variant="text" lines={1} className="max-w-xs [&>div]:h-9" />
          <Skeleton variant="text" lines={3} />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-12" />
        </div>
      </SkeletonGroup>
    </Section>
  );
}
