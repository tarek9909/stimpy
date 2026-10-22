/**
 * The 3D engine (builder.md section 5). Plain TypeScript around three.js: no React, no framework imports. It is only
 * ever loaded through a dynamic `import()` (see BuilderCanvas3D), so three.js never reaches the initial JS of `/` or
 * `/builder`.
 */
import {
  AmbientLight,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  Spherical,
  Texture,
  TOUCH,
  UnsignedByteType,
  Vector3,
  WebGLRenderer,
  type Light,
  type Material,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CameraView, FallbackReason, LightingPreset, Tier } from '../types';
import { coverCrop } from '../lib/coverCrop';
import { FrameTimeSampler, frameVerdict, nextLowerTier, type FrameStats } from '../lib/frameSampler';
import { LruCache } from '../lib/lru';
import { anisotropyFor, pixelRatioFor } from '../lib/mode';
import { sampleFromTimestamps, type SwapSample } from '../lib/swapMonitor';
import { ZIP_TOTAL_MS, CROSSFADE_MS, COLOR_FADE_MS, popOffset, zipFrame } from '../lib/zipTimeline';
import { LIGHTING, TONE_MAPPING_EXPOSURE } from './lighting';
import { createSwapPanelMaterial, type PanelUniforms } from './panelMaterial';

export const GLB_TIMEOUT_MS = 15_000;
export const TEXTURE_CACHE_SIZE = 4;
export const CONTEXT_RESTORE_MS = 3_000;
export const MAX_TEXTURE_LONG_SIDE = 2048;
export const LOW_TIER_TEXTURE_WIDTH = 640;
export const POLAR_MIN_DEG = 70;
export const POLAR_MAX_DEG = 100;
export const ROTATE_STEP_DEG = 45;
export const KEY_ROTATE_STEP_DEG = 15;

export class EngineFailure extends Error {
  constructor(
    readonly reason: FallbackReason,
    message: string,
  ) {
    super(message);
    this.name = 'EngineFailure';
  }
}

export class EngineAborted extends Error {
  constructor() {
    super('aborted');
    this.name = 'EngineAborted';
  }
}

export interface EngineArt {
  id: number | string;
  url: string;
  width: number | null;
  height: number | null;
  /** Tried when `url` (a texture override) fails to load: the Stimpie artwork (builder.md test 7). */
  fallbackUrl?: string | null;
}

export interface EngineModel {
  url: string;
  sizeBytes: number;
  backPanelMesh: string;
  panelAspect: number;
  camera: CameraView;
  lighting: LightingPreset;
}

export interface EngineOptions {
  container: HTMLElement;
  model: EngineModel;
  tier: Tier;
  reducedMotion: boolean;
  tint: string;
  fabricTextureUrl: string | null;
  art: EngineArt | null;
  signal: AbortSignal;
  /** Fraction 0..1 (or null when the size is unknown) while the GLB downloads. */
  onProgress?: (fraction: number | null) => void;
  /** Automatic fallback to 2D (the caller switches the view silently). */
  onFallback: (reason: FallbackReason) => void;
  /** A problem that does not change the view (SHADER_PATCH_FAILED): report only. */
  onReport?: (reason: FallbackReason) => void;
  onTierChange?: (tier: Tier) => void;
  onPerf?: (p: { medianFrameMs: number; p95FrameMs: number; tier: Tier }) => void;
  onInteract?: (kind: 'rotate' | 'zoom' | 'reset') => void;
  onSwapDone?: (s: SwapSample) => void;
  /** Test/dashboard override: sample frame times but never switch to 2D because of them. */
  skipFrameVerdict?: boolean;
  /** Simulator: artificial per-frame cost in ms. */
  extraFrameMs?: number;
  /** Expose `window.__stimpyBuilder3d` (tests). */
  debug?: boolean;
  /** Test hook: compile broken GLSL so the cross-fade fallback and SHADER_PATCH_FAILED can be exercised. */
  breakShader?: boolean;
}

export interface EngineHandle {
  readonly canvas: HTMLCanvasElement;
  /** Show a Stimpie on the back panel; animated unless `animate` is false or motion is reduced. */
  showArt(art: EngineArt, animate?: boolean): Promise<void>;
  /** Warm the cache for neighbours (idle, skipped on save-data by the caller). */
  preload(arts: readonly EngineArt[]): void;
  setTint(hex: string, animate?: boolean): void;
  setFabricTexture(url: string | null): void;
  setLighting(preset: LightingPreset): void;
  /** Apply a camera config (also used by the dashboard's live preview). */
  setCameraConfig(view: CameraView, animate?: boolean): void;
  rotateBy(deg: number): void;
  zoomBy(factor: number): void;
  resetView(): void;
  getView(): CameraView;
  setReducedMotion(reduced: boolean): void;
  resize(): void;
  dispose(): void;
}

interface TexEntry {
  texture: Texture;
  id: number | string;
}

interface ModelParts {
  root: Object3D;
  panel: Mesh;
  fabrics: MeshStandardMaterial[];
}

declare global {
  interface Window {
    __stimpyBuilder3d?: unknown;
  }
}

const now = () => performance.now();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });
}

/** The art image, falling back to `fallbackUrl` when the override cannot be loaded. */
function loadArtImage(art: EngineArt): Promise<HTMLImageElement> {
  return loadImage(art.url).catch((e: unknown) => {
    if (art.fallbackUrl && art.fallbackUrl !== art.url) return loadImage(art.fallbackUrl);
    throw e;
  });
}

class NetworkError extends Error {}

async function fetchGlb(url: string, sizeHint: number, signal: AbortSignal, onProgress?: (f: number | null) => void): Promise<ArrayBuffer> {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal.addEventListener('abort', onAbort);
  const timer = setTimeout(() => ctl.abort(), GLB_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(url, { signal: ctl.signal, mode: 'cors' });
    } catch (e) {
      if (signal.aborted) throw new EngineAborted();
      if (ctl.signal.aborted) throw new EngineFailure('GLB_FAILED', 'GLB download timed out');
      throw new NetworkError(e instanceof Error ? e.message : 'network error');
    }
    if (!res.ok) throw new EngineFailure('GLB_FAILED', `GLB request failed with ${res.status}`);
    const total = Number(res.headers.get('content-length')) || sizeHint || 0;
    if (!res.body || typeof res.body.getReader !== 'function') {
      onProgress?.(null);
      return await res.arrayBuffer();
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      let step: ReadableStreamReadResult<Uint8Array>;
      try {
        step = await reader.read();
      } catch (e) {
        if (signal.aborted) throw new EngineAborted();
        if (ctl.signal.aborted) throw new EngineFailure('GLB_FAILED', 'GLB download timed out');
        throw new NetworkError(e instanceof Error ? e.message : 'network error');
      }
      if (step.done) break;
      chunks.push(step.value);
      received += step.value.byteLength;
      onProgress?.(total > 0 ? Math.min(1, received / total) : null);
    }
    const out = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out.buffer;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

/** True when the GLB declares EXT_meshopt_compression (reads only the JSON chunk header). */
export function requiresMeshopt(buffer: ArrayBuffer): boolean {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) return false; // "glTF"
    const jsonLength = view.getUint32(12, true);
    if (view.getUint32(16, true) !== 0x4e4f534a) return false; // "JSON"
    const json = new TextDecoder().decode(new Uint8Array(buffer, 20, Math.min(jsonLength, buffer.byteLength - 20)));
    return json.includes("EXT_meshopt_compression");
  } catch {
    return false;
  }
}

/** Download (one silent retry on a network error only) and parse the GLB; locate the panel and fabric materials. */
async function loadModel(model: EngineModel, signal: AbortSignal, onProgress?: (f: number | null) => void): Promise<ModelParts> {
  let buffer: ArrayBuffer;
  try {
    buffer = await fetchGlb(model.url, model.sizeBytes, signal, onProgress);
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    buffer = await fetchGlb(model.url, model.sizeBytes, signal, onProgress).catch((e2: unknown) => {
      if (e2 instanceof NetworkError) throw new EngineFailure('GLB_FAILED', e2.message);
      throw e2;
    });
  }
  if (signal.aborted) throw new EngineAborted();
  const loader = new GLTFLoader();
  if (requiresMeshopt(buffer)) {
    // Only models compressed with EXT_meshopt_compression need the WASM decoder: it is a separate chunk and
    // WebAssembly compilation needs 'wasm-unsafe-eval' in a strict CSP, so it is never loaded for plain models.
    const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  let gltf;
  try {
    gltf = await loader.parseAsync(buffer, '');
  } catch (e) {
    throw new EngineFailure('GLB_FAILED', e instanceof Error ? e.message : 'invalid glTF');
  }
  const root = gltf.scene;
  const panel = root.getObjectByName(model.backPanelMesh);
  if (!panel || !(panel as Mesh).isMesh) {
    const names: string[] = [];
    root.traverse((o) => {
      if (o.name) names.push(o.name);
    });
    // eslint-disable-next-line no-console -- builder.md 5.2: console warning with the mesh names found
    console.warn(`[builder] back panel mesh "${model.backPanelMesh}" not found. Names in the model: ${names.join(', ')}`);
    throw new EngineFailure('PANEL_MESH_MISSING', `mesh ${model.backPanelMesh} not found`);
  }
  const fabrics = new Set<MeshStandardMaterial>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || m === panel) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (mat.name === 'fabric') fabrics.add(mat as MeshStandardMaterial);
    }
  });
  return { root, panel: panel as Mesh, fabrics: [...fabrics] };
}

function disposeMaterial(m: Material): void {
  for (const v of Object.values(m)) {
    if (v instanceof Texture) v.dispose();
  }
  m.dispose();
}

export async function createEngine(opts: EngineOptions): Promise<EngineHandle> {
  const { container, model, signal } = opts;
  let tier = opts.tier;
  let reduced = opts.reducedMotion;

  // 1. Model and first artwork in parallel. Nothing GPU-side exists yet, so an abort here leaks nothing.
  const [parts, firstImage] = await Promise.all([
    loadModel(model, signal, opts.onProgress),
    opts.art ? loadArtImage(opts.art).catch(() => null) : Promise.resolve(null),
  ]);
  if (signal.aborted) throw new EngineAborted();

  // 2. Renderer (builder.md 5.1). No preserveDrawingBuffer, no shadows, transparent canvas.
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: tier !== 'low', alpha: true, powerPreference: 'high-performance' });
  } catch {
    throw new EngineFailure('WEBGL_UNSUPPORTED', 'could not create a WebGL renderer');
  }
  const canvas = renderer.domElement;
  try {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.setAttribute('data-builder-canvas', '3d');
  canvas.tabIndex = 0;
  container.appendChild(canvas);

  const scene = new Scene();
  const rig = new Group();
  rig.name = 'rig';
  scene.add(rig);
  rig.add(parts.root);

  // ----- lights -----
  let lights: Light[] = [];
  const setLighting = (preset: LightingPreset) => {
    for (const l of lights) scene.remove(l);
    lights = LIGHTING[preset].map((def) => {
      if (def.kind === 'ambient') return new AmbientLight(def.color, def.intensity);
      if (def.kind === 'hemisphere') return new HemisphereLight(def.sky, def.ground, def.intensity);
      const d = new DirectionalLight(def.color, def.intensity);
      d.position.set(def.position[0], def.position[1], def.position[2]);
      return d;
    });
    for (const l of lights) scene.add(l);
  };
  setLighting(model.lighting);

  // ----- camera -----
  let camConfig = model.camera;
  const camera = new PerspectiveCamera(camConfig.fov, 4 / 5, 0.05, 20);
  const target = new Vector3(...camConfig.target);
  camera.position.set(...camConfig.position);
  camera.lookAt(target);
  const baseDistance = () => new Vector3(...camConfig.position).distanceTo(new Vector3(...camConfig.target));

  // ----- body material -----
  for (const m of parts.fabrics) {
    m.roughness = 0.9;
    m.metalness = 0;
    m.color.set(opts.tint);
  }
  let tintAnim: { from: Color; to: Color; start: number } | null = null;

  // ----- panel material -----
  let shaderFailed = false;
  let reportedShader = false;
  const reportShader = () => {
    if (reportedShader) return;
    reportedShader = true;
    opts.onReport?.('SHADER_PATCH_FAILED');
  };
  const swapMat = createSwapPanelMaterial({
    onPatchFailed: () => {
      useFallbackPanel();
    },
    breakOnPurpose: opts.breakShader === true,
  });
  const uniforms: PanelUniforms = swapMat.uniforms;
  const panel = parts.panel;
  const originalPanelMaterial = panel.material;
  let panelMaterial: MeshStandardMaterial = swapMat.material;
  panel.material = panelMaterial;
  if (Array.isArray(originalPanelMaterial)) originalPanelMaterial.forEach((m) => m.dispose());
  else originalPanelMaterial.dispose();

  // Neutral grey placeholder until the first texture is ready (builder.md 5.2 step 6).
  const placeholder = new DataTexture(new Uint8Array([205, 205, 205, 255]), 1, 1, RGBAFormat, UnsignedByteType);
  placeholder.colorSpace = SRGBColorSpace;
  placeholder.needsUpdate = true;
  uniforms.uMapOld.value = placeholder;
  uniforms.uMapNew.value = placeholder;

  renderer.debug.onShaderError = () => {
    useFallbackPanel();
  };

  // Cross-fade fallback (200 ms of material opacity between two textures) when the shader patch fails.
  let underMesh: Mesh | null = null;
  let underMaterial: MeshStandardMaterial | null = null;
  let fade: { start: number; from: TexEntry | null; to: TexEntry } | null = null;
  function useFallbackPanel() {
    if (shaderFailed) return;
    shaderFailed = true;
    reportShader();
    const cur = currentEntry;
    const fallback = new MeshStandardMaterial({ roughness: 0.9, metalness: 0, color: 0xffffff, map: cur ? cur.texture : placeholder });
    fallback.name = 'panel';
    panel.material = fallback;
    swapMat.material.dispose();
    panelMaterial = fallback;
    underMaterial = new MeshStandardMaterial({ roughness: 0.9, metalness: 0, color: 0xffffff, map: cur ? cur.texture : placeholder });
    underMesh = new Mesh(panel.geometry, underMaterial);
    underMesh.visible = false;
    underMesh.renderOrder = -1;
    panel.parent?.add(underMesh);
    request();
  }

  // ----- textures -----
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const lru = new LruCache<number | string, TexEntry>(TEXTURE_CACHE_SIZE, (e) => e.texture.dispose());
  const inflight = new Map<number | string, Promise<TexEntry>>();
  let currentEntry: TexEntry | null = null;
  let currentArtId: number | string | null = null;
  let disposed = false;

  function makeTexture(art: EngineArt, img: HTMLImageElement): TexEntry {
    let source: HTMLImageElement | HTMLCanvasElement = img;
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    const longSide = Math.max(w, h);
    let scale = longSide > MAX_TEXTURE_LONG_SIDE ? MAX_TEXTURE_LONG_SIDE / longSide : 1;
    if (tier === 'low' && w * scale > LOW_TIER_TEXTURE_WIDTH) scale = LOW_TIER_TEXTURE_WIDTH / w;
    if (scale < 1) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      source = c;
    }
    const aw = art.width ?? w;
    const ah = art.height ?? h;
    w = aw;
    h = ah;
    const tex = new Texture(source);
    tex.colorSpace = SRGBColorSpace;
    tex.flipY = false; // the panel UVs follow the glTF convention (origin top-left)
    tex.generateMipmaps = true;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.wrapS = ClampToEdgeWrapping;
    tex.wrapT = ClampToEdgeWrapping;
    tex.anisotropy = anisotropyFor(tier, maxAniso);
    const crop = coverCrop(w, h, model.panelAspect);
    if (crop.needed) {
      tex.repeat.set(crop.repeatX, crop.repeatY);
      tex.offset.set(crop.offsetX, crop.offsetY);
    }
    tex.updateMatrix();
    tex.needsUpdate = true;
    return { texture: tex, id: art.id };
  }

  async function getTexture(art: EngineArt): Promise<TexEntry> {
    const hit = lru.get(art.id);
    if (hit) return hit;
    const running = inflight.get(art.id);
    if (running) return running;
    const p = loadArtImage(art).then((img) => {
      inflight.delete(art.id);
      if (disposed) throw new EngineAborted();
      const entry = makeTexture(art, img);
      lru.set(art.id, entry);
      renderer.initTexture(entry.texture); // upload before the swap starts (no hitch on the first frame)
      return entry;
    });
    p.catch(() => inflight.delete(art.id));
    inflight.set(art.id, p);
    return p;
  }

  const pin = (...ids: (number | string | null)[]) => lru.setPinned(ids.filter((i): i is number | string => i !== null));

  function setBoth(entry: TexEntry) {
    uniforms.uMapOld.value = entry.texture;
    uniforms.uMapNew.value = entry.texture;
    uniforms.uMatOld.value.copy(entry.texture.matrix);
    uniforms.uMatNew.value.copy(entry.texture.matrix);
    uniforms.uProgress.value = 0;
    uniforms.uLine.value = 0;
    uniforms.uPop.value = 0;
    if (shaderFailed) {
      panelMaterial.map = entry.texture;
      panelMaterial.opacity = 1;
      panelMaterial.transparent = false;
      panelMaterial.needsUpdate = true;
      if (underMesh) underMesh.visible = false;
    }
    currentEntry = entry;
    currentArtId = entry.id;
  }

  // ----- swap state machine -----
  let swap: { start: number; to: TexEntry; stamps: number[] } | null = null;
  let artToken = 0;

  function completeSwap(report: boolean) {
    if (!swap) return;
    const s = swap;
    swap = null;
    setBoth(s.to);
    pin(currentArtId);
    if (report) opts.onSwapDone?.(sampleFromTimestamps(s.stamps, now() - s.start));
  }

  async function showArt(art: EngineArt, animate = true): Promise<void> {
    const token = ++artToken;
    if (swap) completeSwap(false); // rapid swapping: finish the running swap instantly, latest wins
    if (currentArtId === art.id) return;
    let entry: TexEntry;
    try {
      entry = await getTexture(art);
    } catch {
      return; // keep the previous art (builder.md test 7)
    }
    if (token !== artToken || disposed) return;
    pin(currentArtId, art.id);
    if (!animate || reduced || !currentEntry) {
      setBoth(entry);
      pin(art.id);
      request();
      return;
    }
    if (shaderFailed) {
      fade = { start: now(), from: currentEntry, to: entry };
      if (underMesh && underMaterial) {
        underMaterial.map = currentEntry.texture;
        underMaterial.needsUpdate = true;
        underMesh.visible = true;
      }
      panelMaterial.map = entry.texture;
      panelMaterial.transparent = true;
      panelMaterial.opacity = 0;
      panelMaterial.needsUpdate = true;
      currentEntry = entry;
      currentArtId = entry.id;
      request();
      return;
    }
    uniforms.uMapNew.value = entry.texture;
    uniforms.uMatNew.value.copy(entry.texture.matrix);
    swap = { start: now(), to: entry, stamps: [] };
    request();
  }

  function preload(arts: readonly EngineArt[]) {
    for (const a of arts) {
      if (lru.has(a.id) || inflight.has(a.id)) continue;
      if (lru.size >= TEXTURE_CACHE_SIZE) break;
      void getTexture(a).catch(() => undefined);
    }
  }

  // first texture
  if (opts.art && firstImage) {
    const entry = makeTexture(opts.art, firstImage);
    lru.set(opts.art.id, entry);
    renderer.initTexture(entry.texture);
    setBoth(entry);
    pin(opts.art.id);
  }

  // ----- controls (builder.md 5.6) -----
  // Wheel only with ctrl: a capture listener registered BEFORE OrbitControls swallows plain wheel events.
  const onWheelCapture = (e: WheelEvent) => {
    if (!e.ctrlKey) e.stopImmediatePropagation();
    else opts.onInteract?.('zoom');
  };
  canvas.addEventListener('wheel', onWheelCapture, { capture: true });
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduced;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.target.copy(target);
  controls.minPolarAngle = MathUtils.degToRad(POLAR_MIN_DEG);
  controls.maxPolarAngle = MathUtils.degToRad(POLAR_MAX_DEG);
  controls.minDistance = baseDistance() * 0.7;
  controls.maxDistance = baseDistance() * 1.3;
  controls.enableZoom = true;
  controls.rotateSpeed = 0.6;
  controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
  controls.update();
  // OrbitControls sets touch-action: none; restore vertical page scrolling (builder.md 5.6).
  canvas.style.touchAction = 'pan-y';

  const pointers = new Set<number>();
  const onPointerDown = (e: PointerEvent) => {
    pointers.add(e.pointerId);
    cancelSway();
    opts.onInteract?.(pointers.size >= 2 ? 'zoom' : 'rotate');
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // Keyboard: OrbitControls' own keys are pan-only (and pan is off), so arrows/+/- are handled here, canvas focus only.
  const onKeyDown = (e: KeyboardEvent) => {
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
        rotateBy(-KEY_ROTATE_STEP_DEG);
        break;
      case 'ArrowRight':
        rotateBy(KEY_ROTATE_STEP_DEG);
        break;
      case 'ArrowUp':
        tiltBy(-8);
        break;
      case 'ArrowDown':
        tiltBy(8);
        break;
      case '+':
      case '=':
        zoomBy(0.85);
        break;
      case '-':
        zoomBy(1.18);
        break;
      case 'Home':
        resetView();
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };
  canvas.addEventListener('keydown', onKeyDown);

  // ----- view tween (rotate / zoom / reset buttons) -----
  interface ViewTween {
    from: Spherical;
    to: Spherical;
    start: number;
    dur: number;
  }
  let viewTween: ViewTween | null = null;
  const sph = (): Spherical => new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const ease = (x: number) => 1 - Math.pow(1 - x, 3);

  function clampSpherical(s: Spherical) {
    s.phi = MathUtils.clamp(s.phi, controls.minPolarAngle, controls.maxPolarAngle);
    s.radius = MathUtils.clamp(s.radius, controls.minDistance, controls.maxDistance);
    return s;
  }

  function tweenTo(to: Spherical, ms: number) {
    cancelSway();
    const from = sph();
    // shortest way round
    const d = ((to.theta - from.theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    to.theta = from.theta + d;
    clampSpherical(to);
    if (reduced || ms <= 0) {
      camera.position.copy(controls.target).add(new Vector3().setFromSpherical(to));
      camera.lookAt(controls.target);
      controls.update();
      viewTween = null;
      request();
      return;
    }
    viewTween = { from, to, start: now(), dur: ms };
    request();
  }

  function rotateBy(deg: number) {
    const to = sph();
    to.theta += MathUtils.degToRad(deg);
    opts.onInteract?.('rotate');
    tweenTo(to, 300);
  }
  function tiltBy(deg: number) {
    const to = sph();
    to.phi += MathUtils.degToRad(deg);
    tweenTo(to, 200);
  }
  function zoomBy(factor: number) {
    const to = sph();
    to.radius *= factor;
    opts.onInteract?.('zoom');
    tweenTo(to, 200);
  }
  function resetView() {
    const c = camConfig;
    controls.target.set(...c.target);
    const to = new Spherical().setFromVector3(new Vector3(...c.position).sub(new Vector3(...c.target)));
    opts.onInteract?.('reset');
    tweenTo(to, 600);
  }

  // ----- idle sway: +/-8 degrees over 2 s once, cancelled by any input, skipped with reduced motion -----
  let sway: { start: number; prev: number } | null = null;
  function cancelSway() {
    sway = null;
  }
  controls.addEventListener('start', () => {
    cancelSway();
    viewTween = null;
  });
  controls.addEventListener('change', () => request());

  // ----- render loop (on demand) -----
  let raf = 0;
  let needsRender = true;
  let inView = true;
  let tabVisible = typeof document === 'undefined' ? true : !document.hidden;
  let lost = false;
  let firstRendered = false;
  let lastNow = 0;
  const sampler = new FrameTimeSampler();
  let sampling: { afterDrop: boolean; last: number | null } | null = null;
  let lastRenderStamp = 0;
  let frameCount = 0;
  let disposedByError = false;

  const canRun = () => !disposed && !disposedByError && !lost && inView && tabVisible;
  function request() {
    if (disposed) return;
    needsRender = true;
    if (!raf && canRun()) raf = requestAnimationFrame(frame);
  }

  function busyWait(ms: number) {
    const end = now() + ms;
    while (now() < end) {
      /* simulator: artificial frame cost */
    }
  }

  function frame(ts: number) {
    raf = 0;
    if (!canRun()) return;
    try {
      frameBody(ts);
    } catch (e) {
      // Uncaught error in the render loop: stop and let the caller fall back to 2D (builder.md 6.2).
      // eslint-disable-next-line no-console -- diagnostics for the one case that should never happen
      console.warn('[builder] render loop error', e);
      disposedByError = true;
      opts.onFallback('WEBGL_UNSUPPORTED');
    }
  }

  function frameBody(ts: number) {
    const t = now();
    lastNow = ts;
    let animating = false;

    if (tintAnim) {
      const k = Math.min(1, (t - tintAnim.start) / COLOR_FADE_MS);
      for (const m of parts.fabrics) m.color.lerpColors(tintAnim.from, tintAnim.to, k);
      if (k >= 1) tintAnim = null;
      else animating = true;
    }
    if (swap) {
      swap.stamps.push(ts);
      const el = t - swap.start;
      const f = zipFrame(el);
      uniforms.uProgress.value = f.progress;
      uniforms.uLine.value = f.lineOpacity;
      uniforms.uPop.value = popOffset(el);
      if (el >= ZIP_TOTAL_MS) completeSwap(true);
      else animating = true;
    }
    if (fade) {
      const k = Math.min(1, (t - fade.start) / CROSSFADE_MS);
      panelMaterial.opacity = k;
      if (k >= 1) {
        panelMaterial.transparent = false;
        panelMaterial.opacity = 1;
        panelMaterial.needsUpdate = true;
        if (underMesh) underMesh.visible = false;
        fade = null;
      } else animating = true;
    }
    if (viewTween) {
      const k = Math.min(1, (t - viewTween.start) / viewTween.dur);
      const e = ease(k);
      const s = new Spherical(
        MathUtils.lerp(viewTween.from.radius, viewTween.to.radius, e),
        MathUtils.lerp(viewTween.from.phi, viewTween.to.phi, e),
        MathUtils.lerp(viewTween.from.theta, viewTween.to.theta, e),
      );
      camera.position.copy(controls.target).add(new Vector3().setFromSpherical(s));
      camera.lookAt(controls.target);
      if (k >= 1) viewTween = null;
      else animating = true;
    }
    if (sway) {
      const el = t - sway.start;
      if (el >= 2000) sway = null;
      else {
        const off = MathUtils.degToRad(8) * Math.sin((2 * Math.PI * el) / 2000);
        const v = camera.position.clone().sub(controls.target);
        v.applyAxisAngle(new Vector3(0, 1, 0), off - sway.prev);
        sway.prev = off;
        camera.position.copy(controls.target).add(v);
        camera.lookAt(controls.target);
        animating = true;
      }
    }
    const moved = controls.update();
    if (moved) animating = true;

    // Frame-time sampling renders continuously for the sampling window.
    if (sampling) animating = true;

    if (needsRender || animating) {
      if (opts.extraFrameMs) busyWait(opts.extraFrameMs);
      renderer.render(scene, camera);
      frameCount += 1;
      needsRender = false;
      if (!firstRendered) {
        firstRendered = true;
        if (!reduced) sway = { start: now(), prev: 0 };
        sampling = { afterDrop: false, last: null };
        sampler.reset();
      }
      lastRenderStamp = ts;
    }

    if (sampling) {
      if (sampling.last !== null && lastRenderStamp === ts) {
        if (sampler.push(ts - sampling.last)) finishSampling();
      }
      if (sampling) sampling.last = ts;
    }

    if (!raf && (animating || needsRender || sampling)) {
      raf = requestAnimationFrame(frame);
    }
  }

  function finishSampling() {
    if (!sampling) return;
    const stats: FrameStats = sampler.stats();
    const afterDrop = sampling.afterDrop;
    const lower = nextLowerTier(tier);
    const verdict = frameVerdict(stats, { canDropTier: lower !== null, afterDrop });
    if (opts.skipFrameVerdict) {
      sampling = null;
      opts.onPerf?.({ medianFrameMs: stats.median, p95FrameMs: stats.p95, tier });
      return;
    }
    if (verdict === 'drop-tier' && lower) {
      tier = lower;
      applyPixelRatio();
      opts.onTierChange?.(tier);
      sampler.reset();
      sampling = { afterDrop: true, last: null };
      return;
    }
    sampling = null;
    if (verdict === 'switch-2d') {
      opts.onFallback('SLOW_FRAMES');
      return;
    }
    opts.onPerf?.({ medianFrameMs: stats.median, p95FrameMs: stats.p95, tier });
  }

  // ----- resize / DPR (builder.md 5.8) -----
  let resizeRaf = 0;
  function applyPixelRatio() {
    renderer.setPixelRatio(pixelRatioFor(tier, window.devicePixelRatio));
    doResize();
  }
  function doResize() {
    resizeRaf = 0;
    if (disposed) return;
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(pixelRatioFor(tier, window.devicePixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    request();
  }
  const ro = new ResizeObserver(() => {
    if (!resizeRaf) resizeRaf = requestAnimationFrame(doResize);
  });
  ro.observe(container);
  doResize();

  // ----- visibility, context loss -----
  const io = new IntersectionObserver(
    (entries) => {
      const e = entries[entries.length - 1];
      if (!e) return;
      inView = e.isIntersecting;
      if (inView) request();
    },
    { threshold: 0.05 },
  );
  io.observe(canvas);
  const onVis = () => {
    tabVisible = !document.hidden;
    if (tabVisible) request();
  };
  document.addEventListener('visibilitychange', onVis);

  let restoreTimer: ReturnType<typeof setTimeout> | null = null;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    restoreTimer = setTimeout(() => {
      if (lost && !disposed) opts.onFallback('CONTEXT_LOST');
    }, CONTEXT_RESTORE_MS);
  };
  const onRestored = () => {
    lost = false;
    if (restoreTimer) clearTimeout(restoreTimer);
    restoreTimer = null;
    for (const k of lru.keys()) {
      const e = lru.peek(k);
      if (e) e.texture.needsUpdate = true;
    }
    request();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // ----- first frame -----
  request();
  renderer.render(scene, camera);
  frameCount += 1;

  // ----- public API -----
  // One fabric texture at a time: a replaced one is disposed (dashboard edits would otherwise leak GPU memory), and only
  // the latest request applies (a slow earlier image must not overwrite a newer choice or a reset to none).
  let fabricTexture: Texture | null = null;
  let fabricToken = 0;
  const handle: EngineHandle = {
    canvas,
    showArt,
    preload,
    setTint(hex, animate = true) {
      const to = new Color().set(hex);
      if (!animate || reduced || parts.fabrics.length === 0) {
        for (const m of parts.fabrics) m.color.copy(to);
        tintAnim = null;
      } else {
        const from = (parts.fabrics[0] as MeshStandardMaterial).color.clone();
        tintAnim = { from, to, start: now() };
      }
      request();
    },
    setFabricTexture(url) {
      const token = ++fabricToken;
      void (async () => {
        let tex: Texture | null = null;
        if (url) {
          try {
            const img = await loadImage(url);
            if (disposed || token !== fabricToken) return;
            tex = new Texture(img);
            tex.colorSpace = SRGBColorSpace;
            tex.flipY = false;
            tex.wrapS = RepeatWrapping;
            tex.wrapT = RepeatWrapping;
            tex.anisotropy = anisotropyFor(tier, maxAniso);
            tex.needsUpdate = true;
          } catch {
            if (disposed || token !== fabricToken) return;
            tex = null;
          }
        }
        for (const m of parts.fabrics) {
          m.map = tex;
          m.needsUpdate = true;
        }
        if (fabricTexture && fabricTexture !== tex) fabricTexture.dispose();
        fabricTexture = tex;
        request();
      })();
    },
    setLighting(preset) {
      setLighting(preset);
      request();
    },
    setCameraConfig(view, animate = false) {
      camConfig = view;
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
      controls.target.set(...view.target);
      controls.minDistance = baseDistance() * 0.7;
      controls.maxDistance = baseDistance() * 1.3;
      const to = new Spherical().setFromVector3(new Vector3(...view.position).sub(new Vector3(...view.target)));
      tweenTo(to, animate ? 600 : 0);
    },
    rotateBy,
    zoomBy,
    resetView,
    getView() {
      return {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        fov: camera.fov,
      };
    },
    setReducedMotion(r) {
      reduced = r;
      controls.enableDamping = !r;
      if (r) {
        sway = null;
        viewTween = null;
      }
    },
    resize() {
      doResize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      if (restoreTimer) clearTimeout(restoreTimer);
      raf = 0;
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('wheel', onWheelCapture, { capture: true });
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) disposeMaterial(mat);
      });
      underMaterial?.dispose();
      lru.clear();
      inflight.clear();
      placeholder.dispose();
      fabricTexture?.dispose();
      fabricTexture = null;
      uniforms.uMapOld.value = null;
      uniforms.uMapNew.value = null;
      for (const l of lights) scene.remove(l);
      lights = [];
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      currentEntry = null;
      swap = null;
      fade = null;
      viewTween = null;
      sway = null;
      sampling = null;
      if (window.__stimpyBuilder3d && (window.__stimpyBuilder3d as { canvas?: unknown }).canvas === canvas) delete window.__stimpyBuilder3d;
    },
  };

  if (opts.debug) {
    window.__stimpyBuilder3d = {
      canvas,
      scene,
      camera,
      renderer,
      controls,
      panel,
      uniforms,
      handle,
      get shaderFailed() {
        return shaderFailed;
      },
      get tier() {
        return tier;
      },
      get frames() {
        return frameCount;
      },
      textureKeys: () => lru.keys(),
      info: () => ({ memory: { ...renderer.info.memory }, render: { ...renderer.info.render }, programs: renderer.info.programs?.length ?? 0 }),
      busy: () => !!(raf || swap || fade || tintAnim || viewTween || sway || sampling),
      lastNow: () => lastNow,
      timeline: { zipFrame, popOffset },
    };
  }

  return handle;
  } catch (e) {
    // Anything that throws while building the scene must not leak a WebGL context.
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    if (e instanceof EngineFailure || e instanceof EngineAborted) throw e;
    throw new EngineFailure('WEBGL_UNSUPPORTED', e instanceof Error ? e.message : 'scene setup failed');
  }
}
