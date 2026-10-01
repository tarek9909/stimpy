# Stimpy: motion graphics production plan

The six motion-graphic videos from `motion.md` / `stimpy_master_plan.md` §9, built as code in one app.
Every frame is a pure function of time, and the soundtrack is synthesised from the same timeline, so the
preview in the browser is exactly what the final render will be.

## Shared signature system (every video)

| Rule from the brief | How it is built |
|---|---|
| **Zip wipe** transitions | `engine/zipper.ts`: a real zipper (interlocking teeth, coral pull tab) runs across the screen and the current scene parts in a V behind the pull, revealing the next one. |
| **Zip sound** = sound logo | `audio/sfx.ts`: tooth clicks are generated *from the pull's motion*, so every zip on screen sounds right. One fixed "signature zip" is used at logo moments. |
| One typeface | Poppins (Bold headlines, Medium subheads, Regular body). Other fonts appear only *inside* Stimpie artwork (e.g. the countdown numbers, which change art style daily). |
| Flat, clean hoodie illustration | `engine/hoodie.ts`: vector hoodie (back, front, 2D turn), figure, Stimpie panel docked with a zip track. |
| Vertical 9:16 | 1080×1920 @ 60 fps; key text kept inside the Reels safe area (top 260 px / bottom 420 px clear). |
| Logo | The split S is rebuilt as vector geometry from the Poppins Bold "S" (solid left half, outlined right half dropped lower), so it animates without losing fidelity. |
| **All brand colours in every video** | Coral, Black, White lead. Electric blue is used for action moments (counter, CTA, poll bar, "Live now"). Butter, Sky, Lilac and Cream arrive through the Stimpie designs and the world colours. |

## The Stimpie library (`art/designs.ts`)

These are procedural, animated back designs made only from brand colours, and each is signed with the split S in a corner:
FLAME · BLOOM · STATIC · WAVE · NIGHT · SUN · TAG · ORBIT · HALFTONE · CHECKER · EYE · PIXEL.

## The videos

01. **Logo Reveal** (10 s): black → a glowing zip line is pulled down in the dark → the back parts and coral light floods out → the logo flickers through four identities on the beat → it settles, and the tagline types itself → the zipper closes over everything → "Coming soon."
02. **The Question** (15 s): cream. "How many hoodies do you own…". A hoodie drops, then more hoodies rain down faster, each with a different back, while a blue counter ticks 3… 7… 12… 20. The tower wobbles and collapses and the music cuts. A vacuum pulls everything into ONE hoodie whose back flickers through every design. "What if you only needed one?" Zip wipe to the logo.
05. **Stimpie Glimpses** (10 s, a series of 5 episodes): a giant closed zipper over the hint colour. It cracks open for slivers of the art and snaps shut, faster and faster, with 2-frame hidden flashes. It stops at 80%, zips shut, and shows "Not yet."
07. **Countdown** (6 s template: 5 · 4 · 3 · 2 · 1 · Tomorrow, plus an 8 s launch day): a hoodie from behind. A Stimpie zips on, and its design IS the number, in a different art style each day. "Days left." On launch day the hoodie turns to the viewer, and a giant zipper unzips the screen to reveal "Live now" on electric blue, with room for the link sticker.
09. **Which Back Are You?** (10 s poll, 3 pairs: Loud/Quiet · Chaos/Calm · Night/Day) plus an 8 s results follow-up: two silhouetted Stimpies leak colour at their edges, labels fade in, a spotlight sweeps between them, and they pulse with the music. The follow-up shows a result bar filling, the winner cracking with light, and "You chose. Revealed first."
10. **The Split Screen** (15 s, seamless loop): a figure in a plain hoodie. A zip on every beat brings a new Stimpie and a new world colour. The swaps accelerate into a 4-way split, then slam into one: "Same hoodie." A final zip: "Different you." It ends on the plain hoodie it started with.

## Workflow

- Preview: `cd app && npm run dev` opens a film picker at http://localhost:5210. Space plays, and there are scrub, loop and frame-step controls. See README.md.
- Render (after approval): `node scripts/render.ts video --film logo` and the like (see README).
