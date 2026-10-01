// WebGL2 post: bloom (threshold -> 2x separable blur at quarter res), chromatic
// aberration, flash, vignette, film grain. Input is the 2D canvas of the frame.
import type { Post } from './scene';

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const BRIGHT = `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D src;
void main(){
  vec3 c = texture(src, uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(0.55, 1.0, l), 1.);
}`;

const BLUR = `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D src; uniform vec2 dir;
void main(){
  float w[5] = float[](0.227, 0.194, 0.121, 0.054, 0.016);
  vec3 c = texture(src, uv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    c += texture(src, uv + dir * float(i)).rgb * w[i];
    c += texture(src, uv - dir * float(i)).rgb * w[i];
  }
  o = vec4(c, 1.);
}`;

const COMP = `#version 300 es
precision highp float; in vec2 uv; out vec4 o;
uniform sampler2D src; uniform sampler2D bloomA; uniform sampler2D bloomB;
uniform float ca, bloom, grain, vig, flash, fade, seed; uniform vec3 flashCol; uniform vec2 res;
float h(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec2 d = uv - 0.5;
  vec2 off = d * ca;
  vec3 c;
  c.r = texture(src, uv - off).r;
  c.g = texture(src, uv).g;
  c.b = texture(src, uv + off).b;
  vec3 b = texture(bloomA, uv).rgb * 0.6 + texture(bloomB, uv).rgb * 0.8;
  c += b * bloom * vec3(1.0, 0.92, 0.88);
  c = mix(c, flashCol, clamp(flash, 0., 1.));
  float v = smoothstep(0.95, 0.25, length(d * vec2(0.9, 1.1)));
  c *= mix(1.0 - vig, 1.0, v);
  // soft grain: two octaves, strongest in the mid-tones, kept out of deep blacks
  float g = (h(uv * res + seed) - 0.5) * 0.6 + (h(floor(uv * res * 0.5) + seed * 1.7) - 0.5) * 0.4;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c += g * grain * (0.25 + 3.0 * lum * (1.0 - lum));
  o = vec4(c * fade, 1.);
}`;

// area-filtered downscale (preview): average a 4x4 grid across each output pixel's footprint
const DOWN = `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D src; uniform vec2 texel; uniform vec2 foot;
void main(){
  vec3 c = vec3(0.);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    vec2 d = (vec2(float(x), float(y)) - 1.5) / 4.0 * foot * texel;
    c += texture(src, uv + d).rgb;
  }
  o = vec4(c / 16., 1.);
}`;

export class PostFX {
  gl: WebGL2RenderingContext;
  private tex: WebGLTexture;
  private progs: Record<string, WebGLProgram> = {};
  private fbs: { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }[] = [];

  private full: { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number } | null = null;
  outW: number;
  outH: number;

  constructor(public canvas: HTMLCanvasElement, public W: number, public H: number) {
    canvas.width = W;
    canvas.height = H;
    this.outW = W;
    this.outH = H;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false })!;
    this.gl = gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const [k, fs] of Object.entries({ bright: BRIGHT, blur: BLUR, comp: COMP, down: DOWN })) this.progs[k] = this.program(VS, fs);
    this.tex = this.makeTex(W, H);
    // quarter-res ping-pong x2, eighth-res ping-pong x2
    for (const div of [4, 4, 8, 8]) this.fbs.push(this.makeFb(Math.ceil(W / div), Math.ceil(H / div)));
  }

  /** Display size. Smaller than W x H = render full-res, then filter down. */
  setOutput(w: number, h: number) {
    w = Math.min(this.W, Math.round(w));
    h = Math.min(this.H, Math.round(h));
    if (w === this.outW && h === this.outH) return;
    this.outW = w;
    this.outH = h;
    this.canvas.width = w;
    this.canvas.height = h;
    if (!this.full && (w < this.W || h < this.H)) this.full = this.makeFb(this.W, this.H);
  }

  private program(vs: string, fs: string) {
    const gl = this.gl;
    const p = gl.createProgram()!;
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    return p;
  }
  private makeTex(w: number, h: number) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  private makeFb(w: number, h: number) {
    const gl = this.gl;
    const tex = this.makeTex(w, h);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h };
  }
  private pass(prog: string, target: (typeof this.fbs)[number] | null, texs: WebGLTexture[], uni: (p: WebGLProgram) => void) {
    const gl = this.gl;
    const p = this.progs[prog];
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : this.outW, target ? target.h : this.outH);
    const names = ['src', 'bloomA', 'bloomB'];
    texs.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(gl.getUniformLocation(p, names[i]), i);
    });
    uni(p);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  render(src: HTMLCanvasElement, post: Post, frame: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const [a, b, c2, d] = this.fbs;
    const noop = () => {};
    const blur = (from: WebGLTexture, to: (typeof this.fbs)[number], dx: number, dy: number) =>
      this.pass('blur', to, [from], (p) => gl.uniform2f(gl.getUniformLocation(p, 'dir'), dx / to.w, dy / to.h));
    this.pass('bright', a, [this.tex], noop);
    blur(a.tex, b, 1.5, 0);
    blur(b.tex, a, 0, 1.5);
    this.pass('bright', c2, [a.tex], noop);
    blur(c2.tex, d, 2, 0);
    blur(d.tex, c2, 0, 2);
    const scaled = this.full && (this.outW < this.W || this.outH < this.H);
    this.pass('comp', scaled ? this.full : null, [this.tex, a.tex, c2.tex], (p) => {
      const u = (n: string) => gl.getUniformLocation(p, n);
      gl.uniform1f(u('ca'), post.ca);
      gl.uniform1f(u('bloom'), post.bloom);
      gl.uniform1f(u('grain'), post.grain);
      gl.uniform1f(u('vig'), post.vignette);
      gl.uniform1f(u('flash'), post.flash);
      gl.uniform1f(u('fade'), post.fade);
      gl.uniform1f(u('seed'), (frame % 97) * 13.37);
      gl.uniform3f(u('flashCol'), ...post.flashColor);
      gl.uniform2f(u('res'), this.W, this.H);
    });
    if (scaled) {
      this.pass('down', null, [this.full!.tex], (p) => {
        gl.uniform2f(gl.getUniformLocation(p, 'texel'), 1 / this.W, 1 / this.H);
        gl.uniform2f(gl.getUniformLocation(p, 'foot'), this.W / this.outW, this.H / this.outH);
      });
    }
  }
}
