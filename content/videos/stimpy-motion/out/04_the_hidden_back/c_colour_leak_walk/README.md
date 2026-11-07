# 04 · C · Colour Leak Walk

**Shoot brief for the real-footage version of the idea. 9:16, 10.6 s.**

Someone walks away down a dark corridor toward a single light. They are a pure silhouette, so the back is never seen, but the light changes colour on every footstep: coral, butter, sky, lilac, white. The back changes, and the light gives it away.

## Files
- `stimpy_colourleak_clean.mp4`: the animatic. It shows the timing, framing and sound to aim for.
- `stimpy_colourleak_notes.mp4`: the same film with the shoot notes on screen (shot number, what to do). Give this one to whoever is filming.
- `colourleak_clean_sheet.png`: contact sheet. `.wav`: the animatic soundtrack.

## Kit
- One RGB LED light with a remote (about $20–30)
- A dark hallway, alley or garage at night
- A tripod
- A friend on the remote

## Setup
Put the light at the far end, pointed back at the camera, hidden behind a doorframe or on the floor. Set the camera low on the tripod at waist height. Set exposure for the light so the subject stays black.

## Shot list (timed to the animatic)
| Time | Shot | How |
|---|---|---|
| 0.0 s | **Dark corridor, one light** | Hold on the empty corridor for a moment. |
| 0.3 s | **Walk toward the light** | The subject walks slowly away from the camera into the light. |
| 0.9 s | **A colour on every step** | The friend changes the colour with the remote on every footstep: coral, butter, sky, lilac, white. Count the steps out loud. |
| 2.6 s | **Text** | "The back changes." (add in the edit). |
| 7.3 s | **Into the light** | Full brightness as they reach it. They disappear into it. |
| 8.0 s | **End card** | Add `00_end_cards/stimpy_endcards_soon.mp4`. |

## Sound
Footsteps, with a soft synth chord that changes on every step along with the light.

## Edit
Lock the exposure (tap and hold) so the phone doesn't brighten the silhouette.

## Caption
"The back changes. Soon."

---
Source: `app/src/films/04_the_hidden_back/c_colour_leak_walk/index.ts`. Re-render: `cd app && node scripts/render.ts all --film colourleak`
