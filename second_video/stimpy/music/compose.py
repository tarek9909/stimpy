"""STIMPY — "Multiple Identities" (original score, synthesised from scratch).

120 BPM (beat 0.5 s, bar 2 s), F minor, 60 s. Every section of the video is a whole number of bars, so the
edit and the music share one grid. Writes:
  ../app/public/audio/stimpy.wav   48 kHz stereo master
  ../app/src/music.json            tempo, sections and the event times the visuals sync to

    uv run python compose.py
"""
import json
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BPM = 120
BEAT = 60 / BPM
BAR = 4 * BEAT
DUR = 60.0
N = int(SR * (DUR + 4))  # headroom for tails, trimmed at the end
rng = np.random.default_rng(20260928)
ROOT = Path(__file__).resolve().parent.parent

# ------------------------------------------------------------------ the edit (seconds)
SECTIONS = [
    ("cold", 0, 4), ("blank", 4, 8), ("explode", 8, 16), ("snap", 16, 22),
    ("identities", 22, 40), ("collection", 40, 48), ("yours", 48, 54), ("end", 54, 60),
]
EV = {
    "coldSwaps": [i * BEAT for i in range(8)],
    "cut": 4.0,
    "tilt": 8.0, "separate": 9.0, "labels": [10.0, 11.0, 12.0], "collapse": 14.0, "away": 15.0,
    "snap": 18.0,
    "swaps": [22, 26, 30, 32, 34, 35, 36, 37, 38, 38.5, 39, 39.5],
    "flips": [40.5 + 0.25 * i for i in range(12)],
    "pick": 46.0, "fly": 47.5,
    "grab": 48.4, "drop": 49.5, "print": [50.0, 51.75], "snap2": 52.0,
    "peel": 54.0, "logo": 55.0, "tagline": 56.0, "fade": 58.5,
}


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def at(t):
    return int(round(t * SR))


class Bus:
    def __init__(self, name):
        self.name = name
        self.x = np.zeros((N, 2))

    def add(self, sig, t, gain=1.0, pan=0.0):
        """Mix a mono (n,) or stereo (n,2) signal in at time t with an equal-power pan."""
        i = at(t)
        if i >= N:
            return
        if sig.ndim == 1:
            a = (pan + 1) * np.pi / 4
            sig = np.stack([sig * np.cos(a), sig * np.sin(a)], 1) * np.sqrt(2)
        n = min(len(sig), N - i)
        self.x[i:i + n] += sig[:n] * gain


BUSES = {k: Bus(k) for k in ["kick", "drums", "bass", "stabs", "pad", "lead", "arp", "fx", "bells"]}
B = BUSES


# ------------------------------------------------------------------ DSP helpers
def tt(dur):
    return np.arange(int(dur * SR)) / SR


def noise(n):
    return rng.standard_normal(n)


def sos(kind, f, order=2):
    return signal.butter(order, f, btype=kind, fs=SR, output="sos")


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x, axis=0)


def biquad_lp(f0, q):
    w0 = 2 * np.pi * f0 / SR
    al, c = np.sin(w0) / (2 * q), np.cos(w0)
    b = np.array([(1 - c) / 2, 1 - c, (1 - c) / 2])
    a = np.array([1 + al, -2 * c, 1 - al])
    return b / a[0], a / a[0]


def lp_sweep(x, cut, q=0.8, block=32):
    """Resonant low-pass with a time-varying cutoff (array, one value per sample), processed in small blocks."""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        b, a = biquad_lp(float(np.clip(cut[min(i, len(cut) - 1)], 25, SR * 0.45)), q)
        y[i:i + block], zi = signal.lfilter(b, a, x[i:i + block], zi=zi)
    return y


def saw(f, n, ph0=0.0):
    """Band-limited (polyBLEP) sawtooth; f may be a scalar or a per-sample array."""
    f = np.broadcast_to(np.asarray(f, float), (n,))
    dt = f / SR
    ph = (ph0 + np.cumsum(dt) - dt[0]) % 1.0
    s = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    s[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    s[m] -= x * x + x + x + 1
    return s


def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1, hold=None):
    """Attack/decay/sustain then release over the last r seconds of n samples."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-9), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-9)))
    rn = int(r * SR)
    if rn > 0 and n > rn:
        e[-rn:] *= np.linspace(1, 0, rn) ** 2
    return e


# ------------------------------------------------------------------ instruments
def kick(gain=1.0, t0=0.0, tone=1.0):
    t = tt(0.55)
    f = 44 + 120 * np.exp(-t * 30) + 60 * np.exp(-t * 140)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6.5 / tone)
    click = filt(noise(len(t)), "highpass", 2500) * np.exp(-t * 400) * 0.35
    B["kick"].add(np.tanh(1.8 * (body + click)) * 0.9, t0, gain)


def clap(t0, gain=1.0, pan=0.0):
    t = tt(0.45)
    env = np.zeros_like(t)
    for d in (0.0, 0.009, 0.019, 0.028):
        env += np.where(t >= d, np.exp(-(t - d) * 190), 0)
    env += np.where(t >= 0.03, np.exp(-(t - 0.03) * 13) * 0.55, 0)
    x = signal.sosfilt(signal.butter(2, [900, 3200], "bandpass", fs=SR, output="sos"), noise(len(t))) * env
    B["drums"].add(x * 0.9, t0, gain, pan)


def hat(t0, gain=1.0, open_=False, pan=0.15):
    t = tt(0.4 if open_ else 0.09)
    x = filt(noise(len(t)), "highpass", 7500, 4) * np.exp(-t * (8 if open_ else 55))
    B["drums"].add(x, t0, gain * (0.5 if open_ else 0.45), pan)


def tick(t0, gain=1.0, f=4200, pan=0.0):
    t = tt(0.05)
    x = signal.sosfilt(signal.butter(2, [f * 0.7, f * 1.4], "bandpass", fs=SR, output="sos"), noise(len(t))) * np.exp(-t * 260)
    x += np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t * 400) * 0.3
    B["drums"].add(x, t0, gain, pan)


def rim(t0, gain=1.0):
    t = tt(0.08)
    x = (np.sin(2 * np.pi * 1750 * t) * 0.6 + filt(noise(len(t)), "highpass", 3000) * 0.5) * np.exp(-t * 90)
    B["drums"].add(x, t0, gain * 0.5, -0.2)


def crash(t0, gain=1.0):
    t = tt(2.5)
    x = filt(noise(len(t)), "highpass", 4000, 2) * (np.exp(-t * 2.2) * 0.8 + np.exp(-t * 25) * 0.6)
    B["fx"].add(np.stack([x, np.roll(x, 211)], 1), t0, gain * 0.35)


def bass(t0, m, dur, gain=1.0):
    n = int((dur + 0.05) * SR)
    t = np.arange(n) / SR
    f = midi(m)
    x = saw(f, n) * 0.6 + saw(f * 1.004, n) * 0.4 + np.sin(2 * np.pi * f / 2 * t) * 0.9
    x = lp_sweep(x, 160 + 1300 * np.exp(-t * 14), q=1.3)
    x = np.tanh(x * 1.6) * adsr(n, 0.003, 0.25, 0.75, 0.04)
    B["bass"].add(x, t0, gain * 0.5)


def stab(t0, chord, dur=0.2, gain=1.0, bright=1.0):
    n = int((dur + 0.25) * SR)
    t = np.arange(n) / SR
    L = np.zeros(n)
    R = np.zeros(n)
    for m in chord:
        f = midi(m)
        L += saw(f * 2 ** (-7 / 1200), n, rng.random()) + 0.5 * saw(f * 2, n, rng.random())
        R += saw(f * 2 ** (7 / 1200), n, rng.random()) + 0.5 * saw(f * 2, n, rng.random())
    cut = 350 + 5200 * bright * np.exp(-t * 16)
    env = adsr(n, 0.002, 0.09, 0.35, 0.22) * np.where(t < dur, 1, np.exp(-(t - dur) * 30))
    x = np.stack([lp_sweep(L, cut, 1.1), lp_sweep(R, cut, 1.1)], 1) * env[:, None]
    B["stabs"].add(x / len(chord), t0, gain * 0.55)


def pad(t0, chord, dur, gain=1.0, attack=0.8, cutoff=1400):
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    L = np.zeros(n)
    R = np.zeros(n)
    for m in chord:
        f = midi(m)
        for d in (-11, -4, 3, 10):
            v = saw(f * 2 ** (d / 1200) * (1 + 0.0015 * np.sin(2 * np.pi * (0.2 + 0.05 * d) * t)), n, rng.random())
            (L if d < 0 else R).__iadd__(v)
            (R if d < 0 else L).__iadd__(v * 0.4)
    env = np.minimum(t / attack, 1) * np.where(t < dur, 1, np.exp(-(t - dur) * 4))
    x = np.stack([filt(L, "lowpass", cutoff), filt(R, "lowpass", cutoff)], 1) * env[:, None]
    B["pad"].add(x / (len(chord) * 3), t0, gain * 0.45)


def pluck(t0, m, gain=1.0, pan=0.0, bright=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = midi(m)
    x = saw(f, n) * 0.7 + np.sign(np.sin(2 * np.pi * f * t)) * 0.3
    x = lp_sweep(x, 400 + 5500 * bright * np.exp(-t * 22), q=1.6) * np.exp(-t * 9)
    B["arp"].add(x, t0, gain * 0.32, pan)


def lead(t0, m, dur, gain=1.0):
    n = int((dur + 0.15) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip((t - 0.15) * 4, 0, 1)
    f = midi(m) * vib
    x = saw(f * 2 ** (-6 / 1200), n) + saw(f * 2 ** (6 / 1200), n) + 0.35 * np.sin(2 * np.pi * np.cumsum(f * 2) / SR)
    x = lp_sweep(x, 900 + 3600 * np.exp(-t * 6), q=1.0)
    env = adsr(n, 0.006, 0.3, 0.6, 0.12) * np.where(t < dur, 1, np.exp(-(t - dur) * 25))
    B["lead"].add(np.tanh(x * env * 0.9) * 0.6, t0, gain * 0.5)


def bell(t0, m, gain=1.0, pan=0.0, dur=2.5):
    t = tt(dur)
    f = midi(m)
    idx = 2.2 * np.exp(-t * 3)
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 3.5 * t)) * np.exp(-t * 1.6)
    x += 0.3 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 3)
    B["bells"].add(x, t0, gain * 0.3, pan)


def impact(t0, gain=1.0):
    t = tt(3.0)
    f = 30 + 70 * np.exp(-t * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6)
    hit = filt(noise(len(t)), "lowpass", 2500) * np.exp(-t * 10) * 0.5
    B["fx"].add(np.tanh(1.5 * (boom + hit)), t0, gain * 0.85)


def snapfx(t0, gain=1.0, big=False):
    """The magnetic 'clack' of a Stimpie landing: a sharp transient, a metallic ping and a low thump."""
    t = tt(0.5)
    click = filt(noise(len(t)), "highpass", 3000) * np.exp(-t * 700)
    ping = (np.sin(2 * np.pi * 2350 * t) + 0.6 * np.sin(2 * np.pi * 3610 * t)) * np.exp(-t * 45) * 0.35
    thump = np.sin(2 * np.pi * (70 + 90 * np.exp(-t * 60)) * t) * np.exp(-t * (14 if big else 24))
    B["fx"].add(click * 0.9 + ping + thump * (1.2 if big else 0.7), t0, gain * 0.7)


def zipfx(t0, dur=0.3, gain=1.0):
    """A zipper running shut: a train of tooth clicks that speeds up, over filtered noise."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    rate = 170 + 330 * np.sin(np.pi * np.minimum(u * 1.2, 1.0) / 2)  # teeth per second
    ph = np.cumsum(rate) / SR
    teeth = (0.5 + 0.5 * np.cos(2 * np.pi * ph)) ** 8
    x = signal.sosfilt(signal.butter(2, [1600, 7500], "bandpass", fs=SR, output="sos"), noise(n))
    body = filt(noise(n), "lowpass", 900) * 0.25
    env = np.sin(np.pi * u) ** 0.5 * (0.7 + 0.3 * u)
    y = (x * (0.25 + 0.95 * teeth) + body) * env
    pan = np.linspace(-0.5, 0.5, n)
    a = (pan + 1) * np.pi / 4
    B["fx"].add(np.stack([y * np.cos(a), y * np.sin(a)], 1) * 1.3, t0, gain * 0.55)


def whoosh(t0, dur=0.35, gain=1.0, up=True):
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    cf = 400 * (20 ** (u if up else 1 - u))
    x = noise(n)
    y = np.zeros(n)
    zi = np.zeros(4)
    for i in range(0, n, 64):
        c = float(cf[i])
        s = signal.butter(2, [c * 0.6, min(c * 1.6, SR * 0.45)], "bandpass", fs=SR, output="sos")
        y[i:i + 64], zi2 = signal.sosfilt(s, x[i:i + 64], zi=zi.reshape(2, 2))
        zi = zi2.reshape(-1)
    env = np.sin(np.pi * u) ** 1.5
    pan = np.linspace(-0.7, 0.7, n)
    a = (pan + 1) * np.pi / 4
    B["fx"].add(np.stack([y * env * np.cos(a), y * env * np.sin(a)], 1) * 1.4, t0, gain * 0.6)


def riser(t0, dur, gain=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    u = t / dur
    x = lp_sweep(noise(n), 300 * (30 ** u), q=2.0) * 0.5
    x += saw(110 * (4 ** u), n) * 0.12 * u
    B["fx"].add(x * u ** 2, t0, gain * 0.55)


def sparkle(t0, gain=1.0):
    for k in range(3):
        m = int(rng.choice([84, 87, 89, 91, 94, 96]))
        t = tt(0.6)
        x = np.sin(2 * np.pi * midi(m) * t) * np.exp(-t * 9)
        B["bells"].add(x, t0 + k * 0.045, gain * 0.14, float(rng.uniform(-0.8, 0.8)))


def mouse(t0, gain=1.0):
    t = tt(0.03)
    B["drums"].add(filt(noise(len(t)), "highpass", 1800) * np.exp(-t * 500), t0, gain * 0.5, 0.3)


# ------------------------------------------------------------------ harmony
FM9 = [53, 56, 60, 63, 67]
DBM9 = [49, 53, 56, 60, 63]
EB69 = [51, 55, 58, 60, 65]
CM9 = [48, 51, 55, 58, 62]
PROG = [FM9, DBM9, EB69, CM9]
ROOTS = [41, 37, 39, 36]  # F2 Db2 Eb2 C2


def chord(bar):
    return PROG[bar % 4]


def bt(bar, beat=0.0):
    return bar * BAR + beat * BEAT


def groove(bar, kick_on=True, clap_on=True, hats=1.0, bass_on=True, stabs=True, stab_gain=1.0):
    if kick_on:
        for b in range(4):
            kick(1.0, bt(bar, b))
    if clap_on:
        for b in (1, 3):
            clap(bt(bar, b), 0.9)
    if hats:
        for s in range(16):
            if s % 4 == 2:
                hat(bt(bar, s / 4), hats, open_=True)
            elif s % 4 != 0:
                hat(bt(bar, s / 4), hats * (0.55 if s % 2 else 0.8), pan=0.25 if s % 2 else -0.1)
    r = ROOTS[bar % 4]
    if bass_on:
        for b, d, o in [(0, 0.4, 0), (0.75, 0.22, 0), (1.5, 0.4, 12), (2.25, 0.22, 0), (2.75, 0.4, 7), (3.5, 0.4, 10)]:
            bass(bt(bar, b), r + o, d * BEAT * 2)
    if stabs:
        for b in (0.5, 1.5, 2.25, 3.5):
            stab(bt(bar, b), chord(bar), 0.12, stab_gain * 0.8)


HOOK = [(0, 0.5, 72), (0.75, 0.25, 75), (1.5, 0.5, 77), (2.5, 0.25, 80), (3.0, 0.5, 79), (3.5, 0.5, 75),
        (4.0, 0.75, 77), (5.0, 0.5, 72), (6.0, 0.25, 75), (6.5, 0.25, 77), (7.0, 1.0, 72)]
HOOK_B = HOOK[:7] + [(5.0, 0.5, 80), (6.0, 0.25, 79), (6.5, 0.25, 77), (7.0, 1.0, 75)]


def hook(bar, variant=0, gain=1.0):
    for b, d, m in (HOOK if variant == 0 else HOOK_B):
        lead(bt(bar, b), m, d * BEAT, gain)


def arp(bar, bright=0.6, gain=1.0, rate=4):
    c = chord(bar)
    tones = [m + 12 for m in c] + [m + 24 for m in c[:3]]
    order = [0, 2, 4, 6, 7, 5, 3, 1]
    for s in range(4 * rate):
        m = tones[order[s % len(order)] % len(tones)]
        pluck(bt(bar, s / rate), m, gain * (1.0 if s % 4 == 0 else 0.75), pan=0.35 * np.sin(s * 0.9), bright=bright)


# ------------------------------------------------------------------ the arrangement
def compose():
    # COLD OPEN (bars 0–1): a chord stab + a clack on every beat — one swap per beat
    crash(0.0, 1.0)
    for bar in (0, 1):
        groove(bar, stabs=False)
        for b in range(4):
            stab(bt(bar, b), chord(bar), 0.16, 1.1, 1.2)
            snapfx(bt(bar, b), 0.55)
            zipfx(bt(bar, b) + 0.01, 0.26, 0.6)
    whoosh(3.6, 0.4, 0.8)
    # hard cut at 4.0: one boom rings into the silence
    impact(EV["cut"], 0.9)

    # BLANK (bars 2–3): a pad breathes in, a few bells
    pad(4.4, FM9, 3.6, 0.9, attack=2.2, cutoff=900)
    for t, m, p in [(4.75, 84, -0.3), (5.75, 80, 0.3), (6.75, 79, -0.1), (7.25, 75, 0.2)]:
        bell(t, m, 0.9, p)

    # EXPLODE (bars 4–7): mechanical ticks, a pluck arpeggio opening up, sub pulse
    for bar in range(4, 8):
        u = (bar - 4) / 3
        pad(bt(bar), chord(bar), BAR, 0.55, attack=0.3, cutoff=1100)
        arp(bar, bright=0.25 + 0.5 * u, gain=0.8)
        for s in range(16):
            tick(bt(bar, s / 4), 0.22 if s % 4 else 0.4, 5200 if s % 2 else 3900, pan=0.4 if s % 2 else -0.4)
        rim(bt(bar, 1))
        rim(bt(bar, 3))
        kick(0.55, bt(bar, 0), 0.7)
        kick(0.4, bt(bar, 2.5), 0.7)
        for b in (0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5):
            bass(bt(bar, b), ROOTS[bar % 4], 0.18, 0.55)
    whoosh(EV["separate"] - 0.2, 0.5, 1.0)
    for t in EV["labels"]:
        bell(t, 96, 0.35, 0.4, 0.8)
        tick(t, 0.8, 6000)
    snapfx(EV["collapse"], 0.7)
    zipfx(EV["collapse"], 0.7, 0.8)
    whoosh(EV["away"], 0.6, 0.8)
    riser(15.0, 2.75, 0.6)

    # SNAP build (bar 8): claps accelerate, everything drops out for the last 16th, then the snap
    for b in range(4):
        kick(0.5, bt(8, b), 0.6)
    for s in range(8):
        clap(bt(8, s / 2), 0.35 + 0.05 * s)
    for s in range(8, 15):
        clap(bt(8, s / 4 + 0), 0.3 + 0.04 * s)
    arp(8, bright=0.9, gain=0.8, rate=4)
    pad(bt(8), chord(8), 1.75, 0.6, attack=0.2, cutoff=1500)
    impact(EV["snap"], 1.0)
    snapfx(EV["snap"], 1.2, big=True)
    zipfx(EV["snap"] + 0.02, 0.5, 1.1)
    crash(EV["snap"], 1.0)

    # DROP + IDENTITIES (bars 9–19)
    for bar in range(9, 20):
        groove(bar, hats=1.25 if bar >= 17 else 1.0)
        pad(bt(bar), chord(bar), BAR, 0.35, attack=0.05, cutoff=1800)
    for bar in range(9, 20, 2):
        hook(bar, (bar // 2) % 2, 0.9 if bar < 11 else 1.0)
    for t in EV["swaps"]:
        whoosh(t - 0.3, 0.3, 0.5)
        snapfx(t, 0.9)
        zipfx(t + 0.01, 0.28, 0.8)
        if t in (22, 26, 30, 34):
            crash(t, 0.7)
    for s in range(12, 16):  # fill into the fast swaps
        clap(bt(16, s / 4), 0.5)
    for s in range(8, 16):
        clap(bt(19, s / 4), 0.35 + 0.03 * s)
    riser(38.0, 2.0, 0.5)

    # COLLECTION (bars 20–23): breakdown — no kick, no bass, bright arpeggio and sparkles
    crash(40.0, 0.9)
    impact(40.0, 0.4)
    for bar in range(20, 24):
        pad(bt(bar), chord(bar), BAR, 0.8, attack=0.4, cutoff=2400)
        arp(bar, bright=1.0, gain=0.7)
        clap(bt(bar, 1), 0.35)
        clap(bt(bar, 3), 0.35)
        for b in (0.5, 1.5, 2.5, 3.5):
            hat(bt(bar, b), 0.7, open_=True)
    for t in EV["flips"]:
        sparkle(t, 0.8)
    riser(46.0, 1.9, 0.55)
    bell(EV["pick"], 89, 0.6)
    whoosh(EV["fly"], 0.5, 1.0)

    # YOURS (bars 24–26): mouse foley, printing ticks, snap, the hook one last time
    for bar in (24, 25):
        for b in range(4):
            kick(0.7, bt(bar, b), 0.8)
        for b in (0.5, 1.5, 2.5, 3.5):
            hat(bt(bar, b), 0.8)
        pad(bt(bar), chord(bar), BAR, 0.4, attack=0.2, cutoff=1200)
    mouse(EV["grab"], 1.0)
    mouse(EV["drop"] - 0.05, 1.0)
    bell(EV["drop"], 91, 0.5, 0.2, 1.0)
    p0, p1 = EV["print"]
    k = 0
    t = p0
    while t < p1:
        tick(t, 0.5, 3000 + 150 * k, pan=0.3 * np.sin(k))
        t += BEAT / 4
        k += 1
    for b in range(4):
        bass(bt(25, b), ROOTS[25 % 4], 0.35, 0.8)
    riser(50.0, 1.85, 0.5)
    snapfx(EV["snap2"], 1.1, big=True)
    zipfx(EV["snap2"] + 0.02, 0.45, 1.0)
    impact(EV["snap2"], 0.7)
    crash(EV["snap2"], 0.8)
    groove(26)
    hook(26, 1, 1.0)

    # END (bars 27–29): the final chord, the peel, the logo, a long tail
    stab(54.0, [41, 53, 56, 60, 63, 67], 0.9, 1.3, 1.3)
    kick(1.0, 54.0)
    crash(54.0, 1.0)
    whoosh(EV["peel"], 0.6, 0.9, up=False)
    impact(EV["logo"], 0.9)
    snapfx(EV["logo"], 1.0, big=True)
    zipfx(EV["logo"] + 0.02, 1.0, 0.7)
    pad(55.0, FM9, 4.0, 0.9, attack=0.6, cutoff=1300)
    bass(55.0, 29, 3.5, 0.6)
    for t, m, p in [(56.0, 84, -0.3), (56.5, 87, 0.3), (57.0, 89, -0.1), (57.5, 91, 0.2), (58.0, 84, 0)]:
        bell(t, m, 0.7, p, 3.0)


# ------------------------------------------------------------------ mix
def reverb_ir(sec=2.4, decay=2.6, seed=3):
    r = np.random.default_rng(seed)
    t = tt(sec)
    ir = r.standard_normal((len(t), 2)) * np.exp(-t * decay)[:, None]
    ir = filt(ir, "lowpass", 5500)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    return ir / np.sqrt((ir ** 2).sum(0))


def pingpong(x, d=0.375, fb=0.38, mix=0.3):
    n = at(d)
    y = np.zeros_like(x)
    for k in range(1, 7):
        g = mix * fb ** (k - 1)
        ch = k % 2
        s = np.roll(x.mean(1), n * k)
        s[: n * k] = 0
        y[:, ch] += s * g
    return x + filt(y, "lowpass", 4500)


def limit(x, ceiling=0.9, look=0.004, release=0.08):
    """Look-ahead brickwall limiter: gain follows the windowed peak, attacks instantly, releases smoothly."""
    from scipy.ndimage import maximum_filter1d
    la = at(look)
    pk = maximum_filter1d(np.abs(x).max(1), size=2 * la + 1)
    g = np.minimum(1.0, ceiling / np.maximum(pk, 1e-9))
    a = np.exp(-1 / (release * SR))
    g = signal.lfilter([1 - a], [1, -a], g - 1) + 1  # smooth recovery
    g = np.minimum(g, np.minimum(1.0, ceiling / np.maximum(pk, 1e-9)))
    return np.tanh(x * g[:, None] / ceiling * 1.1) / np.tanh(1.1) * ceiling


def mixdown():
    t = np.arange(N) / SR
    # sidechain: pump bass, pads and stabs off every kick
    kicks = sorted({round(k, 4) for k in KICK_TIMES})
    duck = np.ones(N)
    for k in kicks:
        i = at(k)
        n = min(at(0.35), N - i)
        duck[i:i + n] = np.minimum(duck[i:i + n], 1 - 0.65 * np.exp(-np.arange(n) / SR * 11))
    for k in ("bass", "pad", "stabs", "arp"):
        B[k].x *= duck[:, None] ** (0.7 if k == "arp" else 1.0)
    B["arp"].x = pingpong(B["arp"].x, mix=0.28)
    B["lead"].x = pingpong(B["lead"].x, mix=0.22)

    gains = {"kick": 0.95, "drums": 0.8, "bass": 0.9, "stabs": 0.75, "pad": 0.7, "lead": 0.62, "arp": 0.55, "fx": 0.8, "bells": 0.8}
    sends = {"drums": 0.12, "stabs": 0.22, "pad": 0.35, "lead": 0.25, "arp": 0.3, "fx": 0.3, "bells": 0.6}
    dry = sum(B[k].x * g for k, g in gains.items())
    wet_in = sum(B[k].x * gains[k] * s for k, s in sends.items())
    ir = reverb_ir()
    wet = np.stack([signal.fftconvolve(wet_in[:, c], ir[:, c])[:N] for c in range(2)], 1)
    m = dry + wet * 0.55
    m = filt(m, "highpass", 28)
    # glue: gentle bus compression (RMS follower) + soft clip
    env = np.sqrt(np.maximum(filt((m ** 2).mean(1), "lowpass", 8), 1e-9))
    gr = np.minimum(1.0, (0.25 / np.maximum(env, 1e-6)) ** 0.35)
    m *= gr[:, None]
    m /= np.abs(m).max()
    m = limit(m * 2.6, ceiling=0.9)
    m = m[: at(DUR)]
    # fade out the last 1.5 s
    f = at(1.5)
    m[-f:] *= np.linspace(1, 0, f)[:, None] ** 1.5
    return m / np.abs(m).max() * 0.93


KICK_TIMES = []
_kick = kick


def kick(gain=1.0, t0=0.0, tone=1.0):  # noqa: F811 — record kick times for the sidechain
    KICK_TIMES.append(t0)
    _kick(gain, t0, tone)


if __name__ == "__main__":
    compose()
    m = mixdown()
    out = ROOT / "app/public/audio/stimpy.wav"
    out.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(out, SR, (m * 32767).astype(np.int16))
    beats = [round(i * BEAT, 4) for i in range(int(DUR / BEAT))]
    meta = {"bpm": BPM, "beat": BEAT, "bar": BAR, "duration": DUR,
            "sections": [{"id": s, "start": a, "end": b} for s, a, b in SECTIONS],
            "events": EV, "beats": beats}
    (ROOT / "app/src/music.json").write_text(json.dumps(meta, indent=1))
    rms = [float(np.sqrt((m[at(a):at(b)] ** 2).mean())) for _, a, b in SECTIONS]
    print("wrote", out)
    print("section RMS dBFS:", {s: round(20 * np.log10(r + 1e-9), 1) for (s, _, _), r in zip(SECTIONS, rms)})
