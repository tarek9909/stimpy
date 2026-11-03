import sys, math

def wave_band(y0, thick, amp, phase, color):
    pts_top, pts_bot = [], []
    for i in range(0, 61):
        x = -100 + i * 3200 / 60
        dy = amp * math.sin(x / 520 + phase) + 0.08 * (x - 1500) * 0.25
        pts_top.append((x, y0 + dy))
        pts_bot.append((x, y0 + thick + dy * 1.06))
    d = "M" + " L".join(f"{x:.0f} {y:.0f}" for x, y in pts_top)
    d += " L" + " L".join(f"{x:.0f} {y:.0f}" for x, y in reversed(pts_bot)) + "Z"
    return f'<path d="{d}" fill="{color}"/>'

stripes = []
cols = ["#FF7A59", "#FFF4E6", "#FF7A59", "#FFF4E6", "#FF7A59", "#FFF4E6", "#2E63FF"]
for i, c in enumerate(cols):
    stripes.append(wave_band(150 + i * 130, 132, 70, 0.6, c))

speed = []
for i, (y, x0, ln, c) in enumerate([(2580, 120, 520, "#FFF4E6"), (2680, 160, 300, "#FFF4E6"), (2740, 100, 600, "#FFF4E6"),
                                     (2820, 180, 300, "#2E63FF"), (2900, 140, 460, "#FF7A59"), (2980, 220, 260, "#FFF4E6")]):
    speed.append(f'<rect x="{x0}" y="{y}" width="{ln}" height="22" rx="11" fill="{c}"/>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 4000" width="3000" height="4000">
  <style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&amp;family=Anton&amp;family=Oswald:wght@500;700&amp;family=Racing+Sans+One&amp;display=block');</style>
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="31"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.2"/></feComponentTransfer>
    </filter>
    <filter id="ink" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="8"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2 1.1"/>
    </filter>
    <clipPath id="flag"><rect x="0" y="0" width="3000" height="1150"/></clipPath>
    <g id="wheel">
      <circle r="205" fill="#111111"/>
      <circle r="190" fill="#1E1E1E"/>
      <circle r="120" fill="#BFC6CC"/>
      <circle r="120" fill="none" stroke="#111111" stroke-width="10"/>
      <g stroke="#7D868E" stroke-width="18"><path d="M0 -110V110M-110 0H110M-78 -78L78 78M78 -78L-78 78"/></g>
      <circle r="36" fill="#FF7A59" stroke="#111111" stroke-width="10"/>
      <path d="M-150 -60 A160 160 0 0 1 -60 -150" fill="none" stroke="#FFF4E6" stroke-width="10"/>
    </g>
  </defs>

  <rect width="3000" height="4000" fill="#121212"/>

  <!-- waving flag stripes -->
  <g clip-path="url(#flag)">{''.join(stripes)}</g>

  <!-- headline, italic condensed -->
  <g transform="skewX(-9)">
    <text x="1770" y="1690" text-anchor="middle" font-family="Anton" font-size="560" fill="#FFF4E6" letter-spacing="6">GRAND PRIX</text>
    <text x="1840" y="2170" text-anchor="middle" font-family="Anton" font-size="470" fill="#FF7A59" letter-spacing="10">DE STIMPY</text>
  </g>
  <text x="1500" y="2370" text-anchor="middle" font-family="Oswald" font-weight="500" font-size="88" letter-spacing="22" fill="#FFF4E6">12 · 13 JUNE 1976 · THE TWO SIDES CIRCUIT</text>

  <!-- speed lines -->
  {''.join(speed)}

  <!-- the car -->
  <ellipse cx="1520" cy="3165" rx="1250" ry="46" fill="#000000" opacity="0.6"/>
  <g stroke="#111111" stroke-width="18" stroke-linejoin="round">
    <!-- rear wing -->
    <path d="M520 2700 L470 2590 M650 2700 L620 2590" stroke-width="26"/>
    <path d="M330 2560 L760 2560 L760 2612 L330 2630Z" fill="#FF7A59"/>
    <!-- body -->
    <path fill="#FFF4E6" d="M380 3060 L380 2850 C400 2750 520 2720 720 2705 L1240 2660 C1400 2550 1580 2500 1770 2500 C1960 2500 2090 2570 2190 2670 L2610 2740 C2700 2760 2740 2820 2740 2900 L2740 3060 Z"/>
  </g>
  <!-- livery stripes -->
  <clipPath id="body"><path d="M380 3060 L380 2850 C400 2750 520 2720 720 2705 L1240 2660 C1400 2550 1580 2500 1770 2500 C1960 2500 2090 2570 2190 2670 L2610 2740 C2700 2760 2740 2820 2740 2900 L2740 3060 Z"/></clipPath>
  <g clip-path="url(#body)">
    <path d="M300 2840 L2800 2880 L2800 2990 L300 2950Z" fill="#FF7A59"/>
    <path d="M300 2975 L2800 3015 L2800 3050 L300 3010Z" fill="#2E63FF"/>
    <rect x="300" y="3040" width="2500" height="40" fill="#111111"/>
  </g>
  <!-- canopy -->
  <path d="M1330 2660 C1440 2575 1600 2540 1740 2545 C1860 2550 1960 2600 2040 2672 Z" fill="#1F2B4D" stroke="#111111" stroke-width="16"/>
  <path d="M1460 2620 C1540 2585 1620 2572 1700 2572 L1660 2640 L1440 2648Z" fill="#5CC8FF" opacity="0.55"/>
  <circle cx="2690" cy="2840" r="34" fill="#FFE45C" stroke="#111111" stroke-width="12"/>
  <path d="M2470 3060 L2760 3060 L2760 3090 L2440 3090Z" fill="#111111"/>
  <!-- arches + wheels -->
  <path d="M570 3062 A250 250 0 0 1 1070 3062Z" fill="#111111"/>
  <path d="M1990 3062 A250 250 0 0 1 2490 3062Z" fill="#111111"/>
  <use href="#wheel" transform="translate(820 3060)"/>
  <use href="#wheel" transform="translate(2240 3060)"/>
  <!-- roundel 001 -->
  <circle cx="1450" cy="2830" r="150" fill="#FFFFFF" stroke="#111111" stroke-width="16"/>
  <text x="1450" y="2880" text-anchor="middle" font-family="Anton" font-size="150" fill="#111111">001</text>
  <!-- invented sponsors -->
  <text x="900" y="2810" text-anchor="middle" font-family="Racing Sans One" font-size="84" fill="#111111">ZIP OIL</text>
  <g transform="translate(2120 2820)">
    <rect x="-210" y="-70" width="420" height="96" rx="10" fill="#111111"/>
    <text x="0" y="5" text-anchor="middle" font-family="Racing Sans One" font-size="68" fill="#FFE45C">SWAP TYRES</text>
  </g>
  <text x="1770" y="2730" text-anchor="middle" font-family="Oswald" font-weight="700" font-size="40" letter-spacing="6" fill="#111111">STIMPY RACING TEAM</text>

  <!-- footer -->
  <line x1="300" y1="3330" x2="2700" y2="3330" stroke="#FFF4E6" stroke-width="6"/>
  <text x="300" y="3470" font-family="Oswald" font-weight="700" font-size="96" letter-spacing="8" fill="#FFF4E6">ENDURANCE · 24 HOURS · 2 SIDES</text>
  <text x="300" y="3590" font-family="Oswald" font-weight="500" font-size="62" letter-spacing="10" fill="#FF7A59">ORGANISED BY THE STIMPY AUTOMOBILE CLUB</text>
  <text x="300" y="3700" font-family="Oswald" font-weight="500" font-size="52" letter-spacing="10" fill="#8E8E8E">OFFICIAL SUPPLIERS: ZIP OIL · SWAP TYRES · ONE HOODIE FUEL CO.</text>

  <rect width="3000" height="4000" filter="url(#ink)" opacity="0.05" style="mix-blend-mode:screen"/>
  <rect width="3000" height="4000" filter="url(#grain)" style="mix-blend-mode:multiply"/>

  <g id="stimpy-sig" transform="translate(2730 3790)">
    <clipPath id="sigL"><rect x="-200" y="-300" width="200" height="400"/></clipPath>
    <clipPath id="sigR"><rect x="0" y="-300" width="200" height="400"/></clipPath>
    <text x="0" y="0" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="240" fill="#FFFFFF" clip-path="url(#sigL)">S</text>
    <text x="0" y="18" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="240" fill="none" stroke="#FF7A59" stroke-width="11" clip-path="url(#sigR)">S</text>
  </g>
</svg>'''
open(sys.argv[1], "w", encoding="utf-8").write(svg)
