"""Generates src/04-stickerbomb.svg: one sticker per Stimpy niche, die-cut and layered edge to edge.

Every sticker is drawn around (0,0); the `diecut` filter adds the white border and drop shadow,
so any shape gets a correct die-cut outline. Usage: python gen_stickerbomb.py <out.svg>
"""
import sys

OUT = sys.argv[1]
INK, CORAL, CREAM, BUTTER, SKY, LILAC, BLUE = "#111111", "#FF7A59", "#FFF4E6", "#FFE45C", "#5CC8FF", "#C9B6FF", "#2E63FF"


def matchbox():
    return f'''
<rect x="-260" y="-350" width="520" height="700" fill="#B9D4C0"/>
<rect x="-260" y="-350" width="520" height="150" fill="{CORAL}"/>
<text y="-245" text-anchor="middle" font-family="Bebas Neue" font-size="110" letter-spacing="8" fill="{CREAM}">STRIKE</text>
<circle cy="40" r="190" fill="#A5C6AE"/>
<path fill="{INK}" d="M0 -150 C60 -150 110 -100 115 -10 L210 20 L250 190 L180 200 L150 90 L150 230 L-150 230 L-150 90 L-180 200 L-250 190 L-210 20 L-115 -10 C-110 -100 -60 -150 0 -150 Z"/>
<rect x="-75" y="20" width="150" height="190" fill="{CREAM}"/>
<path fill="{CORAL}" d="M0 45 C25 90 60 115 55 160 C50 190 28 200 0 200 C-28 200 -50 190 -55 160 C-60 120 -25 105 -15 70 C-5 100 5 105 12 110 C16 85 10 65 0 45Z"/>
<text y="320" text-anchor="middle" font-family="Alfa Slab One" font-size="56" fill="{INK}">SAFETY Nº 001</text>'''


def popup():
    return f'''
<rect x="-360" y="-210" width="720" height="420" fill="#C0C0C0"/>
<path d="M-360 210 V-210 H360" fill="none" stroke="#FFFFFF" stroke-width="8"/>
<path d="M-360 210 H360 V-210" fill="none" stroke="#404040" stroke-width="8"/>
<defs><linearGradient id="tb" x1="0" x2="1"><stop offset="0" stop-color="#000080"/><stop offset="1" stop-color="#1084D0"/></linearGradient></defs>
<rect x="-344" y="-194" width="688" height="70" fill="url(#tb)"/>
<text x="-326" y="-145" font-family="Archivo Black" font-size="40" fill="#FFFFFF">Identity.exe</text>
<rect x="282" y="-186" width="54" height="52" fill="#C0C0C0" stroke="#404040" stroke-width="4"/>
<text x="309" y="-146" text-anchor="middle" font-family="Archivo Black" font-size="40" fill="#000">×</text>
<path d="M-250 -70 L-170 70 H-330 Z" fill="{BUTTER}" stroke="#000" stroke-width="8" stroke-linejoin="round"/>
<text x="-250" y="50" text-anchor="middle" font-family="Archivo Black" font-size="90" fill="#000">!</text>
<text x="-130" y="-30" font-family="Archivo Black" font-size="46" fill="#000">Too many looks</text>
<text x="-130" y="30" font-family="Archivo Black" font-size="46" fill="#000">detected.</text>
<rect x="-90" y="90" width="180" height="80" fill="#C0C0C0" stroke="#000" stroke-width="6"/>
<path d="M-84 166 V96 H84" fill="none" stroke="#FFFFFF" stroke-width="6"/>
<text y="146" text-anchor="middle" font-family="Archivo Black" font-size="44" fill="#000">OK</text>'''


def travel():
    return f'''
<clipPath id="tc"><circle r="300"/></clipPath>
<circle r="300" fill="#1A2B5C"/>
<g clip-path="url(#tc)" fill="none" stroke-width="34">
  <path d="M-320 260 Q-60 120 80 -60" stroke="{CORAL}"/>
  <path d="M-320 300 Q-40 150 105 -30" stroke="{BUTTER}"/>
  <path d="M-320 340 Q-20 180 130 0" stroke="{SKY}"/>
  <path d="M-320 380 Q0 210 155 30" stroke="{LILAC}"/>
</g>
<g transform="translate(150 -100) rotate(-40)" fill="#FFFFFF">
  <ellipse rx="40" ry="150"/><path d="M-210 20 L0 -40 L210 20 L210 50 L0 20 L-210 50Z"/><path d="M-80 130 L0 100 L80 130 L80 150 L0 135 L-80 150Z"/>
</g>
<text x="0" y="-200" text-anchor="middle" font-family="Bebas Neue" font-size="72" letter-spacing="6" fill="{CREAM}">FLY STIMPY AIR</text>
<text x="0" y="250" text-anchor="middle" font-family="Bebas Neue" font-size="54" letter-spacing="6" fill="{CREAM}">DEPARTURES ONLY</text>'''


def skull():
    return f'''
<path fill="#F2F0E6" stroke="{INK}" stroke-width="14" d="M-230 -40 C-230 -230 -110 -300 0 -300 C110 -300 230 -230 230 -40 C230 40 190 80 170 110 L170 200 C170 240 150 250 130 250 L130 360 C130 400 90 400 90 360 L90 250 L30 250 L30 420 C30 460 -20 460 -20 420 L-20 250 L-90 250 L-90 330 C-90 370 -130 370 -130 330 L-130 250 C-160 250 -170 230 -170 200 L-170 110 C-190 80 -230 40 -230 -40Z"/>
<path fill="{INK}" d="M-150 -70 C-150 -130 -50 -130 -40 -70 C-30 0 -150 10 -150 -70Z"/>
<path fill="{INK}" d="M150 -70 C150 -130 50 -130 40 -70 C30 0 150 10 150 -70Z"/>
<path fill="{INK}" d="M0 30 L-35 100 H35Z"/>
<g stroke="{INK}" stroke-width="10"><line x1="-100" y1="150" x2="100" y2="150"/><line x1="-50" y1="120" x2="-50" y2="190"/><line x1="0" y1="120" x2="0" y2="190"/><line x1="50" y1="120" x2="50" y2="190"/></g>
<circle cx="-95" cy="-80" r="18" fill="{CORAL}"/><circle cx="95" cy="-80" r="18" fill="{CORAL}"/>
<text y="-200" text-anchor="middle" font-family="Bungee" font-size="60" fill="{CORAL}" stroke="{INK}" stroke-width="5" paint-order="stroke">SKATE &amp; SWAP</text>'''


def roundel():
    checks = "".join(f'<rect x="{-270 + i * 45}" y="{-20 if i % 2 else 25}" width="45" height="45" fill="{INK}"/>' for i in range(12))
    return f'''
<circle r="290" fill="#FFFFFF" stroke="{INK}" stroke-width="20"/>
<circle r="240" fill="{CORAL}"/>
<clipPath id="rc"><circle r="240"/></clipPath>
<g clip-path="url(#rc)"><rect x="-270" y="-20" width="540" height="90" fill="#FFFFFF"/>{checks}</g>
<text y="-50" text-anchor="middle" font-family="Archivo Black" font-size="190" fill="{INK}">001</text>
<text y="185" text-anchor="middle" font-family="Archivo Black" font-size="60" letter-spacing="4" fill="#FFFFFF">GRAND PRIX</text>'''


def boxing():
    return f'''
<rect x="-250" y="-360" width="500" height="720" fill="#EFE3C8"/>
<text y="-250" text-anchor="middle" font-family="Bebas Neue" font-size="70" letter-spacing="10" fill="{INK}">TONIGHT ONLY</text>
<text y="-90" text-anchor="middle" font-family="Alfa Slab One" font-size="150" fill="#C8102E">MONDAY</text>
<text y="20" text-anchor="middle" font-family="Alfa Slab One" font-size="90" fill="{INK}">vs.</text>
<text y="200" text-anchor="middle" font-family="Alfa Slab One" font-size="200" fill="{INK}">ME</text>
<rect x="-220" y="250" width="440" height="80" fill="{INK}"/>
<text y="310" text-anchor="middle" font-family="Bebas Neue" font-size="64" letter-spacing="8" fill="#EFE3C8">12 ROUNDS</text>'''


def bust():
    return f'''
<defs><linearGradient id="marble" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FAF8F2"/><stop offset="1" stop-color="#C9C4BA"/></linearGradient></defs>
<rect x="-300" y="-360" width="600" height="740" fill="{LILAC}"/>
<path fill="url(#marble)" stroke="#8E887C" stroke-width="6" d="M-260 380 C-250 220 -170 170 -90 150 L-80 80 C-140 40 -160 -40 -150 -120 C-140 -250 -60 -300 10 -300 C110 -300 170 -220 160 -110 C155 -30 120 30 80 70 L90 150 C170 170 250 220 260 380Z"/>
<path fill="#E3DED3" d="M-150 -150 C-120 -260 -40 -300 20 -300 C100 -300 160 -240 160 -160 C120 -210 60 -240 -10 -220 C-60 -205 -110 -190 -150 -150Z"/>
<g fill="#EDE9E0" stroke="#8E887C" stroke-width="5">{"".join(f'<circle cx="{x}" cy="{y}" r="{r}"/>' for x, y, r in [(-120,-200,52),(-60,-250,55),(10,-268,55),(80,-250,52),(130,-195,48),(-150,-130,40),(150,-120,38)])}</g>
<path d="M-152 -40 C-185 -45 -185 20 -150 25" fill="#E3DED3" stroke="#8E887C" stroke-width="6"/>
<rect x="-150" y="-140" width="300" height="70" rx="20" fill="{INK}"/>
<path d="M0 -70 L-22 -5 L18 -5" fill="none" stroke="#8E887C" stroke-width="7" stroke-linejoin="round"/>
<rect x="-10" y="-120" width="20" height="16" fill="{INK}"/>
<path d="M-45 35 Q0 55 45 35" fill="none" stroke="#8E887C" stroke-width="9"/>
<rect x="-280" y="270" width="560" height="100" fill="{CORAL}"/>
<text y="335" text-anchor="middle" font-family="Bebas Neue" font-size="54" letter-spacing="4" fill="{INK}">OVERTHINKING SINCE 400 BC</text>'''


def tarot():
    return f'''
<rect x="-220" y="-360" width="440" height="720" rx="24" fill="#16163A"/>
<rect x="-195" y="-335" width="390" height="670" rx="14" fill="none" stroke="#E8C66A" stroke-width="6"/>
<text y="-260" text-anchor="middle" font-family="Alfa Slab One" font-size="60" fill="#E8C66A">XXII</text>
<path d="M0 -180 A150 150 0 0 0 0 120Z" fill="{CORAL}"/>
<path d="M0 -180 A150 150 0 0 1 0 120Z" fill="{CREAM}"/>
<g stroke="#E8C66A" stroke-width="10">{"".join(f'<line x1="0" y1="-215" x2="0" y2="-245" transform="rotate({a} 0 -30)"/>' for a in range(-90, 91, 30))}</g>
<path d="M-60 -60 A35 35 0 0 1 -10 -60" fill="none" stroke="{INK}" stroke-width="10"/>
<path d="M10 -60 A35 35 0 0 1 60 -60" fill="none" stroke="{INK}" stroke-width="10"/>
<rect x="-180" y="230" width="360" height="90" fill="#E8C66A"/>
<text y="292" text-anchor="middle" font-family="Alfa Slab One" font-size="56" fill="#16163A">THE SWAP</text>'''


def swiss():
    return f'''
<rect x="-290" y="-360" width="580" height="720" fill="#E9E6DF"/>
<circle cx="-30" cy="-60" r="210" fill="{INK}"/>
<path d="M-30 -270 A210 210 0 0 1 -30 150Z" fill="{CORAL}"/>
<line x1="-30" y1="-330" x2="-30" y2="330" stroke="{INK}" stroke-width="6"/>
<text x="-260" y="250" font-family="Archivo Black" font-size="72" fill="{INK}">zwei</text>
<text x="-260" y="320" font-family="Archivo Black" font-size="72" fill="{CORAL}">seiten</text>
<text x="260" y="-310" text-anchor="end" font-family="Archivo Black" font-size="36" fill="{INK}">001</text>'''


def croissant():
    lobes = [(-250, 60, -50, 70, 95), (-150, -40, -30, 105, 130), (0, -80, 0, 130, 150), (150, -40, 30, 105, 130), (250, 60, 50, 70, 95)]
    body = "".join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" transform="rotate({r} {x} {y})" fill="#E8A33D" stroke="{INK}" stroke-width="12"/>' for x, y, r, rx, ry in lobes)
    shine = "".join(f'<ellipse cx="{x - 20}" cy="{y - ry * 0.45:.0f}" rx="{rx * 0.35:.0f}" ry="{ry * 0.18:.0f}" transform="rotate({r} {x} {y})" fill="#F6C979"/>' for x, y, r, rx, ry in lobes)
    return f'''
<path d="M-250 80 C-330 110 -340 200 -300 240" fill="none" stroke="{INK}" stroke-width="20" stroke-linecap="round"/>
<circle cx="-300" cy="250" r="42" fill="#FFFFFF" stroke="{INK}" stroke-width="12"/>
<path d="M250 80 C330 40 350 -60 320 -130" fill="none" stroke="{INK}" stroke-width="20" stroke-linecap="round"/>
<circle cx="320" cy="-140" r="42" fill="#FFFFFF" stroke="{INK}" stroke-width="12"/>
{body}{shine}
<rect x="-110" y="-120" width="220" height="56" rx="18" fill="{INK}"/>
<rect x="-14" y="-104" width="28" height="12" fill="{INK}"/>
<path d="M-40 -20 Q0 15 40 -20" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>
<text y="220" text-anchor="middle" font-family="Shrikhand" font-size="76" fill="{CORAL}" stroke="{INK}" stroke-width="6" paint-order="stroke">Flaky but</text>
<text y="310" text-anchor="middle" font-family="Shrikhand" font-size="76" fill="{CORAL}" stroke="{INK}" stroke-width="6" paint-order="stroke">Fabulous</text>'''


def ufo():
    return f'''
<circle r="300" fill="#0F1430"/>
<g fill="#FFF4E6"><circle cx="-180" cy="-150" r="8"/><circle cx="160" cy="-200" r="6"/><circle cx="210" cy="60" r="7"/><circle cx="-220" cy="80" r="6"/><circle cx="-60" cy="-240" r="5"/></g>
<path d="M-60 -40 L-170 230 H170 L60 -40Z" fill="{BUTTER}" opacity="0.55"/>
<path fill="{CORAL}" d="M-60 150 L-40 110 L40 110 L60 150 L60 230 L-60 230Z"/>
<path fill="{CORAL}" d="M-60 150 L-90 210 L-75 215 L-60 180Z M60 150 L90 210 L75 215 L60 180Z"/>
<ellipse cy="-60" rx="110" ry="80" fill="{SKY}" stroke="{INK}" stroke-width="10"/>
<ellipse cy="-30" rx="250" ry="70" fill="#B8BCC8" stroke="{INK}" stroke-width="10"/>
<g fill="{BUTTER}"><circle cx="-150" cy="-25" r="16"/><circle cx="-50" cy="-15" r="16"/><circle cx="50" cy="-15" r="16"/><circle cx="150" cy="-25" r="16"/></g>
<text y="-190" text-anchor="middle" font-family="Bungee" font-size="54" fill="{BUTTER}">THEY CAME FOR</text>
<text y="-140" text-anchor="middle" font-family="Bungee" font-size="54" fill="{BUTTER}">THE HOODIE</text>'''


def vhs():
    return f'''
<rect x="-380" y="-230" width="760" height="460" rx="20" fill="{INK}"/>
<rect x="-330" y="-190" width="660" height="230" fill="#E9E1D0"/>
<rect x="-330" y="-190" width="660" height="60" fill="#C8102E"/>
<text x="-310" y="-145" font-family="Bebas Neue" font-size="48" letter-spacing="6" fill="#FFFFFF">SP · T-120</text>
<text y="10" text-anchor="middle" font-family="Creepster" font-size="112" fill="#C8102E">THE DROP</text>
<rect x="-250" y="80" width="500" height="110" rx="12" fill="#2A2A2A"/>
<circle cx="-140" cy="135" r="40" fill="#E9E1D0"/><circle cx="140" cy="135" r="40" fill="#E9E1D0"/>
<text y="-252" text-anchor="middle" font-family="Bebas Neue" font-size="44" letter-spacing="8" fill="{INK}">BE KIND · REWIND</text>'''


def raccoon():
    return f'''
<path fill="#1F3B2D" d="M-260 -320 H260 V60 C260 220 120 320 0 360 C-120 320 -260 220 -260 60Z"/>
<path fill="none" stroke="#E8C66A" stroke-width="12" d="M-225 -285 H225 V60 C225 200 100 290 0 322 C-100 290 -225 200 -225 60Z"/>
<path fill="#8E8E8E" d="M-170 -170 L-120 -250 L-70 -160 Z M170 -170 L120 -250 L70 -160Z"/>
<path fill="#B5B5B5" stroke="{INK}" stroke-width="10" d="M-190 -60 C-190 -180 -90 -200 0 -200 C90 -200 190 -180 190 -60 C190 30 90 110 0 130 C-90 110 -190 30 -190 -60Z"/>
<path fill="{INK}" d="M-180 -70 C-120 -120 -40 -110 0 -70 C40 -110 120 -120 180 -70 C150 -10 60 0 0 -30 C-60 0 -150 -10 -180 -70Z"/>
<circle cx="-80" cy="-60" r="22" fill="#FFFFFF"/><circle cx="80" cy="-60" r="22" fill="#FFFFFF"/>
<ellipse cy="40" rx="34" ry="24" fill="{INK}"/>
<text y="200" text-anchor="middle" font-family="Alfa Slab One" font-size="54" fill="#E8C66A">TRASH PANDA</text>
<text y="262" text-anchor="middle" font-family="Alfa Slab One" font-size="44" fill="#E8C66A">SOCIETY</text>'''


def memphis():
    return f'''
<path d="M-320 0 C-260 -140 -180 140 -110 0 S30 140 100 0 S240 -140 320 0" fill="none" stroke="#FF5FA2" stroke-width="70" stroke-linecap="round"/>
<path d="M-200 -180 L-120 -280 L-60 -170Z" fill="{SKY}" stroke="{INK}" stroke-width="10"/>
<circle cx="200" cy="-180" r="60" fill="{BUTTER}" stroke="{INK}" stroke-width="10"/>
<rect x="100" y="120" width="140" height="40" transform="rotate(-25 170 140)" fill="{LILAC}" stroke="{INK}" stroke-width="10"/>
<g fill="{INK}"><circle cx="-250" cy="160" r="12"/><circle cx="-200" cy="200" r="12"/><circle cx="-150" cy="160" r="12"/><circle cx="-100" cy="200" r="12"/></g>'''


def cassette():
    return f'''
<rect x="-360" y="-230" width="720" height="460" rx="30" fill="{CORAL}" stroke="{INK}" stroke-width="12"/>
<rect x="-300" y="-180" width="600" height="250" rx="16" fill="{CREAM}"/>
<text x="-270" y="-120" font-family="Shrikhand" font-size="54" fill="{INK}">Mood Mixtape</text>
<text x="270" y="-120" text-anchor="end" font-family="Bebas Neue" font-size="60" fill="{CORAL}">A|B</text>
<rect x="-200" y="-80" width="400" height="120" rx="60" fill="{INK}"/>
<circle cx="-120" cy="-20" r="44" fill="#FFFFFF"/><circle cx="120" cy="-20" r="44" fill="#FFFFFF"/>
<circle cx="-120" cy="-20" r="16" fill="{INK}"/><circle cx="120" cy="-20" r="16" fill="{INK}"/>
<path d="M-220 230 L-180 120 H180 L220 230" fill="#E35F40" stroke="{INK}" stroke-width="10"/>
<circle cx="-100" cy="180" r="16" fill="{INK}"/><circle cx="100" cy="180" r="16" fill="{INK}"/>'''


def arcade():
    return f'''
<rect x="-380" y="-200" width="760" height="400" rx="30" fill="#0B0714"/>
<rect x="-350" y="-170" width="700" height="340" rx="16" fill="none" stroke="#FF5FA2" stroke-width="10"/>
<text y="-50" text-anchor="middle" font-family="'Press Start 2P'" font-size="54" fill="#FF5FA2">INSERT</text>
<text y="30" text-anchor="middle" font-family="'Press Start 2P'" font-size="54" fill="{SKY}">HOODIE</text>
<text y="115" text-anchor="middle" font-family="'Press Start 2P'" font-size="28" fill="{BUTTER}">CREDIT 01</text>'''


def rainbow():
    cols = ["#4A2C1A", "#A34419", CORAL, "#E8A33D", "#F2C94C"]
    arcs = "".join(f'<path d="M{-300 + i * 55} 120 A{300 - i * 55} {300 - i * 55} 0 0 1 {300 - i * 55} 120" fill="none" stroke="{c}" stroke-width="56"/>' for i, c in enumerate(cols))
    return f'''
<rect x="-340" y="-230" width="680" height="460" rx="230" fill="#F3DFBF"/>
<g transform="translate(0 20)">{arcs}</g>
<text y="40" text-anchor="middle" font-family="Shrikhand" font-size="64" fill="{CREAM}" stroke="#4A2C1A" stroke-width="8" paint-order="stroke">Keep on</text>
<text y="200" text-anchor="middle" font-family="Shrikhand" font-size="96" fill="#F2C94C" stroke="#4A2C1A" stroke-width="10" paint-order="stroke">Swappin'</text>'''


def nametag():
    return f'''
<rect x="-300" y="-200" width="600" height="400" rx="40" fill="#C8102E"/>
<text y="-110" text-anchor="middle" font-family="Archivo Black" font-size="96" fill="#FFFFFF">HELLO</text>
<text y="-50" text-anchor="middle" font-family="Archivo Black" font-size="40" fill="#FFFFFF">my name is</text>
<rect x="-270" y="-10" width="540" height="170" fill="#FFFFFF"/>
<text y="120" text-anchor="middle" font-family="Shrikhand" font-size="110" fill="{INK}">anyone</text>'''


def bolt():
    return f'<path d="M40 -260 L-140 40 H-10 L-60 260 L150 -60 H20 L80 -260Z" fill="{BUTTER}" stroke="{INK}" stroke-width="14" stroke-linejoin="round"/>'


def star():
    return f'<path d="M0 -200 L55 -60 L200 -60 L85 30 L130 180 L0 90 L-130 180 L-85 30 L-200 -60 L-55 -60Z" fill="{SKY}" stroke="{INK}" stroke-width="12" stroke-linejoin="round"/><text y="40" text-anchor="middle" font-family="Archivo Black" font-size="56" fill="{INK}">001</text>'


def zipit():
    return f'''
<rect x="-330" y="-80" width="660" height="160" fill="{INK}"/>
<g fill="#C9C9C9">{"".join(f'<rect x="{x}" y="-12" width="18" height="24"/>' for x in range(-310, 320, 26))}</g>
<text y="-20" text-anchor="middle" font-family="Bungee" font-size="54" fill="{CORAL}">ZIP IT</text>
<text y="60" text-anchor="middle" font-family="Bungee" font-size="40" fill="{CREAM}">SWAP IT</text>'''


def hero():
    return f'''
<path fill="{CORAL}" stroke="{INK}" stroke-width="16" d="{burst(560, 500, 24)}"/>
<circle r="420" fill="{CREAM}" stroke="{INK}" stroke-width="12"/>
<clipPath id="hL"><rect x="-400" y="-500" width="400" height="800"/></clipPath>
<clipPath id="hR"><rect x="0" y="-500" width="400" height="800"/></clipPath>
<text x="0" y="110" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="560" fill="{INK}" clip-path="url(#hL)">S</text>
<text x="0" y="150" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="560" fill="none" stroke="{CORAL}" stroke-width="20" clip-path="url(#hR)">S</text>
<text y="290" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="130" fill="{INK}">Stimpy</text>'''


def burst(r1, r2, n):
    import math
    pts = []
    for i in range(n * 2):
        r = r1 if i % 2 == 0 else r2
        a = math.pi * i / n
        pts.append(f"{r * math.sin(a):.1f} {-r * math.cos(a):.1f}")
    return "M" + " L".join(pts) + "Z"


# (sticker, x, y, rotation, scale) back to front; covers the panel edge to edge
LAYOUT = [
    # back layer: fillers that close the gaps
    (nametag, 1500, 1250, 8, 1.0), (memphis, 1000, 2400, -20, 1.1), (star, 2050, 2350, 10, 0.9),
    (zipit, 1350, 3950, 3, 1.1), (bolt, 2900, 3050, 15, 0.9), (roundel, 150, 2750, 12, 0.8),
    (popup, 2000, 1150, 6, 0.8), (vhs, 2100, 3900, -12, 0.8), (star, 1000, 3350, -12, 0.7),
    # main layer
    (swiss, 360, 400, -8, 1.3), (travel, 1500, 380, 6, 1.25), (boxing, 2540, 470, 8, 1.15),
    (popup, 2380, 1150, -5, 1.15), (tarot, 400, 1350, 7, 1.2), (rainbow, 1250, 1000, -4, 1.15),
    (raccoon, 2580, 1950, -7, 1.2), (bust, 400, 2350, -6, 1.2), (memphis, 2380, 2800, 15, 1.1),
    (vhs, 540, 3170, 7, 1.05), (cassette, 2420, 3500, -9, 1.15), (matchbox, 1520, 3480, 3, 1.15),
    (roundel, 420, 3700, -10, 1.05), (arcade, 860, 1640, -10, 0.95), (ufo, 2050, 1700, 8, 1.05),
    (croissant, 1230, 2930, -6, 0.95), (skull, 1980, 2950, 10, 1.0), (nametag, 1800, 820, 12, 0.85),
    (zipit, 2600, 3980, 4, 1.0), (bolt, 2850, 1350, 20, 0.8), (star, 120, 1850, -15, 0.85),
    (star, 2880, 2500, 25, 0.7), (bolt, 80, 3300, -20, 0.7), (zipit, 700, 40, -6, 1.0),
    (hero, 1500, 2150, -4, 1.05),
]

parts = []
for i, (fn, x, y, rot, sc) in enumerate(LAYOUT):
    parts.append(f'<g transform="translate({x} {y}) rotate({rot}) scale({sc})" filter="url(#diecut)">{fn()}</g>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 4000" width="3000" height="4000">
  <style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&amp;family=Bebas+Neue&amp;family=Alfa+Slab+One&amp;family=Archivo+Black&amp;family=Bungee&amp;family=Shrikhand&amp;family=Creepster&amp;family=Press+Start+2P&amp;display=block');</style>
  <defs>
    <filter id="diecut" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="16" result="ab"/>
      <feComponentTransfer in="ab" result="d"><feFuncA type="linear" slope="8" intercept="-0.6"/></feComponentTransfer>
      <feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="white"/>
      <feGaussianBlur in="d" stdDeviation="14" result="sb"/>
      <feOffset in="sb" dx="10" dy="16" result="so"/>
      <feFlood flood-color="#000000" flood-opacity="0.45"/><feComposite in2="so" operator="in" result="shadow"/>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="white"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="4"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.18"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="3000" height="4000" fill="#2B2B2E"/>
  {"".join(parts)}
  <rect width="3000" height="4000" filter="url(#grain)" style="mix-blend-mode:multiply"/>
  <g id="stimpy-sig" transform="translate(2730 3760)" filter="url(#diecut)">
    <clipPath id="sigL"><rect x="-200" y="-300" width="200" height="400"/></clipPath>
    <clipPath id="sigR"><rect x="0" y="-300" width="200" height="400"/></clipPath>
    <circle cx="0" cy="-85" r="135" fill="{CREAM}"/>
    <text x="0" y="0" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="230" fill="{INK}" clip-path="url(#sigL)">S</text>
    <text x="0" y="18" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="230" fill="none" stroke="{CORAL}" stroke-width="10" clip-path="url(#sigR)">S</text>
  </g>
</svg>
'''
open(OUT, "w", encoding="utf-8").write(svg)
