// Procedural Stimpy hoodie generator. Run: node tools/hoodie-model/generate.mjs [--seed=7]
// Output: backend/seed-assets/models/hoodie.glb (+ hoodie.meta.json)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  add, sub, mul, dot, cross, norm, len, lerp, lerp3, clamp, smoothstep, sgn, spow, makeNoise, pchip, catmullResample,
} from './lib/math.mjs';
import {
  Part, gridPart, computeNormals, displace, frames, tubeAlong, superEllipsoid, mergeParts, capFan, transformPart,
} from './lib/mesh.mjs';
import { writeGlb } from './lib/glb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(here, '../../backend/seed-assets/models');
const seedArg = process.argv.find((a) => a.startsWith('--seed='));
const SEED = seedArg ? Number(seedArg.split('=')[1]) : 7;
const { noise, fbm } = makeNoise(SEED);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- torso definition
const TOP_Y = 0.335;
const BOT_Y = -0.365;
const A = pchip([[-0.365, 0.285], [-0.31, 0.303], [-0.22, 0.308], [-0.10, 0.305], [0.0, 0.307], [0.10, 0.310], [0.17, 0.310], [0.24, 0.303], [0.275, 0.288], [0.30, 0.255], [0.318, 0.205], [0.335, 0.125]]);
const BF = pchip([[-0.365, 0.122], [-0.30, 0.130], [-0.22, 0.134], [-0.10, 0.136], [0.0, 0.142], [0.10, 0.148], [0.17, 0.144], [0.24, 0.126], [0.285, 0.105], [0.315, 0.094], [0.335, 0.088]]);
const BB = pchip([[-0.365, 0.114], [-0.30, 0.124], [-0.22, 0.130], [-0.10, 0.132], [0.0, 0.133], [0.10, 0.131], [0.17, 0.125], [0.24, 0.113], [0.285, 0.098], [0.315, 0.090], [0.335, 0.086]]);
const CZ = pchip([[-0.365, 0], [0.2, 0], [0.335, -0.010]]);
const NEXP = pchip([[-0.365, 2.3], [0.0, 2.5], [0.2, 2.5], [0.335, 2.2]]);

function torsoBase(th, y) {
  const a = A(y), n = NEXP(y);
  const s = Math.sin(th), c = Math.cos(th);
  const b = c >= 0 ? BF(y) : BB(y);
  return [a * spow(s, 2 / n), y, CZ(y) + b * spow(c, 2 / n)];
}

function panelMask(x, y, z) {
  const wx = smoothstep(0.19, 0.235, Math.abs(x));
  const wy = Math.max(smoothstep(0.205, 0.245, y), 1 - smoothstep(BOT_Y - 0.05, BOT_Y, y));
  const zgate = smoothstep(0.02, -0.03, z);
  const hoodZone = smoothstep(0.17, 0.2, y) * (1 - smoothstep(0.16, 0.2, Math.abs(x)));
  return (1 - zgate * (1 - Math.max(wx, wy))) * (1 - zgate * hoodZone);
}
const valley = (n) => -Math.pow(1 - Math.min(1, Math.abs(n)), 2.4) + 0.25; // sharp creases, soft ridges

function torsoDisp(x, y, z) {
  const m = panelMask(x, y, z);
  const th = Math.atan2(x, z);
  let d = 0;
  // gather folds bunching above the hem rib
  const hemW = (1 - smoothstep(-0.30, -0.08, y)) * smoothstep(BOT_Y + 0.004, BOT_Y + 0.05, y);
  d += 0.0115 * hemW * valley(noise(th * 4.6, y * 3.0, 3.1)) + 0.0022 * hemW * noise(th * 11, y * 9, 3.3);
  // underarm drag folds
  const sideW = smoothstep(0.14, 0.26, Math.abs(x));
  const yW = smoothstep(-0.08, 0.08, y) * (1 - smoothstep(0.17, 0.25, y));
  d += 0.0115 * sideW * yW * valley(noise(th * 3.4 + y * 9, y * 6, 7.7));
  d += 0.0024 * fbm(x * 9 + 11, y * 7, z * 9, 3);
  // diagonal tension creases from neck toward the armhole
  const topW = smoothstep(0.17, 0.27, y) * (1 - smoothstep(0.315, 0.335, y)) * smoothstep(0.09, 0.17, Math.abs(x));
  d += 0.0050 * topW * valley(noise(x * 9 + y * 14, y * 3, z * 9 + 5));
  // tension creases between pocket corners and chest
  const fr = smoothstep(0.02, 0.1, z) * smoothstep(-0.2, -0.1, y) * (1 - smoothstep(0.08, 0.2, y));
  d += 0.0042 * fr * valley(noise(x * 7 + y * 9, y * 3, 6.6)) * smoothstep(0.03, 0.12, Math.abs(x));
  // soft horizontal crease above the pocket
  d += 0.0022 * Math.exp(-(((y + 0.1) / 0.03) ** 2)) * (z > 0 ? 1 : 0) * noise(x * 14, 0.5, 4.4);
  return d * m;
}
function baseNormal(th, y) {
  const e = 4e-4;
  const a = sub(torsoBase(th + e, y), torsoBase(th - e, y));
  const b = sub(torsoBase(th, y + e), torsoBase(th, y - e));
  return norm(cross(a, b));
}
function torsoPoint(th, y) {
  const b = torsoBase(th, y);
  const n = baseNormal(th, y);
  const d = torsoDisp(b[0], b[1], b[2]);
  return [b[0] + n[0] * d, b[1] + n[1] * d, b[2] + n[2] * d];
}
function torsoNormal(th, y) {
  const e = 4e-4;
  const a = sub(torsoPoint(th + e, y), torsoPoint(th - e, y));
  const b = sub(torsoPoint(th, y + e), torsoPoint(th, y - e));
  return norm(cross(a, b));
}
/** surface point at world x,y on the front (side=+1) or back (side=-1). returns {p,n,th} */
function torsoAtXY(x, y, side = 1) {
  let lo, hi;
  if (side > 0) { lo = -Math.PI / 2; hi = Math.PI / 2; } else { lo = Math.PI / 2; hi = (3 * Math.PI) / 2; }
  const f = (th) => torsoPoint(th, y)[0] - x;
  const sign = side > 0 ? 1 : -1; // x increases with th on front, decreases on back
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (sign * f(mid) > 0) hi = mid; else lo = mid;
  }
  const th = (lo + hi) / 2;
  return { p: torsoPoint(th, y), n: torsoNormal(th, y), th };
}
/** point on the +x (side>0) shoulder at height y with given z */
function torsoAtYZ(y, z, sx = 1) {
  let lo = 0.0001, hi = Math.PI - 0.0001;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (torsoPoint(mid, y)[2] > z) lo = mid; else hi = mid;
  }
  const th = (lo + hi) / 2;
  const t = sx > 0 ? th : TAU - th;
  return { p: torsoPoint(t, y), n: torsoNormal(t, y), th: t };
}
/** theta on the back at arc distance s (>0 toward +x) from the back centre, at height y */
function thetaAtArc(y, s) {
  const target = Math.abs(s);
  let th = Math.PI, acc = 0;
  const dir = s >= 0 ? -1 : 1;
  const step = 0.002;
  let prev = torsoBase(th, y);
  while (acc < target) {
    th += dir * step;
    const q = torsoBase(th, y);
    const seg = Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]);
    if (acc + seg >= target) { th -= dir * step * (1 - (target - acc) / seg); acc = target; break; }
    acc += seg;
    prev = q;
  }
  return th;
}
function torsoImplicit(p) {
  const y = p[1];
  if (y > TOP_Y + 0.002 || y < BOT_Y - 0.01) return 2;
  const a = A(y), n = NEXP(y);
  const dz = p[2] - CZ(y);
  const b = dz >= 0 ? BF(y) : BB(y);
  return Math.pow(Math.abs(p[0] / a), n) + Math.pow(Math.abs(dz / b), n);
}
const horiz = (p) => [p[0], p[2] - CZ(p[1])];

const parts = { body: [], zip: [], cords: [], panelZip: [], panel: [] };
const info = {};

function liftedPoint(r, lift) { return add(r.p, mul(r.n, lift)); }

// ---------------------------------------------------------------- torso
const NT = 90;
const ysT = [];
for (let k = 0; k <= 31; k++) ysT.push(lerp(BOT_Y, 0.24, k / 31));
for (let k = 1; k <= 12; k++) ysT.push(lerp(0.24, TOP_Y, k / 12));
const torso = gridPart((i, j) => torsoPoint((TAU * (i % NT)) / NT, ysT[j]), NT, ysT.length - 1, {
  center: (j) => [0, ysT[j], 0],
  name: 'torso',
});
computeNormals(torso);
parts.body.push(torso);

// collar rolled edge around the neck opening + neck cap
const neckRing = [];
for (let k = 0; k < 64; k++) neckRing.push(torsoPoint((TAU * k) / 64, TOP_Y));
parts.body.push(tubeAlong(neckRing, 0.0068, 5, { closed: true, name: 'collar' }));
const NECK_IN = 0.012;
const capRing = (th, y, k) => {
  const b = torsoBase(th, TOP_Y);
  const h = horiz(torsoBase(th, TOP_Y));
  const l = Math.hypot(h[0], h[1]);
  const inn = [b[0] - (h[0] / l) * NECK_IN, 0, b[2] - (h[1] / l) * NECK_IN];
  const cz = CZ(TOP_Y);
  const t = k / 4;
  const e = 1 - t * t;
  return [inn[0] * e, lerp(TOP_Y - 0.06, TOP_Y - 0.14, t * t), cz + (inn[2] - cz) * e];
};
parts.body.push(gridPart((i, j) => capRing((TAU * (i % 32)) / 32, 0, j), 32, 4, { expect: { i: 3, j: 1, dir: [0, 1, 0] }, name: 'neckcap' }));

// ---------------------------------------------------------------- hood
const THETA0 = 0.14;
const HNU = 76, HNV = 22;
function hoodParams(th) {
  const sym = Math.min(1, Math.abs(th - Math.PI) / (Math.PI - THETA0));
  const taper = 1 - smoothstep(0.42, 1.0, sym);
  const ft = 0.40 + 0.60 * taper;
  const h = (0.058 + 0.036 * (1 - sym)) * ft;
  const w = (0.060 + 0.115 * Math.pow(1 - sym, 0.6)) * ft;
  const front = smoothstep(0.62, 1.0, sym);
  const dropMax = ft * (0.02 + 0.100 * Math.pow(Math.cos((Math.PI / 2) * Math.min(1, sym * 1.05)), 1.25)) + 0.034 * front;
  return { sym, ft, h, w, dropMax };
}
function hoodDrop(th) {
  const { w, ft, dropMax } = hoodParams(th);
  const nb = torsoBase(th, TOP_Y);
  const hn = norm([nb[0], 0, nb[2] - CZ(TOP_Y)]);
  const rho = (y) => { const q = torsoPoint(th, y); return q[0] * hn[0] + (q[2] - CZ(TOP_Y)) * hn[2]; };
  const rho0 = rho(TOP_Y);
  const T5 = w + 0.010 * ft;
  let prevD = 0, prevV = 0;
  for (let d = 0.004; d < dropMax; d += 0.002) {
    const v = rho(TOP_Y - d) - rho0 - 0.85 * T5;
    if (v >= 0) return prevD + ((d - prevD) * (0 - prevV)) / (v - prevV || 1);
    prevD = d; prevV = v;
  }
  return dropMax;
}
const DROPS = [];
{
  const raw = [];
  for (let i = 0; i <= HNU; i++) { const th = THETA0 + ((TAU - 2 * THETA0) * i) / HNU; raw.push(hoodDrop(th) * (1 + 0.13 * noise(th * 2.6, 1.7, 0.4))); }
  let cur = raw;
  for (let pass = 0; pass < 6; pass++) cur = cur.map((v, i) => (cur[Math.max(0, i - 1)] + 2 * v + cur[Math.min(HNU, i + 1)]) / 4);
  cur.forEach((v) => DROPS.push(v));
}
function hoodProfile(th, di) {
  const { ft, h, w, dropMax } = hoodParams(th);
  const nb = torsoPoint(th, TOP_Y);
  const C = [0, CZ(TOP_Y)];
  const hn = norm([nb[0] - C[0], 0, nb[2] - C[1]]);
  const dir = [hn[0], hn[2]];
  const lat = [-hn[2], hn[0]];
  const T5 = w + 0.010 * ft;
  const drop = Math.min(DROPS[di], dropMax);
  const ye = TOP_Y - drop;
  const onTorso = (y, lift) => {
    const q = add(torsoPoint(th, y), mul(torsoNormal(th, y), lift));
    const dx = q[0] - nb[0], dz = q[2] - nb[2];
    return [dx * dir[0] + dz * dir[1], q[1], dx * lat[0] + dz * lat[1]];
  };
  const ya = ye + 0.016;
  const eA = onTorso(ya, 0.0075);
  const eB = onTorso(ye, 0.0006);
  const y5 = lerp(TOP_Y + 0.25 * h, ye, 0.30);
  const K = [
    [-0.012, TOP_Y - 0.080, 0],
    [-0.009, TOP_Y - 0.035, 0],
    [0.002 + 0.05 * w, TOP_Y + 0.35 * h, 0],
    [0.15 * w, TOP_Y + 0.82 * h, 0],
    [0.36 * w, TOP_Y + h + 0.010 * ft, 0],
    [0.66 * w, TOP_Y + 0.78 * h, 0],
    [T5, y5, 0],
    [lerp(T5, eA[0], 0.62), lerp(y5, ya, 0.62), eA[2] * 0.4],
    eA,
    eB,
  ];
  const prof = catmullResample(K, HNV, 30).pts;
  return { prof, dir, lat, nb };
}
const hoodRows = [];
for (let i = 0; i <= HNU; i++) {
  const th = THETA0 + ((TAU - 2 * THETA0) * i) / HNU;
  hoodRows.push({ th, ...hoodProfile(th, i) });
}
const hood = gridPart(
  (i, j) => {
    const r = hoodRows[i];
    const pr = r.prof[j];
    return [r.nb[0] + r.dir[0] * pr[0] + r.lat[0] * pr[2], pr[1], r.nb[2] + r.dir[1] * pr[0] + r.lat[1] * pr[2]];
  },
  HNU,
  HNV,
  { expect: { i: HNU / 2, j: 3, dir: [0, 1, 0] }, name: 'hood' },
);
displace(hood, (p, n, k) => {
  const j = Math.floor(k / (HNU + 1));
  const ii = k % (HNU + 1);
  const endFade = smoothstep(HNV, HNV - 6, j) * smoothstep(0, 8, Math.min(ii, HNU - ii));
  const v = (p[1] - 0.2) / 0.2;
  const outerLow = smoothstep(0.55, 1.0, 1 - Math.max(0, Math.min(1, v)));
  const th = Math.atan2(p[0], p[2]);
  const outer = smoothstep(0.36, 0.26, p[1]) * smoothstep(7, 12, j);
  const sth = Math.abs(th);
  let d = 0.0018 * fbm(Math.abs(p[0]) * 12, p[1] * 12, p[2] * 12, 3);
  // large gather folds radiating from the neck seam, plus smaller creases
  d += 0.024 * outer * valley(noise(sth * 3.0 + 0.7, 2.0, 5.1));
  d += 0.005 * outer * valley(noise(sth * 7.5, p[1] * 6, 8.2));
  d += 0.003 * smoothstep(0.34, 0.39, p[1]) * noise(sth * 6.5, 3.1, 2.2);
  d += 0.0020 * outerLow * noise(sth * 5, p[1] * 18, 1.9);
  return d * endFade;
});
parts.body.push(hood);
info.hood = { nu: HNU, nv: HNV };
const hv = (i, j) => hood.gv(i, j);
function hoodRowPath(j, i0 = 0, i1 = HNU, lift = 0.0004, stride = 2) {
  const out = [];
  for (let i = i0; i <= i1; i += stride) {
    const k = hv(i, j);
    out.push(add(hood.vert(k), mul(hood.nrm(k), lift)));
  }
  return out;
}
function hoodColPath(i, j0 = 0, j1 = HNV, lift = 0.0004) {
  const out = [];
  for (let j = j0; j <= j1; j++) {
    const k = hv(i, j);
    out.push(add(hood.vert(k), mul(hood.nrm(k), lift)));
  }
  return out;
}
// find crest row: highest y on the middle column
let crestJ = 0, crestY = -9;
for (let j = 0; j <= HNV; j++) {
  const y = hood.vert(hv(HNU / 2, j))[1];
  if (y > crestY) { crestY = y; crestJ = j; }
}
info.crestJ = crestJ;
parts.body.push(tubeAlong(hoodRowPath(HNV, 3, HNU - 3, -0.0004, 1), (t) => 0.0020 * Math.pow(Math.sin(Math.PI * t), 0.3), 4, { name: 'hoodedge' }));
for (const ii of [0, HNU]) parts.body.push(tubeAlong(hoodColPath(ii, 0, HNV, -0.0006), (t) => 0.0030 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)), 0.35), 5, { name: 'hoodbinding' }));
// hood seams: centre seam (outer wall), rim stitch pairs, collar stitch ring (inner wall)
parts.body.push(tubeAlong(hoodColPath(HNU / 2, crestJ, HNV - 1, 0.0006), 0.0017, 5, { name: 'hoodseam' }));
parts.body.push(tubeAlong(hoodRowPath(Math.max(1, crestJ - 3), 14, HNU - 14, 0.0003, 1), (t) => 0.0012 * Math.pow(Math.sin(Math.PI * t), 0.4), 3, { name: 'rimstitchA' }));
parts.body.push(tubeAlong(hoodRowPath(Math.min(HNV - 2, crestJ + 3), 14, HNU - 14, 0.0003, 1), (t) => 0.0012 * Math.pow(Math.sin(Math.PI * t), 0.4), 3, { name: 'rimstitchB' }));
parts.body.push(tubeAlong(hoodRowPath(3, 6, HNU - 6, 0.0003, 1), 0.0013, 3, { name: 'collarstitch' }));

// ---------------------------------------------------------------- hem band
const HEM_RIDGES = 30, HEM_PER = 5, NB = HEM_RIDGES * HEM_PER;
const ringTheta = [];
{
  const fine = 2000;
  const cum = [0];
  let prev = torsoBase(0, BOT_Y);
  for (let k = 1; k <= fine; k++) {
    const q = torsoBase((TAU * k) / fine, BOT_Y);
    cum.push(cum[k - 1] + Math.hypot(q[0] - prev[0], q[2] - prev[2]));
    prev = q;
  }
  const total = cum[fine];
  let k = 0;
  for (let i = 0; i < NB; i++) {
    const t = (total * i) / NB;
    while (cum[k + 1] < t) k++;
    ringTheta.push(((k + (t - cum[k]) / (cum[k + 1] - cum[k])) / fine) * TAU);
  }
}
const ridge = (i, per) => {
  const ph = (i % per) / per;
  return Math.pow(0.5 - 0.5 * Math.cos(TAU * ph), 0.6) - 0.5;
};
// rows: [y, offset, ridgeAmp]
const HEM_AMP = 0.0056;
const hemRows = [
  [BOT_Y + 0.018, -0.002, 0], [BOT_Y + 0.013, 0.003, 0], [BOT_Y + 0.007, 0.0078, 0.25], [BOT_Y - 0.004, 0.0068, 0.85],
  [BOT_Y - 0.030, 0.0046, 1], [BOT_Y - 0.058, 0.0020, 1], [BOT_Y - 0.074, 0.0, 0.7],
  [BOT_Y - 0.0785, -0.003, 0.2], [BOT_Y - 0.081, -0.007, 0], [BOT_Y - 0.078, -0.012, 0], [BOT_Y + 0.005, -0.013, 0],
];
function hemPoint(i, row) {
  const th = ringTheta[i % NB];
  const b = torsoBase(th, BOT_Y);
  const h = horiz(b);
  const l = Math.hypot(h[0], h[1]);
  const off = row[1] + row[2] * HEM_AMP * ridge(i, HEM_PER);
  return [b[0] + (h[0] / l) * off, row[0], b[2] + (h[1] / l) * off];
}
const hem = gridPart((i, j) => hemPoint(i, hemRows[j]), NB, hemRows.length - 1, { center: (j) => [0, hemRows[j][0], 0], name: 'hem' });
{
  const last = hemRows.length - 1;
  const ring = [];
  for (let i = 0; i < NB; i++) ring.push(hem.gv(i, last));
  capFan(hem, ring, [0, BOT_Y + 0.005, CZ(0)], [0, 1, 0]);
}
parts.body.push(hem);
{
  const seam = [];
  for (let k = 0; k < 80; k++) seam.push(add(torsoPoint((TAU * k) / 80, BOT_Y + 0.014), [0, 0, 0]));
  // stitch ridge sitting just above the hem bead
  const pts = seam.map((p, k) => {
    const n = torsoNormal((TAU * k) / 80, BOT_Y + 0.022);
    return add(torsoPoint((TAU * k) / 80, BOT_Y + 0.023), mul(n, 0.0004));
  });
  parts.body.push(tubeAlong(pts, 0.0013, 3, { closed: true, name: 'hemstitch' }));
}

// ---------------------------------------------------------------- sleeves & cuffs
const SLEEVE_N = 32, SLEEVE_ROWS = 48;
const CR = 1.125;
const SLEEVE_R = pchip([[0, 0.040], [0.06, 0.074], [0.13, 0.091], [0.26, 0.083], [0.42, 0.069], [0.55, 0.0615], [0.64, 0.056], [0.74, 0.051]]);
function buildSleeve(sx) {
  const P = [[0.17, 0.255, -0.01], [0.31, 0.195, -0.015], [0.385, 0.06, -0.012], [0.415, -0.10, 0.0], [0.432, -0.24, 0.07], [0.442, -0.335, 0.115], [0.448, -0.41, 0.14]]
    .map((p) => [p[0] * sx, p[1], p[2]]);
  const M = 320;
  const { pts, length } = catmullResample(P, M, 40);
  const ds = length / M;
  const fr = frames(pts, [0, 0, 1]);
  const wristTarget = P[5];
  let kw = 0, bd = 1e9;
  pts.forEach((p, k) => { const d = len(sub(p, wristTarget)); if (d < bd) { bd = d; kw = k; } });
  const Lw = kw * ds;
  const kEnd = kw + Math.round(0.012 / ds);
  const rowIdx = [];
  // row density: finer at the elbow and above the cuff so folds have enough vertices
  const dens = (s) => 1 + 2.2 * Math.exp(-(((s - 0.44) / 0.08) ** 2)) + 3.2 * smoothstep(Lw - 0.2, Lw, s);
  {
    const cum = [0];
    for (let k = 1; k <= kEnd; k++) cum.push(cum[k - 1] + dens(k * ds));
    let k = 0;
    for (let j = 0; j <= SLEEVE_ROWS; j++) {
      const t = (cum[kEnd] * j) / SLEEVE_ROWS;
      while (k < kEnd && cum[k] < t) k++;
      rowIdx.push(k);
    }
  }
  const radiusAt = (s) => (s > Lw ? lerp(SLEEVE_R(Lw), 0.0425 * CR, (s - Lw) / 0.012) : SLEEVE_R(s));
  const sleeve = gridPart(
    (i, j) => {
      const k = rowIdx[j];
      const f = fr[k];
      const a = (TAU * (i % SLEEVE_N)) / SLEEVE_N;
      const r = radiusAt(k * ds);
      return add(f.p, add(mul(f.N, Math.cos(a) * r * 0.88), mul(f.B, Math.sin(a) * r * 1.08)));
    },
    SLEEVE_N,
    SLEEVE_ROWS,
    { center: (j) => pts[rowIdx[j]], name: `sleeve${sx}` },
  );
  const sElbow = 0.44;
  displace(sleeve, (p, n, k) => {
    const j = Math.floor(k / (SLEEVE_N + 1));
    const s = rowIdx[j] * ds;
    const fade = smoothstep(0.07, 0.17, s);
    const o = n;
    let d = 0.002 * fbm(p[0] * 9 + 3, p[1] * 9, p[2] * 9, 2);
    // elbow creases (inner bend faces +z)
    const bell = Math.exp(-(((s - sElbow) / 0.08) ** 2));
    const inner = 0.3 + 0.7 * smoothstep(-0.3, 0.8, o[2]);
    {
      const ph = TAU * (s / 0.055) + 2.0 * noise(p[0] * 8, p[1] * 6, p[2] * 8);
      d += 0.0085 * bell * inner * (-Math.pow(1 - Math.abs(Math.sin(ph / 2)), 3) + 0.25);
    }
    // compression wrinkles above the cuff
    const g = smoothstep(Lw - 0.13, Lw - 0.01, s);
    {
      const ph2 = TAU * (s / 0.024) + 2.4 * noise(o[0] * 5, s * 9, o[2] * 5);
      d += 0.0090 * g * (-Math.pow(1 - Math.abs(Math.sin(ph2 / 2)), 2.2) + 0.25);
      d += 0.0020 * g * noise(o[0] * 4 + 2, s * 20, o[2] * 4);
    }
    // shoulder / underarm drag folds
    const sh = 1 - smoothstep(0.1, 0.34, s);
    d += 0.0040 * sh * valley(noise(p[0] * 9 + p[1] * 7, p[1] * 5, p[2] * 9 + 9));
    return d * fade;
  });
  parts.body.push(sleeve);

  // ----- cuff
  const kC0 = kw - Math.round(0.004 / ds);
  const cuffPts = pts.slice(kC0);
  const Lc = (cuffPts.length - 1) * ds;
  const CN = 20 * 4;
  const cuffRows = [
    // t (along cuff), radius, rib amp
    [0.0, 0.0462, 0], [0.05, 0.0476, 0.15], [0.13, 0.0436, 0.6], [0.22, 0.0424, 1], [0.6, 0.0418, 1], [0.9, 0.0416, 1],
    [0.965, 0.0412, 0.6], [1.0, 0.0398, 0.2], [1.025, 0.0368, 0], [0.95, 0.0352, 0], [0.5, 0.0352, 0], [0.05, 0.0352, 0],
  ];
  const cenAt = (t) => {
    const x = clamp(t, 0, 1) * (cuffPts.length - 1);
    const k = Math.min(cuffPts.length - 2, Math.floor(x));
    return { c: lerp3(cuffPts[k], cuffPts[k + 1], x - k), f: fr[kC0 + k] };
  };
  const cuff = gridPart(
    (i, j) => {
      const [t, r00, amp] = cuffRows[j];
      const r0 = r00 * CR;
      const { c, f } = cenAt(t);
      const a = (TAU * (i % CN)) / CN;
      const r = r0 + amp * 0.0030 * ridge(i, 4);
      return add(c, add(mul(f.N, Math.cos(a) * r), mul(f.B, Math.sin(a) * r * 0.95)));
    },
    CN,
    cuffRows.length - 1,
    { center: (j) => cenAt(cuffRows[j][0]).c, name: `cuff${sx}` },
  );
  {
    const last = cuffRows.length - 1;
    const ring = [];
    for (let i = 0; i < CN; i++) ring.push(cuff.gv(i, last));
    const { c, f } = cenAt(0.05);
    capFan(cuff, ring, c, mul(f.T, -1));
  }
  parts.body.push(cuff);
  // junction seam at cuff top (sleeve ring)
  const jw = rowIdx.findIndex((k) => k >= kw - 2);
  const seamRing = [];
  {
    const kk = kw - Math.round(0.012 / ds);
    let jj = 0, bdd = 1e9;
    rowIdx.forEach((k, j) => { if (Math.abs(k - kk) < bdd) { bdd = Math.abs(k - kk); jj = j; } });
    for (let i = 0; i < SLEEVE_N; i++) {
      const k = sleeve.gv(i, jj);
      seamRing.push(add(sleeve.vert(k), mul(sleeve.nrm(k), 0.0007)));
    }
  }
  

  // armscye seam: where sleeve surface leaves the torso
  const loop = [];
  for (let i = 0; i < SLEEVE_N; i++) {
    let found = null;
    for (let j = 0; j < SLEEVE_ROWS; j++) {
      const a = sleeve.vert(sleeve.gv(i, j)), b = sleeve.vert(sleeve.gv(i, j + 1));
      const fa = torsoImplicit(a), fb = torsoImplicit(b);
      if (fa < 1 && fb >= 1) {
        const t = (1 - fa) / (fb - fa);
        const p = lerp3(a, b, t);
        const n = lerp3(sleeve.nrm(sleeve.gv(i, j)), sleeve.nrm(sleeve.gv(i, j + 1)), t);
        found = add(p, mul(norm(n), 0.0006));
        break;
      }
    }
    if (!found) {
      const k = sleeve.gv(i, 0);
      found = add(sleeve.vert(k), mul(sleeve.nrm(k), 0.0006));
    }
    loop.push(found);
  }
  // light smoothing of the loop
  const smAll = loop.map((p, i) => lerp3(p, lerp3(loop[(i + SLEEVE_N - 1) % SLEEVE_N], loop[(i + 1) % SLEEVE_N], 0.5), 0.5));
  const sm = smAll.filter((_, i) => i % 1 === 0);
  parts.body.push(tubeAlong(sm, 0.0028, 4, { closed: true, name: 'armscye' }));
  info[`armscyeLoop${sx}`] = sm.length;

  // underarm sleeve seam: pick the vertex column closest to the inside-bottom direction
  let bestI = 0, bestD = -9;
  const jm = Math.round(SLEEVE_ROWS * 0.5);
  const cm = pts[rowIdx[jm]];
  for (let i = 0; i < SLEEVE_N; i++) {
    const o = norm(sub(sleeve.vert(sleeve.gv(i, jm)), cm));
    const d = dot(o, norm([-sx, -0.2, -0.1]));
    if (d > bestD) { bestD = d; bestI = i; }
  }
  const us = [];
  for (let j = 12; j <= SLEEVE_ROWS - 3; j++) {
    const k = sleeve.gv(bestI, j);
    us.push(add(sleeve.vert(k), mul(sleeve.nrm(k), 0.0004)));
  }
  parts.body.push(tubeAlong(us, 0.0015, 3, { name: 'sleeveseam' }));
  return { sleeve, cuff };
}
buildSleeve(1);
buildSleeve(-1);

// ---------------------------------------------------------------- body seams (torso)
for (const sx of [1, -1]) {
  const pts = [];
  for (let k = 0; k <= 36; k++) {
    const y = lerp(BOT_Y + 0.012, 0.07, k / 36);
    const th = sx > 0 ? Math.PI / 2 : (3 * Math.PI) / 2;
    const n = torsoNormal(th, y);
    pts.push(add(torsoPoint(th, y), mul(n, 0.0005)));
  }
  parts.body.push(tubeAlong(pts, 0.0016, 3, { name: 'sideseam' }));
  const sp = [];
  for (let k = 0; k <= 18; k++) {
    const y = lerp(0.333, 0.272, k / 18);
    const r = torsoAtYZ(y, -0.012, sx);
    sp.push(add(r.p, mul(r.n, 0.0006)));
  }
  parts.body.push(tubeAlong(sp, 0.0024, 4, { name: 'shoulderseam' }));
}

// ---------------------------------------------------------------- kangaroo pocket (two halves split by the zip)
for (const sx of [1, -1]) {
  const yb = BOT_Y + 0.02, yt = -0.13, xb = 0.265, xt = 0.205, x0 = 0.026;
  const PNU = 16, PNV = 14;
  const lift = (s, t) => {
    const tp = Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.55);
    const sp = 1 + 1.1 * Math.pow(s, 3);
    return 0.0004 + 0.0075 * tp * sp + 0.0014 * smoothstep(0.1, 0.9, t) * (1 - smoothstep(0.9, 1, t));
  };
  const posAt = (i, j) => {
    const s = i / PNU, t = j / PNV;
    const y = lerp(yb, yt, t);
    const hw = lerp(xb, xt, t);
    const x = sx * lerp(x0, hw, s);
    const r = torsoAtXY(x, y, 1);
    const bulge = 0.0012 * noise(x * 16, y * 16, 3.3);
    return add(r.p, mul(r.n, lift(s, t) + bulge));
  };
  const pocket = gridPart(posAt, PNU, PNV, { expect: { i: PNU / 2, j: PNV / 2, dir: [0, 0, 1] }, name: 'pocket' });
  computeNormals(pocket);
  parts.body.push(pocket);
  const edge = (pts, r, sides, name) => parts.body.push(tubeAlong(pts, r, sides, { name }));
  const colPts = (col, off) => {
    const pts = [];
    for (let j = 0; j <= PNV; j++) {
      const k = pocket.gv(col, j);
      pts.push(add(pocket.vert(k), mul(pocket.nrm(k), off)));
    }
    return pts;
  };
  edge(colPts(PNU, -0.0016), 0.0048, 6, 'pocketedge'); // slanted opening roll
  edge(colPts(0, 0.0003), 0.0013, 3, 'pocketstitch');
  for (const [j, rr] of [[PNV, 0.0014], [PNV - 1, 0.0009], [0, 0.0014]]) {
    const pts = [];
    for (let i = 0; i <= PNU; i++) {
      const k = pocket.gv(i, j);
      pts.push(add(pocket.vert(k), mul(pocket.nrm(k), 0.0004)));
    }
    edge(pts, rr, 3, 'pocketstitch');
  }
}

// ---------------------------------------------------------------- front zip
const ZIP_Y0 = BOT_Y + 0.012, ZIP_Y1 = 0.328;
const zipYs = [];
for (let y = ZIP_Y0; y <= ZIP_Y1; y += 0.0043) zipYs.push(y);
const chest = (x, y, lift = 0) => {
  const r = torsoAtXY(x, y, 1);
  return add(r.p, mul(r.n, lift));
};
{
  for (const sx of [1, -1]) {
    const xs = [0.0182, 0.0170, 0.0082, 0.0054];
    const ls = [0.0002, 0.0028, 0.0028, 0.0042];
    const tapeYs = zipYs.filter((_, k) => k % 3 === 0 || k === zipYs.length - 1);
    const tape = gridPart((i, j) => chest(sx * xs[i], tapeYs[j], ls[i]), 3, tapeYs.length - 1, { expect: { i: 1, j: 3, dir: [0, 0, 1] }, name: 'ziptape' });
    parts.zip.push(tape);
    const pts = zipYs.map((y) => chest(sx * 0.0030, y, 0.0038));
    const ph = sx > 0 ? 0 : 1;
    parts.zip.push(tubeAlong(pts, (t, j) => ((j + ph) % 2 ? 0.0030 : 0.0013), 3, { name: 'zipteeth' }));
  }
  // stops
  for (const y of [ZIP_Y0 + 0.002, ZIP_Y1 - 0.002]) {
    const c = chest(0, y, 0.0035);
    parts.zip.push(superEllipsoid(0.0085, 0.0045, 0.0028, 0.5, 12, 6, (p) => add(p, c)));
  }
  // slider + pull tab (rest position a little below the top)
  const ys = 0.262;
  const sc = torsoAtXY(0, ys, 1);
  const n = sc.n;
  const ex = norm(cross([0, 1, 0], n));
  const ey = norm(cross(n, ex));
  const basis = (p, o) => add(o, add(mul(ex, p[0]), add(mul(ey, p[1]), mul(n, p[2]))));
  const slC = add(sc.p, mul(n, 0.0070));
  parts.zip.push(superEllipsoid(0.0150, 0.0220, 0.0062, 0.42, 16, 10, (p) => basis(p, slC)));
  // bridge + ring
  parts.zip.push(superEllipsoid(0.0075, 0.005, 0.0045, 0.5, 14, 8, (p) => basis(p, add(slC, add(mul(ey, -0.0225), mul(n, 0.002))))));
  const tabC = add(sc.p, add(mul(n, 0.0102), mul(ey, -0.0220 - 0.030)));
  const ang = 0.10;
  const loopPts = [];
  {
    const hw = 0.0088, hh = 0.0310, rr = 0.0075, nC = 7;
    const corners = [[hw - rr, hh - rr, 0], [-hw + rr, hh - rr, 0.5], [-hw + rr, -hh + rr, 1], [hw - rr, -hh + rr, 1.5]];
    for (const [cx, cy, q] of corners) for (let k = 0; k <= nC; k++) {
      const a = (q + (k / nC) * 0.5) * Math.PI;
      const lx = cx + Math.cos(a) * rr, ly = cy + Math.sin(a) * rr;
      const q2 = [lx * Math.cos(ang) - ly * Math.sin(ang), lx * Math.sin(ang) + ly * Math.cos(ang), 0];
      loopPts.push(basis(q2, tabC));
    }
  }
  parts.zip.push(tubeAlong(loopPts, 0.0024, 5, { closed: true, squash: [1, 0.8], name: 'zippull' }));
  info.zipPull = { y: ys };
}

// ---------------------------------------------------------------- eyelets & drawcords
{
  const eyelet = [];
  for (const sx of [1, -1]) {
    const th = sx > 0 ? 0.62 : TAU - 0.62;
    const ii = Math.round(((th - THETA0) / (TAU - 2 * THETA0)) * HNU);
    // choose the hood vertex on the outer wall closest to y ~ 0.325
    let bj = Math.round(HNV * 0.72), bd = 9;
    for (let j = crestJ + 3; j < HNV - 2; j++) {
      const y = hood.vert(hv(ii, j))[1];
      const d = Math.abs(y - 0.300);
      if (d < bd) { bd = d; bj = j; }
    }
    const k = hv(ii, bj);
    const c = add(hood.vert(k), mul(hood.nrm(k), 0.0008));
    const n = hood.nrm(k);
    const u = norm(cross(n, [0, 1, 0]));
    const v = cross(n, u);
    const ring = [];
    for (let q = 0; q < 18; q++) {
      const a = (TAU * q) / 18;
      ring.push(add(c, add(mul(u, Math.cos(a) * 0.0062), mul(v, Math.sin(a) * 0.0062))));
    }
    parts.cords.push(tubeAlong(ring, 0.0019, 5, { closed: true, name: 'eyelet' }));
    // dark inner grommet disk
    // cord path
    const hoodP = hood.vert(k);
    const x0 = hoodP[0];
    const yEnd = sx > 0 ? -0.10 : -0.14;
    const xEnd = x0 + sx * 0.012;
    const ctrl = [];
    ctrl.push(add(c, mul(n, 0.004)));
    ctrl.push(chest(x0 + sx * 0.002, Math.min(0.285, hood.vert(k)[1] - 0.02), 0.0055));
    const nK = 7;
    for (let q = 1; q <= nK; q++) {
      const t = q / nK;
      const y = lerp(0.285, yEnd, t);
      const x = lerp(x0, xEnd, t) + sx * 0.010 * Math.sin(t * 5.5 + (sx > 0 ? 0 : 2)) * t;
      ctrl.push(chest(x, y, 0.0058));
    }
    const { pts } = catmullResample(ctrl, 56, 20);
    parts.cords.push(tubeAlong(pts, 0.0027, 4, { name: 'cord' }));
    // knot + aglet
    const end = pts[pts.length - 1];
    const prev = pts[pts.length - 6];
    const dirEnd = norm(sub(end, prev));
    const knotC = add(pts[pts.length - 1], mul(dirEnd, 0.001));
    parts.cords.push(superEllipsoid(0.0052, 0.0046, 0.0052, 1, 12, 8, (p) => add(p, knotC)));
    const aStart = add(knotC, mul(dirEnd, 0.003));
    const apts = [];
    const AL = 0.026, AN = 8;
    // bend the aglet to lie on the chest: re-project each point onto the torso surface
    for (let q = 0; q <= AN; q++) {
      const base = add(aStart, mul(dirEnd, (AL * q) / AN));
      const r = torsoAtXY(base[0], base[1], 1);
      apts.push(add(r.p, mul(r.n, 0.0058)));
    }
    parts.cords.push(
      tubeAlong(apts, (t) => (t > 0.86 ? 0.0041 * Math.sqrt(Math.max(0, 1 - ((t - 0.86) / 0.14) ** 2) * 0.96 + 0.04) : 0.0041), 8, { caps: true, name: 'aglet' }),
    );
    const bandP = apts[1];
    parts.cords.push(tubeAlong([apts[1], apts[2]], 0.0046, 8, { caps: true, name: 'agletband' }));
  }
}

// ---------------------------------------------------------------- back panel + zip outline
const PW = 0.33, PH = PW / 0.64;
const PYC = -0.066;
const PR = 0.04 * PW;
{
  const lines = (L, r, nIn) => {
    const a = [0, r * 0.5, r];
    for (let k = 1; k < nIn; k++) a.push(r + ((L - 2 * r) * k) / nIn);
    a.push(L - r, L - r * 0.5, L);
    return a;
  };
  const gx = lines(PW, PR, 16), gy = lines(PH, PR, 28);
  const hx = PW / 2, hy = PH / 2;
  const planar = (i, j) => {
    let x = gx[i] - hx, y = gy[j] - hy;
    const cx = hx - PR, cy = hy - PR;
    const ax = Math.abs(x), ay = Math.abs(y);
    if (ax > cx && ay > cy) {
      const dx = ax - cx, dy = ay - cy;
      const d = Math.hypot(dx, dy);
      if (d > PR) {
        x = sgn(x) * (cx + (dx / d) * PR);
        y = sgn(y) * (cy + (dy / d) * PR);
      }
    }
    return [x, y];
  };
  const place = (x, yy, lift) => {
    const y = PYC + yy;
    const th = thetaAtArc(y, x);
    const n = torsoNormal(th, y);
    return add(torsoPoint(th, y), mul(n, lift));
  };
  const nuP = gx.length - 1, nvP = gy.length - 1;
  const panel = gridPart(
    (i, j) => {
      const [x, y] = planar(i, j);
      return place(x, y, 0.0015);
    },
    nuP,
    nvP,
    {
      expect: { i: nuP / 2, j: nvP / 2, dir: [0, 0, -1] },
      uv: (i, j) => {
        const [x, y] = planar(i, j);
        return [(hx - x) / PW, (hy - y) / PH]; // +x world is screen-left from the back
      },
      name: 'back_panel',
    },
  );
  computeNormals(panel);
  parts.panel.push(panel);
  info.panel = { tris: panel.tcount, W: PW, H: PH, yc: PYC };

  // zip outline around panel: perimeter samples of the rounded rectangle
  const GAP = 0.0012;
  const samples = [];
  {
    const step = 0.0062;
    const rr = PR;
    const sx = hx, sy = hy;
    const segs = [];
    // go counter-clockwise starting at bottom-left end of bottom straight edge
    segs.push({ type: 'line', a: [-sx + rr, -sy], b: [sx - rr, -sy], m: [0, -1] });
    segs.push({ type: 'arc', c: [sx - rr, -sy + rr], a0: -Math.PI / 2, a1: 0 });
    segs.push({ type: 'line', a: [sx, -sy + rr], b: [sx, sy - rr], m: [1, 0] });
    segs.push({ type: 'arc', c: [sx - rr, sy - rr], a0: 0, a1: Math.PI / 2 });
    segs.push({ type: 'line', a: [sx - rr, sy], b: [-sx + rr, sy], m: [0, 1] });
    segs.push({ type: 'arc', c: [-sx + rr, sy - rr], a0: Math.PI / 2, a1: Math.PI });
    segs.push({ type: 'line', a: [-sx, sy - rr], b: [-sx, -sy + rr], m: [-1, 0] });
    segs.push({ type: 'arc', c: [-sx + rr, -sy + rr], a0: Math.PI, a1: (3 * Math.PI) / 2 });
    for (const sg of segs) {
      if (sg.type === 'line') {
        const L = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]);
        const n = Math.max(1, Math.round(L / step));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          samples.push({ p: [lerp(sg.a[0], sg.b[0], t), lerp(sg.a[1], sg.b[1], t)], m: sg.m });
        }
      } else {
        const L = Math.abs(sg.a1 - sg.a0) * rr;
        const n = Math.max(2, Math.round(L / step));
        for (let k = 0; k < n; k++) {
          const a = lerp(sg.a0, sg.a1, k / n);
          samples.push({ p: [sg.c[0] + Math.cos(a) * rr, sg.c[1] + Math.sin(a) * rr], m: [Math.cos(a), Math.sin(a)] });
        }
      }
    }
  }
  const nS = samples.length - (samples.length % 2); // even number so teeth alternate cleanly around the loop
  const prof = [
    [0.0012, 0.0014],
    [0.0024, 0.0031],
    [0.0042, 'T'],
    [0.0066, 0.0026],
    [0.0078, 0.0004],
  ];
  const pzip = gridPart(
    (i, j) => {
      const s = samples[i % nS];
      const [w, l] = prof[j];
      const lift = l === 'T' ? (i % 2 ? 0.0048 : 0.0018) : l;
      const x = s.p[0] + s.m[0] * (GAP + w), y = s.p[1] + s.m[1] * (GAP + w);
      return place(x, y, lift);
    },
    nS,
    prof.length - 1,
    { expect: { i: Math.floor(nS * 0.25), j: 2, dir: [0, 0, -1] }, name: 'panel_zip' },
  );
  parts.panelZip.push(pzip);
  info.panelZipTris = pzip.tcount;
}

// ---------------------------------------------------------------- assemble
const finish = (list) => {
  if (process.env.SKIP) list = list.filter((p) => !process.env.SKIP.split(',').some((k) => (p.name || '').startsWith(k))); for (const p of list) { let bad = 0; for (const v of p.p) if (!Number.isFinite(v)) bad++; if (p.n) for (const v of p.n) if (!Number.isFinite(v)) bad++; if (bad) console.log('NaN in part', p.name, bad); } return mergeParts(list); };
const geo = {
  hoodie_body: finish(parts.body),
  zip: finish(parts.zip),
  drawcords: finish(parts.cords),
  panel_zip: finish(parts.panelZip),
  back_panel: finish(parts.panel),
};
const meshes = [
  { name: 'hoodie_body', material: 'fabric', geo: geo.hoodie_body },
  { name: 'back_panel', material: 'panel', geo: geo.back_panel },
  { name: 'zip', material: 'fabric', geo: geo.zip },
  { name: 'drawcords', material: 'fabric', geo: geo.drawcords },
  { name: 'panel_zip', material: 'fabric', geo: geo.panel_zip },
];
for (const [k, list] of Object.entries(parts)) { const agg = {}; for (const p of list) agg[p.name || '?'] = (agg[p.name || '?'] || 0) + p.tcount; if (process.env.PARTS) console.log(k, JSON.stringify(agg)); }
const SHEEN = process.env.NOSHEEN ? null : { color: [0.6, 0.6, 0.6], roughness: 0.4 };
const glb = writeGlb(meshes, { sheen: SHEEN });
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'hoodie.glb'), glb);

let tris = 0;
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
const perMesh = {};
for (const m of meshes) {
  tris += m.geo.i.length / 3;
  perMesh[m.name] = m.geo.i.length / 3;
  for (let k = 0; k < m.geo.p.length; k += 3) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], m.geo.p[k + a]);
    max[a] = Math.max(max[a], m.geo.p[k + a]);
  }
}
const r4 = (v) => Math.round(v * 10000) / 10000;
const meta = {
  triangles: tris,
  trianglesPerMesh: perMesh,
  sizeBytes: glb.length,
  backPanelMesh: 'back_panel',
  panelAspect: 0.64,
  bbox: { min: min.map(r4), max: max.map(r4), size: max.map((v, k) => r4(v - min[k])) },
  recommendedCamera: { position: [0, 0.02, -2.5], target: [0, 0, 0], fov: 32 },
  nodes: ['Hoodie', ...meshes.map((m) => m.name)],
  materials: ['fabric', 'panel'],
  fabricExtensions: SHEEN ? ['KHR_materials_sheen'] : [],
  notes: 'Procedural hoodie, front +Z, back -Z, metres, origin mid-chest, all transforms baked. Materials: fabric, panel. Panel UVs: u grows toward -X, v (glTF, down) grows toward -Y. Fabric carries optional KHR_materials_sheen (soft grazing highlight so black tints keep their form); regenerate without it via NOSHEEN=1. Whole-scene bbox height includes the hood; shoulder seam to hem is about 0.69 m. Regenerate with node tools/hoodie-model/generate.mjs (seeded, deterministic).',
  seed: SEED,
};
writeFileSync(resolve(OUT_DIR, 'hoodie.meta.json'), JSON.stringify(meta, null, 2));
console.log(JSON.stringify({ tris, perMesh, bytes: glb.length, bbox: meta.bbox, info }, null, 1));
