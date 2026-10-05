// The film registry: every motion-graphic video from the brief, with its variants.
import type { Film } from '../engine/engine';
import { makeLogoReveal } from './logo-reveal';
import { makeQuestion } from './question';
import { makeGlimpse, EPISODES } from './glimpses';
import { makeCountdown, COUNTDOWN_VARIANTS } from './countdown';
import { makeWhichBack, WHICH_VARIANTS } from './which-back';
import { makeSplitScreen } from './split-screen';
import { makeEdgeZip, makeSoundFirst, makeEmptyFrame, makePerfectLoop } from './03_zipper_close_up';
import { makeShyBack, makeAlwaysBlocked, makeColourLeak, makeOutOfFrame, makeCensored } from './04_the_hidden_back';
import { makeEndCard, END_CARD_VARIANTS } from './00_end_cards';
import { SHOOT_VARIANTS } from './shoot/cards';
import { makeReveal } from './06_the_reveal';

export interface FilmDef {
  id: string;
  title: string;
  brief: string;
  variants?: { id: string; label: string }[];
  /** renders go to out/<folder>/ (and the source lives in films/<folder>/) */
  folder?: string;
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
  // the "real footage" ideas: shoot animatics, each with a clean cut and a cut with the shoot notes on it
  ...([
    ['edgezip', '03 · A · The Edge Zip (10 s)', '03_zipper_close_up/a_the_edge_zip', 'Macro along the Stimpie edge: the pull turns a corner, the last tooth clicks.', makeEdgeZip],
    ['soundfirst', '03 · B · Sound First (9 s)', '03_zipper_close_up/b_sound_first', 'Black screen, only the zip sound; hard cut to the macro on the clack.', makeSoundFirst],
    ['emptyframe', '03 · C · The Empty Frame (10 s)', '03_zipper_close_up/c_the_empty_frame', 'Overhead: a hand zips an empty frame closed round nothing. "Something goes here."', makeEmptyFrame],
    ['perfectloop', '03 · D · The Perfect Loop (8 s loop)', '03_zipper_close_up/d_the_perfect_loop', 'Overhead: unzip all the way round and back, landing on frame one. Loops forever.', makePerfectLoop],
    ['shyback', '04 · A · The Shy Back (10.4 s)', '04_the_hidden_back/a_the_shy_back', 'The camera circles; they keep turning to face it. Then they finally turn… cut.', makeShyBack],
    ['blocked', '04 · B · Always Blocked (10 s)', '04_the_hidden_back/b_always_blocked', 'Five streets, five things perfectly in the way of the back.', makeAlwaysBlocked],
    ['colourleak', '04 · C · Colour Leak Walk (10.6 s)', '04_the_hidden_back/c_colour_leak_walk', 'A silhouette walks into a light that changes colour on every step.', makeColourLeak],
    ['outofframe', '04 · D · Out of Frame (10 s)', '04_the_hidden_back/d_out_of_frame', 'A handheld follow that is clearly not allowed to show the back.', makeOutOfFrame],
    ['censored', '04 · E · Censored (10.4 s)', '04_the_hidden_back/e_censored', 'A sunny walk away with the back pixelated, glitching for two frames at a time.', makeCensored],
  ] as const).map(([id, title, folder, brief, make]): FilmDef => ({ id, title, folder, brief, variants: SHOOT_VARIANTS, make })),
  {
    id: 'endcards', title: '00 · End cards (3.2 s)', folder: '00_end_cards', brief: 'Closers for the real footage, each opening with the signature zip.',
    variants: END_CARD_VARIANTS, make: (v) => makeEndCard(v),
  },
  {
    id: 'reveal', title: '06 · The Reveal (14.5 s)', folder: '06_the_reveal',
    brief: 'The hero video: hands unzip one Stimpie and zip on another, the world changes, the person turns around. Ends on the launch date.', make: () => makeReveal(),
  },
];

export function findFilm(id: string) { return FILMS.find((f) => f.id === id) ?? FILMS[0]!; }
