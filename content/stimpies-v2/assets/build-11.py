# Generates src/11-food.svg (sunburst rays and repeated croissant lobes are computed here).
import math, pathlib

cx, cy = 1500, 1880
rays = []
n = 32
for i in range(0, n, 2):
    a0 = 2 * math.pi * i / n
    a1 = 2 * math.pi * (i + 1) / n
    R = 4200
    rays.append(f'<path d="M{cx} {cy} L{cx+R*math.cos(a0):.0f} {cy+R*math.sin(a0):.0f} L{cx+R*math.cos(a1):.0f} {cy+R*math.sin(a1):.0f} Z"/>')
rays = '\n    '.join(rays)


def lobe(x, y, rx, ry, rot):
    return f'''<g transform="translate({x} {y}) rotate({rot})">
    <ellipse rx="{rx}" ry="{ry}" fill="url(#crust)" stroke="#111111" stroke-width="22"/>
    <path d="M{-rx*0.55:.0f} {-ry*0.55:.0f} Q0 {-ry*0.85:.0f} {rx*0.55:.0f} {-ry*0.55:.0f}" fill="none" stroke="#FFE2A6" stroke-width="16" stroke-linecap="round"/>
    <path d="M{-rx*0.7:.0f} {ry*0.35:.0f} Q0 {ry*0.62:.0f} {rx*0.7:.0f} {ry*0.35:.0f}" fill="none" stroke="#8A4514" stroke-width="12" stroke-linecap="round" opacity="0.6"/>
  </g>'''


lobes = '\n  '.join([lobe(770, 2010, 95, 115, -62), lobe(2230, 2010, 95, 115, 62),
                     lobe(935, 1880, 155, 175, -45), lobe(2065, 1880, 155, 175, 45),
                     lobe(1185, 1760, 215, 235, -22), lobe(1815, 1760, 215, 235, 22)])


def eye(x, y):
    return f'''<clipPath id="pup{x}"><ellipse cx="{x+8}" cy="{y+22}" rx="42" ry="72"/></clipPath>
  <ellipse cx="{x}" cy="{y}" rx="72" ry="112" fill="#FFFFFF" stroke="#111111" stroke-width="16"/>
  <ellipse cx="{x+8}" cy="{y+22}" rx="42" ry="72" fill="#111111"/>
  <path d="M{x+14} {y+4} L{x+70} {y-60} L{x+74} {y+10} Z" fill="#FFFFFF" clip-path="url(#pup{x})"/>'''


template = (pathlib.Path(__file__).parent / '11-food.svg.tmpl').read_text(encoding='utf-8')
svg = (template.replace('__RAYS__', rays).replace('__LOBES__', lobes)
       .replace('__EYE_L__', eye(1415, 1660)).replace('__EYE_R__', eye(1585, 1660)))
(pathlib.Path(__file__).parent.parent / 'src' / '11-food.svg').write_text(svg, encoding='utf-8')
