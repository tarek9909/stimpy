// 00 · END CARDS (3.2 s each). Ready-made closers for the real footage: cut from your last shot to black and
// drop one of these in. Each opens with the signature zip (the sound logo), as the brand asks for every video.
import { C } from '../../engine/brand';
import { zipWipe } from '../../engine/zipper';
import type { Film } from '../../engine/engine';
import { Score, n, chord } from '../../audio/score';
import { fill, SIG_WIPE, wipeTravelStart } from '../common';
import { logoCard, lineCard } from '../shoot/cards';
import { LAUNCH } from '../06_the_reveal';

const T0 = 0.15, END = 3.2;
const HIT = T0 + SIG_WIPE * 0.7;

type Paint = (c: CanvasRenderingContext2D, age: number) => void;
const CARDS: { id: string; label: string; paint: Paint; dark: boolean }[] = [
  { id: 'logo-black', label: 'Logo on black', paint: (c, a) => logoCard(c, a, C.black), dark: true },
  { id: 'logo-coral', label: 'Logo on coral', paint: (c, a) => logoCard(c, a, C.coral), dark: false },
  { id: 'logo-white', label: 'Logo on white', paint: (c, a) => logoCard(c, a, C.white), dark: false },
  { id: 'soon', label: '"The back changes. Soon."', paint: (c, a) => lineCard(c, a, { small: 'The back changes.', big: 'Soon.' }), dark: true },
  { id: 'something', label: '"Something goes here."', paint: (c, a) => lineCard(c, a, { small: 'Something goes here.', big: 'Soon.' }), dark: true },
  { id: 'date', label: 'Launch date', paint: (c, a) => lineCard(c, a, { small: 'Launch day.', big: LAUNCH.date }), dark: true },
];
export const END_CARD_VARIANTS = CARDS.map((c) => ({ id: c.id, label: c.label }));

export function makeEndCard(v: string): Film {
  const card = CARDS.find((c) => c.id === v) ?? CARDS[0]!;
  return {
    id: 'endcards', title: `00 · End card: ${card.label}`, duration: END,
    marks: [{ t: 0, label: 'black' }, { t: T0, label: 'zip' }, { t: HIT, label: 'card' }],
    draw(c, t, post) {
      post.vignette = card.dark ? 0.3 : 0.14;
      zipWipe(c, (t - T0) / SIG_WIPE, (k) => fill(k, '#050505'), (k) => card.paint(k, t - HIT), { dir: 'down', teeth: card.dark ? C.cream : C.white, tape: C.black });
    },
    score() {
      const S = new Score(END);
      S.signatureZip(wipeTravelStart(T0, SIG_WIPE));
      S.bell(HIT, n('D5'), 0.6, { bus: 'sfx', decay: 2.2, verb: 0.6 });
      S.bell(HIT, n('A5'), 0.35, { bus: 'sfx', decay: 2.2, verb: 0.6 });
      S.pad(HIT, chord('D3', 'A3', 'F#4', 'C#5'), END - HIT - 0.5, 0.4, { attack: 0.1, release: 0.45 });
      S.sub(HIT, n('D1'), END - HIT - 0.4, 0.45);
      return S;
    },
  };
}
