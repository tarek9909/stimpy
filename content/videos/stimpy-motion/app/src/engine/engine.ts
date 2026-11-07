// Frame renderer. A film paints each frame in Canvas 2D (flat, crisp vector art); the frame is uploaded to
// WebGL2, averaged over several sub-frames spread across the shutter (motion blur) in linear light, then
// graded: chromatic aberration on hits, flash, fade, vignette, film grain and dither.
import { loadFonts, releaseAll, setPixelScale, type Ctx } from './draw';
import { loadLogo } from './logo';
import type { Score } from '../audio/score';

export const W = 1080, H = 1920;
/** Reels UI covers roughly the top 250 px and bottom 400 px: key text stays between these. */
export const SAFE = { top: 270, bottom: H - 430, left: 90, right: W - 90 };

export interface Post {
  flash: number; flashColor: string;
  fade: number; fadeColor: string;
  vignette: number; grain: number; ca: number;
  shakeX: number; shakeY: number;
}
export const defaultPost = (): Post => ({ flash: 0, flashColor: '#FFFFFF', fade: 0, fadeColor: '#111111', vignette: 0.12, grain: 0.028, ca: 0, shakeX: 0, shakeY: 0 });

export interface Film {
  id: string;
  title: string;
  duration: number;
  /** designed to loop seamlessly */
  loop?: boolean;
  /** scrubber markers */
  marks: { t: number; label: string }[];
  /** paint the frame at time t (logical 1080×1920 units) and set post parameters */
  draw(c: Ctx, t: number, post: Post): void;
  /** build the soundtrack */
  score(): Score;
}

const VS = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const ACC = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform float uW; in vec2 vUv; out vec4 o;
vec3 lin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main(){ o = vec4(lin(texture(uTex, vUv).rgb) * uW, 1.0); }`;

const POST = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uSeed, uVig, uGrain, uCA, uFlash, uFade;
uniform vec3 uFlashColor, uFadeColor;
uniform vec2 uRes;
in vec2 vUv; out vec4 o;
float h(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 srgb(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 lin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void main(){
  vec2 d = vUv - 0.5;
  vec2 off = d * uCA * 0.006;
  vec3 c = vec3(texture(uTex, vUv + off).r, texture(uTex, vUv).g, texture(uTex, vUv - off).b);
  c = mix(c, lin(uFlashColor), uFlash);
  c = mix(c, lin(uFadeColor), uFade);
  float v = 1.0 - uVig * smoothstep(0.3, 1.0, length(d * vec2(1.0, 0.75)) * 1.35);
  c *= v;
  vec3 s = srgb(c);
  vec2 px = vUv * uRes;
  float g = h(px + uSeed * 91.7) + h(px * 1.37 - uSeed * 17.3) - 1.0;
  float l = dot(s, vec3(0.299, 0.587, 0.114));
  s += g * uGrain * (0.4 + 0.6 * (1.0 - abs(l - 0.5) * 2.0));
  s += (h(px + 3.1 + uSeed) - 0.5) / 255.0;
  o = vec4(s, 1.0);
}`;

function hex3(hex: string): [number, number, number] {
  const p = parseInt(hex.replace('#', ''), 16);
  return [((p >> 16) & 255) / 255, ((p >> 8) & 255) / 255, (p & 255) / 255];
}

export class Engine {
  readonly PW: number;
  readonly PH: number;
  gl: WebGL2RenderingContext;
  frame: HTMLCanvasElement;
  c: Ctx;
  film!: Film;
  errors: string[] = [];
  post: Post = defaultPost();
  private tex: WebGLTexture;
  private accTex: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private accProg: WebGLProgram;
  private postProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;

  constructor(canvas: HTMLCanvasElement, readonly scale = 1) {
    this.PW = W * scale; this.PH = H * scale;
    canvas.width = this.PW; canvas.height = this.PH;
    setPixelScale(scale);
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.frame = document.createElement('canvas');
    this.frame.width = this.PW; this.frame.height = this.PH;
    this.c = this.frame.getContext('2d', { alpha: false })!;
    const float = !!gl.getExtension('EXT_color_buffer_float');
    const mk = (fs: string) => {
      const p = gl.createProgram()!;
      for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]] as const) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
        gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
      return p;
    };
    this.accProg = mk(ACC);
    this.postProg = mk(POST);
    this.vao = gl.createVertexArray()!;
    const tex = (internal: number, format: number, type: number) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, this.PW, this.PH, 0, format, type, null);
      return t;
    };
    this.tex = tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.accTex = float ? tex(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT) : tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  static async loadAssets() {
    await loadFonts();
    await loadLogo();
  }

  setFilm(f: Film) { this.film = f; this.errors = []; }

  /** Paint the film at t into the 2D frame; returns its post parameters. */
  paint(t: number): Post {
    const c = this.c, f = this.film;
    const post = defaultPost();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.fillStyle = '#111111';
    c.fillRect(0, 0, this.PW, this.PH);
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    try {
      c.save();
      f.draw(c, t, post);
      c.restore();
    } catch (e: any) {
      const msg = `[${f.id} @ ${t.toFixed(3)}] ${e?.stack ?? e}`;
      if (!this.errors.includes(msg) && this.errors.length < 20) { this.errors.push(msg); console.error(msg); }
    }
    releaseAll();
    // camera shake: shift the whole painted frame
    if (post.shakeX || post.shakeY) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(this.frame, post.shakeX * this.scale, post.shakeY * this.scale);
    }
    return post;
  }

  /** Render the frame at t: `samples` sub-frames spread over `shutter` × dt, graded to the canvas. */
  render(t: number, dt = 1 / 60, samples = 1, shutter = 0.5) {
    const gl = this.gl;
    const n = Math.max(1, Math.round(samples));
    gl.viewport(0, 0, this.PW, this.PH);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.accProg);
    gl.uniform1i(gl.getUniformLocation(this.accProg, 'uTex'), 0);
    gl.uniform1f(gl.getUniformLocation(this.accProg, 'uW'), 1 / n);
    let post = this.post;
    for (let i = 0; i < n; i++) {
      const ts = n === 1 ? t : t + ((i + 0.5) / n - 0.5) * shutter * dt;
      const p = this.paint(Math.max(0, Math.min(this.film.duration - 1e-4, ts)));
      if (i === Math.floor(n / 2)) post = p;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.frame);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    this.post = post;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.postProg);
    const u = (k: string) => gl.getUniformLocation(this.postProg, k);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accTex);
    gl.uniform1i(u('uTex'), 0);
    gl.uniform1f(u('uSeed'), (Math.round(t * 60) % 997) + 0.37);
    gl.uniform1f(u('uVig'), post.vignette);
    gl.uniform1f(u('uGrain'), post.grain);
    gl.uniform1f(u('uCA'), post.ca);
    gl.uniform1f(u('uFlash'), post.flash);
    gl.uniform1f(u('uFade'), post.fade);
    gl.uniform3fv(u('uFlashColor'), hex3(post.flashColor));
    gl.uniform3fv(u('uFadeColor'), hex3(post.fadeColor));
    gl.uniform2f(u('uRes'), this.PW, this.PH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return n;
  }

  readPixels(buf: Uint8Array) {
    const gl = this.gl;
    gl.readPixels(0, 0, this.PW, this.PH, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  }
}
