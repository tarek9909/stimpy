import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
import json
sr, x = wavfile.read("../app/public/stimpy.wav"); x = x.astype(float)/32768; m = x.mean(1)
song = json.load(open("../app/src/song.json"))
fig, ax = plt.subplots(2,1, figsize=(16,8), sharex=True)
t = np.arange(len(m))/sr
ax[0].plot(t[::20], m[::20], lw=0.3)
for s in song["sections"]: ax[0].axvline(s["start"], color="r"); ax[0].text(s["start"]+0.2, 0.9, s["name"])
for c in song["clicks"]: ax[0].axvline(c["t"], color="k", lw=0.4, ls=":")
ax[1].specgram(m, NFFT=2048, Fs=sr, noverlap=1024, cmap="magma", vmin=-120)
ax[1].set_ylim(0, 12000)
plt.tight_layout(); plt.savefig("qa/song.png", dpi=70)
bands = [(20,60),(60,250),(250,2000),(2000,6000),(6000,16000)]
print("section   " + "  ".join(f"{a}-{b}" for a,b in bands))
for s in song["sections"]:
    seg = m[int(s["start"]*sr):int(s["end"]*sr)]
    row = []
    for a,b in bands:
        y = sosfilt(butter(4,[a,b],"bandpass",fs=sr,output="sos"), seg)
        row.append(f"{20*np.log10(np.sqrt((y**2).mean())+1e-9):7.1f}")
    print(f"{s['name']:8s} " + " ".join(row))
