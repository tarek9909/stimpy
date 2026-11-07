# Stimpy — One Hoodie. Multiple Identities.

Official repository containing the motion design pipelines, 3D/WebGL video render engines, brand identity assets, and strategy documentation for **Stimpy**.

---

## 📁 Repository Structure

```
├── content/                 # Start at content/README.md
│   ├── calendar/            # Launch plan and every file ready to post
│   │   ├── posts/           # Dated Reels, Stories, carousels and image posts
│   │   ├── _covers/         # Reel covers
│   │   ├── _previews/       # Calendar preview images
│   │   └── _archive/        # Replaced versions
│   ├── posters/             # The 18 poster designs
│   ├── videos/              # Video briefs and render projects
│   │   ├── stimpy-motion/   # Motion graphics and poster export
│   │   ├── stimpy-video/    # 50-second "One Hoodie" teaser
│   │   └── second_video/    # 60-second "Multiple Identities" film
│   ├── strategy/            # Master plan, concept, bio and highlights, creative review
│   ├── identity/            # Brand guide, logos, icons, hoodie specifications
│   ├── _stimpies/           # Source Stimpie artwork
│   └── drop-001/            # Drop 001 artwork
│
├── website/                 # Storefront, dashboard and backend code
├── docs/website/            # Website build documentation
├── stimpy_website_plan.md   # Website and dashboard plan
└── pp-viewer/               # 3D model viewer
```

---

## 🎨 Brand Concept

**One hoodie. Multiple identities.**
Stimpy reimagines the streetwear staple by decoupling the garment from a single static print. Through a signature zipper system, wearers can swap out interchangeable back-patches ("Stimpies") to suit any mood, aesthetic, or day of the week.

### The Zipper Signature
Every transition in the motion system uses the **"zip wipe"** — a zipper line traversing the screen pulling open the next scene, paired with the signature Stimpy zip sound logo.

---

## 🛠️ Tech Stack

- **Graphics & Animation:** Three.js, WebGL, Canvas 2D, Vite, TypeScript
- **Audio & Video Processing:** FFmpeg, Python audio synthesis (`synth.py`), Web Audio API
- **Fonts & Assets:** Archivo, Cormorant, IBM Plex Mono, Poppins, GLB 3D models

---

## 📄 Documentation

- [Content index](content/README.md)
- [Launch calendar](content/calendar/STIMPY_CALENDAR.md)
- [Brand Identity Guide](content/identity/stimpy_brand_identity.md)
- [Master Plan & Drop Architecture](content/strategy/master-plan.md)
- [Pre-launch Strategy](content/strategy/concept-and-prelaunch.md)
- [Social Bio & Highlights](content/strategy/instagram-bio-and-highlights.md)
- [Video Briefs](content/videos/video-briefs.md)
- [Website documentation](docs/website/README.md)
