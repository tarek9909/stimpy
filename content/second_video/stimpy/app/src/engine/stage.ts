// The stage: everything a scene can drive in one frame. Scenes are stateless: each frame starts from
// reset() and the active scene sets the camera, the hoodie, the panels, the cards, the two canvas layers
// (background behind the 3D, foreground over it) and the post-process parameters.
import * as THREE from 'three';
import { W, H, PW, PH, SCALE, FOV, DIST } from './gl';
import { Hoodie, LIGHT_UNIFORMS, buildHoodieMaps, DOCK } from './hoodie';
import { Cards } from './cards';
import { DESIGNS, MINE, renderDesign, renderCard, renderCardBack, renderCardBlank, type Design } from '../art/designs';

export interface Layer { cv: HTMLCanvasElement; c: CanvasRenderingContext2D; tex: THREE.CanvasTexture; scene: THREE.Scene; used: boolean }

function layer(): Layer {
  const cv = document.createElement('canvas');
  cv.width = PW; cv.height = PH;
  const c = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  const scene = new THREE.Scene();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  scene.add(m);
  return { cv, c, tex, scene, used: false };
}

export interface Post { flash: number; flashColor: THREE.Color; fade: number; vignette: number; grain: number; ca: number; shake: number }

export class Stage {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, W / H, 10, 20000);
  ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  bg = layer();
  fg = layer();
  clear = new THREE.Color('#111');
  light = LIGHT_UNIFORMS();
  hoodie!: Hoodie;
  cards!: Cards;
  designs: Design[] = DESIGNS;
  mine: Design = MINE;
  art: THREE.Texture[] = [];     // DESIGNS[i] core colourway
  artAlt: THREE.Texture[] = [];  // DESIGNS[i] alternate colourway
  artMine!: THREE.Texture;
  artCanvas: HTMLCanvasElement[] = [];
  mineCanvas!: HTMLCanvasElement;
  post: Post = { flash: 0, flashColor: new THREE.Color(1, 1, 1), fade: 0, vignette: 0.35, grain: 0.05, ca: 0.6, shake: 0 };
  t = 0;

  init(renderer: THREE.WebGLRenderer) {
    const maps = buildHoodieMaps();
    this.hoodie = new Hoodie(maps, this.light);
    this.scene.add(this.hoodie.group);
    const tex = (cv: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    };
    const fronts: THREE.Texture[] = [];
    for (const d of DESIGNS) {
      const a = renderDesign(d, 0), b = renderDesign(d, 1);
      this.artCanvas.push(a);
      this.art.push(tex(a));
      this.artAlt.push(tex(b));
      fronts.push(tex(renderCard(a)), tex(renderCard(b)));
    }
    fronts.splice(11, 1, tex(renderCardBlank())); // 11 designs + the empty 'yours' slot
    this.mineCanvas = renderDesign(MINE, 0);
    this.artMine = tex(this.mineCanvas);
    this.cards = new Cards(fronts, tex(renderCardBack()), this.light);
    this.scene.add(this.cards.group);
    // pre-upload every texture so the first frame of a scene doesn't stall
    for (const t of [...this.art, ...this.artAlt, this.artMine, ...fronts]) renderer.initTexture(t);
  }

  reset(t: number) {
    this.t = t;
    this.clear.set('#111114');
    this.cam({});
    this.hoodie.reset();
    this.cards.reset();
    this.bg.used = this.fg.used = false;
    const L = this.light;
    L.uL.value.set(-0.45, 0.55, 0.7).normalize();
    L.uKey.value.setRGB(1.0, 0.97, 0.92);
    L.uAmb.value.setRGB(0.2, 0.21, 0.24);
    L.uRim.value.setRGB(0.1, 0.1, 0.12);
    Object.assign(this.post, { flash: 0, fade: 0, vignette: 0.35, grain: 0.05, ca: 0.6, shake: 0 });
    this.post.flashColor.setRGB(1, 1, 1);
  }

  /** Orbit camera: looks at (tx, ty, tz) from `dist` away, rotated by yaw/pitch (radians), rolled by roll. */
  cam(o: { tx?: number; ty?: number; tz?: number; dist?: number; yaw?: number; pitch?: number; roll?: number; fov?: number }) {
    const { tx = 0, ty = 0, tz = 0, dist = DIST, yaw = 0, pitch = 0, roll = 0, fov = FOV } = o;
    const c = this.camera;
    if (c.fov !== fov) { c.fov = fov; c.updateProjectionMatrix(); }
    c.position.set(tx + dist * Math.sin(yaw) * Math.cos(pitch), ty + dist * Math.sin(pitch), tz + dist * Math.cos(yaw) * Math.cos(pitch));
    c.up.set(Math.sin(roll), Math.cos(roll), 0);
    c.lookAt(tx, ty, tz);
    c.updateMatrixWorld(true);
    this.light.uCamPos.value.copy(c.position);
  }

  /** Canvas layer behind the 3D (cleared, in logical px). */
  bgc() { return this.begin(this.bg); }
  /** Canvas layer over the 3D (cleared, in logical px). */
  fgc() { return this.begin(this.fg); }
  private begin(l: Layer) {
    if (!l.used) {
      l.used = true;
      l.c.setTransform(1, 0, 0, 1, 0, 0);
      l.c.clearRect(0, 0, PW, PH);
      l.c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      l.c.globalAlpha = 1;
      l.c.globalCompositeOperation = 'source-over';
    }
    return l.c;
  }

  /** Screen position (logical px) of a point in hoodie-local units (after the hoodie's transform). */
  project(x: number, y: number, z = 0, obj: THREE.Object3D = this.hoodie.group): [number, number] {
    obj.updateMatrixWorld(true);
    const v = new THREE.Vector3(x, y, z).applyMatrix4(obj.matrixWorld).project(this.camera);
    return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H];
  }
  /** Screen position of a corner / point on the dock (panel-local units, relative to the dock centre). */
  projectDock(x: number, y: number, z = 0) { return this.project(DOCK.x + x, DOCK.y + y, z); }

  finish() {
    this.hoodie.apply(this.light);
    for (const l of [this.bg, this.fg]) if (l.used) l.tex.needsUpdate = true;
  }
}
