# Stimpy launch: handoff for Codex (posts + ads)

> **Superseded (11 November 2026):** do not use this file. The current calendar, prices and ad plan are in [`content/calendar/STIMPY_CALENDAR.md`](../content/calendar/STIMPY_CALENDAR.md) and its [`HANDOFF.md`](../content/calendar/HANDOFF.md). This file's $30 price, ad dates and ad list no longer apply.

Prepared 7 November 2026. Launch: **Saturday 14.11.26** (Drop 001, 100 hoodies). All times are **Beirut time (EET, UTC+2)**.

This file is what Codex needs to schedule the Instagram posts and build the Meta ads. The full plan is in [`stimpy_master_plan.md`](../stimpy_master_plan.md) (section 10). Every Ads Manager setting is in [`stimpy-ads-manager-settings.pdf`](stimpy-ads-manager-settings.pdf), and the full campaign document is [`stimpy-ad-campaign.docx`](stimpy-ad-campaign.docx).

---

## 1. Rules for Codex

**Money (ads):**
1. Create every campaign, ad set and ad **paused**.
2. Use only the budgets, dates, audiences and settings in `stimpy-ads-manager-settings.pdf`. Never change a budget, date or audience on your own.
3. Before turning anything on, send the owner a summary (campaigns, ad sets, budgets, start/end, audiences, placements, ads, links) and **wait for a written OK**.
4. Turn on **A3** (~25 Nov) and **R1** (29 Nov) only when the owner says so.
5. Never pause, cut or move budget without the owner's OK. The decision rules in section 7 are for the owner to apply; Codex reports the numbers.

**Posts:**
1. Publish only the files listed in section 4, at the listed time, with the listed caption.
2. If a file is missing or marked "to make", do not publish a substitute: tell the owner.
3. Never use files from `content/stimpy-motion/out/` on this PC (see section 2).
4. Do not post anything that ends on "Coming soon", "Not yet" or "Set a reminder" after 14 Nov.

**Never put secrets (tokens, passwords) in this repo.**

---

## 2. Warning: outdated motion videos on this PC

The motion videos in `content/stimpy-motion/out/` on this PC were rendered on **22 Oct 2026**, before the current designs. They show **old artwork that is not in the 11 Stimpies on sale** (for example the black cat, "333 half evil" and the "one of one S" panel in Split Screen), and the poll videos are the old Chaos / Night versions.

**Use the current renders from the stronger PC** (or re-render there) for every motion video in the calendar: Logo Reveal, The Question, Split Screen, The Reveal, the countdowns and the poll videos.

---

## 3. What to prepare before handing over

### Files

| # | File | Used for | Status | How |
|---|---|---|---|---|
| 1 | `2026-11-08_reel_logo-reveal.mp4` | Post, Sun 8 Nov | From the stronger PC | Current render of Logo Reveal |
| 2 | `2026-11-09_reel_the-question.mp4` | Post, Mon 9 Nov | From the stronger PC | Current render of The Question |
| 3 | `2026-11-10_reel_zipper.mp4` | Post, Tue 10 Nov | **To make** | Cut a 3–5 s zipper close-up from the **raw STIMPY 2 footage without captions** (the edited STIMPY 2 has Arabic captions and speech from 1 s). If raw footage is not available, use STIMPY 2 0–3 s as it is. |
| 4 | `2026-11-11_reel_split-screen.mp4` | Post, Wed 11 Nov | From the stronger PC | Current render of Split Screen |
| 5 | `2026-11-12_reel_the-reveal.mp4` | Post, Thu 12 Nov | From the stronger PC | Current render of The Reveal (ends on 14.11) |
| 6 | `2026-11-13_reel_STIMPY1.mp4` | Post, Fri 13 Nov | Ready | `STIMPY 1 — EditFast AI.mp4` as it is |
| 7 | `2026-11-14_reel_STIMPY3.mp4` | Post, Sat 14 Nov | Ready | `STIMPY 3.mp4` as it is |
| 8 | `2026-11-14_carousel_01.jpg` … `_11.jpg` | Carousel, Sat 14 Nov | From the stronger PC | Posters 02–12 (one per Stimpie), 4:5 |
| 9 | `2026-11-15_reel_STIMPY2.mp4` | Post, Sun 15 Nov | Ready | `STIMPY 2.mp4` as it is |
| 10 | `2026-11-17_reel_STIMPY4.mp4` | Post, Tue 17 Nov | Ready | `stimpy 4.mp4` as it is |
| 11 | `story_countdown_D5.mp4`, `_D4`, `_D3`, `_D2`, `_tomorrow`, `_launch` | Stories 9–14 Nov | From the stronger PC | Current countdown renders |
| 12 | `story_poll_loud-soft.mp4`, `_wild-chill.mp4`, `_unleashed-offline.mp4` | Stories 9–11 Nov | From the stronger PC | Current "Which Back" poll renders |
| 13 | `story_logo-black.mp4` | Story, Sun 8 Nov | From the stronger PC | Black logo end card |
| 14 | `ad_A1_STIMPY3_web.mp4` | Ad A1 | **To make** | STIMPY 3 + 2–3 s coral end card: "One hoodie + two Stimpies · $30 + $5 delivery · Shop now" |
| 15 | `ad_W2_STIMPY3_wa.mp4` | Ad W2 | **To make** | STIMPY 3 + end card: "One hoodie + two Stimpies · $30 + $5 delivery · WhatsApp us your size and two designs" |
| 16 | `ad_W1_STIMPY4_wa.mp4` | Ad W1 | **To make** | STIMPY 4 + "Pick your two. $30" on screen + end card "Message us your size and two designs" |
| 17 | `ad_A3-R1_STIMPY2_web.mp4` | Ads A3 and R1 | **To make** | STIMPY 2 + end card: "Same hoodie. Different you. · $30 · Shop now" |
| 18 | `ad_A2_poster16_4x5.jpg`, `ad_A2_poster16_9x16.jpg` | Ad A2 | **To make** | Poster 16 "The Swap" (from the stronger PC) + "$30 · Pick your two" |

All videos 1080 × 1920 (9:16). Ad end cards can be added in Premiere or CapCut.

### Hosting

Meta's API fetches media from a **public URL**; it cannot read files on a PC. Upload the final files somewhere with direct links (cloud storage or the website's uploads) and give Codex the links.

### Access Codex needs

- Instagram professional account connected to the Facebook Page, and a token with `instagram_basic`, `instagram_content_publish` and `pages_read_engagement`.
- Ad account ID, and a token with `ads_management` and access to the Stimpy Pixel.
- WhatsApp Business number connected to the Page.
- Instagram's API publishes immediately and has no "schedule for later" option, so Codex needs a script or job that runs at each listed time on a machine that stays on.

---

## 4. Posting schedule (Codex)

Posts and Reels at **20:30**, stories at **13:00** and **21:00**, except launch day. Captions are in Lebanese Arabic with the English brand line; the owner should read them once before 8 Nov.

### Posts and Reels

| Date | Time | Type | File | Caption |
|---|---|---|---|---|
| **Sun 8 Nov** | 20:30 | Reel | `2026-11-08_reel_logo-reveal.mp4` | في شي رح يتغيّر. 14.11<br>Something's about to change. |
| **Mon 9 Nov** | 20:30 | Reel | `2026-11-09_reel_the-question.mp4` | قدّيش عندك هوديز بس كرمال الرسمة يلي على ضهرن؟ قول الصراحة 👀<br>Be honest. How many? |
| **Tue 10 Nov** | 20:30 | Reel | `2026-11-10_reel_zipper.mp4` | سحّاب واحد. احزر شو بيعمل 🤐<br>The back changes. 14.11 |
| **Wed 11 Nov** | 20:30 | Reel | `2026-11-11_reel_split-screen.mp4` | نفس الهودي. كل مرّة لوك جديد. عدّ قدّيش لوك شفت.<br>ابعتلنا كلمة **STIMPY** عالخاص وبيوصلك اللينك قبل الكل.<br>Same hoodie. Different you. |
| **Thu 12 Nov** | 20:30 | Reel | `2026-11-12_reel_the-reveal.mp4` | فكّ السحّاب، غيّر الضهر، وخلّي الهودي نفسه. السبت 14.11<br>One hoodie. Multiple identities. |
| **Fri 13 Nov** | 20:30 | Reel | `2026-11-13_reel_STIMPY1.mp4` | ليش Stimpy؟ هيدي القصة من أوّلها 👇 بكرا منبلّش.<br>One hoodie. Multiple identities. |
| **Sat 14 Nov** | **12:30** | Reel (launch) | `2026-11-14_reel_STIMPY3.mp4` | صار فيك تطلب! 🔥 هودي + 2 Stimpies بـ $30، والتوصيل $5 لكل لبنان، والدفع عند الاستلام. اللينك بالبايو.<br>One hoodie. Multiple identities. |
| **Sat 14 Nov** | 20:30 | Carousel (11 images) | `2026-11-14_carousel_01.jpg` … `_11.jpg` | الـ 11 Stimpy تبع Drop 001. أيّا تنين بتختار؟ 👇<br>Pick your two. $30 |
| **Sun 15 Nov** | 20:30 | Reel | `2026-11-15_reel_STIMPY2.mp4` | مش بس الضهر… الهودي حالو. قماش تقيل، قصّة مريحة، وبيضلّ نضيف حتى بلا Stimpy 🖤<br>It's in the details. |
| **Tue 17 Nov** | 20:30 | Reel | `2026-11-17_reel_STIMPY4.mp4` | أيّا وحدة بتختار؟ 👇<br>Which one would you pick? |

From 18 Nov: 3–4 posts a week (swaps, styling, customer photos, packing). The owner adds those to this table week by week; Codex does not invent posts.

### Stories

| Date | Time | File | Text / sticker | Who |
|---|---|---|---|---|
| **Sun 8 Nov** | 21:00 | `story_logo-black.mp4` | "Something's about to change." | Codex |
| **Mon 9 Nov** | 13:00 | `story_countdown_D5.mp4` | – | Codex |
| **Mon 9 Nov** | 21:00 | `story_poll_loud-soft.mp4` | **Poll sticker:** Loud / Soft | **Owner** (stickers are not in the API) |
| **Tue 10 Nov** | 13:00 | `story_countdown_D4.mp4` | – | Codex |
| **Tue 10 Nov** | 21:00 | Poll 1 result (real %) + `story_poll_wild-chill.mp4` | Result as text; **poll sticker:** Wild / Chill | **Owner** |
| **Wed 11 Nov** | 13:00 | `story_countdown_D3.mp4` | – | Codex |
| **Wed 11 Nov** | 21:00 | Poll 2 result + `story_poll_unleashed-offline.mp4` | Result as text; **poll sticker:** Unleashed / Offline | **Owner** |
| **Thu 12 Nov** | 13:00 | `story_countdown_D2.mp4` | – | Codex |
| **Thu 12 Nov** | 21:00 | Poll 3 result | Result as text | **Owner** |
| **Fri 13 Nov** | 13:00 | `story_countdown_tomorrow.mp4` | – | Codex |
| **Sat 14 Nov** | 12:30 | `story_countdown_launch.mp4` | **Link sticker** to the store | **Owner** |
| **Sat 14 Nov** | all day | Packing, reposts, prices | – | **Owner** |
| **From 15 Nov** | daily | Swaps, styling, customers, packing | – | **Owner** |

### Manual only (not possible through the API)

| Date | Task |
|---|---|
| Sat 7 Nov | Bio: "One hoodie. Endless backs. Launching 14.11." Choose the early-access keyword (**STIMPY**). |
| Wed 11 Nov | Bio: "Early access opens soon. DM "STIMPY" to get in first." |
| Fri 13 Nov | Send the store link by DM to everyone who sent STIMPY. |
| Sat 14 Nov | Bio: "One hoodie. Multiple identities. Swap the back, change the look. Order via WhatsApp 👇" (or bio 8). Add the link sticker. |
| Sat 14 – Sun 15 Nov | Pin: STIMPY 3, STIMPY 2, and a prices and delivery post. |
| From 14 Nov | Story Highlights (How it works, Order, Stimpies, Reviews, Sizes), replies to comments and DMs, reposting customers. |
| 10–12 Nov | Poll stickers and the real poll results (do not use the percentages baked into the result videos). |

---

## 5. Ads schedule (Codex builds, owner approves)

Ads do not have a "post time": they run continuously between their ad set's start and end. Settings: `stimpy-ads-manager-settings.pdf`.

| Date | Time | Action | Who |
|---|---|---|---|
| **Fri 13 Nov** | by 12:00 | Create the 4 retargeting custom audiences (video viewers 50%+ 30 d, Instagram engagers 30 d, website visitors 30 d, buyers 180 d to exclude). | Codex |
| **Fri 13 Nov** | by 18:00 | Build all 3 campaigns, 3 ad sets and 6 ads, **paused**. Send the owner the summary. | Codex |
| **Fri 13 Nov** | evening | Owner checks the summary and replies OK. | **Owner** |
| **Fri 13 Nov** | after OK | Set campaigns 1 and 2 (ads A1, A2, W1, W2) to active. Their ad sets start **Sat 14 Nov 00:00**. A3 stays paused. Campaign 3 stays paused. | Codex |
| **Sat 14 Nov** | 00:00 | Website (A1, A2) and WhatsApp (W1, W2) start delivering. | – |
| **Sat 14 Nov** | 20:00 | Day-1 check: spend started, links work, Purchases arriving in Events Manager. Report to owner. | Codex |
| **Mon 16 Nov** | 20:00 | Day-3 report: spend, delivery, any errors. | Codex |
| **Fri 20 Nov** | 20:00 | Day-7 report per ad: spend, hook rate, link CTR, cost per WhatsApp conversation, purchases. | Codex |
| **Tue 24 – Fri 27 Nov** | – | Mid-month review: owner compares cost per **delivered** order (order sheet). | **Owner** |
| **~Wed 25 Nov** | after owner OK | Turn on **A3** (STIMPY 2) in the Website campaign. | Codex |
| **Sat 28 Nov** | after owner OK | Set campaign 3 (Retargeting, R1) active. Its ad set starts **Sun 29 Nov 00:00**. | Codex |
| **Sun 29 Nov** | 00:00 | Retargeting (R1) starts delivering. | – |
| **~Sun 6 Dec** | 20:00 | Retargeting report: spend and cost per order. | Codex |
| **Sun 13 Dec** | 23:59 | All ad sets end. | – |
| **Mon 14 Dec** | 20:00 | Final report: spend, delivered orders and cost per delivered order per ad. | Codex |

### Ad text (Lebanese Arabic + English brand line)

| Ads | Primary text | Headline |
|---|---|---|
| Website: A1, A2, A3, R1 | هودي واحد، هويّات كتير. بتغيّر الضهر بثواني بالسحّاب. هودي + 2 Stimpies بـ $30، والتوصيل $5 لكل لبنان، والدفع عند الاستلام. وفيك تزيد Stimpy تالت بـ $10–12.<br>One hoodie. Multiple identities. | $30 · Pick your two |
| WhatsApp: W1, W2 | هودي واحد، ضهرين، $30. ابعتلنا قياسك والتصميمين يلي بدّك ياهن، التوصيل $5 لكل لبنان والدفع عند الاستلام.<br>One hoodie. Multiple identities. | اطلب عالواتساب · Order on WhatsApp |

**WhatsApp pre-filled message:** "Hi, I want to order the hoodie + 2 Stimpies. Size: __ · Designs: __ (W1)" for W1, and the same with "(W2)" for W2.

**WhatsApp auto-reply (greeting):** أهلا فيك بـ Stimpy! هودي + 2 Stimpies بـ $30، والتوصيل $5 لكل لبنان، والدفع عند الاستلام. وكل Stimpy زيادة بـ $10–12. شو قياسك، وأيّا تنين بدّك؟ (then the size chart image). Every order reply also asks: "بدّك تزيد Stimpy تالت بـ $10–12؟"

### Website links (URL parameters)

| Ad | URL parameters |
|---|---|
| A1 | `utm_source=meta&utm_medium=paid&utm_campaign=launch_website&utm_content=A1` |
| A2 | `utm_source=meta&utm_medium=paid&utm_campaign=launch_website&utm_content=A2` |
| A3 | `utm_source=meta&utm_medium=paid&utm_campaign=launch_website&utm_content=A3` |
| R1 | `utm_source=meta&utm_medium=paid&utm_campaign=launch_retargeting&utm_content=R1` |

The website saves these on each order, so every order shows which ad sold it.

---

## 6. Before ads go live (by Fri 13 Nov)

| Check | Status |
|---|---|
| Pixel connected to the website | Done (7 Nov) |
| Live store uses the same 11 design names as the ads | Done (7 Nov) |
| One test order shows as **Purchase** in Events Manager | To do |
| Live prices: $30 pack, $10–12 extra Stimpie, 1-Stimpie pack removed | To do |
| Domain verified; Conversions API token set on the server | To do |
| Ad files 14–18 made and uploaded (section 3) | To do |
| WhatsApp auto-reply, quick replies (price, sizes, delivery) and size chart | To do |
| Media hosted at public links | To do |

---

## 7. Decision rules (owner)

Goal: **cost per delivered order ≤ $10** ($30 − $18 product − ~$2 own costs; the customer pays the $5 delivery).

| When | Rule |
|---|---|
| Days 1–3 | Fix only broken things. Do not judge results. |
| Day 7 | Hook rate under ~20%: change the first 2 s. Link CTR under ~0.8%: clearer offer or ending. WhatsApp conversation over ~$2: change the opening or text. |
| Any time | Pause an ad that spent **$30** with no purchase and no checkout started, or a WhatsApp ad that spent **$15** with no real order chat. |
| 24–27 Nov | **≤ $10:** move money to it. **$10–15:** keep, test one change or turn on A3. **> $15 after 3+ orders:** cut it. |
| ~6 Dec | Retargeting cheaper than Website: move up to $2/day into it. $30 spent with no order: stop it. |

Change budgets only at these points, by at most ~20% at a time. Count every order once and judge ads on delivered orders.
