import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { SearchX } from 'lucide-react';
import { Banner, Button, EmptyState, ErrorState, SkeletonGroup, SlowLoadingHint, useSkeletonDelay } from '@stimpy/ui';
import { asApiError, describeError } from '../api/errors';
import { ForbiddenState } from '../auth/roles';

export function NotFoundState({ what = 'item', backTo, backLabel = 'Go back' }: { what?: string; backTo?: string; backLabel?: string }) {
  return (
    <EmptyState
      icon={<SearchX size={32} />}
      title={`This ${what} no longer exists`}
      text="It may have been removed. Go back to the list and pick another."
      action={backTo ? <Button href={backTo} variant="secondary">{backLabel}</Button> : undefined}
    />
  );
}

export interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>;
  /** Placeholder shaped like the final content (use `Skeleton`). */
  skeleton: ReactNode;
  /** Renders with loaded data. Not called while loading or on a hard error. */
  children: (data: T) => ReactNode;
  /** Noun for the not-found message ("hoodie"). */
  notFoundWhat?: string;
  notFoundBackTo?: string;
  notFoundBackLabel?: string;
}

/**
 * Standard page-level states for one query (dashboard-pages 1.6): skeleton after 150 ms (with the
 * 8 s "still loading" hint), `404` -> in-page not-found, `403` -> in-page forbidden (no
 * redirect), other errors -> retry panel with the request reference, and a stale banner when a
 * refetch fails while data is on screen.
 */
export function QueryBoundary<T>({ query, skeleton, children, notFoundWhat, notFoundBackTo, notFoundBackLabel }: QueryBoundaryProps<T>) {
  const showSkeleton = useSkeletonDelay(query.isPending);

  if (query.isPending) {
    return (
      <SkeletonGroup>
        {showSkeleton ? skeleton : <div className="h-24" />}
        <SlowLoadingHint loading onRetry={() => void query.refetch()} className="mt-3" />
      </SkeletonGroup>
    );
  }
  if (query.isError && query.data === undefined) {
    const api = asApiError(query.error);
    if (api?.code === 'NOT_FOUND') return <NotFoundState what={notFoundWhat} backTo={notFoundBackTo} backLabel={notFoundBackLabel} />;
    if (api?.code === 'FORBIDDEN') return <ForbiddenState />;
    const info = describeError(query.error, 'read');
    return (
      <ErrorState
        title="Couldn't load this page"
        text={info.message}
        requestId={info.unexpected ? info.reference : null}
        onRetry={() => void query.refetch()}
        retryLoading={query.isFetching}
      />
    );
  }
  return (
    <>
      {query.isError ? (
        <Banner
          variant="warning"
          live
          className="mb-4"
          action={
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        >
          Showing saved data. Couldn&apos;t refresh.
        </Banner>
      ) : null}
      {children(query.data as T)}
    </>
  );
}
