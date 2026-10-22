// Frame renderer: draws the active scene into a multisampled HDR target, averages sub-frames spread over
// a shutter interval (motion blur), then grades the result (chromatic aberration, vignette, film grain,
// flash / fade) into the canvas.
import * as THREE from 'three';
import { PW, PH } from './gl';
import { Stage } from './stage';
import { loadFonts } from './draw2d';
import { loadStimpies } from '../art/designs';

export interface SceneDef { id: string; start: number; end: number; draw: (S: Stage, t: number) => void }

const QUAD_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const ACC_FS = /* glsl */ `
uniform sampler2D uTex; uniform float uW; varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(uTex, vUv).rgb * uW, 1.0); }`;

const POST_FS = /* glsl */ `
uniform sampler2D uTex;
uniform float uSeed, uVig, uGrain, uCA, uFlash, uFade;
uniform vec3 uFlashColor;
uniform vec2 uRes;
varying vec2 vUv;
float h(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec2 d = vUv - 0.5;
  vec2 o = d * uCA * 0.004;
  vec3 c = vec3(texture2D(uTex, vUv + o).r, texture2D(uTex, vUv).g, texture2D(uTex, vUv - o).b);
  c = mix(c, uFlashColor, uFlash);
  float v = 1.0 - uVig * smoothstep(0.25, 0.95, length(d * vec2(1.0, 0.8)) * 1.25);
  c *= v;
  c *= 1.0 - uFade;
  vec3 s = toSRGB(c);
  // film grain in display space, strongest in the mids
  vec2 px = vUv * uRes;
  float g = h(px + uSeed * 91.7) + h(px * 1.37 - uSeed * 17.3) - 1.0;
  float lum = dot(s, vec3(0.299, 0.587, 0.114));
  s += g * uGrain * (0.35 + 0.65 * (1.0 - abs(lum - 0.5) * 2.0));
  s += (h(px + 3.1 + uSeed) - 0.5) / 255.0; // dither
  gl_FragColor = vec4(s, 1.0);
}`;

export class Engine {
  renderer: THREE.WebGLRenderer;
  stage = new Stage();
  timeline: SceneDef[] = [];
  duration = 60;
  errors: string[] = [];
  private msRT: THREE.WebGLRenderTarget;
  private accRT: THREE.WebGLRenderTarget;
  private accScene = new THREE.Scene();
  private accMat: THREE.ShaderMaterial;
  private postScene = new THREE.Scene();
  private postMat: THREE.ShaderMaterial;
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PW, PH, false);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the post pass encodes sRGB itself
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.msRT = new THREE.WebGLRenderTarget(PW, PH, { type: THREE.HalfFloatType, samples: 4, colorSpace: THREE.LinearSRGBColorSpace });
    this.accRT = new THREE.WebGLRenderTarget(PW, PH, { type: THREE.FloatType, depthBuffer: false });
    this.accMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: ACC_FS, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      uniforms: { uTex: { value: this.msRT.texture }, uW: { value: 1 } },
    });
    this.accScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.accMat));
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
      uniforms: {
        uTex: { value: this.accRT.texture }, uSeed: { value: 0 }, uVig: { value: 0.35 }, uGrain: { value: 0.05 }, uCA: { value: 0.6 },
        uFlash: { value: 0 }, uFade: { value: 0 }, uFlashColor: { value: new THREE.Color() }, uRes: { value: new THREE.Vector2(PW, PH) },
      },
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
  }

  async init(timeline: SceneDef[], duration: number) {
    await loadFonts();
    await loadStimpies();
    this.stage.init(this.renderer);
    this.timeline = timeline;
    this.duration = duration;
    // compile every shader up front
    this.renderer.compile(this.stage.scene, this.stage.camera);
  }

  sceneAt(t: number) {
    return this.timeline.find((s) => t >= s.start && t < s.end) ?? this.timeline[this.timeline.length - 1]!;
  }

  private drawScene(t: number) {
    const S = this.stage, r = this.renderer;
    S.reset(t);
    const sc = this.sceneAt(t);
    try { sc.draw(S, t); } catch (e: any) {
      const msg = `[${sc.id} @ ${t.toFixed(2)}] ${e?.stack ?? e}`;
      if (!this.errors.includes(msg)) { this.errors.push(msg); console.error(msg); }
    }
    S.finish();
    r.setRenderTarget(this.msRT);
    r.setClearColor(S.clear, 1);
    r.clear(true, true, true);
    if (S.bg.used) r.render(S.bg.scene, this.quadCam);
    r.clearDepth();
    r.render(S.scene, S.camera);
    if (S.fg.used) r.render(S.fg.scene, this.quadCam);
  }

  /** Render the frame at t: `samples` sub-frames spread over `shutter` × dt, graded into the canvas. */
  render(t: number, dt = 1 / 60, samples = 1, shutter = 0.5) {
    const r = this.renderer;
    const n = Math.max(1, Math.round(samples));
    r.setRenderTarget(this.accRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, false, false);
    for (let i = 0; i < n; i++) {
      const ts = n === 1 ? t : t + ((i + 0.5) / n - 0.5) * shutter * dt;
      this.drawScene(Math.max(0, ts));
      this.accMat.uniforms.uW!.value = 1 / n;
      r.setRenderTarget(this.accRT);
      r.render(this.accScene, this.quadCam);
    }
    // post parameters come from the frame's centre time
    if (n > 1) { const S = this.stage; S.reset(t); try { this.sceneAt(t).draw(S, t); } catch { /* reported above */ } }
    const p = this.stage.post, u = this.postMat.uniforms;
    u.uSeed!.value = (Math.round(t * 60) % 997) + 0.37;
    u.uVig!.value = p.vignette; u.uGrain!.value = p.grain; u.uCA!.value = p.ca;
    u.uFlash!.value = p.flash; u.uFade!.value = p.fade; u.uFlashColor!.value.copy(p.flashColor);
    r.setRenderTarget(null);
    r.render(this.postScene, this.quadCam);
    return n;
  }

  readPixels(buf: Uint8Array) {
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, PW, PH, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }
}
