import { z } from 'zod';
import type { Schemas } from '../../api/client';

export type AdminDrop = Schemas['AdminDrop'];
export type DropState = AdminDrop['state'];

export const STATE_LABEL: Record<DropState, string> = {
  UPCOMING: 'Upcoming',
  LIVE: 'Live',
  SOLD_OUT: "Sold out - won't return",
  ENDED: 'Ended',
};

/** What the dashboard offers per state (dashboard-pages 9; the server stays authoritative). */
export function dropControls(state: DropState) {
  return {
    /** Fields can be edited. ENDED drops stay editable only to relaunch (moving the end date) - the spec's archive view is read-only. */
    canEdit: state === 'UPCOMING' || state === 'LIVE',
    /** The launch time is read-only once the drop has started (a started drop cannot move to a LATER start). */
    startsAtLocked: state !== 'UPCOMING',
    /** Ending early: server answers 409 for an ended or not-yet-started drop. */
    canEnd: state === 'LIVE' || state === 'SOLD_OUT',
    canDelete: true,
  };
}

export const dropSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name.').max(120, 'Use at most 120 characters.'),
    story: z.string().max(2000, 'Use at most 2000 characters.'),
    accentHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Enter a valid hex colour.'),
    startsAt: z.string().nullable(),
    endsAt: z.string().nullable(),
    stimpieIds: z.array(z.number()),
    teaserImage: z.string().nullable(),
    teaserVideo: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (!v.startsAt) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Choose the launch date and time.' });
    if (v.startsAt && v.endsAt && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The end must be after the launch.' });
  });
export type DropFormValues = z.infer<typeof dropSchema>;

export const NEW_DROP: DropFormValues = { name: '', story: '', accentHex: '#FFE45C', startsAt: null, endsAt: null, stimpieIds: [], teaserImage: null, teaserVideo: null };

export const toDropValues = (d: AdminDrop): DropFormValues => ({
  name: d.name,
  story: d.story,
  accentHex: d.accentHex,
  startsAt: d.startsAt,
  endsAt: d.endsAt,
  stimpieIds: d.stimpies.map((s) => s.id),
  teaserImage: d.teaserImage,
  teaserVideo: d.teaserVideo,
});

/** Body of `POST` / `PATCH /admin/drops`: dates are ISO UTC (the form holds them that way already). */
export function toDropBody(v: DropFormValues) {
  return {
    name: v.name.trim(),
    story: v.story,
    accentHex: v.accentHex.toUpperCase(),
    startsAt: v.startsAt as string,
    endsAt: v.endsAt,
    stimpieIds: v.stimpieIds,
    teaserImage: v.teaserImage,
    teaserVideo: v.teaserVideo,
  };
}

/** UI-only check when creating (the server accepts a past launch): the launch should be in the future. */
export function launchInPast(startsAtIso: string | null, nowMs: number = Date.now()): boolean {
  return !!startsAtIso && Date.parse(startsAtIso) <= nowMs;
}

/** Another drop that is LIVE while this one launches (overlap warning, not a block; business-rules 6). */
export function overlappingLive(others: ReadonlyArray<Pick<AdminDrop, 'id' | 'state' | 'name'>>, selfId: number | null): string | null {
  const live = others.find((d) => d.state === 'LIVE' && d.id !== selfId);
  return live ? live.name : null;
}

/** Hours between launch and sell-out, one decimal; null when it has not sold out. */
export function hoursToSellOut(startsAt: string, sellOutAt: string | null): number | null {
  if (!sellOutAt) return null;
  const h = (Date.parse(sellOutAt) - Date.parse(startsAt)) / 3_600_000;
  return h < 0 ? null : Math.round(h * 10) / 10;
}

/** "3 h 20 min" / "2 days 4 h" for a duration in hours. */
export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  return h ? `${d} days ${h} h` : `${d} days`;
}
