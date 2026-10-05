// Small dependency-free math helpers for the procedural hoodie generator.
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const sgn = (x) => (x < 0 ? -1 : 1);
export const spow = (x, e) => sgn(x) * Math.pow(Math.abs(x), e);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded 3D value noise in [-1,1]. */
export function makeNoise(seed) {
  const r = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = Float64Array.from({ length: 256 }, () => r() * 2 - 1);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const v = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const noise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), w = fade(yf), s = fade(zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(v(xi, yi, zi), v(xi + 1, yi, zi), u), l(v(xi, yi + 1, zi), v(xi + 1, yi + 1, zi), u), w),
      l(l(v(xi, yi, zi + 1), v(xi + 1, yi, zi + 1), u), l(v(xi, yi + 1, zi + 1), v(xi + 1, yi + 1, zi + 1), u), w),
      s,
    );
  };
  const fbm = (x, y, z, oct = 3) => {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) {
      s += a * noise(x * f, y * f, z * f);
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  };
  return { noise, fbm };
}

/** Monotone cubic (PCHIP) interpolation through [[x,y],...] sorted by x. */
export function pchip(keys) {
  const n = keys.length;
  const x = keys.map((k) => k[0]);
  const y = keys.map((k) => k[1]);
  const h = [], d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(x[i + 1] - x[i]);
    d.push((y[i + 1] - y[i]) / h[i]);
  }
  const m = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (t) => {
    if (t <= x[0]) return y[0] + m[0] * (t - x[0]);
    if (t >= x[n - 1]) return y[n - 1] + m[n - 1] * (t - x[n - 1]);
    let i = 0;
    while (t > x[i + 1]) i++;
    const s = (t - x[i]) / h[i];
    const s2 = s * s, s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * y[i] +
      (s3 - 2 * s2 + s) * h[i] * m[i] +
      (-2 * s3 + 3 * s2) * y[i + 1] +
      (s3 - s2) * h[i] * m[i + 1]
    );
  };
}

/** Catmull-Rom through points (any dimension), resampled to n+1 equally spaced (by arc length) samples. */
export function catmullResample(pts, n, dense = 40) {
  const dim = pts[0].length;
  const P = [pts[0].map((v, k) => 2 * v - pts[1][k]), ...pts, pts[pts.length - 1].map((v, k) => 2 * v - pts[pts.length - 2][k])];
  const fine = [];
  for (let i = 1; i < P.length - 2; i++) {
    for (let s = 0; s < dense; s++) {
      const t = s / dense, t2 = t * t, t3 = t2 * t;
      const q = [];
      for (let k = 0; k < dim; k++) {
        q.push(0.5 * (2 * P[i][k] + (-P[i - 1][k] + P[i + 1][k]) * t + (2 * P[i - 1][k] - 5 * P[i][k] + 4 * P[i + 1][k] - P[i + 2][k]) * t2 + (-P[i - 1][k] + 3 * P[i][k] - 3 * P[i + 1][k] + P[i + 2][k]) * t3));
      }
      fine.push(q);
    }
  }
  fine.push(pts[pts.length - 1].slice());
  const cum = [0];
  for (let i = 1; i < fine.length; i++) {
    let s = 0;
    for (let k = 0; k < dim; k++) s += (fine[i][k] - fine[i - 1][k]) ** 2;
    cum.push(cum[i - 1] + Math.sqrt(s));
  }
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const target = (total * i) / n;
    while (j < fine.length - 2 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = (target - cum[j]) / seg;
    out.push(fine[j].map((v, k) => v + (fine[j + 1][k] - v) * t));
  }
  return { pts: out, length: total };
}
