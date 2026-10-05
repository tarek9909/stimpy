'use client';

import { Section } from '@stimpy/ui';
import type { Stimpie } from '@stimpy/api-client';
import { StimpieAddCard } from './StimpieAddCard';

export default function StimpieRecommendationCards({
  stimpies,
  heading,
  tone,
}: {
  stimpies: Stimpie[];
  heading: string;
  tone: 'white' | 'cream';
}) {
  return (
    <Section tone={tone} heading={heading}>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
        {stimpies.map((stimpie) => (
          <li key={stimpie.id}>
            <StimpieAddCard stimpie={stimpie} showDrop sizes="(min-width: 768px) 22vw, 50vw" />
          </li>
        ))}
      </ul>
    </Section>
  );
}
