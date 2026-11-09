"""Stimpy reel v2: every shot = 1 beat. Renders each shot as its own exact-length segment file.
Relays: each closure group (left zip, right zip, top velcro) is split into 4 equal quarters of its travel;
quarter k comes from Stimpy k's take and is retimed to fill exactly one beat."""
import json, os, subprocess, sys
FF = r"C:\Projects\motion\content\videos\second_video\stimpy\app\node_modules\ffmpeg-static\ffmpeg.exe"
W = r"C:\Users\aswad\Downloads\stimpy cuts\work"
OUT = W + r"\v5"
os.makedirs(OUT, exist_ok=True)
FPS = 30
BEAT0, BEAT = 0.435, 0.5976
def bf(k): return 0 if k == 0 else round((BEAT0 + BEAT / 2 * k) * FPS)  # k = half-beat index
def clip(n): return W + "\\20261109_" + n + ".mp4"

ORDER = ["Sabotage", "Receipt", "Chameleon", "SameDay"]
# travel windows (seconds) per closure group, Stimpy order Sabotage, Receipt, Chameleon, Same Day
# Exact source frame ranges, measured frame by frame (zip-pull height % in brackets).
# Each range is retimed to exactly one beat; each shot starts at the height the previous one ended.
import json as _j, os as _os
_S = _j.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "data", "split8.json")))
RELAYS = []
for _g in ["Left zip", "Right zip", "Top velcro", "Bottom velcro"]:
    for _i, _r in enumerate(_S[_g]):
        RELAYS.append(("%s %d/8 %s [%d-%d%%]" % (_g, _i + 1, _r["stimpy"], _r["h0"], _r["h1"]), _r["take"], _r["f0"], _r["f1"]))
shots = []  # label, file, src_in_frame, src_out_frame (exclusive), beat_start, beat_end
k = 0
for i, n in enumerate(["214441", "214348", "214535", "214600", "214622"]):
    shots.append(("Position %d" % (i + 1), n, 20, None, k, k + 1)); k += 1
for label, n, a, b in RELAYS:   # 8 steps per closure group, no repeats
    shots.append((label, n, a, b, k, k + 1)); k += 1
for i, n in enumerate(["220044", "220052", "220102", "220112", "220122"]):
    shots.append(("Disappear %d" % (i + 1), n, 20, None, k, k + 1)); k += 1
shots.append(("Pull-out", "220211", 182, 209, k, k + 2)); k += 2          # one full beat
shots.append(("Bare surface", "220211", 212, None, k, k + 2)); k += 2     # ends on the empty surface, no logo
END = (k, k)

edl = []
for idx, (label, n, a, b, k0, k1) in enumerate(shots):
    n_out = bf(k1) - bf(k0)
    path = OUT + "\\seg%02d.mp4" % idx
    if b is None:   # straight trim, real speed
        vf = f"trim=start_frame={a}:end_frame={a + n_out},setpts=PTS-STARTPTS"
        speed = 1.0
    else:           # retime src [a,b) to exactly n_out frames
        speed = (b - a) / n_out
        vf = f"trim=start_frame={a}:end_frame={b},setpts=(PTS-STARTPTS)/{speed:.6f},fps=30"
    subprocess.run([FF, "-v", "error", "-y", "-i", clip(n), "-vf", vf + f",trim=end_frame={n_out}",
                    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-r", "30", path], check=True)
    edl.append(dict(label=label, file=path, src=n, src_in=a, src_out=b, speed=round(speed, 2), start=bf(k0), end=bf(k1)))
    print("%-28s %s src %4s-%4s speed %.2fx  tl %3d-%3d" % (label, n, a, b if b else a + n_out, speed, bf(k0), bf(k1)))
card = dict(start=bf(END[0]), end=bf(END[1]))
markers = [bf(i) for i in range(0, END[1] + 1)]
json.dump(dict(segs=edl, end=card, total=card["end"], markers=markers), open(OUT + "\\edl_v5.json", "w"), indent=1)
print("end card", card, "total %.2fs" % (card["end"] / FPS))
