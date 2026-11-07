"""STIMPY — "One Hoodie" : a fully synthesized EDM track.

128 BPM, F minor, 26 bars (~49 s). Everything is generated from code, so the
video knows every hit exactly: this script also writes the timing map the
renderer reads (app/src/song.json).

Structure (bars, 0-based):
   0-3   DARK    heartbeat sub, air, a clock tick, a dark Fm drone
   4-7   WALK    kick + filtered offbeat bass, pad opens, riser + snare roll
   8-15  WORLDS  drop 1: a CLICK + impact every 2 bars (a new Stimpie/world)
  16-19  DECK    breakdown: the Stimpie detaches (reverse click), cards riffle
  20-22  SWAP    drop 2: acid line, a CLICK on every beat (pitched upward)
  23-25  LOGO    final CLICK, held chord, decay to silence

Run:  .venv/Scripts/python synth.py
"""
import json
import math
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
BPM = 128.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
STEP = BEAT / 4
NBARS = 26
DUR = NBARS * BAR + 1.0
N = int(DUR * SR)

ROOT = Path(__file__).resolve().parent
OUT_WAV = ROOT.parent / "app" / "public" / "stimpy.wav"
OUT_JSON = ROOT.parent / "app" / "src" / "song.json"

rng = np.random.default_rng(1)


def T(bar, beat=0.0, step=0.0):
    return bar * BAR + beat * BEAT + step * STEP


def mtof(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def stereo():
    return np.zeros((N, 2))


def place(buf, sig, t, gain=1.0, pan=0.0):
    """Mix a mono or stereo signal into buf at time t (seconds)."""
    i = int(round(t * SR))
    if i >= N:
        return
    if sig.ndim == 1:
        l = math.cos((pan + 1) * math.pi / 4)
        r = math.sin((pan + 1) * math.pi / 4)
        sig = np.stack([sig * l, sig * r], axis=1) * math.sqrt(2)
    j = min(N, i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def ar(n, a, r):
    """Attack/release envelope over n samples."""
    e = np.ones(n)
    na = max(1, int(a * SR))
    nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na) if na < n else np.linspace(0, 1, n)[:na]
    if nr < n:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def polyblep_saw(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    p = (phase0 + np.cumsum(dt)) % 1.0
    s = 2 * p - 1
    m = p < dt
    x = p[m] / dt[m]
    s[m] -= x + x - x * x - 1
    m = p > 1 - dt
    x = (p[m] - 1) / dt[m]
    s[m] -= x * x + x + x + 1
    return s


def sine(freq, n, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return np.sin(2 * np.pi * (phase0 + np.cumsum(f) / SR))


def noise(n):
    return rng.standard_normal(n)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "highpass", fs=SR, output="sos"), x, axis=0)


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, "lowpass", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x, axis=0)


def svf(x, fc, q=0.707, mode="lp"):
    """TPT state-variable filter with a per-sample cutoff (mono)."""
    fc = np.clip(np.broadcast_to(np.asarray(fc, dtype=float), x.shape), 20, SR * 0.45)
    g = np.tan(np.pi * fc / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    y = np.empty_like(x)
    ic1 = ic2 = 0.0
    xs, a1s, a2s, a3s = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist()
    out = [0.0] * len(xs)
    for i in range(len(xs)):
        v3 = xs[i] - ic2
        v1 = a1s[i] * ic1 + a2s[i] * v3
        v2 = ic2 + a2s[i] * ic1 + a3s[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v2 if mode == "lp" else (v1 if mode == "bp" else xs[i] - k * v1 - v2)
    y[:] = out
    return y


def reverb_ir(seconds, damp_hz=5000, seed=7):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    e = np.exp(-np.arange(n) / (seconds * SR / 6.9))
    ir = np.stack([lp(r.standard_normal(n), damp_hz) * e, lp(r.standard_normal(n), damp_hz) * e], axis=1)
    ir[: int(0.012 * SR)] = 0  # pre-delay
    return ir / np.sqrt((ir ** 2).sum(axis=0))


def reverb(x, ir):
    return np.stack([fftconvolve(x[:, c], ir[:, c])[:N] for c in range(2)], axis=1)


# ---------------------------------------------------------------- instruments

def kick(level=1.0, low=45.0):
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = low + 120 * np.exp(-t / 0.035) + 40 * np.exp(-t / 0.006)
    body = sine(f, n) * np.exp(-t / 0.32) * np.clip(t / 0.002, 0, 1)
    click = hp(noise(n), 2500) * np.exp(-t / 0.0025) * 0.5
    return np.tanh(1.8 * (body + click)) * level


def heartbeat():
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for dt, amp in ((0.0, 1.0), (0.24, 0.65)):
        tt = np.clip(t - dt, 0, None)
        f = 38 + 50 * np.exp(-tt / 0.04)
        s = sine(f, n) * np.exp(-tt / 0.13) * (t >= dt)
        out += s * amp
    return lp(np.tanh(1.5 * out), 400)


def clap():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    nz = bp(noise(n), 900, 3200)
    e = np.zeros(n)
    for d in (0.0, 0.011, 0.023):
        e += (t >= d) * np.exp(-np.clip(t - d, 0, None) / 0.009) * 0.6
    e += (t >= 0.03) * np.exp(-np.clip(t - 0.03, 0, None) / 0.13)
    tone = sine(210 * np.exp(-t / 0.2), n) * np.exp(-t / 0.05) * 0.25
    return (nz * e + tone) * 0.9


def snare_hit(bright=1.0):
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    nz = bp(noise(n), 1200, 4000 + 3000 * bright) * np.exp(-t / 0.045)
    tone = sine(190 + 60 * bright, n) * np.exp(-t / 0.03) * 0.4
    return nz + tone


def hat(open_=False):
    n = int((0.35 if open_ else 0.08) * SR)
    t = np.arange(n) / SR
    tau = 0.14 if open_ else 0.022
    return hp(noise(n), 7500, 4) * np.exp(-t / tau) * (0.7 if open_ else 1.0)


def the_click(pitch=1.0, big=False):
    """The Stimpie snap: transient + metallic ring + a snap-button thunk."""
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    s = hp(noise(n), 3000) * np.exp(-t / 0.0016) * 1.4
    for f, tau, a in ((2210, 0.030, 0.5), (3480, 0.022, 0.4), (5140, 0.016, 0.3), (7020, 0.010, 0.25), (1320, 0.05, 0.3)):
        s += np.sin(2 * np.pi * f * pitch * t) * np.exp(-t / tau) * a
    thunk_f = (190 * np.exp(-t / 0.03) + 80) * (0.9 + 0.1 * pitch)
    s += sine(thunk_f, n) * np.exp(-t / 0.045) * (1.2 if big else 0.7)
    if big:  # a second, lower latch a hair later: "ka-CLICK"
        d = int(0.018 * SR)
        s[d:] += s[: n - d] * 0.55
    return np.tanh(1.3 * s)


def impact():
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    boom = sine(30 + 35 * np.exp(-t / 0.15), n) * np.exp(-t / 0.9)
    crash = hp(noise(n), 4000) * np.exp(-t / 0.7) * 0.35
    return np.tanh(1.4 * boom) + crash


def riffle(dur):
    """Cards fanning: a train of tiny ticks that accelerates."""
    n = int(dur * SR)
    out = np.zeros(n)
    k = 36
    for i in range(k):
        u = i / k
        t0 = dur * (1 - (1 - u) ** 1.7)
        m = int(0.012 * SR)
        tick = bp(noise(m), 2500, 9000) * np.exp(-np.arange(m) / (0.0025 * SR))
        j = int(t0 * SR)
        out[j : j + m] += tick[: max(0, min(m, n - j))] * (0.5 + 0.5 * u)
    return out


def supersaw(midi, n, voices=7, spread=0.22, seed=0):
    r = np.random.default_rng(seed)
    L = np.zeros(n)
    R = np.zeros(n)
    for v in range(voices):
        det = (v / (voices - 1) - 0.5) * 2 * spread
        s = polyblep_saw(mtof(midi + det), n, r.random())
        pan = (v / (voices - 1) - 0.5) * 1.6
        L += s * math.cos((pan + 1) * math.pi / 4)
        R += s * math.sin((pan + 1) * math.pi / 4)
    return np.stack([L, R], axis=1) / voices


# ---------------------------------------------------------------- the score

CHORDS = [  # one per bar, cycling: Fm  Db  Ab  Eb (voice-led)
    (41, [53, 56, 60]),
    (37, [53, 56, 61]),
    (44, [51, 56, 60]),
    (39, [51, 55, 58]),
]
SECTIONS = [("dark", 0, 4), ("walk", 4, 8), ("worlds", 8, 16), ("deck", 16, 20), ("swap", 20, 23), ("logo", 23, 26)]

drums = stereo()
bass = stereo()
music = stereo()
fx = stereo()
clicks = stereo()
send = stereo()  # reverb send

events = {"kick": [], "clap": [], "heart": [], "click": [], "impact": [], "hat": []}

# heartbeat: DARK, and faintly under DECK
for b in list(range(0, 4)) + list(range(16, 20)):
    for beat in (0, 2):
        g = 0.7 if b < 4 else 0.3
        place(drums, heartbeat(), T(b, beat), g)
        events["heart"].append(T(b, beat))
place(drums, heartbeat(), T(25), 0.5)
events["heart"].append(T(25))

# clock tick in DARK (foreshadows the click)
for b in range(0, 4):
    for beat in range(4):
        tk = the_click(pitch=1.8)[: int(0.03 * SR)] * 0.12
        place(fx, tk, T(b, beat, 2), 1.0, pan=0.4 if beat % 2 else -0.4)

# kicks
KICK_BARS = list(range(4, 7)) + list(range(8, 16)) + list(range(20, 23))
for b in KICK_BARS:
    for beat in range(4):
        lvl = 0.75 if b < 8 else 1.0
        place(drums, kick(lvl), T(b, beat))
        events["kick"].append(T(b, beat))

# claps on 2 & 4 in the drops
for b in list(range(8, 16)) + list(range(20, 23)):
    for beat in (1, 3):
        c = clap()
        place(drums, c, T(b, beat), 0.55)
        place(send, c, T(b, beat), 0.25)
        events["clap"].append(T(b, beat))

# hats
for b in list(range(6, 8)) + list(range(8, 16)) + list(range(20, 23)):
    for s in range(16):
        if b in (6, 7):
            if s % 2 == 0:
                place(drums, hat(), T(b, 0, s), 0.10 + 0.06 * (s % 4 == 2), pan=0.3)
            continue
        vel = 0.22 if s % 4 == 2 else 0.095
        place(drums, hat(), T(b, 0, s), vel, pan=0.25 if s % 2 else -0.15)
        if s % 4 == 2:
            place(drums, hat(True), T(b, 0, s), 0.17, pan=-0.2)
            events["hat"].append(T(b, 0, s))

# snare rolls into each drop (bars 6-7 and 18-19): 8ths -> 16ths -> 32nds
for start in (6, 18):
    hits = []
    for s in range(0, 16, 2):
        hits.append(T(start, 0, s))
    for s in range(0, 12):
        hits.append(T(start + 1, 0, s))
    for s in range(0, 8):  # 32nds over beats 3 of the last bar
        hits.append(T(start + 1, 3) - BEAT + s * STEP / 2)
    hits.sort()
    for i, h in enumerate(hits):
        u = i / len(hits)
        place(drums, snare_hit(u), h, 0.06 + 0.24 * u ** 1.5, pan=(rng.random() - 0.5) * 0.4)
        place(send, snare_hit(u), h, 0.1 * u)

# risers into each drop (4 bars / 2 bars), cut dead one beat before
for start, bars_ in ((4, 4), (18, 2)):
    t0 = T(start)
    t1 = T(start + bars_) - BEAT
    n = int((t1 - t0) * SR)
    u = np.linspace(0, 1, n)
    nz = noise(n)
    center = 300 * (8000 / 300) ** (u ** 1.3)
    sw = svf(nz, center, q=2.5, mode="bp") * u ** 2 * 0.26
    tone = polyblep_saw(180 * (8 ** u ** 1.6), n) * u ** 3 * 0.05
    r = np.stack([sw + tone, np.roll(sw, 90) + tone], axis=1)
    place(fx, r, t0)
    place(send, r, t0, 0.4)

# reverse click swelling into drop 1 (fills the silent beat)
rc = the_click(big=True)[::-1]
rc = rc[-int(BEAT * SR):] * np.linspace(0, 1, int(BEAT * SR)) ** 2
place(clicks, rc, T(8) - BEAT, 0.35)
place(send, rc, T(8) - BEAT, 0.3)

# THE CLICKS
world_clicks = [T(8), T(10), T(12), T(14)]
for i, t in enumerate(world_clicks):
    place(clicks, the_click(pitch=1.0 + 0.06 * i, big=True), t, 0.95)
    place(send, the_click(pitch=1.0), t, 0.35)
    place(fx, impact(), t, 0.7 if i % 2 == 0 else 0.45)
    place(send, impact(), t, 0.15)
    events["click"].append({"t": t, "kind": "world", "i": i})
    events["impact"].append(t)

# DECK: the stimpie detaches (reversed click), then a riffle of cards
det = the_click(big=True)[::-1][-int(0.35 * SR):]
place(clicks, det, T(16) - 0.35, 0.7)
place(send, det, T(16) - 0.35, 0.4)
events["click"].append({"t": T(16), "kind": "detach", "i": 0})
place(fx, impact(), T(16), 0.35)
rf = riffle(BAR * 0.9)
place(fx, rf, T(17), 0.6, pan=-0.2)
place(send, rf, T(17), 0.3)
events["riffle"] = [T(17), T(17) + BAR * 0.9]

# DROP 2: a click on every beat, climbing in pitch
for k in range(12):
    b, beat = 20 + k // 4, k % 4
    t = T(b, beat)
    place(clicks, the_click(pitch=1.0 + k * 0.045, big=(beat == 0)), t, 0.75, pan=(-0.35, 0.35)[k % 2])
    place(send, the_click(pitch=1.0 + k * 0.045), t, 0.2)
    events["click"].append({"t": t, "kind": "swap", "i": k})
place(fx, impact(), T(20), 0.7)
events["impact"].append(T(20))

# FINAL
place(clicks, the_click(pitch=0.85, big=True), T(23), 1.0)
place(send, the_click(pitch=0.85, big=True), T(23), 0.6)
place(fx, impact(), T(23), 0.9)
place(send, impact(), T(23), 0.3)
events["click"].append({"t": T(23), "kind": "final", "i": 0})
events["impact"].append(T(23))

# ---- pads: supersaw chords, filter follows the story
pad = stereo()
for b in range(0, 26):
    root, notes = CHORDS[b % 4]
    if b >= 23:
        root, notes = CHORDS[0]
    n = int(BAR * SR) + int(0.05 * SR)
    ch = sum(supersaw(m, n, seed=b * 7 + j) for j, m in enumerate(notes)) / 3
    ch += supersaw(notes[0] - 12, n, voices=3, spread=0.1, seed=b) * 0.4
    e = ar(n, 0.02, 0.05)
    if b >= 23:  # hold and fade the last chord
        n2 = int(3 * BAR * SR)
        ch = sum(supersaw(m, n2, seed=90 + j) for j, m in enumerate(notes + [notes[0] + 12])) / 4
        e = ar(n2, 0.01, 2.5 * BAR)
        place(pad, ch * e[:, None], T(b))
        break
    place(pad, ch * e[:, None], T(b))

cut = np.full(N, 300.0)
tt = np.arange(N) / SR


def seg(a, b_):
    return (tt >= T(a)) & (tt < T(b_))


cut[seg(0, 4)] = 260 + 140 * np.sin(np.pi * (tt[seg(0, 4)] - T(0)) / (4 * BAR)) ** 2
m = seg(4, 8)
cut[m] = 400 * (6.0 ** ((tt[m] - T(4)) / (4 * BAR)) ** 1.5)
cut[seg(8, 16)] = 3200
m = seg(16, 20)
cut[m] = 1400 + 1800 * ((tt[m] - T(16)) / (4 * BAR))
cut[seg(20, 23)] = 4200
m = tt >= T(23)
cut[m] = 3800 * np.exp(-(tt[m] - T(23)) / 2.5) + 300
pad = np.stack([svf(pad[:, c], cut, q=0.9) for c in range(2)], axis=1)
pad[seg(7, 8) & (tt >= T(8) - BEAT)] *= 0.0  # the vacuum before the drop
pad[seg(19, 20) & (tt >= T(20) - BEAT)] *= 0.0
place(music, pad, 0.0, 0.55)
place(send, pad, 0.0, 0.25)

# ---- offbeat bass (bass-house), walk = filtered, drops = open
BASS_STEPS = [2, 3, 6, 10, 11, 14]
for b in list(range(4, 7)) + list(range(8, 16)) + list(range(20, 23)):
    root, _ = CHORDS[b % 4]
    for s in BASS_STEPS:
        if b < 8 and s in (3, 11):
            continue
        n = int(STEP * SR * (1.8 if s in (2, 10) else 0.9))
        f = mtof(root)
        tn = np.arange(n) / SR
        osc = polyblep_saw(f, n) * 0.6 + polyblep_saw(f * 1.004, n) * 0.6 + sine(f / 2, n) * 0.7
        top = 900 if b < 8 else 2600
        c = 120 + top * np.exp(-tn / 0.06)
        note = svf(osc, c, q=1.4) * ar(n, 0.003, 0.02)
        place(bass, np.tanh(1.6 * note), T(b, 0, s), 0.5)

# ---- pluck arp in WORLDS and DECK (ping-pong delay)
ARP = [0, 1, 2, 1, 3, 2, 1, 2]
arp_bus = stereo()
for b in list(range(8, 16)) + list(range(16, 20)):
    _, notes = CHORDS[b % 4]
    tones = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[0] + 24]
    for i, idx in enumerate(ARP):
        n = int(0.3 * SR)
        tn = np.arange(n) / SR
        f = mtof(tones[idx])
        osc = polyblep_saw(f, n) + polyblep_saw(f * 1.006, n) * 0.5
        bright = 5000 if b < 16 else 2200
        note = svf(osc, 300 + bright * np.exp(-tn / 0.05), q=1.2) * np.exp(-tn / 0.12)
        place(arp_bus, note, T(b, 0, i * 2), 0.16 if b < 16 else 0.11)
dl = int(BEAT * 0.75 * SR)
echo = np.zeros_like(arp_bus)
echo[dl:, 1] += arp_bus[:-dl, 0] * 0.45
echo[2 * dl:, 0] += arp_bus[: -2 * dl, 0] * 0.25
music += arp_bus + lp(echo, 3500)
send += arp_bus * 0.3

# ---- acid line in SWAP (acid red)
ACID = [41, 41, 53, 41, 44, 41, 48, 41, 41, 51, 41, 53, 44, 46, 48, 51]
ACCENT = [1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1]
acid = np.zeros(N)
t0 = T(20)
n_all = int(3 * BAR * SR)
freq = np.zeros(n_all)
gate = np.zeros(n_all)
acc = np.zeros(n_all)
for k in range(48):
    i0 = int(k * STEP * SR)
    i1 = int((k + 1) * STEP * SR)
    freq[i0:i1] = mtof(ACID[k % 16] + (12 if k >= 32 and k % 4 == 3 else 0))
    gl = int((i1 - i0) * 0.7)
    gate[i0 : i0 + gl] = 1
    acc[i0:i1] = ACCENT[k % 16]
# glide
freq = lp(freq, 60, 1)
osc = polyblep_saw(freq, n_all)
ph = (np.arange(n_all) % int(STEP * SR)) / SR
sweep = np.linspace(0, 1, n_all)
fc = 200 + (600 + 2400 * sweep) * np.exp(-ph / (0.07 + 0.08 * acc)) * (1 + acc)
a = svf(osc, fc, q=7.0) * lp(gate, 200, 1)
a = np.tanh(3.0 * a)
place(music, a, t0, 0.17)
place(send, a, t0, 0.06)

# ---- chord stabs in SWAP (offbeats)
for b in range(20, 23):
    _, notes = CHORDS[b % 4]
    for s in (2, 6, 10, 14):
        n = int(0.16 * SR)
        st = sum(supersaw(m + 12, n, voices=5, seed=s + m) for m in notes) / 3
        st = lp(st, 3500) * ar(n, 0.002, 0.08)[:, None]
        place(music, st, T(b, 0, s), 0.3)

# ---- air + vinyl dust in the dark
n = int(T(8) * SR)
air = lp(noise(n), 700) * 0.06 * np.sin(np.linspace(0, np.pi, n)) ** 0.5
air2 = np.stack([air, np.roll(air, 400)], axis=1)
dust = np.zeros(n)
idx = rng.choice(n, 180, replace=False)
dust[idx] = rng.standard_normal(180) * 0.5
dust = hp(dust, 2000)
place(fx, air2 + dust[:, None] * 0.25, 0.0)

# ---------------------------------------------------------------- mix

sc = np.ones(N)
for k in events["kick"]:
    i = int(k * SR)
    m = min(N - i, int(0.3 * SR))
    sc[i : i + m] = np.minimum(sc[i : i + m], 1 - 0.75 * np.exp(-np.arange(m) / (0.07 * SR)))
sc = lp(sc, 40, 1)

ir = reverb_ir(2.8)
wet = reverb(hp(send, 250), ir)

mix = drums * 1.0 + bass * sc[:, None] + music * sc[:, None] + fx + clicks + wet * 0.35 * (0.4 + 0.6 * sc[:, None])
mix = hp(mix, 25)
drive = 1.1
mix = np.tanh(drive * mix) / np.tanh(drive)
mix *= 0.97 / np.abs(mix).max()
fade = int(0.4 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]

OUT_WAV.parent.mkdir(parents=True, exist_ok=True)
wavfile.write(OUT_WAV, SR, (mix * 32767).astype(np.int16))

song = {
    "bpm": BPM,
    "beat": BEAT,
    "bar": BAR,
    "bars": NBARS,
    "duration": DUR,
    "sections": [{"name": n_, "start": T(a_), "end": T(b_)} for n_, a_, b_ in SECTIONS],
    "kicks": events["kick"],
    "claps": events["clap"],
    "hearts": events["heart"],
    "clicks": events["click"],
    "impacts": events["impact"],
    "riffle": events["riffle"],
}
OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
OUT_JSON.write_text(json.dumps(song, indent=1))

# a quick loudness report per section
for name, a_, b_ in SECTIONS:
    s = mix[int(T(a_) * SR) : int(T(b_) * SR)]
    print(f"{name:7s} rms {20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-9):6.1f} dBFS  peak {np.abs(s).max():.2f}")
print("wrote", OUT_WAV, f"{DUR:.2f}s")
