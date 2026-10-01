// The film registry: every motion-graphic video from the brief, with its variants.
import type { Film } from '../engine/engine';
import { makeLogoReveal } from './logo-reveal';
import { makeQuestion } from './question';
import { makeGlimpse, EPISODES } from './glimpses';
import { makeCountdown, COUNTDOWN_VARIANTS } from './countdown';
import { makeWhichBack, WHICH_VARIANTS } from './which-back';
import { makeSplitScreen } from './split-screen';

export interface FilmDef {
  id: string;
  title: string;
  brief: string;
  variants?: { id: string; label: string }[];
  make(variant: string): Film;
}

export const FILMS: FilmDef[] = [
  { id: 'logo', title: '01 · Logo Reveal (10 s)', brief: 'Introduce the name, the look, and the zip sound. Caption: "Something\'s about to change."', make: () => makeLogoReveal() },
  { id: 'question', title: '02 · The Question (15 s)', brief: 'Feel the problem before the solution. Caption: "Be honest. How many?"', make: () => makeQuestion() },
  {
    id: 'glimpses', title: '05 · Stimpie Glimpses (10 s series)', brief: 'Build desire for the designs without revealing them. Caption: "Pause it if you can."',
    variants: EPISODES.map((e) => ({ id: e.id, label: `Nº 0${e.no} — ${e.design.toUpperCase()}` })), make: (v) => makeGlimpse(v),
  },
  {
    id: 'countdown', title: '07 · Countdown (6 s stories)', brief: 'Daily story countdown for the final days; the number changes identity each day. Launch day turns and unzips to "Live now".',
    variants: COUNTDOWN_VARIANTS, make: (v) => makeCountdown(v),
  },
  {
    id: 'which', title: '09 · Which Back Are You? (10 s + results)', brief: 'Story poll: two silhouetted Stimpies; add the poll sticker in Instagram. Next day: the results follow-up.',
    variants: WHICH_VARIANTS, make: (v) => makeWhichBack(v),
  },
  { id: 'split', title: '10 · The Split Screen (15 s loop)', brief: 'The whole concept without words, designed to loop. Caption: "Count how many looks."', make: () => makeSplitScreen() },
];

export function findFilm(id: string) { return FILMS.find((f) => f.id === id) ?? FILMS[0]!; }
