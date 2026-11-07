// The edit: one scene per section of the score (music.json), so every cut lands on a bar line.
import type { SceneDef } from './engine/engine';
import type { Stage } from './engine/stage';
import music from './music.json';
import { cold } from './scenes/cold';
import { blank } from './scenes/blank';
import { explode } from './scenes/explode';
import { snap } from './scenes/snap';
import { identities } from './scenes/identities';
import { collection } from './scenes/collection';
import { yours } from './scenes/yours';
import { end } from './scenes/end';

const DRAW: Record<string, (S: Stage, t: number) => void> = { cold, blank, explode, snap, identities, collection, yours, end };

export const TIMELINE: SceneDef[] = music.sections.map((s) => ({ id: s.id, start: s.start, end: s.end, draw: DRAW[s.id]! }));
export const DURATION = music.duration;
