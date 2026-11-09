import subprocess, sys, os, json, numpy as np

FF = r"C:\Projects\motion\content\videos\second_video\stimpy\app\node_modules\ffmpeg-static\ffmpeg.exe"
W = r"C:\Users\aswad\Downloads\stimpy cuts\work"
OUT = sys.argv[1]
w, h = 108, 192

def frames(path):
    p = subprocess.run([FF, "-v", "error", "-i", path, "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                       capture_output=True, check=True)
    a = np.frombuffer(p.stdout, np.uint8).reshape(-1, h, w).astype(np.float32)
    return a

def shift(a, b):
    A = np.fft.fft2(a - a.mean()); B = np.fft.fft2(b - b.mean())
    R = A * np.conj(B); R /= np.abs(R) + 1e-9
    r = np.abs(np.fft.ifft2(R)); y, x = np.unravel_index(r.argmax(), r.shape)
    if y > h // 2: y -= h
    if x > w // 2: x -= w
    return int(x), int(y)

res = {}
ref = None
for f in sorted(os.listdir(W)):
    if not f.endswith(".mp4"): continue
    a = frames(os.path.join(W, f))
    n = len(a)
    motion = np.r_[0, np.abs(np.diff(a, axis=0)).mean(axis=(1, 2))]
    last = a[-1]; first = a[0]
    d_last = np.abs(a - last).mean(axis=(1, 2))
    d_first = np.abs(a - first).mean(axis=(1, 2))
    bright = a.mean(axis=(1, 2))
    if ref is None: ref = a[0]
    res[f] = dict(n=n, motion=motion.round(2).tolist(), d_last=d_last.round(2).tolist(),
                  d_first=d_first.round(2).tolist(), bright=bright.round(1).tolist(),
                  shift_first_vs_ref=shift(first, ref), shift_last_vs_ref=shift(last, ref))
    print(f, n, "frames", "shift", res[f]["shift_first_vs_ref"], res[f]["shift_last_vs_ref"])
json.dump(res, open(OUT, "w"))
