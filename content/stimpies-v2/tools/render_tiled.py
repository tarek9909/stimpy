"""Print-renders a heavy SVG in 2x2 tiles (Chrome stalls on many filtered layers at full size), then stitches.

Usage: python render_tiled.py <name>   ->  out/print/<name>.png at 3543x4724
"""
import os, re, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
SCALE = 1.2  # 1500x2000 tile -> 1800x2400 px; stitched 3600x4800 then resized to 3543x4724

name = sys.argv[1]
src = open(os.path.join(ROOT, "src", name + ".svg"), encoding="utf-8").read()
work = tempfile.mkdtemp()
tiles = []
for ty in range(2):
    for tx in range(2):
        vb = f"{tx * 1500} {ty * 2000} 1500 2000"
        tile_svg = re.sub(r'viewBox="[^"]*" width="3000" height="4000"', f'viewBox="{vb}" width="1500" height="2000"', src, count=1)
        svg_path = os.path.join(work, f"t{ty}{tx}.svg")
        png_path = os.path.join(work, f"t{ty}{tx}.png")
        open(svg_path, "w", encoding="utf-8").write(tile_svg)
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                        f"--user-data-dir={os.path.join(work, 'profile')}", "--window-size=1500,2000",
                        f"--force-device-scale-factor={SCALE}", "--virtual-time-budget=8000",
                        f"--screenshot={png_path}", "file:///" + svg_path.replace("\\", "/")],
                       check=True, timeout=300, capture_output=True)
        tiles.append(((tx, ty), Image.open(png_path).convert("RGB")))
        print("tile", tx, ty, tiles[-1][1].size, flush=True)

w, h = int(1500 * SCALE), int(2000 * SCALE)
sheet = Image.new("RGB", (w * 2, h * 2))
for (tx, ty), im in tiles:
    sheet.paste(im.resize((w, h)), (tx * w, ty * h))
out = os.path.join(ROOT, "out", "print", name + ".png")
sheet.resize((3543, 4724), Image.LANCZOS).save(out, dpi=(300, 300))
print("wrote", out)
