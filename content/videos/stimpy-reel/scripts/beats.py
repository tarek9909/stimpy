import subprocess, numpy as np
FF = r"C:\Projects\motion\content\videos\second_video\stimpy\app\node_modules\ffmpeg-static\ffmpeg.exe"
SONG = r"C:\Users\aswad\Downloads\Drake - Money In The Grave ft. Rick Ross.mp3"
sr = 22050
p = subprocess.run([FF, "-v", "error", "-ss", "20", "-t", "40", "-i", SONG, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True, check=True)
x = np.frombuffer(p.stdout, np.float32)
hop, win = 256, 1024
n = (len(x) - win) // hop
frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop][:n] * np.hanning(win)
S = np.abs(np.fft.rfft(frames, axis=1))
S = np.log1p(100 * S)
flux = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
flux = np.r_[0, flux]
# low band (kick) flux
freqs = np.fft.rfftfreq(win, 1 / sr)
lb = freqs < 150
lflux = np.r_[0, np.maximum(0, np.diff(S[:, lb], axis=0)).sum(axis=1)]
fps = sr / hop
env = flux - np.convolve(flux, np.ones(16) / 16, mode="same")
env = np.maximum(env, 0)
# tempo via autocorrelation in 70-180 bpm
ac = np.correlate(env, env, mode="full")[len(env) - 1:]
lags = np.arange(len(ac))
bpm = 60 * fps / np.maximum(lags, 1)
mask = (bpm > 70) & (bpm < 180)
cands = sorted(zip(ac[mask], bpm[mask]), reverse=True)[:8]
print("tempo candidates:", [(round(b, 2), round(float(a), 1)) for a, b in cands])
best = cands[0][1]
# refine bpm with fine grid + phase search over comb
def score(b, ph):
    period = 60 / b * fps
    idx = (ph + np.arange(0, len(env) / period) * period).astype(int)
    idx = idx[idx < len(env)]
    return env[idx].sum()
bs = np.arange(best - 3, best + 3, 0.01)
res = []
for b in bs:
    period = 60 / b * fps
    sc = [score(b, ph) for ph in np.arange(0, period, 0.5)]
    res.append((max(sc), b, np.argmax(sc) * 0.5))
sc, b, ph = max(res)
period = 60 / b
t0 = 20 + ph / fps
beats = t0 + np.arange(0, 40 / period) * period
print("BPM %.2f  beat %.4fs  first beat %.3f" % (b, period, t0))
near = beats[(beats > 24) & (beats < 30)]
print("beats near 26s:", np.round(near, 3))
# kick strength on those beats
for t in near:
    i = int((t - 20) * fps)
    print("  %.3f kick %.1f flux %.1f" % (t, lflux[max(0, i - 2):i + 3].max(), flux[max(0, i - 2):i + 3].max()))
print("--- per-beat offset of nearest onset peak (ms), 26-48s")
offs=[]
for t in beats[(beats>26)&(beats<48)]:
    i=int((t-20)*fps); w=6
    seg=env[i-w:i+w+1]; j=np.argmax(seg)-w
    offs.append(j/fps*1000)
print(np.round(offs).astype(int).tolist())
print("median offset ms", np.median(offs))
