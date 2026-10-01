// The hoodie (a lit fabric height field), the Stimpie panels that dock on its back, their shadows,
// and the zip track shown in the exploded view.
//
// The hoodie is a flat plane whose shading comes from a procedurally built height map: every garment part
// (sleeves, body, hood, cuffs, waistband) is rasterised, blurred into a rounded "pillow" and stacked, then
// folds, seams and the dock welt are added. The fragment shader derives normals from it and lights the
// fleece. Local units: the hoodie spans 1000×1000 (canvas space, y down); in 3D it is centred on its group.
import * as THREE from 'three';

export const DOCK = { x: 0, y: -55, w: 300, h: 364, r: 22 }; // panel footprint in hoodie-local units (y up)
/** The zipper runs around the dock at this inset from the edge (panel-local units). */
export const ZIP_INSET = 9;
const ZB = { x: DOCK.w / 2 - ZIP_INSET, y: DOCK.h / 2 - ZIP_INSET, r: DOCK.r - ZIP_INSET };
const ZC = { x: ZB.x - ZB.r, y: ZB.y - ZB.r };
const ZQ = (Math.PI / 2) * ZB.r;
export const ZIP_PERIM = 4 * (ZC.x + ZC.y) + 2 * Math.PI * ZB.r;
/** Arc position where the zip starts and ends: the bottom centre. */
export const ZIP_START = 4 * ZC.y + 2 * ZC.x + 3 * ZQ + ZC.x;
/** Point and tangent on the zip line at arc position s (counter-clockwise from the right edge's bottom end). */
export function zipPoint(s: number): { x: number; y: number; tx: number; ty: number } {
  const ey = 2 * ZC.y, ex = 2 * ZC.x, r = ZB.r;
  s = ((s % ZIP_PERIM) + ZIP_PERIM) % ZIP_PERIM;
  const arc = (cx: number, cy: number, a0: number, d: number) => { const a = a0 + d / r; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, tx: -Math.sin(a), ty: Math.cos(a) }; };
  if (s < ey) return { x: ZB.x, y: -ZC.y + s, tx: 0, ty: 1 };
  s -= ey; if (s < ZQ) return arc(ZC.x, ZC.y, 0, s);
  s -= ZQ; if (s < ex) return { x: ZC.x - s, y: ZB.y, tx: -1, ty: 0 };
  s -= ex; if (s < ZQ) return arc(-ZC.x, ZC.y, Math.PI / 2, s);
  s -= ZQ; if (s < ey) return { x: -ZB.x, y: ZC.y - s, tx: 0, ty: -1 };
  s -= ey; if (s < ZQ) return arc(-ZC.x, -ZC.y, Math.PI, s);
  s -= ZQ; if (s < ex) return { x: -ZC.x + s, y: -ZB.y, tx: 1, ty: 0 };
  s -= ex; return arc(ZC.x, -ZC.y, -Math.PI / 2, s);
}

const RES = 1400; // height-map pixels across 1000 units
const K = RES / 1000;

type Draw = (c: CanvasRenderingContext2D) => void;

function mirror(d: Draw): Draw {
  return (c) => { c.save(); c.translate(1000, 0); c.scale(-1, 1); d(c); c.restore(); };
}

// ---------------------------------------------------------------- silhouette (canvas space, y down)
const sleeve: Draw = (c) => {
  c.beginPath();
  c.moveTo(266, 296);
  c.bezierCurveTo(224, 310, 196, 362, 186, 432);
  c.bezierCurveTo(176, 520, 170, 650, 170, 792);
  c.lineTo(260, 794);
  c.bezierCurveTo(264, 690, 272, 560, 292, 450);
  c.bezierCurveTo(296, 380, 290, 320, 266, 296);
  c.closePath();
  c.fill();
};
const body: Draw = (c) => {
  c.beginPath();
  c.moveTo(370, 250);
  c.bezierCurveTo(430, 266, 570, 266, 630, 250);
  c.bezierCurveTo(680, 268, 716, 284, 738, 300);
  c.bezierCurveTo(752, 332, 744, 392, 722, 444);
  c.bezierCurveTo(716, 560, 714, 700, 712, 850);
  c.lineTo(288, 850);
  c.bezierCurveTo(286, 700, 284, 560, 278, 444);
  c.bezierCurveTo(256, 392, 248, 332, 262, 300);
  c.bezierCurveTo(284, 284, 320, 268, 370, 250);
  c.closePath();
  c.fill();
};
const waist: Draw = (c) => {
  c.beginPath();
  c.moveTo(291, 794);
  c.lineTo(709, 794);
  c.bezierCurveTo(708, 820, 706, 846, 704, 868);
  c.quadraticCurveTo(500, 880, 296, 868);
  c.bezierCurveTo(294, 846, 292, 820, 291, 794);
  c.closePath();
  c.fill();
};
const cuff: Draw = (c) => {
  c.beginPath();
  c.moveTo(171, 782);
  c.lineTo(259, 784);
  c.lineTo(257, 842);
  c.quadraticCurveTo(214, 850, 173, 840);
  c.closePath();
  c.fill();
};
const hood: Draw = (c) => {
  c.beginPath();
  c.moveTo(356, 300);
  c.bezierCurveTo(334, 212, 364, 84, 500, 64);
  c.bezierCurveTo(636, 84, 666, 212, 644, 300);
  c.bezierCurveTo(604, 334, 562, 346, 500, 348);
  c.bezierCurveTo(438, 346, 396, 334, 356, 300);
  c.closePath();
  c.fill();
};

interface Part { draw: Draw; lift: number; amp: number; blur: number; rib?: boolean }
const PARTS: Part[] = [
  { draw: sleeve, lift: 0.0, amp: 0.5, blur: 40 },
  { draw: mirror(sleeve), lift: 0.0, amp: 0.5, blur: 40 },
  { draw: body, lift: 0.06, amp: 0.6, blur: 44 },
  { draw: cuff, lift: 0.05, amp: 0.3, blur: 12, rib: true },
  { draw: mirror(cuff), lift: 0.05, amp: 0.3, blur: 12, rib: true },
  { draw: waist, lift: 0.12, amp: 0.32, blur: 14, rib: true },
  { draw: hood, lift: 0.22, amp: 0.7, blur: 56 },
];

// folds: [points, width, strength (+ ridge / − valley), blur]
type Fold = [[number, number][], number, number, number];
const FOLDS_L: Fold[] = [
  [[[294, 452], [318, 520], [352, 606]], 18, 0.9, 14],
  [[[300, 520], [322, 600], [344, 700]], 16, -0.7, 14],
  [[[180, 548], [214, 566], [254, 586]], 14, 0.8, 9],
  [[[178, 586], [214, 598], [256, 612]], 12, -0.7, 9],
  [[[176, 700], [214, 712], [256, 718]], 12, -0.6, 8],
  [[[174, 728], [214, 742], [258, 744]], 14, 0.9, 8],
  [[[174, 756], [214, 764], [258, 766]], 12, -0.8, 7],
  [[[304, 776], [360, 770], [424, 774]], 16, 0.8, 9],
  [[[300, 792], [360, 788], [430, 792]], 10, -0.6, 6],
  [[[420, 300], [428, 236], [452, 168]], 22, 0.55, 18],
  [[[392, 268], [404, 200], [430, 140]], 14, -0.35, 14],
  [[[250, 330], [232, 370], [214, 420]], 16, 0.4, 14],
];
const FOLDS_C: Fold[] = [
  [[[452, 776], [500, 770], [550, 776]], 14, 0.7, 9],
  [[[500, 74], [500, 200], [500, 340]], 8, -0.35, 6],
];

function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / n;
      acc += src[row + Math.min(w - 1, x + r + 1)]! - src[row + Math.max(0, x - r)]!;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}
const gauss = (a: Float32Array, w: number, h: number, r: number) => boxBlur(boxBlur(boxBlur(a, w, h, r), w, h, r), w, h, r);

/** Build the hoodie's height/detail textures. H: r height, g folds, b rib, a coverage. D: r seams, g welt, b AO, a brand tab. */
export function buildHoodieMaps() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = RES;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  const n = RES * RES;
  const raster = (draw: Draw, blur = 0, style: (c: CanvasRenderingContext2D) => void = () => {}) => {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.filter = 'none';
    c.clearRect(0, 0, RES, RES);
    c.setTransform(K, 0, 0, K, 0, 0);
    c.filter = blur > 0 ? `blur(${blur * K}px)` : 'none';
    c.fillStyle = '#fff';
    c.strokeStyle = '#fff';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    style(c);
    draw(c);
    const d = c.getImageData(0, 0, RES, RES).data;
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = d[i * 4 + 3]! / 255;
    return a;
  };

  const height = new Float32Array(n), cover = new Float32Array(n), rib = new Float32Array(n);
  for (const p of PARTS) {
    const m = raster(p.draw), b = raster(p.draw, p.blur);
    for (let i = 0; i < n; i++) {
      const mi = m[i]!;
      if (mi <= 0) continue;
      const x = Math.min(1, Math.max(0, (b[i]! - 0.5) * 2));
      const h = p.lift + p.amp * Math.sqrt(1 - (1 - x) * (1 - x));
      height[i] = height[i]! * (1 - mi) + h * mi;
      cover[i] = Math.max(cover[i]!, mi);
      rib[i] = rib[i]! * (1 - mi) + (p.rib ? 1 : 0) * mi;
    }
  }

  // folds
  const folds = new Float32Array(n);
  const addFold = ([pts, w, s, blur]: Fold) => {
    const a = raster((c) => {
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(pts[0]![0], pts[0]![1]);
      if (pts.length === 3) c.quadraticCurveTo(pts[1]![0], pts[1]![1], pts[2]![0], pts[2]![1]);
      else pts.slice(1).forEach(([x, y]) => c.lineTo(x, y));
      c.stroke();
    }, blur);
    for (let i = 0; i < n; i++) folds[i] = folds[i]! + a[i]! * s;
  };
  for (const f of FOLDS_L) { addFold(f); addFold([f[0].map(([x, y]) => [1000 - x, y] as [number, number]), f[1], f[2], f[3]]); }
  for (const f of FOLDS_C) addFold(f);

  // seams & stitches (r), dock welt (g)
  const seams = raster((c) => {
    c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(500, 68); c.lineTo(500, 346); c.stroke();
    c.setLineDash([5, 4]);
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(294, 800); c.quadraticCurveTo(500, 804, 706, 800); c.stroke();
    for (const s of [1, -1]) {
      const X = (x: number) => (s > 0 ? x : 1000 - x);
      c.beginPath(); c.moveTo(X(173), 789); c.lineTo(X(258), 791); c.stroke();
    }
    // stitch line inside the dock welt
    c.beginPath();
    c.roundRect(500 - DOCK.w / 2 + 10, 555 - DOCK.h / 2 + 10, DOCK.w - 20, DOCK.h - 20, DOCK.r - 8);
    c.stroke();
  }, 0);
  const welt = raster((c) => {
    c.lineWidth = 7;
    c.beginPath();
    c.roundRect(500 - DOCK.w / 2, 555 - DOCK.h / 2, DOCK.w, DOCK.h, DOCK.r);
    c.stroke();
  }, 2.5);
  const tab = raster((c) => { c.fillRect(322, 798, 10, 22); }, 0.4);

  // soften steps between stacked parts, then cavity AO
  const hs = gauss(height, RES, RES, 2);
  const wide = gauss(hs, RES, RES, 18);
  const H = new Uint8ClampedArray(n * 4), D = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const cav = Math.max(0, wide[i]! - hs[i]!);
    const ao = Math.max(0, 1 - cav * 3.2);
    // canvas rows are top-down; textures are uploaded with flipY so v = 1 at the top
    H[i * 4] = hs[i]! * 255;
    H[i * 4 + 1] = (0.5 + Math.max(-0.5, Math.min(0.5, folds[i]! * 0.5))) * 255;
    H[i * 4 + 2] = rib[i]! * 255;
    H[i * 4 + 3] = cover[i]! * 255;
    D[i * 4] = seams[i]! * 255;
    D[i * 4 + 1] = welt[i]! * 255;
    D[i * 4 + 2] = ao * 255;
    D[i * 4 + 3] = tab[i]! * 255;
  }
  const tex = (a: Uint8ClampedArray) => {
    const t = new THREE.DataTexture(a, RES, RES, THREE.RGBAFormat);
    t.flipY = false;
    t.needsUpdate = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    return t;
  };
  // DataTexture rows start at the bottom: flip the arrays so v = 1 is the top of the garment
  const flip = (a: Uint8ClampedArray) => {
    const o = new Uint8ClampedArray(a.length), row = RES * 4;
    for (let y = 0; y < RES; y++) o.set(a.subarray(y * row, (y + 1) * row), (RES - 1 - y) * row);
    return o;
  };
  return { H: tex(flip(H)), D: tex(flip(D)) };
}

// ---------------------------------------------------------------- shaders
const COMMON = /* glsl */ `
float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float rrAlong(vec2 p, vec2 B, float r){
  vec2 c = B - r; float ey = 2.0 * c.y, ex = 2.0 * c.x, q = 1.5707963 * r;
  if (p.x > c.x && abs(p.y) <= c.y) return p.y + c.y;
  if (p.y > c.y && abs(p.x) <= c.x) return ey + q + (c.x - p.x);
  if (p.x < -c.x && abs(p.y) <= c.y) return 2.0 * q + ex + ey + (c.y - p.y);
  if (p.y < -c.y && abs(p.x) <= c.x) return 3.0 * q + ex + 2.0 * ey + (p.x + c.x);
  if (p.x >= c.x && p.y >= c.y) return ey + atan(p.y - c.y, p.x - c.x) * r;
  if (p.x <= -c.x && p.y >= c.y) return q + ex + ey + (atan(p.y - c.y, p.x + c.x) - 1.5707963) * r;
  if (p.x <= -c.x && p.y <= -c.y) { float a = atan(p.y + c.y, p.x + c.x); if (a > 0.0) a -= 6.2831853; return 2.0 * q + ex + 2.0 * ey + (a + 3.1415926) * r; }
  return 3.0 * q + 2.0 * ex + 2.0 * ey + (atan(p.y + c.y, p.x - c.x) + 1.5707963) * r;
}
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
`;

export const LIGHT_UNIFORMS = () => ({
  uL: { value: new THREE.Vector3(-0.45, 0.55, 0.7).normalize() },
  uKey: { value: new THREE.Color(1.0, 0.97, 0.92) },
  uAmb: { value: new THREE.Color(0.22, 0.23, 0.26) },
  uRim: { value: new THREE.Color(0.0, 0.0, 0.0) },
  uCamPos: { value: new THREE.Vector3() },
});

const HOODIE_VS = /* glsl */ `
varying vec2 vUv;
varying vec3 vW;
void main(){
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const HOODIE_FS = /* glsl */ `
uniform sampler2D uH, uD;
uniform vec3 uColor, uL, uKey, uAmb, uRim, uGlowColor, uTabColor, uCamPos;
uniform float uBump, uDockGlow, uWelt, uTime, uRipAge, uRipAmp, uOpacity;
uniform float uChase;
varying vec2 vUv;
varying vec3 vW;
${COMMON}
float hgt(vec2 uv){ vec4 h = texture2D(uH, uv); vec4 d = texture2D(uD, uv); return h.r + (h.g - 0.5) * 0.28 + d.g * 0.035 * uWelt; }
void main(){
  vec4 h = texture2D(uH, vUv);
  if (h.a < 0.004) discard;
  vec4 d = texture2D(uD, vUv);
  vec2 p = (vUv - 0.5) * 1000.0;            // hoodie-local units, y up
  // impact ripple travelling out from the dock
  float rr = length(p - vec2(${DOCK.x.toFixed(1)}, ${DOCK.y.toFixed(1)}));
  float rip = uRipAmp * sin(rr * 0.05 - uRipAge * 34.0) * exp(-uRipAge * 5.0) * exp(-rr * 0.004) * step(0.0, uRipAge) * smoothstep(uRipAge * 900.0 + 60.0, uRipAge * 900.0 - 60.0, rr);
  vec2 e = vec2(1.6 / ${RES.toFixed(1)}, 0.0);
  float hx = hgt(vUv + e.xy) - hgt(vUv - e.xy);
  float hy = hgt(vUv + e.yx) - hgt(vUv - e.yx);
  vec3 n = normalize(vec3(-hx * uBump, -hy * uBump, 1.0));
  // rib knit on cuffs and waistband, fleece micro-texture everywhere
  n.x += sin(p.x * 1.9) * 0.22 * h.b;
  vec2 q = p * 0.9;
  n.xy += (vec2(vnoise(q * 1.7), vnoise(q * 1.7 + 17.0)) - 0.5) * 0.07;
  n.xy += (vec2(vnoise(q * 0.35), vnoise(q * 0.35 + 5.0)) - 0.5) * 0.05;
  n.x += rip * cos(rr * 0.05) * 0.9;
  n.y += rip * 0.5;
  n = normalize(n);
  vec3 V = normalize(uCamPos - vW);
  float ndl = dot(n, uL);
  float diff = smoothstep(-0.35, 1.0, ndl);
  float sheen = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 base = uColor * (0.93 + 0.14 * vnoise(p * 0.08));
  vec3 col = base * (uAmb + uKey * diff * 1.6);
  col += uRim * sheen * 1.4;
  col += uKey * base * pow(max(dot(reflect(-uL, n), V), 0.0), 6.0) * 0.35;
  col *= mix(0.42, 1.0, d.b);                // cavity AO
  col *= 1.0 - d.r * 0.32;                   // seams
  col += uKey * d.g * uWelt * 0.012;         // welt catches the light
  // the dock outline glows when armed, with a light chasing round it (the zip is hidden in the seam)
  if (uDockGlow > 0.0) {
    vec2 dp = p - vec2(${DOCK.x.toFixed(1)}, ${DOCK.y.toFixed(1)});
    vec2 ZBv = vec2(${ZB.x.toFixed(2)}, ${ZB.y.toFixed(2)});
    float zd = sdRR(dp, ZBv, ${ZB.r.toFixed(2)});
    float zs = rrAlong(dp, ZBv, ${ZB.r.toFixed(2)});
    float P = ${ZIP_PERIM.toFixed(2)};
    float ds = abs(mod(zs - uChase * P + P * 0.5, P) - P * 0.5);
    float ring = exp(-abs(zd) * 0.2) * 0.5 + exp(-abs(zd) * 0.05) * 0.1;
    col += uGlowColor * ring * uDockGlow * (0.45 + 1.8 * exp(-ds * 0.02));
  }
  gl_FragColor = vec4(col, h.a * uOpacity);
}`;

const PANEL_VS = /* glsl */ `
uniform float uPeel, uPeelR, uRipAge, uRipAmp, uBulge;
uniform vec2 uPeelDir, uPeelFrom;
varying vec2 vUv;
varying vec2 vP;
varying vec3 vW;
varying float vLift;
${COMMON}
void main(){
  vUv = uv;
  vec3 p = position;
  vP = p.xy;
  float sd = sdRR(p.xy, vec2(${(DOCK.w / 2).toFixed(1)}, ${(DOCK.h / 2).toFixed(1)}), ${DOCK.r.toFixed(1)});
  p.z += uBulge * smoothstep(0.0, -40.0, sd);
  float r = length(p.xy);
  p.z += uRipAmp * sin(r * 0.06 - uRipAge * 38.0) * exp(-uRipAge * 6.0) * step(0.0, uRipAge) * smoothstep(uRipAge * 1100.0 + 40.0, uRipAge * 1100.0 - 40.0, r);
  // page curl: the fold line sweeps from uPeelFrom along uPeelDir; everything behind it rolls over a cylinder
  float lift = 0.0;
  if (uPeel > 0.0) {
    float s = dot(p.xy - uPeelFrom, uPeelDir);
    float L = uPeel * (${Math.hypot(DOCK.w, DOCK.h).toFixed(1)} + 3.14159 * uPeelR);
    if (s < L) {
      float dd = L - s, th = dd / uPeelR, s2, z;
      if (th < 3.14159) { s2 = L - uPeelR * sin(th); z = uPeelR * (1.0 - cos(th)); }
      else { s2 = L + (dd - 3.14159 * uPeelR); z = 2.0 * uPeelR; }
      p.xy += uPeelDir * (s2 - s);
      p.z += z;
      lift = z;
    }
  }
  vLift = lift;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PANEL_FS = /* glsl */ `
uniform sampler2D uArt;
uniform vec3 uL, uKey, uAmb, uRim, uCamPos, uThread, uBack, uGlowColor;
uniform vec3 uTx, uTy;
uniform float uOpacity, uFlash, uZip, uZipStart, uZipGlow;
uniform vec2 uPull;
varying vec2 vUv;
varying vec2 vP;
varying vec3 vW;
varying float vLift;
${COMMON}
void main(){
  vec2 B = vec2(${(DOCK.w / 2).toFixed(1)}, ${(DOCK.h / 2).toFixed(1)});
  float sd = sdRR(vP, B, ${DOCK.r.toFixed(1)});
  float aa = fwidth(sd) * 0.8 + 0.3;
  float alpha = 1.0 - smoothstep(-aa, aa, sd);
  if (alpha <= 0.0) discard;
  vec3 gn = normalize(cross(dFdx(vW), dFdy(vW)));
  if (dot(gn, uCamPos - vW) < 0.0) gn = -gn;
  // padded edge: slope of the panel's rounded-rect pillow, expressed with the panel's world axes
  vec2 eps = vec2(1.0, 0.0);
  vec2 g = vec2(sdRR(vP + eps.xy, B, ${DOCK.r.toFixed(1)}) - sdRR(vP - eps.xy, B, ${DOCK.r.toFixed(1)}), sdRR(vP + eps.yx, B, ${DOCK.r.toFixed(1)}) - sdRR(vP - eps.yx, B, ${DOCK.r.toFixed(1)})) * 0.5;
  float edge = smoothstep(-22.0, 0.0, sd);
  float side = gl_FrontFacing ? 1.0 : -1.0;
  vec3 n = normalize(gn + (uTx * g.x + uTy * g.y) * edge * 1.1 * side);
  // cotton weave
  n += (uTx * (vnoise(vP * 1.3) - 0.5) + uTy * (vnoise(vP * 1.3 + 9.0) - 0.5)) * 0.06;
  n = normalize(n);
  vec3 col;
  if (gl_FrontFacing) {
    vec3 art = texture2D(uArt, vUv).rgb;
    float weave = 0.5 + 0.5 * sin(vP.x * 2.6) * sin(vP.y * 2.6);
    col = art * (0.93 + 0.07 * weave) * (0.96 + 0.08 * vnoise(vP * 0.2));
    // edge stitching (dashed), on the line where the hidden zip runs
    vec2 ZBv = vec2(${ZB.x.toFixed(2)}, ${ZB.y.toFixed(2)});
    float zd = sdRR(vP, ZBv, ${ZB.r.toFixed(2)});
    float P = ${ZIP_PERIM.toFixed(2)};
    float zs = rrAlong(vP, ZBv, ${ZB.r.toFixed(2)});
    float st = smoothstep(1.3, 0.3, abs(zd)) * step(0.42, fract(zs / 7.0));
    col = mix(col, uThread, st * 0.9);
    // zipping on: a light runs round the edge leaving a glowing trail
    float rel = mod(zs - uZipStart + P, P);
    float closed = step(rel, uZip * P);
    float trail = closed * exp(-(uZip * P - rel) * 0.012) * exp(-abs(zd) * 0.18);
    col += uGlowColor * trail * uZipGlow * 2.4;
    col += (uGlowColor * 1.5 + 0.6) * exp(-length(vP - uPull) * 0.09) * uZipGlow * step(uZip, 0.999) * 1.6;
  } else {
    // the back: raw cotton and a woven label
    col = uBack * (0.9 + 0.1 * vnoise(vP * 0.5));
    float lab = step(abs(vP.x), 34.0) * step(abs(vP.y - 140.0), 10.0);
    col = mix(col, vec3(0.03, 0.05, 0.9), lab * 0.9);
  }
  vec3 V = normalize(uCamPos - vW);
  float diff = smoothstep(-0.3, 1.0, dot(n, uL));
  vec3 lit = col * (uAmb * 1.35 + uKey * diff * 0.95);
  lit += uKey * pow(max(dot(reflect(-uL, n), V), 0.0), 10.0) * 0.08;
  lit += uRim * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.8;
  // self-shadow under the curl
  lit *= 1.0 - 0.25 * smoothstep(0.0, 30.0, vLift) * (1.0 - smoothstep(30.0, 120.0, vLift));
  lit = mix(lit, vec3(1.0), uFlash);
  gl_FragColor = vec4(lit, alpha * uOpacity);
}`;

const SHADOW_FS = /* glsl */ `
uniform sampler2D uH;
uniform float uBlur, uOpacity;
uniform vec2 uOff, uSize;
varying vec2 vUv;
varying vec2 vP;
${COMMON}
void main(){
  // vP is hoodie-local; the shadow is clipped to the garment
  float cover = texture2D(uH, vP / 1000.0 + 0.5).a;
  float sd = sdRR(vP - vec2(${DOCK.x.toFixed(1)}, ${DOCK.y.toFixed(1)}) - uOff, uSize * 0.5, ${DOCK.r.toFixed(1)});
  float a = 1.0 - smoothstep(-uBlur, uBlur, sd);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * uOpacity * cover);
}`;

const SHADOW_VS = /* glsl */ `
varying vec2 vUv;
varying vec2 vP;
void main(){ vUv = uv; vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAME_FS = /* glsl */ `
uniform vec3 uL, uKey, uAmb, uGlowColor, uTape, uThread;
uniform float uGlow, uOpacity, uChase;
varying vec2 vUv;
varying vec2 vP;
${COMMON}
void main(){
  // the dock layer on its own: a stitched tape frame (the zip itself stays hidden inside it)
  vec2 ZBv = vec2(${ZB.x.toFixed(2)}, ${ZB.y.toFixed(2)});
  float zd = sdRR(vP, ZBv, ${ZB.r.toFixed(2)});
  float zs = rrAlong(vP, ZBv, ${ZB.r.toFixed(2)});
  float tape = 1.0 - smoothstep(10.0, 11.5, abs(zd));
  vec3 col = uTape * (0.8 + 0.3 * vnoise(vP * 0.8));
  float st = smoothstep(0.9, 0.2, abs(abs(zd) - 6.5)) * step(0.4, fract(zs / 6.0));
  col = mix(col, uThread, st * 0.7);
  float fill = (1.0 - smoothstep(-1.0, 1.0, zd + 10.0)) * 0.06;
  float a = max(tape, fill);
  vec3 c = mix(uThread * 0.6, col, tape);
  float P = ${ZIP_PERIM.toFixed(2)};
  float ds = abs(mod(zs - uChase * P + P * 0.5, P) - P * 0.5);
  float glow = exp(-abs(zd) * 0.12) * (0.4 + 1.6 * exp(-ds * 0.025));
  c = c * (uAmb * 1.2 + uKey * 0.8) + uGlowColor * glow * uGlow;
  a = max(a, min(1.0, glow * uGlow * 0.5));
  gl_FragColor = vec4(c, a * uOpacity);
}`;

// ---------------------------------------------------------------- objects
export interface PanelState {
  art: THREE.Texture | null;
  x: number; y: number; z: number; // offset from the dock centre (hoodie-local)
  rx: number; ry: number; rz: number;
  scale: number;
  peel: number; peelAngle: number; // peel progress 0..1 and the direction it travels (radians, 0 = +x)
  ripAge: number; ripAmp: number;
  opacity: number; flash: number;
  zip: number; zipGlow: number; // how far the zip has run round the edge (0..1, from the bottom centre) and its glow
  shadow: number; // shadow strength multiplier
}
export const panelDefaults = (): PanelState => ({
  art: null, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1, peel: 0, peelAngle: (3 * Math.PI) / 4,
  ripAge: -1, ripAmp: 0, opacity: 1, flash: 0, zip: 1, zipGlow: 0, shadow: 1,
});

export class Panel {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  smat: THREE.ShaderMaterial;
  state = panelDefaults();
  constructor(H: THREE.Texture, light: ReturnType<typeof LIGHT_UNIFORMS>, order: number) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: PANEL_VS, fragmentShader: PANEL_FS, transparent: true, side: THREE.DoubleSide,
      uniforms: {
        ...light, uArt: { value: null }, uOpacity: { value: 1 }, uFlash: { value: 0 },
        uZip: { value: 1 }, uZipStart: { value: ZIP_START }, uZipGlow: { value: 0 }, uPull: { value: new THREE.Vector2() },
        uPeel: { value: 0 }, uPeelR: { value: 34 }, uPeelDir: { value: new THREE.Vector2() }, uPeelFrom: { value: new THREE.Vector2() },
        uRipAge: { value: -1 }, uRipAmp: { value: 0 }, uBulge: { value: 5 },
        uThread: { value: new THREE.Color('#EDE8DE') }, uBack: { value: new THREE.Color('#E6E0D3') }, uGlowColor: { value: new THREE.Color('#3346FF') },
        uTx: { value: new THREE.Vector3(1, 0, 0) }, uTy: { value: new THREE.Vector3(0, 1, 0) },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(DOCK.w, DOCK.h, 90, 110), this.mat);
    this.mesh.renderOrder = order + 1;
    this.smat = new THREE.ShaderMaterial({
      vertexShader: SHADOW_VS, fragmentShader: SHADOW_FS, transparent: true, depthWrite: false,
      uniforms: { uH: { value: H }, uBlur: { value: 6 }, uOpacity: { value: 0.5 }, uOff: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2(DOCK.w, DOCK.h) } },
    });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), this.smat);
    this.shadow.position.z = 0.6;
    this.shadow.renderOrder = order;
  }
  apply(light: ReturnType<typeof LIGHT_UNIFORMS>) {
    const s = this.state, m = this.mesh, u = this.mat.uniforms;
    const on = !!s.art && s.opacity > 0.001;
    m.visible = on;
    this.shadow.visible = on && s.shadow > 0;
    if (!on) return;
    m.position.set(DOCK.x + s.x, DOCK.y + s.y, 2.5 + s.z);
    m.rotation.set(s.rx, s.ry, s.rz);
    m.scale.setScalar(s.scale);
    u.uArt!.value = s.art;
    u.uOpacity!.value = s.opacity;
    u.uFlash!.value = s.flash;
    u.uZip!.value = s.zip;
    u.uZipGlow!.value = s.zipGlow;
    const zp = zipPoint(ZIP_START + Math.min(0.999, s.zip) * ZIP_PERIM);
    u.uPull!.value.set(zp.x, zp.y);
    u.uPeel!.value = s.peel;
    const d = new THREE.Vector2(Math.cos(s.peelAngle), Math.sin(s.peelAngle));
    u.uPeelDir!.value.copy(d);
    // the curl starts at the corner opposite to the direction of travel
    u.uPeelFrom!.value.set(-Math.sign(d.x || 1) * DOCK.w / 2, -Math.sign(d.y || 1) * DOCK.h / 2);
    u.uRipAge!.value = s.ripAge;
    u.uRipAmp!.value = s.ripAmp;
    m.updateMatrixWorld(true);
    const e = m.matrixWorld.elements;
    u.uTx!.value.set(e[0]!, e[1]!, e[2]!).normalize();
    u.uTy!.value.set(e[4]!, e[5]!, e[6]!).normalize();
    // shadow: offset away from the light by the lift, softer as it rises
    const lift = Math.max(0, s.z + 2.5 * (1 - s.peel));
    const L = light.uL.value;
    this.smat.uniforms.uOff!.value.set(s.x - (L.x / L.z) * lift * 0.9, s.y - (L.y / L.z) * lift * 0.9);
    this.smat.uniforms.uBlur!.value = 3 + lift * 0.22;
    this.smat.uniforms.uOpacity!.value = s.shadow * s.opacity * (1 - s.peel * 0.8) * (0.62 / (1 + lift * 0.004));
    this.smat.uniforms.uSize!.value.set(DOCK.w * s.scale, DOCK.h * s.scale);
  }
}

export class Hoodie {
  group = new THREE.Group();
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  frame: THREE.Mesh;
  fmat: THREE.ShaderMaterial;
  panels: Panel[];
  constructor(maps: { H: THREE.Texture; D: THREE.Texture }, light: ReturnType<typeof LIGHT_UNIFORMS>) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: HOODIE_VS, fragmentShader: HOODIE_FS, transparent: true,
      uniforms: {
        ...light, uH: { value: maps.H }, uD: { value: maps.D },
        uColor: { value: new THREE.Color('#38383E') }, uBump: { value: 15 }, uWelt: { value: 1 },
        uDockGlow: { value: 0 }, uGlowColor: { value: new THREE.Color('#3346FF') }, uTabColor: { value: new THREE.Color('#2233CC') },
        uTime: { value: 0 }, uRipAge: { value: -1 }, uRipAmp: { value: 0 }, uOpacity: { value: 1 }, uChase: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), this.mat);
    this.mesh.renderOrder = 0;
    this.group.add(this.mesh);
    this.fmat = new THREE.ShaderMaterial({
      vertexShader: SHADOW_VS, fragmentShader: FRAME_FS, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      uniforms: {
        ...light, uGlow: { value: 0 }, uOpacity: { value: 1 }, uGlowColor: { value: new THREE.Color('#3346FF') },
        uTape: { value: new THREE.Color('#3B3B42') }, uThread: { value: new THREE.Color('#EDE8DE') }, uChase: { value: 0 },
      },
    });
    this.frame = new THREE.Mesh(new THREE.PlaneGeometry(DOCK.w + 40, DOCK.h + 40), this.fmat);
    this.frame.position.set(DOCK.x, DOCK.y, 1.5);
    this.frame.renderOrder = 1;
    this.group.add(this.frame);
    this.panels = [0, 1, 2].map((i) => new Panel(maps.H, light, 2 + i * 2));
    for (const p of this.panels) { this.group.add(p.shadow); this.group.add(p.mesh); }
  }
  reset() {
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.group.visible = true;
    const u = this.mat.uniforms;
    u.uDockGlow!.value = 0;
    u.uChase!.value = 0;
    this.fmat.uniforms.uChase!.value = 0;
    u.uRipAge!.value = -1;
    u.uRipAmp!.value = 0;
    u.uOpacity!.value = 1;
    u.uWelt!.value = 1;
    this.frame.visible = false;
    this.frame.position.set(DOCK.x, DOCK.y, 1.5);
    this.fmat.uniforms.uGlow!.value = 0;
    this.fmat.uniforms.uOpacity!.value = 1;
    for (const p of this.panels) p.state = panelDefaults();
  }
  apply(light: ReturnType<typeof LIGHT_UNIFORMS>) {
    for (const p of this.panels) p.apply(light);
  }
}
