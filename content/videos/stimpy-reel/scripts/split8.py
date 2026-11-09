"""Split each closure group into 8 steps. Each step = one Stimpy take covering [h_a, h_b] of the motion.
Search (DP) over boundaries + Stimpy order: heights continuous, each Stimpy used twice, never twice in a row,
source length as close as possible to the 9-frame shot (playback speed near 1x)."""
import json, math, itertools, os, numpy as np
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
med = json.load(open(here + r"\prog.json"))
SHOT = 9

def curve_from_series(series, f0, f1, lo, hi):
    a = np.array([np.nan if v is None else v for v in series], float)
    i = np.arange(len(a)); ok = ~np.isnan(a); a = np.interp(i, i[ok], a[ok])
    a = np.array([np.median(a[max(0, j - 3):j + 4]) for j in range(len(a))])
    seg = np.maximum.accumulate(a[f0:f1 + 1])
    return [(float(h), f0 + k) for k, h in enumerate(seg)]

# (height %, frame) measured points per take
G = {
 "Left zip": dict(rng=(20, 95), takes={
   "Sabotage": ("214819", [(20,140),(28,149),(40,162),(55,177),(60,190),(72,197),(75,205),(87,212),(95,222)]),
   "Receipt":  ("215208", [(20,240),(30,249),(40,262),(50,266),(60,273),(75,279),(85,283),(95,289)]),
   "Chameleon":("215601", [(20,126),(25,150),(30,186),(45,199),(50,201),(60,206),(72,218),(80,231),(85,236),(95,245)]),
   "SameDay":  ("215845", [(20,150),(49,162),(60,177),(68,182),(75,189),(82,199),(90,211),(95,222)])}),
 "Right zip": dict(rng=(12, 86), takes={
   "Chameleon":("215646", curve_from_series(med["215646"]["prog"], 138, 195, 0, 0)),
   "Sabotage": ("214920", curve_from_series(med["214920"]["prog"], 162, 264, 0, 0)),
   "Receipt":  ("215337", curve_from_series(med["215337"]["prog"], 138, 282, 0, 0)),
   "SameDay":  ("215935", curve_from_series(med["215935"]["prog"], 156, 225, 0, 0))}),
 "Top velcro": dict(rng=(0, 90), takes={
   "SameDay":  ("220019", [(0,88),(11,96),(36,101),(55,106),(68,111),(68.5,125)]),
   "Receipt":  ("215405", [(0,87),(20,92),(36,97),(68,102),(70,117),(71,122),(80,137),(87,142),(90,150)]),
   "Chameleon":("215712", [(20,64),(36,70),(58,77),(61,82),(68,87)]),
   "Sabotage": ("215005", [(55,85),(58,90),(65,95),(68,99),(69,105),(71,110),(77,120),(80,130)])}),
 "Bottom velcro": dict(rng=(0, 95), takes={
   # re-measured frame by frame (right-hand fingertips along the bottom edge)
   "Receipt":  ("215405", [(0,212),(45,218),(48,245),(57,250),(61,256),(69,265),(82,274),(86,277),(90,286)]),
   "SameDay":  ("220019", [(0,206),(55,212),(60,230),(65,245),(69,266),(90,269),(91,290)]),
   "Sabotage": ("215005", [(0,225),(57,231),(69,243),(70,264),(95,271),(100,307)]),
   "Chameleon":("215712", [(0,180),(50,186),(61,228),(65,246),(82,252),(86,255),(90,264)])}),
}

def frame_at(pts, h, end=False):
    hs = [p[0] for p in pts]; fs = [p[1] for p in pts]
    if h < hs[0] - 1e-9 or h > hs[-1] + 1e-9: return None
    # first frame where height reaches h (for both ends; plateaus are included in the segment)
    for (h0, f0), (h1, f1) in zip(pts, pts[1:]):
        if h0 <= h <= h1:
            if h1 == h0: return f0
            return f0 + (h - h0) / (h1 - h0) * (f1 - f0)
    return fs[-1]

out = {}
for name, g in G.items():
    lo, hi = g["rng"]; takes = g["takes"]; names = list(takes)
    H = list(range(lo, hi + 1))
    best = {}
    # state: (step, height, last, counts) -> (cost, path)
    from functools import lru_cache
    @lru_cache(None)
    def solve(step, h, last, counts):
        if step == 8:
            return (0.0, ()) if h == hi else (math.inf, ())
        res = (math.inf, ())
        for ti, tn in enumerate(names):
            if tn == last or counts[ti] >= 2: continue
            pts = takes[tn][1]
            fa = frame_at(pts, h)
            if fa is None: continue
            for h2 in range(h + 1, hi + 1):
                fb = frame_at(pts, h2)
                if fb is None: break
                n = fb - fa
                if n < (4 if name == "Bottom velcro" else 5): continue
                if n > 36: break
                c = math.log(n / SHOT) ** 2
                nc = list(counts); nc[ti] += 1
                sub = solve(step + 1, h2, tn, tuple(nc))
                if c + sub[0] < res[0]:
                    res = (c + sub[0], ((tn, h, h2, round(fa), round(fb)),) + sub[1])
        return res
    cost, path = solve(0, lo, None, (0, 0, 0, 0))
    print("==", name, "cost %.2f" % cost)
    rows = []
    for tn, a, b, fa, fb in path:
        rows.append(dict(stimpy=tn, take=takes[tn][0], h0=a, h1=b, f0=fa, f1=fb))
        print("  %-10s %s  %3d%% -> %3d%%  frames %d-%d (%d fr, %.2fx)" % (tn, takes[tn][0], a, b, fa, fb, fb - fa, (fb - fa) / SHOT))
    out[name] = rows
json.dump(out, open(here + r"\split8.json", "w"), indent=1)
