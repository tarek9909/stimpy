import { Section, Skeleton, SkeletonGroup } from '@stimpy/ui';

export default function StimpieLoading() {
  return (
    <Section tone="white">
      <SkeletonGroup label="Loading the Stimpie" className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Skeleton ratio="0.64" className="mx-auto w-full max-w-md" />
        <div className="flex flex-col gap-4">
          <Skeleton variant="text" lines={1} className="max-w-xs [&>div]:h-9" />
          <Skeleton variant="text" lines={4} />
          <Skeleton className="h-12" />
        </div>
      </SkeletonGroup>
    </Section>
  );
}
