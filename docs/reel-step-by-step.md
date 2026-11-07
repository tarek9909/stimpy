# Stimpy reel: shoot and edit, step by step

Galaxy S24 Ultra to Adobe Premiere Pro. 1080x1920, 30 fps, about 14 s. Music about 101 BPM (confirm it). Hard cuts only.

## Part 1. Before you shoot

### What to bring

- [ ] Both hoodies: **Black** and **Cream**, ironed flat
- [ ] All 11 Stimpies, stacked in this order: **Sabotage** (hook and payoff); for the black hoodie **Bubblegum, Tiger, Unhinged, Ducks, Receipt**; for the cream hoodie **Neon, Public Persona, Chameleon, Same Day, Drama**
- [ ] Phone on a tripod or overhead arm, lens straight down, plus a remote or the 2 s timer
- [ ] Studio light at the side with a diffuser, and a lint roller
- [ ] Tape (4 corner marks per hoodie), a warm mid-tone surface, props: cassette, receipt, VHS tape, duck
- [ ] Plain top with no logos, no rings or watches
- [ ] Phone: full battery, 20 GB free, Do Not Disturb on

### Camera settings (set once, then do not change)

| Setting | Value |
|---|---|
| Mode and lens | Video, More, **Pro Video**, **1x**, portrait |
| Resolution | **UHD 30** (60 only for slow-mo) |
| HDR10+ and LOG | Both **off** |
| ISO and shutter | ISO **50 to 100**, **1/50** s (1/60 if your power is 60 Hz) |
| White balance | Manual, about **5200 K**, same for every clip |
| Focus | **MF**. Focus on the panel edge and surface texture, then do not touch it. |
| EV meter | Aim near **0 to -0.7**. Change ISO or the light, not the shutter. |
| Settings gear | Auto FPS **off**, video stabilization **off**, HEVC on |

> Per hoodie: black needs more light and cream clips easily. Re-set ISO only when you switch hoodies, check the histogram, and keep white balance the same.

### Slate every clip

- Start recording, wait **1 s** with nothing moving, do the action, wait **1 s**, stop. These are your trimming handles.
- Name each clip using the names in Part 2.

## Part 2. Shoot order and what each take must show

Shoot in this order (not the edit order) so you only change hoodie and light twice. The camera stays put for every overhead shot.

| # | Clip name | How to shoot it | Good take | Takes |
|---|---|---|---|---|
| 1 | **A_hook** (black, back up) | Hoodie in frame with the panel area upper-middle, hood laid up and out of the way. Bare back first. Hold **Sabotage** at the bottom edge, press it flat against the back, pull the zipper closed in **one smooth move**, pull your hand straight out downward. | Panel straight, zip closes cleanly, no hesitation, yellow not clipped | 3 |
| 2 | **C1_swaps_black** (black, back up) | **Do not stop recording.** Start with Sabotage on. Unzip it, set it aside off frame, zip on **Bubblegum**, then Tiger, Unhinged, Ducks, Receipt. About 5 s per swap, hold each design still 1 s after the zip closes. | Every panel straight, same zip motion each time, no hand covering the design | 2 |
| 3 | **D1_payoff_black** | Black hoodie with Sabotage on, back up, hands out of frame, 3 s still. | Panel centered, no arm shadow | 2 |
| 4 | **B_montage_black1 / black3** (front up, zip closed) | **black1**: Tiger fanned beside the hoodie. **black3**: Bubblegum, Drama, Ducks fanned. 2 s still each, hands out of frame. | Hoodie on the same tape marks in both | 2 each |
| | **Switch to the Cream hoodie.** Re-check ISO and histogram. Keep white balance. | | | |
| 5 | **C2_swaps_cream** (cream, back up) | Same routine as C1, one continuous take: **Neon, Public Persona, Chameleon, Same Day, Drama**. | Same as C1, cream not blown out | 2 |
| 6 | **D2_payoff_cream** | Cream hoodie with Sabotage on, back up, 3 s still. | Same position as D1 | 2 |
| 7 | **B_montage_cream2 / cream4** | Cream hoodie front up. **cream2**: Receipt and Chameleon beside it. **cream4**: Neon, Unhinged, Same Day, Public Persona. | Same tape marks as black | 2 each |
| | **Last, with both hoodies.** | | | |
| 8 | **D3_payoff_both** | Black and cream hoodies side by side, both back up, both with Sabotage. 3 s still. Both fully in frame. | Panels level, same height | 2 |
| 9 | **E_pullout** | Cream hoodie with Sabotage on the marks. Grab the bottom hem from below the frame and pull it straight down and out in **one 0.5 s motion**. Keep recording 1 s of empty surface. | Straight pull, no snagging, clean empty surface at the end | 3 |

## Part 3. Premiere, step by step

### Step 1. Import and set up

1. Copy the clips to your computer. Check each plays smoothly. If a clip stutters, right-click it, **Proxy**, **Create Proxies**, or transcode it.
2. **File, New, Sequence**, Settings tab: Editing mode **Custom**, Timebase **30 fps**, Frame size **1080 horizontal x 1920 vertical**, Pixel aspect **Square**. Name it `stimpy_reel`.
3. Make bins: `01_clips`, `02_music`, `03_sfx`. Rename clips as in Part 2.
4. Drag the first clip to the sequence and choose **Keep existing settings**. Set each 4K clip to **Scale 50** in Effect Controls (or right-click, **Set to Frame Size**).

### Step 2. Music and beat markers

1. Put the song on A1. Trim the start so the first strong beat is at `00:00:00:00`. If the track starts later, add that offset to every marker time below.
2. Confirm tempo: play and press **M** on 8 beats, then check the spacing is about 0.594 s (18 frames). If not, use beat = 60 / BPM seconds and ignore the table.
3. Click the timecode field, type each time from the table, press Enter, then press **M**. Turn **Snapping on (S)**.

| Beat | Time | Beat | Time | Beat | Time | Beat | Time |
|---|---|---|---|---|---|---|---|
| 0 | 00:00 | 7 | 04:05 | 13 | 07:22 | 19 | 11:09 |
| 1 | 00:18 | 8 | 04:23 | 14 | 08:10 | 20 | 11:26 |
| 2 | 01:06 | 9 | 05:10 | 15 | 08:27 | 21 | 12:14 |
| 3 | 01:24 | 10 | 05:28 | 16 | 09:15 | 22 | 13:02 |
| 4 | 02:11 | 11 | 06:16 | 17 | 10:03 | 23 | 13:20 |
| 5 | 02:29 | 12 | 07:04 | 18 | 10:21 | 24 | 14:08 |
| 6 | 03:17 | | | | | | |

Times are seconds:frames at 30 fps, at 101 BPM (1 beat = 17.8 frames).

### Step 3. Build the timeline (cut on the markers)

| Beats | Time | Clip | What to do |
|---|---|---|---|
| 0 to 6 | 0:00 to 3:17 | A_hook (best take) | Slide the clip so the frame where the zipper **finishes closing** sits at marker 6. Razor (**C**) at 0 and 6, ripple delete the rest (Shift+Delete). |
| 6 to 10 | 3:17 to 5:28 | black1, cream2, black3, cream4 | One beat (18 frames) each, using a still stretch with no hands. Use **Position** to keep the hoodie in the same spot. |
| 10 to 15 | 5:28 to 8:27 | C1_swaps_black | Scrub the take, find where each panel is fully zipped, razor so each swap starts on a marker with the zip finishing about 6 frames in. Order: Bubblegum, Tiger, Unhinged, Ducks, Receipt. |
| 15 to 20 | 8:27 to 11:26 | C2_swaps_cream | Same method. Order: Neon, Public Persona, Chameleon, Same Day, Drama. |
| 20 to 23 | 11:26 to 13:20 | D1_black, D3_both, D2_cream | One beat each, in that order. All show Sabotage. |
| 23 to 24 | 13:20 to 14:08 | E_pullout | Start at the grab, end on bare surface at marker 24. |
| after | 14:08 to 15:00 | End card (optional) | Coral `#FF7A59` background, split S logo centered, zip sound. Inside the safe zone. |

### Step 4. Polish

1. **Match the two hoodies**: Lumetri Color, Basic Correction. Adjust Exposure so black and cream clips feel equally bright. Contrast **+10**, Saturation **105 to 110**, Temperature slightly warm.
2. **Align**: fix any off-position clip with **Position** in Effect Controls. No transitions.
3. **Audio**: music peaks around **-6 dB**. The zipper sound from the clips goes on A2 at about **-18 dB**. Add a zip sound on the end card.
4. **Text**: keep it out of the top 14% (about 270 px) and bottom 25% (about 480 px).
5. Play it once with sound, looking for position jumps and clipped highlights.

### Step 5. Export

1. **File, Export, Media**. Format **H.264**, preset **Match Source - High bitrate**.
2. Video: 1080x1920, 30 fps, **VBR 1-pass**, target **10 to 12 Mbps**, max **16**. Audio: **AAC 320 kbps, 48 kHz**.
3. Export a version **without music** if you will add the song from Instagram's library, to avoid copyright muting.
4. Watch the file on your phone before posting.

## If something goes wrong

- Clips stutter: make proxies.
- Hoodie jumps between clips: adjust Position, and re-tape the marks next time.
- Flicker bands: shutter must match your power frequency (1/50 or 1/60).
- Dark panels vanish on the black hoodie: keep them on the cream one.
