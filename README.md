# Stimpy — One Hoodie. Multiple Identities.

Official repository containing the motion design pipelines, 3D/WebGL video render engines, brand identity assets, and strategy documentation for **Stimpy**.

---

## 📁 Repository Structure

```
├── identity/                      # Complete brand identity assets
│   ├── stimpy_brand_identity.md   # Typography, color palette & core rules
│   ├── stimpy_brand_sheet.png     # Full brand visual board
│   ├── stimpy_logo_*.png          # Primary logos (main, on dark, on light)
│   └── stimpy_icon_*.png          # App & social icon variations
│
├── stimpy-motion/                 # Canvas & motion-graphics rendering pipeline
│   ├── app/                       # TypeScript/Vite motion engine & scene scripts
│   ├── out/                       # Rendered social video teasers & audio stems (.mp4, .wav)
│   │   ├── stimpy_logo.mp4        # Logo Reveal teaser
│   │   ├── stimpy_question.mp4    # "How many hoodies do you own?" teaser
│   │   ├── stimpy_split.mp4       # The Split Screen loop
│   │   ├── stimpy_glimpses_*.mp4  # Glimpses series (Bloom, Flame, Night, Sun, Wave)
│   │   ├── stimpy_countdown_*.mp4 # Daily Countdown series (D5 through Launch)
│   │   └── stimpy_which_*.mp4     # "Which Back Are You?" poll & result films
│   ├── PLAN.md                    # Motion graphics implementation plan
│   └── README.md                  # Motion engine documentation & render guide
│
├── stimpy-video/                  # 3D Avatar & WebGL video generator
│   ├── app/                       # Three.js 3D character animation engine
│   ├── out/                       # Rendered MP4s (stimpy_instagram.mp4, stimpy_avatar.mp4)
│   │   ├── stills/ & shots/       # Rendered frame previews & still captures
│   │   └── stimpies/              # Lookbook and Stimpie back-design cards
│   ├── song/                      # Audio synthesis scripts (synth.py) & QA logs
│   └── README.md                  # 3D renderer setup & specs
│
├── second_video/                  # 2D/GL scene engine & interactive sequencer
│   └── stimpy/                    # Stage engine, hoodie shaders, designs, and music
│
├── pdoom-video/                   # WebGL procedural canvas & visual treatment docs
│   └── docs/                      # ENGINE.md, TREATMENT.md
│
├── stimpy_master_plan.md          # Full brand, product, drop & content master plan
├── stimpy_concept_prelaunch.md    # Pre-launch hype strategy & community rollout
├── stimpy_bio_and_highlights.md   # Social bios, story highlights & caption copy
└── motion.md                      # Motion design signature system & storyboards
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

- [Brand Identity Guide](identity/stimpy_brand_identity.md)
- [Master Plan & Drop Architecture](stimpy_master_plan.md)
- [Pre-launch Strategy](stimpy_concept_prelaunch.md)
- [Social Bio & Highlights Architecture](stimpy_bio_and_highlights.md)
- [Motion Design & Video Storyboards](motion.md)
