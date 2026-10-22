// Collectible Stimpie cards for the collection wall: rounded cards with a holographic foil that shifts with
// their tilt, and a shared back.
import * as THREE from 'three';

export const CARD = { w: 240, h: 336, r: 14 };

const VS = /* glsl */ `
varying vec2 vUv;
varying vec2 vP;
varying vec3 vW;
varying vec3 vN;
void main(){
  vUv = uv; vP = position.xy;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FS = /* glsl */ `
uniform sampler2D uFront, uBack;
uniform vec3 uCamPos, uL;
uniform float uOpacity, uHolo, uGlint, uLift;
varying vec2 vUv;
varying vec2 vP;
varying vec3 vW;
varying vec3 vN;
float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 rainbow(float t){ return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void main(){
  vec2 B = vec2(${(CARD.w / 2).toFixed(1)}, ${(CARD.h / 2).toFixed(1)});
  float sd = sdRR(vP, B, ${CARD.r.toFixed(1)});
  float aa = fwidth(sd) + 0.2;
  float a = 1.0 - smoothstep(-aa, aa, sd);
  if (a <= 0.0) discard;
  vec3 V = normalize(uCamPos - vW);
  vec3 n = gl_FrontFacing ? vN : -vN;
  float facing = dot(n, V);
  vec3 col;
  if (gl_FrontFacing) {
    // the face is just the picture
    vec4 face = texture2D(uFront, vUv);
    a *= face.a;
    if (a <= 0.0) discard;
    col = face.rgb;
    // foil: strongest on the border, a whisper over the art
    vec2 inner = abs(vP - vec2(0.0, 18.0)) - vec2(108.0, 131.0);
    float border = step(0.0, max(inner.x, inner.y));
    float band = vUv.x * 0.9 + vUv.y * 0.7 + (n.x * 1.7 - n.y * 1.3) + uGlint * 0.6;
    vec3 foil = rainbow(band) * (0.8 + 0.4 * h21(floor(vP * 0.7)));
    col = mix(col, col * 0.55 + foil * 0.75, uHolo * mix(0.12, 0.55, border));
    // moving specular glint
    float g = exp(-pow((vUv.x - vUv.y * 0.5 - (fract(uGlint) * 2.2 - 0.6)) * 7.0, 2.0));
    col += vec3(1.0) * g * 0.35 * uHolo;
  } else {
    col = texture2D(uBack, vec2(1.0 - vUv.x, vUv.y)).rgb;
  }
  float diff = smoothstep(-0.2, 1.0, dot(n, uL));
  col *= 0.78 + 0.3 * diff;
  col *= 0.8 + 0.2 * smoothstep(0.0, 0.6, facing);
  gl_FragColor = vec4(col, a * uOpacity);
}`;

export interface CardState { x: number; y: number; z: number; rx: number; ry: number; rz: number; scale: number; opacity: number; glint: number; visible: boolean }

export class Cards {
  group = new THREE.Group();
  meshes: THREE.Mesh[] = [];
  mats: THREE.ShaderMaterial[] = [];
  constructor(fronts: THREE.Texture[], back: THREE.Texture, light: { uL: { value: THREE.Vector3 }; uCamPos: { value: THREE.Vector3 } }) {
    const geo = new THREE.PlaneGeometry(CARD.w, CARD.h);
    fronts.forEach((f, i) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS, transparent: true, side: THREE.DoubleSide,
        uniforms: { uFront: { value: f }, uBack: { value: back }, uCamPos: light.uCamPos, uL: light.uL, uOpacity: { value: 1 }, uHolo: { value: 1 }, uGlint: { value: 0 }, uLift: { value: 0 } },
      });
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 20 + i;
      this.meshes.push(m);
      this.mats.push(mat);
      this.group.add(m);
    });
  }
  reset() {
    this.group.visible = false;
    this.group.position.set(0, 0, 0);
    this.group.rotation.set(0, 0, 0);
    for (const m of this.meshes) m.visible = false;
  }
  set(i: number, s: Partial<CardState>) {
    const m = this.meshes[i]!, u = this.mats[i]!.uniforms;
    this.group.visible = true;
    m.visible = s.visible ?? true;
    m.position.set(s.x ?? 0, s.y ?? 0, s.z ?? 0);
    m.rotation.set(s.rx ?? 0, s.ry ?? 0, s.rz ?? 0);
    m.scale.setScalar(s.scale ?? 1);
    u.uOpacity!.value = s.opacity ?? 1;
    u.uGlint!.value = s.glint ?? 0;
  }
}
