# Inlines the tritone bust into the 08 template so src/08-classical.svg is self-contained.
import base64, pathlib
here = pathlib.Path(__file__).parent
img = base64.b64encode((here / 'bust-tritone.jpg').read_bytes()).decode()
svg = (here / '08-classical.svg.tmpl').read_text(encoding='utf-8').replace('__IMG__', img)
(here.parent / 'src' / '08-classical.svg').write_text(svg, encoding='utf-8')
