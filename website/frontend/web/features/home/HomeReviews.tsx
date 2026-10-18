import { ReviewCard, Section } from '@stimpy/ui';
import type { Review } from '@stimpy/api-client';
import { ScrollRow } from '@/components/ScrollRow';

/** Render review media once; only the small scrolling controls need browser behavior. */
export function HomeReviews({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null;
  return <Section tone="white" heading="Worn your way." className="store-reviews">
    <ScrollRow label="Customer swaps">
      {reviews.map((review) => <li key={review.id} className="w-72 shrink-0 snap-start">
        <ReviewCard review={review} className="h-full" />
      </li>)}
    </ScrollRow>
  </Section>;
}
