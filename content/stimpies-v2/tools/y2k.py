import sys
o = []
A = o.append


def bevel(x, y, w, h, fill="#C0C0C0", inset=False, t=8):
    lt, rb, lt2, rb2 = ("#FFFFFF", "#0A0A0A", "#DFDFDF", "#808080")
    if inset:
        lt, rb, lt2, rb2 = ("#808080", "#FFFFFF", "#0A0A0A", "#DFDFDF")
    A(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"/>')
    A(f'<path d="M{x} {y+h}V{y}H{x+w}" fill="none" stroke="{lt}" stroke-width="{t}" transform="translate({t/2} {t/2})"/>')
    A(f'<path d="M{x} {y+h}H{x+w}V{y}" fill="none" stroke="{rb}" stroke-width="{t}" transform="translate({-t/2} {-t/2})"/>')
    A(f'<path d="M{x+t} {y+h-t}V{y+t}H{x+w-t}" fill="none" stroke="{lt2}" stroke-width="{t}" transform="translate({t/2} {t/2})"/>')
    A(f'<path d="M{x+t} {y+h-t}H{x+w-t}V{y+t}" fill="none" stroke="{rb2}" stroke-width="{t}" transform="translate({-t/2} {-t/2})"/>')


def button(x, y, w, h, label, default=False, size=64):
    if default:
        A(f'<rect x="{x-8}" y="{y-8}" width="{w+16}" height="{h+16}" fill="#0A0A0A"/>')
    bevel(x, y, w, h)
    A(f'<text x="{x+w/2}" y="{y+h/2+size*0.36}" text-anchor="middle" font-family="Pixelify Sans" font-weight="500" font-size="{size}" fill="#0A0A0A">{label}</text>')
    if default:
        A(f'<rect x="{x+22}" y="{y+18}" width="{w-44}" height="{h-36}" fill="none" stroke="#0A0A0A" stroke-width="4" stroke-dasharray="6 6"/>')


def window(x, y, w, h, title, active=True):
    A(f'<rect x="{x+28}" y="{y+28}" width="{w}" height="{h}" fill="#003F3F" opacity="0.45"/>')
    bevel(x, y, w, h)
    g = "url(#tb)" if active else "url(#tbi)"
    A(f'<rect x="{x+16}" y="{y+16}" width="{w-32}" height="104" fill="{g}"/>')
    A(f'<text x="{x+44}" y="{y+90}" font-family="Pixelify Sans" font-weight="700" font-size="62" fill="#FFFFFF">{title}</text>')
    bx = x + w - 16 - 3 * 92
    for i, s in enumerate(["_", "□", "×"]):
        bxx = bx + i * 92 + (16 if i == 2 else 0) - 8
        bevel(bxx, y + 28, 80, 72, t=6)
        if s == "_":
            A(f'<rect x="{bxx+22}" y="{y+80}" width="32" height="8" fill="#0A0A0A"/>')
        elif s == "□":
            A(f'<rect x="{bxx+20}" y="{y+42}" width="40" height="38" fill="none" stroke="#0A0A0A" stroke-width="7"/>')
        else:
            A(f'<path d="M{bxx+22} {y+46}L{bxx+58} {y+84}M{bxx+58} {y+46}L{bxx+22} {y+84}" stroke="#0A0A0A" stroke-width="10"/>')


A('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 4000" width="3000" height="4000">
<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@700&amp;family=Pixelify+Sans:wght@500;700&amp;family=VT323&amp;display=block');</style>
<defs>
<linearGradient id="tb" x1="0" x2="1"><stop offset="0" stop-color="#000080"/><stop offset="1" stop-color="#1084D0"/></linearGradient>
<linearGradient id="tbi" x1="0" x2="1"><stop offset="0" stop-color="#808080"/><stop offset="1" stop-color="#B5B5B5"/></linearGradient>
<pattern id="dither" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#007878"/><rect x="4" y="4" width="4" height="4" fill="#007878"/></pattern>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="4"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.12"/></feComponentTransfer></filter>
</defs>
<rect width="3000" height="4000" fill="#008080"/>
<rect width="3000" height="4000" fill="url(#dither)" opacity="0.5"/>
''')
# wallpaper wordmark, tone on tone
A('<text x="1500" y="3520" text-anchor="middle" font-family="VT323" font-size="168" fill="#7CC9C9" letter-spacing="8">ONE HOODIE. MULTIPLE IDENTITIES.</text>')


def icon(x, y, kind, label):
    if kind == "folder":
        A(f'<path d="M{x} {y+30}h70l20 24h110v136H{x}z" fill="#F7D35C" stroke="#0A0A0A" stroke-width="6"/>')
        A(f'<path d="M{x} {y+70}h200v120H{x}z" fill="#FFE98A" stroke="#0A0A0A" stroke-width="6"/>')
        A(f'<rect x="{x+60}" y="{y+90}" width="80" height="80" fill="#FF7A59" stroke="#0A0A0A" stroke-width="5"/>')
    elif kind == "bin":
        A(f'<path d="M{x+30} {y+40}h140l-16 160h-108z" fill="#E6E6E6" stroke="#0A0A0A" stroke-width="6"/>')
        A(f'<rect x="{x+18}" y="{y+22}" width="164" height="24" fill="#C0C0C0" stroke="#0A0A0A" stroke-width="6"/>')
        for i in range(3):
            A(f'<line x1="{x+70+i*30}" y1="{y+70}" x2="{x+70+i*30}" y2="{y+180}" stroke="#808080" stroke-width="8"/>')
    elif kind == "exe":
        A(f'<rect x="{x+10}" y="{y+20}" width="180" height="150" fill="#C0C0C0" stroke="#0A0A0A" stroke-width="6"/>')
        A(f'<rect x="{x+10}" y="{y+20}" width="180" height="34" fill="#000080"/>')
        A(f'<path d="M{x+100} {y+70}c40 0 56 30 56 60v40h-112v-40c0-30 16-60 56-60z" fill="#111111"/>')
        A(f'<rect x="{x+76}" y="{y+100}" width="48" height="56" fill="#FF7A59"/>')
    elif kind == "globe":
        A(f'<circle cx="{x+100}" cy="{y+100}" r="90" fill="#5CC8FF" stroke="#0A0A0A" stroke-width="6"/>')
        A(f'<path d="M{x+40} {y+60}q40 -20 60 10t30 50q-30 30 -60 20zM{x+120} {y+150}q30-30 60-10" fill="#7BD389" stroke="#0A0A0A" stroke-width="5"/>')
    A(f'<text x="{x+100}" y="{y+262}" text-anchor="middle" font-family="Pixelify Sans" font-weight="500" font-size="50" fill="#FFFFFF">{label}</text>')


icon(200, 220, "folder", "My Stimpies")
icon(200, 540, "bin", "Old Looks")
icon(200, 860, "exe", "hoodie.exe")
icon(200, 1180, "globe", "Mood Explorer")

# window 1: identity manager
x, y, w, h = 620, 250, 2180, 1080
window(x, y, w, h, "Stimpy Identity Manager", active=False)
A(f'<circle cx="{x+230}" cy="{y+430}" r="120" fill="#FFFFFF" stroke="#0A0A0A" stroke-width="8"/>')
A(f'<text x="{x+230}" y="{y+500}" text-anchor="middle" font-family="Pixelify Sans" font-weight="700" font-size="200" fill="#000080">?</text>')
A(f'<text x="{x+420}" y="{y+400}" font-family="VT323" font-size="230" fill="#0A0A0A">SWAP IDENTITY?</text>')
A(f'<text x="{x+425}" y="{y+520}" font-family="Pixelify Sans" font-weight="500" font-size="60" fill="#0A0A0A">Your current look will be saved to My Stimpies.</text>')
bevel(x + 70, y + 858, 64, 64, fill="#FFFFFF", inset=True, t=6)
A(f'<path d="M{x+84} {y+890}l14 16l26 -34" fill="none" stroke="#0A0A0A" stroke-width="10"/>')
A(f'<text x="{x+160}" y="{y+910}" font-family="Pixelify Sans" font-weight="500" font-size="54" fill="#0A0A0A">Ask me every morning</text>')
button(x + 760, y + 820, 500, 140, "Yes", size=72)
button(x + 1300, y + 820, 620, 140, "Also yes", default=True, size=72)

# window 2: error
x, y, w, h = 300, 1500, 2150, 880
window(x, y, w, h, "Error", active=False)
A(f'<circle cx="{x+230}" cy="{y+400}" r="125" fill="#E01B1B" stroke="#7A0000" stroke-width="8"/>')
A(f'<path d="M{x+170} {y+340}l120 120M{x+290} {y+340}l-120 120" stroke="#FFFFFF" stroke-width="34" stroke-linecap="square"/>')
A(f'<text x="{x+430}" y="{y+360}" font-family="Pixelify Sans" font-weight="700" font-size="96" fill="#0A0A0A">Too many hoodies.</text>')
A(f'<text x="{x+430}" y="{y+480}" font-family="Pixelify Sans" font-weight="500" font-size="80" fill="#0A0A0A">Wear one anyway?</text>')
A(f'<text x="{x+430}" y="{y+570}" font-family="Pixelify Sans" font-weight="500" font-size="52" fill="#555555">Error 0x001: closet.sys is full</text>')
button(x + 660, y + 660, 420, 130, "OK", default=True)
button(x + 1140, y + 660, 420, 130, "OK")
button(x + 1620, y + 660, 420, 130, "Details")

# window 3: progress (active)
x, y, w, h = 560, 2490, 2280, 820
window(x, y, w, h, "Installing new personality...", active=True)
A(f'<text x="{x+70}" y="{y+250}" font-family="Pixelify Sans" font-weight="500" font-size="66" fill="#0A0A0A">Copying confidence.dll to C:\\YOU\\BACK</text>')
bevel(x + 70, y + 310, w - 140, 150, fill="#FFFFFF", inset=True)
n = int((w - 180) / 86 * 0.87)
for i in range(n):
    A(f'<rect x="{x+92+i*86}" y="{y+332}" width="74" height="106" fill="#000080"/>')
A(f'<text x="{x+70}" y="{y+560}" font-family="Pixelify Sans" font-weight="500" font-size="64" fill="#0A0A0A">87% complete</text>')
A(f'<text x="{x+w-70}" y="{y+560}" text-anchor="end" font-family="Pixelify Sans" font-weight="500" font-size="64" fill="#0A0A0A">Time remaining: 1 zip</text>')
button(x + w - 490, y + 620, 420, 130, "Cancel")

# cursor hovering "Also yes"
cx, cy = 2330, 1160
A(f'<path transform="translate({cx} {cy}) scale(9)" d="M0 0V17L4 13L7 20L10 19L7 12H12Z" fill="#FFFFFF" stroke="#0A0A0A" stroke-width="1.2"/>')

# taskbar
ty = 3640
bevel(-20, ty, 3040, 400)
bevel(170, ty + 40, 470, 150)
A(f'''<g transform="translate(250 {ty+160})"><clipPath id="sbL"><rect x="-80" y="-140" width="80" height="180"/></clipPath><clipPath id="sbR"><rect x="0" y="-140" width="80" height="180"/></clipPath>
<text x="0" y="0" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="140" fill="#111111" clip-path="url(#sbL)">S</text>
<text x="0" y="10" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="140" fill="none" stroke="#FF7A59" stroke-width="6" clip-path="url(#sbR)">S</text></g>''')
A(f'<text x="330" y="{ty+140}" font-family="Pixelify Sans" font-weight="700" font-size="80" fill="#0A0A0A">Stimpy</text>')
bevel(700, ty + 40, 620, 150, fill="#D4D4D4", inset=True)
A(f'<text x="740" y="{ty+135}" font-family="Pixelify Sans" font-weight="700" font-size="56" fill="#0A0A0A">Installing new p...</text>')
bevel(1360, ty + 40, 560, 150)
A(f'<text x="1400" y="{ty+135}" font-family="Pixelify Sans" font-weight="500" font-size="56" fill="#0A0A0A">Error</text>')
bevel(2000, ty + 40, 830, 150, inset=True)
A(f'<text x="2060" y="{ty+140}" font-family="Pixelify Sans" font-weight="500" font-size="64" fill="#0A0A0A">12:00 AM</text>')

A('<rect width="3000" height="4000" filter="url(#grain)" style="mix-blend-mode:multiply"/>')
# signature lives in the system tray
A('''<g id="stimpy-sig" transform="translate(2700 3790)">
<clipPath id="sigL"><rect x="-200" y="-300" width="200" height="400"/></clipPath>
<clipPath id="sigR"><rect x="0" y="-300" width="200" height="400"/></clipPath>
<text x="0" y="0" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="190" fill="#111111" clip-path="url(#sigL)">S</text>
<text x="0" y="14" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="190" fill="none" stroke="#FF7A59" stroke-width="8" clip-path="url(#sigR)">S</text>
</g>
</svg>''')
open(sys.argv[1], "w", encoding="utf-8").write("\n".join(o))
