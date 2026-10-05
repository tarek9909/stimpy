// Tiny mesh toolkit: indexed parts, lofted grids, tubes, super-ellipsoids, normals.
import { add, sub, mul, dot, cross, norm, len, sgn } from './math.mjs';

export class Part {
  constructor(name = '') {
    this.name = name;
    this.p = []; // flat xyz
    this.uv = []; // flat uv
    this.i = []; // triangle indices
    this.n = null;
  }
  get vcount() { return this.p.length / 3; }
  get tcount() { return this.i.length / 3; }
  vert(k) { return [this.p[3 * k], this.p[3 * k + 1], this.p[3 * k + 2]]; }
  nrm(k) { return [this.n[3 * k], this.n[3 * k + 1], this.n[3 * k + 2]]; }
  addVert(x, y, z, u = 0, v = 0) {
    this.p.push(x, y, z);
    this.uv.push(u, v);
    return this.p.length / 3 - 1;
  }
  addTri(a, b, c) { this.i.push(a, b, c); }
  append(o) {
    const base = this.vcount;
    for (const v of o.p) this.p.push(v);
    for (const v of o.uv) this.uv.push(v);
    for (const t of o.i) this.i.push(t + base);
    this.n = null;
    return base;
  }
  /** grid accessor (valid on parts made by gridPart; base = offset when appended) */
  gv(i, j, base = 0) { return base + j * this.cols + i; }
}

function faceNormal(P, a, b, c) {
  const pa = [P[3 * a], P[3 * a + 1], P[3 * a + 2]];
  const pb = [P[3 * b], P[3 * b + 1], P[3 * b + 2]];
  const pc = [P[3 * c], P[3 * c + 1], P[3 * c + 2]];
  return cross(sub(pb, pa), sub(pc, pa));
}

/**
 * Build a (nu+1) x (nv+1) grid. fn(i,j)->[x,y,z]; for periodic loops call fn with i%nu yourself.
 * Orientation: opts.center(j) -> point inside ring (normals face away) or opts.expect={i,j,dir}.
 */
export function gridPart(fn, nu, nv, opts = {}) {
  const part = new Part(opts.name || '');
  part.cols = nu + 1;
  part.rows = nv + 1;
  part.nu = nu;
  part.nv = nv;
  const uvf = opts.uv || ((i, j) => [i / nu, j / nv]);
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const q = fn(i, j);
      const t = uvf(i, j);
      part.addVert(q[0], q[1], q[2], t[0], t[1]);
    }
  }
  const idx = (i, j) => j * (nu + 1) + i;
  const tris = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      tris.push([a, b, c], [a, c, d]);
    }
  }
  let flip = !!opts.flip;
  if (opts.center) {
    let s = 0;
    for (const [a, b, c] of tris) {
      const fnv = faceNormal(part.p, a, b, c);
      const cen = mul(add(add(part.vert(a), part.vert(b)), part.vert(c)), 1 / 3);
      const j = Math.floor(a / (nu + 1));
      s += dot(norm(fnv), norm(sub(cen, opts.center(j))));
    }
    if (s < 0) flip = !flip;
  } else if (opts.expect) {
    const { i, j, dir } = opts.expect;
    const fnv = faceNormal(part.p, idx(i, j), idx(i + 1, j), idx(i + 1, j + 1));
    if (dot(fnv, dir) < 0) flip = !flip;
  }
  for (const [a, b, c] of tris) {
    if (flip) part.addTri(a, c, b);
    else part.addTri(a, b, c);
  }
  return part;
}

/** Area-weighted vertex normals, welded across coincident vertices. */
export function computeNormals(part) {
  const nv = part.vcount;
  const acc = new Float64Array(nv * 3);
  for (let t = 0; t < part.i.length; t += 3) {
    const a = part.i[t], b = part.i[t + 1], c = part.i[t + 2];
    const f = faceNormal(part.p, a, b, c);
    for (const k of [a, b, c]) {
      acc[3 * k] += f[0];
      acc[3 * k + 1] += f[1];
      acc[3 * k + 2] += f[2];
    }
  }
  const map = new Map();
  const key = (k) => `${Math.round(part.p[3 * k] * 1e6)}_${Math.round(part.p[3 * k + 1] * 1e6)}_${Math.round(part.p[3 * k + 2] * 1e6)}`;
  const keys = new Array(nv);
  for (let k = 0; k < nv; k++) {
    keys[k] = key(k);
    const e = map.get(keys[k]);
    if (e) { e[0] += acc[3 * k]; e[1] += acc[3 * k + 1]; e[2] += acc[3 * k + 2]; }
    else map.set(keys[k], [acc[3 * k], acc[3 * k + 1], acc[3 * k + 2]]);
  }
  part.n = new Array(nv * 3);
  for (let k = 0; k < nv; k++) {
    const s = norm(map.get(keys[k]));
    part.n[3 * k] = s[0];
    part.n[3 * k + 1] = s[1];
    part.n[3 * k + 2] = s[2];
  }
  return part;
}

/** Move every vertex along its (welded) normal by fn(p, n, k). */
export function displace(part, fn) {
  computeNormals(part);
  for (let k = 0; k < part.vcount; k++) {
    const p = part.vert(k), n = part.nrm(k);
    const d = fn(p, n, k);
    part.p[3 * k] += n[0] * d;
    part.p[3 * k + 1] += n[1] * d;
    part.p[3 * k + 2] += n[2] * d;
  }
  computeNormals(part);
  return part;
}

/** Transport frames along a polyline. Returns [{p,T,N,B}] */
export function frames(points, refUp = [0, 0, 1]) {
  const n = points.length;
  const out = [];
  let T0 = norm(sub(points[1], points[0]));
  let N = cross(T0, refUp);
  if (len(N) < 1e-6) N = cross(T0, [1, 0, 0]);
  N = norm(N);
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    const T = norm(sub(b, a));
    N = sub(N, mul(T, dot(N, T)));
    N = norm(N);
    out.push({ p: points[i], T, N, B: cross(T, N) });
  }
  return out;
}

export function capFan(part, ring, center, outward) {
  // ring: vertex indices (closed loop, length m, NOT repeated)
  const c = part.addVert(center[0], center[1], center[2], 0.5, 0.5);
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length];
    const f = faceNormal(part.p, a, b, c);
    if (dot(f, outward) > 0) part.addTri(a, b, c);
    else part.addTri(b, a, c);
  }
}

/**
 * Tube along points. radius(t, j) with t in 0..1, or number. sides >= 3.
 * opts: caps (bool), closed (bool, closes the loop path), scaleXY [sx, sy] ellipse ratio, phase.
 */
export function tubeAlong(points, radius, sides = 5, opts = {}) {
  let pts = points;
  if (opts.closed) pts = [...points, points[0]];
  const fr = frames(pts, opts.refUp || [0, 1, 0]);
  const rf = typeof radius === 'function' ? radius : () => radius;
  const nv = pts.length - 1;
  const part = gridPart(
    (i, j) => {
      const f = fr[j];
      const a = (2 * Math.PI * (i % sides)) / sides;
      const r = rf(j / nv, j, a);
      const sx = opts.squash ? opts.squash[0] : 1, sy = opts.squash ? opts.squash[1] : 1;
      return add(f.p, add(mul(f.N, Math.cos(a) * r * sx), mul(f.B, Math.sin(a) * r * sy)));
    },
    sides,
    nv,
    { center: (j) => pts[j], name: opts.name },
  );
  const ringIdx = (j) => Array.from({ length: sides }, (_, i) => j * (sides + 1) + i);
  if (opts.caps && !opts.closed) {
    capFan(part, ringIdx(0), pts[0], sub(pts[0], pts[1]));
    capFan(part, ringIdx(nv), pts[nv], sub(pts[nv], pts[nv - 1]));
  }
  return part;
}

/** Super-ellipsoid centred at origin with radii, exponent e (1=ellipsoid, <1 boxier); xf maps local->world. */
export function superEllipsoid(rx, ry, rz, e = 1, nlon = 16, nlat = 10, xf = (p) => p) {
  const c = (a) => sgn(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), e);
  const s = (a) => sgn(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), e);
  const part = gridPart(
    (i, j) => {
      const th = (2 * Math.PI * (i % nlon)) / nlon;
      const ph = -Math.PI / 2 + (Math.PI * j) / nlat;
      return xf([rx * c(ph) * c(th), ry * s(ph), rz * c(ph) * s(th)]);
    },
    nlon,
    nlat,
    { center: () => xf([0, 0, 0]) },
  );
  return part;
}

export function transformPart(part, xf) {
  for (let k = 0; k < part.vcount; k++) {
    const q = xf(part.vert(k));
    part.p[3 * k] = q[0];
    part.p[3 * k + 1] = q[1];
    part.p[3 * k + 2] = q[2];
  }
  part.n = null;
  return part;
}

export function mergeParts(parts) {
  const out = new Part('merged');
  out.n = [];
  for (const p of parts) {
    if (!p.n) computeNormals(p);
    const base = out.vcount;
    for (const v of p.p) out.p.push(v);
    for (const v of p.n) out.n.push(v);
    for (const v of p.uv) out.uv.push(v);
    for (const t of p.i) out.i.push(t + base);
  }
  return out;
}
