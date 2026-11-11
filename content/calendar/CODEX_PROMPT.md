You are setting up the Stimpy (@stimpy.lb) Instagram content calendar and Meta ads. Today is Wed Nov 11, 2026. Launch is Sat Nov 14, 12:00 PM Beirut time.

SOURCE OF TRUTH
- Use ONLY content/calendar/STIMPY_CALENDAR.md (repo: tarek9909/stimpy, branch main). Pull main first.
- HANDOFF.md, META_SCHEDULING.md and VIDEOS_TO_BUILD.md are older. Where they disagree with STIMPY_CALENDAR.md, the calendar wins. Do not use docs/launch-handoff-codex.md or any $30 price plan.
- Do not invent posts, captions, prices, designs, budgets or settings. If something is missing and the calendar doesn't say what it should be, list it under "Needs owner decision". Do not fill it yourself.

AD CREATIVE RULE (strict)
- Only these five videos may be used as ads, uploaded exactly as they are, with no edits, end cards, trims, overlays or re-exports:
  STIMPY 1 — EditFast AI (1).mp4 | STIMPY 2 (1).mp4 | STIMPY 3 (1).mp4 | stimpy 4 (1).mp4 | WhatsApp Video 2026-11-10 at 12.19.00 AM.mp4
- On the owner's laptop they are in C:\Users\User\Downloads\stimpy vid\. If you can't reach that folder, stop and ask for the files. Do not substitute any other video.
- Upload the original files for ads, not the audio-adjusted copies in posts\.

PART 1: CONTENT CALENDAR CHECK
1. For every row in the calendar's "Calendar" section (Nov 2 to Dec 3), check:
   - the file exists in content/calendar/posts/ (or at the full path shown) and its name matches the row exactly
   - videos play start to finish (ffprobe or ffmpeg decode, no errors), are 1080x1920, and have audio
   - the caption and CTA match the calendar word for word, including emoji and Arabic
   - no file, caption or cover shows a price, discount, "100 hoodies", edition numbers, "One slot left" or custom-design claims
   - the cover exists in _covers\ where the calendar says one is needed
   - carousels have the slides listed under "Carousel slides", in filename order, without contact-sheet.png
2. Video files (.mp4) and previews (.jpg) are gitignored. If a file is on the other PC (C:\Projects\motion\content\calendar\posts\) and not in the repo folder, say which, and copy it over only if you can reach it.
3. For each missing item: if the file exists elsewhere in the repo or on the PC, put it in place under the calendar's exact name and say where it came from. If it doesn't exist, list it under "Still missing". Don't create artwork, captions or videos.
4. Schedule in Meta Business Suite every post that is ready and dated after now, at the calendar's date and time (Beirut). Stories that need a sticker go on the "Stories to post by hand" list instead. Don't schedule anything already past.

PART 2: ADS MANAGER SETUP
Build exactly what the calendar's "Ads" section says: "Budget", "Ad settings", "Ad build steps", "Ad copy" and "Spending limits". That means 4 campaigns, 4 ad sets and 6 ads (Ad 1 to Ad 6), with the names, budgets, dates, audiences, placements, buttons, links, UTMs, prefilled WhatsApp codes (SWAP-A, SWAP-B) and text from the calendar.
- Every website link must preselect sabotage,same-day-different-me. Open each link and confirm the pack and both designs are preselected.
- Turn off creative enhancements, automatic captions, multi-advertiser ads and Advantage+ audience everywhere.
- Create the three retargeting custom audiences (video viewers 50%+ 30 days, IG engagers 30 days, website visitors 30 days, exclude Purchase 180 days).
- STOP BEFORE PUBLISHING. Leave every campaign as a draft. Don't publish, don't submit for review, don't add or change payment methods, and don't change account spending limits until the owner confirms in writing. Spending money needs the owner's approval.
- If Meta doesn't offer a setting the calendar asks for, or forces a different value (minimum budget, objective name, attribution), don't work around it. Record what Meta showed.

REPORT (return all of this, in this order, as markdown)
A. Summary: what you checked, what you changed, what is still missing, and what needs the owner.
B. Calendar table, one row per calendar entry: Date | Time | Format | File name | File present (Y/N + path) | Plays OK (Y/N, duration, resolution) | Caption matches (Y/N, and the difference if N) | Cover (Y/N) | Scheduled in Business Suite (Y/N + scheduled time) | Notes.
C. Files you added or moved: source path, then destination path.
D. Still missing / Needs owner decision: one line each, with why.
E. Ads, one block per campaign:
   - campaign: name, objective, budget optimization, A/B test, spending limit
   - ad set: name, conversion location, performance goal, event, daily budget, start and end (date, time, time zone), bid strategy, location, ages, genders, Advantage+ audience, placements selected, custom audiences in and out, attribution shown
   - each ad: name, video file name uploaded (exact), primary text (exact), headline, button, full destination URL or WhatsApp number, prefilled message, creative enhancements (off/on), automatic captions (off/on), status (draft)
   - screenshots of the ad set settings and each ad preview (Reels, Stories and the 4:5 Feed), saved with names like ads/AD2_s3_web_preview.png
F. Link tests: for each website ad URL, what the page showed (pack, the two designs preselected, Y/N).
G. Anything Meta changed, refused or warned about.
H. Differences from the calendar: every place your setup differs from STIMPY_CALENDAR.md, and why. If there are none, write "None".

Commit any file changes in the repo to a new branch named codex/calendar-ads-setup with a clear message. Don't push to main. Include the branch name in the report.
