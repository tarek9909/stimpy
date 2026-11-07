import random, math, sys
random.seed(86)
OUT = sys.argv[1]
INK, CREAM, CORAL, SKY, BUTTER, LILAC, MINT, PINK = "#111111", "#FFF4E6", "#FF7A59", "#5CC8FF", "#FFE45C", "#C9B6FF", "#7FD8BE", "#FFB3C7"

# zones kept clear of confetti: (x0, y0, x1, y1)
CLEAR = [(380, 1430, 2640, 2600), (2450, 3500, 3000, 4000), (80, 200, 1200, 1320), (1530, 260, 2680, 1180), (1060, 540, 1760, 1290), (240, 2940, 1400, 3610), (1490, 2750, 2200, 3450), (2220, 2740, 2670, 3460), (220, 1280, 1180, 1400), (1880, 1180, 2680, 1350), (300, 2720, 1250, 2900), (1460, 3600, 2360, 3720)]
def clear(x, y, pad=60):
    return not any(x0 - pad < x < x1 + pad and y0 - pad < y < y1 + pad for x0, y0, x1, y1 in CLEAR)

def squiggle(x, y, w, amp, waves, stroke, color):
    step = w / (waves * 2)
    d = f"M{x:.0f} {y:.0f}"
    for i in range(waves * 2):
        cx = x + step * (i + 0.5); cy = y + (-amp * 2 if i % 2 == 0 else amp * 2)
        d += f" Q{cx:.0f} {cy:.0f} {x + step * (i + 1):.0f} {y:.0f}"
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{stroke}" stroke-linecap="round"/>'

def zigzag(x, y, w, h, n, stroke, color):
    d = f"M{x} {y}" + "".join(f" L{x + w * (i + 1) / n:.0f} {y + (h if i % 2 == 0 else 0)}" for i in range(n))
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{stroke}" stroke-linejoin="miter"/>'

confetti, tries = [], 0
while len(confetti) < 110 and tries < 6000:
    tries += 1
    x, y = random.uniform(180, 2820), random.uniform(180, 3820)
    if not clear(x, y) or any(math.hypot(x - a, y - b) < 135 for a, b, _ in confetti):
        continue
    confetti.append((x, y, random.choice(["stick", "stick", "dot", "tri", "ring", "squig"])))

def confetto(x, y, kind):
    r = random.uniform(0, 180); c = random.choice([INK, INK, CORAL, SKY, BUTTER, LILAC, MINT])
    if kind == "stick":
        return f'<rect x="-45" y="-11" width="90" height="22" rx="4" fill="{c}" transform="translate({x:.0f} {y:.0f}) rotate({r:.0f})"/>'
    if kind == "dot":
        return f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{random.choice([12, 16, 22])}" fill="{c}"/>'
    if kind == "tri":
        return f'<path d="M0 -40 L36 26 L-36 26 Z" fill="{c}" transform="translate({x:.0f} {y:.0f}) rotate({r:.0f})"/>'
    if kind == "ring":
        return f'<circle cx="{x:.0f}" cy="{y:.0f}" r="28" fill="none" stroke="{c}" stroke-width="12"/>'
    return f'<g transform="translate({x - 60:.0f} {y:.0f}) rotate({r:.0f} 60 0)">{squiggle(0, 0, 120, 10, 2, 12, INK)}</g>'

terrazzo = []
for _ in range(70):
    x, y = random.uniform(0, 600), random.uniform(0, 600)
    n = random.randint(5, 7); rad = random.uniform(10, 30)
    pts = [(x + rad * random.uniform(0.6, 1.2) * math.cos(2 * math.pi * k / n), y + rad * random.uniform(0.6, 1.2) * math.sin(2 * math.pi * k / n)) for k in range(n)]
    terrazzo.append('<path d="M' + " L".join(f"{a:.0f} {b:.0f}" for a, b in pts) + f' Z" fill="{random.choice([INK, CORAL, SKY, LILAC, MINT, BUTTER])}"/>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 4000" width="3000" height="4000">
  <style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&amp;family=Rubik+Mono+One&amp;family=Pacifico&amp;family=Oswald:wght@500;700&amp;display=block');</style>
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="8"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.14"/></feComponentTransfer>
    </filter>
    <pattern id="dots" width="64" height="64" patternUnits="userSpaceOnUse"><circle cx="32" cy="32" r="11" fill="{INK}"/></pattern>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0 L0 0 L0 80" fill="none" stroke="{INK}" stroke-width="7"/></pattern>
    <pattern id="stripes" width="70" height="70" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="24" height="70" fill="{INK}"/></pattern>
    <pattern id="terrazzo" width="600" height="600" patternUnits="userSpaceOnUse"><rect width="600" height="600" fill="{CREAM}"/>{"".join(terrazzo)}</pattern>
  </defs>

  <rect width="3000" height="4000" fill="{PINK}"/>
  <rect width="3000" height="4000" fill="url(#grid)" opacity="0.12"/>

  <!-- top cluster -->
  <circle cx="640" cy="760" r="560" fill="{SKY}"/>
  <circle cx="640" cy="760" r="560" fill="url(#dots)" opacity="0.85"/>
  <rect x="1600" y="330" width="1000" height="760" fill="url(#stripes)" transform="rotate(10 2100 710)"/>
  <rect x="1660" y="390" width="880" height="640" fill="{BUTTER}" stroke="{INK}" stroke-width="14" transform="rotate(10 2100 710)"/>
  <text x="2100" y="800" text-anchor="middle" font-family="Rubik Mono One" font-size="250" fill="{INK}" transform="rotate(10 2100 710)">'86</text>
  <path d="M1080 1240 L1460 560 L1700 1240 Z" fill="none" stroke="{INK}" stroke-width="16" transform="translate(34 34)"/>
  <path d="M1080 1240 L1460 560 L1700 1240 Z" fill="{CORAL}"/>
  {squiggle(260, 1340, 900, 40, 4, 34, INK)}
  {zigzag(1900, 1240, 760, 90, 8, 30, INK)}
  <circle cx="2700" cy="250" r="80" fill="none" stroke="{INK}" stroke-width="22"/>

  <!-- centre card -->
  <rect x="480" y="1530" width="2100" height="1040" fill="{INK}"/>
  <rect x="440" y="1490" width="2100" height="1040" fill="url(#terrazzo)" stroke="{INK}" stroke-width="18"/>
  <rect x="540" y="1590" width="1900" height="840" fill="{CREAM}" stroke="{INK}" stroke-width="10"/>
  <text x="1490" y="1900" text-anchor="middle" font-family="Pacifico" font-size="290" fill="{CORAL}" stroke="{INK}" stroke-width="8" transform="rotate(-5 1490 1850)">totally</text>
  <text x="1490" y="2190" text-anchor="middle" font-family="Rubik Mono One" font-size="226" fill="{INK}">SWAPPABLE</text>
  <rect x="720" y="2265" width="1540" height="100" fill="{SKY}" stroke="{INK}" stroke-width="10"/>
  <text x="1490" y="2341" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="72" letter-spacing="16" fill="{INK}">ONE HOODIE · NINE MOODS</text>

  <!-- bottom cluster -->
  <path d="M260 3520 A 560 560 0 0 1 1380 3520 Z" fill="{LILAC}"/>
  <path d="M260 3520 A 560 560 0 0 1 1380 3520 Z" fill="url(#stripes)" opacity="0.22"/>
  <rect x="260" y="3520" width="1120" height="70" fill="{INK}"/>
  <rect x="1560" y="2820" width="560" height="560" fill="{MINT}" stroke="{INK}" stroke-width="18" transform="rotate(-14 1840 3100)"/>
  <circle cx="1840" cy="3100" r="160" fill="{CORAL}"/>
  <rect x="2240" y="2760" width="180" height="680" fill="url(#dots)"/>
  <rect x="2470" y="2760" width="180" height="680" fill="{BUTTER}" stroke="{INK}" stroke-width="14"/>
  {squiggle(1480, 3660, 860, 30, 3, 30, CORAL)}
  {zigzag(330, 2780, 900, 110, 7, 34, INK)}
  {squiggle(380, 3110, 820, 26, 4, 24, SKY)}

  <!-- confetti -->
  {"".join(confetto(*c) for c in confetti)}

  <rect width="3000" height="4000" filter="url(#grain)" style="mix-blend-mode:multiply"/>

  <g id="stimpy-sig" transform="translate(2730 3760)">
    <clipPath id="sigL"><rect x="-200" y="-300" width="200" height="400"/></clipPath>
    <clipPath id="sigR"><rect x="0" y="-300" width="200" height="400"/></clipPath>
    <text x="0" y="0" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="300" fill="#111111" clip-path="url(#sigL)">S</text>
    <text x="0" y="22" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="300" fill="none" stroke="#FF7A59" stroke-width="11" clip-path="url(#sigR)">S</text>
  </g>
</svg>
'''
open(OUT, "w", encoding="utf-8").write(svg)
