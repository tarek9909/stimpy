import random, sys

OUT = sys.argv[1]
random.seed(86)

PAL = {"K": "#111111", "C": "#FF7A59", "D": "#C9533A", "S": "#F2B98C", "E": "#111111",
       "W": "#FFF4E6", "B": "#2E3A8C", "R": "#FF3B5C", "Y": "#FFE45C", "G": "#5CC8FF"}

HERO = [
    "....KKKKKKKK....",
    "...KCCCCCCCCK...",
    "..KCCCCCCCCCCK..",
    "..KCCKKKKKKCCK..",
    "..KCKSSSSSSKCK..",
    "..KCKSESSESKCK..",
    "..KCKSSSSSSKCK..",
    "..KCKSSKKSSKCK..",
    "..KCCKSSSSKCCK..",
    ".KCCCCKKKKCCCCK.",
    "KCCCCCCWWCCCCCCK",
    "KCKCCCCWWCCCCKCK",
    "KCKCCCCCCCCCCKCK",
    "KCKCCDDDDDDCCKCK",
    "KSKCCDCCCCDCCKSK",
    "KSKCCDDDDDDCCKSK",
    ".KKKKKKKKKKKKKK.",
    "...KBBBKKBBBK...",
    "...KBBBKKBBBK...",
    "...KBBBKKBBBK...",
    "..KWWWWKKWWWWK..",
    "..KKKKKK.KKKKKK.",
]
HEART = [".KK.KK.", "KRRKRRK", "KRRRRRK", ".KRRRK.", "..KRK..", "...K..."]
COIN = ["..KKKK..", ".KYYYYK.", "KYYKKYYK", "KYKYYYYK", "KYYKKYYK", "KYYYYKYK", ".KYKKYK.", "..KKKK.."]


def sprite(rows, x0, y0, px):
    out = []
    for r, row in enumerate(rows):
        row = row.ljust(len(rows[0]), ".")
        for c, ch in enumerate(row):
            if ch != ".":
                out.append(f'<rect x="{x0 + c * px}" y="{y0 + r * px}" width="{px + 0.6}" height="{px + 0.6}" fill="{PAL[ch]}"/>')
    return "\n".join(out)


stars = "\n".join(
    f'<rect x="{random.randrange(400, 2600)}" y="{random.randrange(1300, 2350)}" width="{s}" height="{s}" fill="{random.choice(["#FFF4E6", "#5CC8FF", "#FFE45C"])}" opacity="{random.choice([0.5, 0.8, 1])}"/>'
    for s in [random.choice([14, 14, 20, 28]) for _ in range(70)])

bricks = []
for row in range(3):
    y = 2540 + row * 60
    off = 0 if row % 2 == 0 else 60
    for x in range(330 - off, 2670, 120):
        bricks.append(f'<rect x="{x + 4}" y="{y + 4}" width="112" height="52" fill="{"#C9533A" if row else "#FF7A59"}"/>')
bricks = "\n".join(bricks)

hero_px = 46
hero_x = 1500 - 16 * hero_px // 2
hero = sprite(HERO, hero_x, 1500, hero_px)
hearts = "\n".join(sprite(HEART, 470 + i * 200, 2800, 22) for i in range(3))
coins = sprite(COIN, 2280, 1650, 26) + sprite(COIN, 560, 1900, 20)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 4000" width="3000" height="4000">
  <style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&amp;family=Press+Start+2P&amp;display=block');</style>
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="5"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.16"/></feComponentTransfer>
    </filter>
    <filter id="neon" x="-20%" y="-60%" width="140%" height="220%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="b1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b2"/>
      <feMerge><feMergeNode in="b1"/><feMergeNode in="b1"/><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <pattern id="scan" width="10" height="12" patternUnits="userSpaceOnUse">
      <rect width="10" height="5" fill="#000000" opacity="0.32"/>
    </pattern>
    <radialGradient id="vig" cx="50%" cy="50%" r="70%">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.75"/>
    </radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.10"/>
      <stop offset="0.35" stop-color="#FFFFFF" stop-opacity="0.02"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0A0F2C"/>
      <stop offset="0.7" stop-color="#1C1550"/>
      <stop offset="1" stop-color="#3A1A5C"/>
    </linearGradient>
    <clipPath id="screen"><rect x="330" y="1000" width="2340" height="2380" rx="110"/></clipPath>
  </defs>

  <!-- cabinet -->
  <rect width="3000" height="4000" fill="#141018"/>
  <g stroke-width="34">
    <line x1="150" y1="0" x2="150" y2="4000" stroke="#FF7A59"/>
    <line x1="215" y1="0" x2="215" y2="4000" stroke="#FFE45C"/>
    <line x1="280" y1="0" x2="280" y2="4000" stroke="#5CC8FF"/>
    <line x1="2850" y1="0" x2="2850" y2="4000" stroke="#FF7A59"/>
    <line x1="2785" y1="0" x2="2785" y2="4000" stroke="#FFE45C"/>
    <line x1="2720" y1="0" x2="2720" y2="4000" stroke="#5CC8FF"/>
  </g>

  <!-- marquee -->
  <rect x="330" y="190" width="2340" height="660" rx="40" fill="#0B0714" stroke="#2A2233" stroke-width="16"/>
  <g font-family="'Press Start 2P'" text-anchor="middle" filter="url(#neon)">
    <text x="1500" y="480" font-size="150" fill="#FF5FA2">INSERT HOODIE</text>
    <text x="1500" y="700" font-size="120" fill="#5CC8FF">TO CONTINUE</text>
  </g>

  <!-- screen bezel -->
  <rect x="300" y="970" width="2400" height="2440" rx="130" fill="#000000" stroke="#2A2233" stroke-width="14"/>
  <g clip-path="url(#screen)">
    <rect x="330" y="1000" width="2340" height="2380" fill="url(#sky)"/>
    {stars}
    <g font-family="'Press Start 2P'" font-size="64" fill="#FFF4E6">
      <text x="450" y="1160" fill="#FF5FA2">1UP</text>
      <text x="450" y="1250">000000</text>
      <text x="1500" y="1160" text-anchor="middle" fill="#FF5FA2">HI-SCORE</text>
      <text x="1500" y="1250" text-anchor="middle">001</text>
      <text x="2550" y="1160" text-anchor="end" fill="#5CC8FF">2UP</text>
      <text x="2550" y="1250" text-anchor="end">000000</text>
    </g>
    {coins}
    {hero}
    {bricks}
    {hearts}
    <text x="1120" y="2875" font-family="'Press Start 2P'" font-size="52" fill="#FFF4E6">x3 LOOKS</text>
    <text x="1500" y="3110" text-anchor="middle" font-family="'Press Start 2P'" font-size="120" fill="#FFE45C" filter="url(#glow)">PRESS START</text>
    <text x="1500" y="3260" text-anchor="middle" font-family="'Press Start 2P'" font-size="44" fill="#FFF4E6" opacity="0.75">STIMPY ARCADE  1986</text>
    <rect x="330" y="1000" width="2340" height="2380" fill="url(#scan)"/>
    <rect x="330" y="1000" width="2340" height="2380" fill="url(#vig)"/>
    <rect x="330" y="1000" width="2340" height="2380" fill="url(#glass)"/>
  </g>

  <!-- control panel -->
  <rect x="330" y="3480" width="2340" height="380" rx="40" fill="#1F1A26" stroke="#2A2233" stroke-width="12"/>
  <rect x="470" y="3660" width="40" height="100" fill="#3A3442"/>
  <ellipse cx="490" cy="3770" rx="85" ry="40" fill="#111111"/>
  <circle cx="490" cy="3640" r="95" fill="#FF3B5C"/>
  <circle cx="460" cy="3610" r="28" fill="#FFFFFF" opacity="0.5"/>
  <g>
    <circle cx="900" cy="3670" r="85" fill="#FF7A59" stroke="#111111" stroke-width="14"/>
    <circle cx="1140" cy="3640" r="85" fill="#FFE45C" stroke="#111111" stroke-width="14"/>
    <circle cx="1380" cy="3670" r="85" fill="#5CC8FF" stroke="#111111" stroke-width="14"/>
    <circle cx="1620" cy="3640" r="85" fill="#C9B6FF" stroke="#111111" stroke-width="14"/>
  </g>
  <g font-family="'Press Start 2P'" font-size="40" fill="#8A8294" text-anchor="middle">
    <text x="900" y="3815">ZIP</text><text x="1140" y="3785">SWAP</text><text x="1380" y="3815">FLEX</text><text x="1620" y="3785">REPEAT</text>
  </g>
  <rect x="1900" y="3580" width="300" height="140" rx="16" fill="#0B0714" stroke="#FFE45C" stroke-width="8"/>
  <text x="2050" y="3672" text-anchor="middle" font-family="'Press Start 2P'" font-size="44" fill="#FFE45C">1P</text>

  <rect width="3000" height="4000" filter="url(#grain)" style="mix-blend-mode:screen" opacity="0.5"/>

  <g id="stimpy-sig" transform="translate(2470 3790)">
    <clipPath id="sigL"><rect x="-200" y="-300" width="200" height="400"/></clipPath>
    <clipPath id="sigR"><rect x="0" y="-300" width="200" height="400"/></clipPath>
    <text x="0" y="0" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="240" fill="#FFFFFF" clip-path="url(#sigL)">S</text>
    <text x="0" y="18" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="240" fill="none" stroke="#FF7A59" stroke-width="10" clip-path="url(#sigR)">S</text>
  </g>
</svg>
'''
open(OUT, "w", encoding="utf-8").write(svg)
