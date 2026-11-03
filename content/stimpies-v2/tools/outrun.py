import sys, random
random.seed(1986)
OUT = sys.argv[1]
HZ, VPX = 2380, 1500  # horizon y, vanishing point x

# perspective grid floor
grid = []
N = 15
for i in range(1, N + 1):
    y = HZ + 1650 * (i / N) ** 2.1
    grid.append(f'<line x1="0" y1="{y:.0f}" x2="3000" y2="{y:.0f}" stroke-width="{4 + i * 0.9:.1f}"/>')
for k in range(-14, 15):
    xb = VPX + k * 360
    grid.append(f'<line x1="{VPX + k * 30}" y1="{HZ}" x2="{xb}" y2="4000" stroke-width="7"/>')

stars = "".join(
    f'<circle cx="{random.uniform(150, 2850):.0f}" cy="{random.uniform(160, 1500):.0f}" r="{random.choice([3, 4, 5, 7])}" fill="#FFF4E6" opacity="{random.uniform(0.4, 1):.2f}"/>'
    for _ in range(90))

# sun stripes (cuts grow toward the horizon)
cuts = "".join(f'<rect x="0" y="{1880 + i * 78 + i * i * 2:.0f}" width="3000" height="{12 + i * 9}" fill="black"/>' for i in range(7))

LEAF = "M0 0 C160 -120 420 -110 640 70 C560 40 470 30 400 60 C300 0 160 0 0 40 Z"
fronds = "".join(f'<path d="{LEAF}" transform="rotate({a}) scale({s})"/>' for a, s in
                 [(-40, 1.0), (-5, 1.1), (30, 1.05), (65, 0.9), (215, 1.05), (180, 1.1), (145, 1.0), (115, 0.85), (-80, 0.7)])
PALM = f'''<g id="palm">
      <path d="M-34 0 C30 520 150 1040 110 1700 L210 1700 C250 1040 110 520 34 0 Z"/>
      {fronds}
      <circle cx="-20" cy="40" r="34"/><circle cx="30" cy="50" r="30"/>
    </g>'''

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 4000" width="3000" height="4000">
  <style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&amp;family=Bungee&amp;family=Yellowtail&amp;family=Oswald:wght@500;700&amp;display=block');</style>
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="21"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.16"/></feComponentTransfer>
    </filter>
    <filter id="neon" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#07031A"/>
      <stop offset="0.45" stop-color="#2A0B4E"/>
      <stop offset="0.8" stop-color="#8A1E6B"/>
      <stop offset="1" stop-color="#FF4F7B"/>
    </linearGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFE45C"/>
      <stop offset="0.45" stop-color="#FF7A59"/>
      <stop offset="1" stop-color="#E8236F"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A0B4E"/>
      <stop offset="1" stop-color="#07031A"/>
    </linearGradient>
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.46" stop-color="#5CC8FF"/>
      <stop offset="0.5" stop-color="#FFFFFF"/>
      <stop offset="0.52" stop-color="#2A0B4E"/>
      <stop offset="0.7" stop-color="#8A1E6B"/>
      <stop offset="1" stop-color="#FFB37A"/>
    </linearGradient>
    <mask id="sunCuts"><rect width="3000" height="4000" fill="white"/>{cuts}</mask>
    <clipPath id="aboveHz"><rect width="3000" height="{HZ}"/></clipPath>
    {PALM}
  </defs>

  <rect width="3000" height="{HZ}" fill="url(#sky)"/>
  {stars}

  <!-- sun -->
  <g clip-path="url(#aboveHz)">
    <circle cx="1500" cy="1980" r="900" fill="#FF4F7B" opacity="0.55" filter="url(#bloom)"/>
    <circle cx="1500" cy="1980" r="760" fill="url(#sun)" mask="url(#sunCuts)"/>
    <!-- wireframe mountains -->
    <path d="M0 {HZ} L0 2050 L300 1880 L520 2060 L760 1820 L1040 2100 L1160 {HZ} Z" fill="#1A0838" stroke="#FF2BD6" stroke-width="8"/>
    <path d="M3000 {HZ} L3000 2000 L2700 1840 L2460 2080 L2220 1900 L1960 2140 L1840 {HZ} Z" fill="#1A0838" stroke="#FF2BD6" stroke-width="8"/>
    <path d="M300 1880 L380 {HZ} M760 1820 L700 {HZ} M2700 1840 L2620 {HZ} M2220 1900 L2300 {HZ}" stroke="#FF2BD6" stroke-width="5" opacity="0.6"/>
  </g>

  <!-- neon grid floor -->
  <rect y="{HZ}" width="3000" height="{4000 - HZ}" fill="url(#floor)"/>
  <g stroke="#FF2BD6" filter="url(#neon)" opacity="0.95">{"".join(grid)}</g>
  <rect y="{HZ - 6}" width="3000" height="14" fill="#FFE45C" filter="url(#neon)"/>

  <!-- palms -->
  <g fill="#07031A">
    <use href="#palm" transform="translate(300 1560) scale(0.95) rotate(-6)"/>
    <use href="#palm" transform="translate(760 1950) scale(0.55) rotate(5)"/>
    <use href="#palm" transform="translate(2700 1500) scale(-1 1) rotate(-8)"/>
  </g>

  <!-- wedge sports car, rear view -->
  <g transform="translate(0 40)">
    <ellipse cx="1500" cy="3470" rx="560" ry="50" fill="#000000" opacity="0.6"/>
    <rect x="1070" y="3360" width="170" height="110" rx="14" fill="#07031A"/>
    <rect x="1760" y="3360" width="170" height="110" rx="14" fill="#07031A"/>
    <path d="M1030 3400 L1030 3190 C1040 3140 1080 3120 1130 3110 L1250 2990 C1280 2965 1720 2965 1750 2990 L1870 3110 C1920 3120 1960 3140 1970 3190 L1970 3400 Z" fill="#110626" stroke="#5CC8FF" stroke-width="8"/>
    <path d="M1285 3010 L1715 3010 L1810 3100 L1190 3100 Z" fill="#2A0B4E"/>
    <path d="M1320 3020 L1420 3020 L1360 3090 L1260 3090 Z" fill="#5CC8FF" opacity="0.35"/>
    <rect x="1040" y="3092" width="920" height="26" fill="#07031A"/>
    <rect x="1070" y="3170" width="860" height="56" rx="8" fill="#FF7A59" filter="url(#neon)"/>
    <rect x="1070" y="3170" width="860" height="56" rx="8" fill="#FFB37A"/>
    <rect x="1420" y="3270" width="160" height="70" rx="8" fill="#FFF4E6"/>
    <text x="1500" y="3322" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="50" fill="#07031A">SWAP</text>
  </g>

  <!-- title -->
  <text x="1500" y="740" text-anchor="middle" font-family="Yellowtail" font-size="330" fill="#FF2BD6" filter="url(#neon)" transform="rotate(-7 1500 700)">Stimpy</text>
  <g transform="translate(1500 1150) skewX(-10)">
    <text x="0" y="0" text-anchor="middle" font-family="Bungee" font-size="310" fill="none" stroke="#5CC8FF" stroke-width="34" filter="url(#neon)" stroke-linejoin="round">NIGHT DRIVE</text>
    <text x="0" y="0" text-anchor="middle" font-family="Bungee" font-size="310" fill="url(#chrome)" stroke="#FFFFFF" stroke-width="8" stroke-linejoin="round">NIGHT DRIVE</text>
  </g>
  <text x="1500" y="1360" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="80" letter-spacing="40" fill="#2A0B4E">· EST. 1986 ·</text>

  <!-- footer -->
  <text x="1500" y="3720" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="66" letter-spacing="22" fill="#5CC8FF">MILES AHEAD · NOTHING BEHIND</text>

  <rect width="3000" height="4000" filter="url(#grain)" style="mix-blend-mode:screen" opacity="0.6"/>

  <g id="stimpy-sig" transform="translate(2730 3760)">
    <clipPath id="sigL"><rect x="-200" y="-300" width="200" height="400"/></clipPath>
    <clipPath id="sigR"><rect x="0" y="-300" width="200" height="400"/></clipPath>
    <text x="0" y="0" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="300" fill="#FFFFFF" clip-path="url(#sigL)">S</text>
    <text x="0" y="22" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="300" fill="none" stroke="#FF7A59" stroke-width="11" clip-path="url(#sigR)">S</text>
  </g>
</svg>
'''
open(OUT, "w", encoding="utf-8").write(svg)
