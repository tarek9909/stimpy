"""Measure zip-pull height on the zipper line for left-zip and right-zip takes.
Hand = skin pixels that differ from the clean start frame, inside a narrow band around the zipper line.
Progress = (bottom - y) / (bottom - top) using the panel's zipper span."""
import subprocess, json, sys, numpy as np
FF = r"C:\Projects\motion\content\videos\second_video\stimpy\app\node_modules\ffmpeg-static\ffmpeg.exe"
W = r"C:\Users\aswad\Downloads\stimpy cuts\work"
SC = 2; w, h = 540, 960
GROUPS = {"L": ["214819", "215208", "215601", "215845"], "R": ["214920", "215337", "215646", "215935"]}
BAND = {"L": (150, 330), "R": (630, 800)}
TOP, BOT = 730, 1250   # zipper span (full-res y) from the clean frame

def read(t):
    p = subprocess.run([FF, "-v", "error", "-i", f"{W}\\20261109_{t}.mp4", "-vf", f"scale={w}:{h}",
                        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.uint8).reshape(-1, h, w, 3).astype(np.float32)

res = {}
for side, takes in GROUPS.items():
    x0, x1 = BAND[side]
    for t in takes:
        a = read(t)
        ref = np.median(a[:15], axis=0)
        ys_out = []
        for fr in a:
            sub = fr[600 // SC:1320 // SC, x0 // SC:x1 // SC]
            rs = ref[600 // SC:1320 // SC, x0 // SC:x1 // SC]
            r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
            cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b
            cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b
            yy = 0.299 * r + 0.587 * g + 0.114 * b
            m = (cr > 140) & (cr < 175) & (cb > 92) & (cb < 125) & (yy > 50) & (np.abs(sub - rs).sum(-1) > 60)
            ys = np.nonzero(m)[0]
            if len(ys) > 150:
                y = float(np.median(ys)) * SC + 600
                ys_out.append(round((BOT - y) / (BOT - TOP) * 100, 1))
            else:
                ys_out.append(None)
        res[t] = dict(side=side, prog=ys_out)
        print(t, side, file=sys.stderr)
json.dump(res, open(sys.argv[1], "w"))
