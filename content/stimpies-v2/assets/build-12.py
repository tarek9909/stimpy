# Generates src/12-space.svg (the starfield is scattered here with a fixed seed).
import random, pathlib

random.seed(1957)
stars = []
for _ in range(140):
    x, y = random.randint(40, 2960), random.randint(940, 2700)
    if 1900 < x < 2800 and 1050 < y < 1950:
        continue  # keep the planet clean
    r = random.choice([3, 4, 5, 6, 8, 10])
    o = random.choice([0.5, 0.7, 0.9, 1])
    stars.append(f'<circle cx="{x}" cy="{y}" r="{r}" opacity="{o}"/>')
stars = '\n    '.join(stars)

here = pathlib.Path(__file__).parent
svg = (here / '12-space.svg.tmpl').read_text(encoding='utf-8').replace('__STARS__', stars)
(here.parent / 'src' / '12-space.svg').write_text(svg, encoding='utf-8')
