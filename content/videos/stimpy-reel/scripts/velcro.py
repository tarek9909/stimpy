"""Track hand x along the top edge (velcro) in the 4 velcro takes."""
import subprocess, json, sys, numpy as np
FF = r"C:\Projects\motion\content\videos\second_video\stimpy\app\node_modules\ffmpeg-static\ffmpeg.exe"
W = r"C:\Users\aswad\Downloads\stimpy cuts\work"
SC = 2; w, h = 540, 960
TAKES = ["215005", "215405", "215712", "220019"]
Y0, Y1 = 560, 860      # band around the top velcro edge
X0, X1 = 150, 820       # panel width span
res = {}
for t in TAKES:
    p = subprocess.run([FF, "-v", "error", "-i", f"{W}\\20261109_{t}.mp4", "-vf", f"scale={w}:{h}",
                        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True)
    a = np.frombuffer(p.stdout, np.uint8).reshape(-1, h, w, 3).astype(np.float32)
    ref = np.median(a[:15], axis=0)
    out = []
    for fr in a:
        sub = fr[Y0 // SC:Y1 // SC, X0 // SC:X1 // SC]; rs = ref[Y0 // SC:Y1 // SC, X0 // SC:X1 // SC]
        r, g, b = sub[..., 0], sub[..., 1], sub[..., 2]
        cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b
        cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b
        yy = 0.299 * r + 0.587 * g + 0.114 * b
        m = (cr > 140) & (cr < 175) & (cb > 92) & (cb < 125) & (yy > 50) & (np.abs(sub - rs).sum(-1) > 60)
        ys, xs = np.nonzero(m)
        if len(xs) > 150:
            out.append(round((np.percentile(xs, 95) * SC + X0 - X0) / (X1 - X0) * 100, 1))  # rightmost fingertip
        else:
            out.append(None)
    res[t] = out
    print(t, ' '.join('%.1f:%s' % (i / 30, ('%d' % out[i]) if out[i] is not None else '-') for i in range(45, len(out), 6)))
json.dump(res, open(sys.argv[1], "w"))
