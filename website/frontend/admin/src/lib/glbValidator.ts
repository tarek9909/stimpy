/**
 * Browser port of the hoodie GLB validator (docs/website/frontend/builder.md section 7.1).
 * Adapted from `tools/hoodie-model/validate.mjs` (the Stimpy hoodie-model toolchain, dependency-free):
 * the checks, limits and messages are the same; `Buffer` is replaced by `Uint8Array` + `DataView`, and the
 * stats additionally list node names, mesh names and skin/animation counts for the dashboard's report.
 * The container is parsed by hand (no GLTFLoader), so the report works without loading three.js.
 *
 * `validateHoodieGlb(bytes, { panelMesh })` -> `{ ok, errors, warnings, stats }`.
 */

export const GLB_LIMITS = {
  trisTarget: 40000,
  trisHard: 80000,
  bytesTarget: 2.5 * 1024 * 1024,
  bytesHard: 5 * 1024 * 1024,
  panelTrisMin: 800,
  panelTrisMax: 2000,
  panelAspect: 0.64,
  panelAspectTol: 0.01,
  heightMin: 0.6,
  heightMax: 0.9,
} as const;

const ALLOWED_EXT = new Set(['EXT_meshopt_compression', 'KHR_draco_mesh_compression', 'KHR_materials_sheen']);
const COMP: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export interface GlbStats {
  sizeBytes: number;
  totalTriangles?: number;
  materials?: string[];
  meshes?: Record<string, { triangles: number; materials: string[] }>;
  nodeNames?: string[];
  /** Names of the nodes that carry a mesh: the candidates for the back-panel mesh dropdown. */
  meshNodeNames?: string[];
  meshNames?: string[];
  skins?: number;
  animations?: number;
  extensionsUsed?: string[];
  bbox?: { min: number[]; max: number[]; size: number[] };
  panel?: { triangles: number; width: number; height: number; aspect: number; centroid: number[] };
}

export interface GlbReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: GlbStats;
}

type Vec = number[];
// glTF JSON is untyped input from a user's file; the checks below probe it defensively.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export function validateHoodieGlb(input: ArrayBuffer | Uint8Array, opts: { panelMesh?: string } = {}): GlbReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats: GlbStats = { sizeBytes: 0 };
  const err = (m: string) => errors.push(m);
  const warn = (m: string) => warnings.push(m);
  const panelName = opts.panelMesh || 'back_panel';
  const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
  stats.sizeBytes = buf.length;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  if (buf.length < 28 || dv.getUint32(0, true) !== 0x46546c67) return { ok: false, errors: ['Not a GLB (bad magic)'], warnings, stats };
  if (dv.getUint32(4, true) !== 2) err('glTF container version is not 2');
  if (dv.getUint32(8, true) !== buf.length) err('GLB header length does not match file size');
  let off = 12;
  let json: Json = null;
  let bin: Uint8Array | null = null;
  while (off + 8 <= buf.length) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) {
      try {
        json = JSON.parse(new TextDecoder().decode(data));
      } catch {
        return { ok: false, errors: ['The JSON chunk is not valid JSON'], warnings, stats };
      }
    } else if (type === 0x004e4942 && !bin) bin = data;
    off += 8 + len;
    off = Math.ceil(off / 4) * 4;
  }
  if (!json) return { ok: false, errors: ['No JSON chunk'], warnings, stats };
  if (!json.asset || json.asset.version !== '2.0') err('asset.version must be "2.0"');

  if (buf.length > GLB_LIMITS.bytesHard) err(`File size ${(buf.length / 1048576).toFixed(2)} MB exceeds hard limit 5 MB`);
  else if (buf.length > GLB_LIMITS.bytesTarget) warn(`File size ${(buf.length / 1048576).toFixed(2)} MB exceeds target 2.5 MB`);

  for (const k of ['skins', 'animations', 'cameras', 'textures', 'images', 'samplers']) {
    if (json[k] && json[k].length) err(`Scene must not contain ${k} (found ${json[k].length})`);
  }
  stats.skins = json.skins?.length ?? 0;
  stats.animations = json.animations?.length ?? 0;
  for (const e of (json.extensionsUsed ?? []) as string[]) {
    if (!ALLOWED_EXT.has(e)) err(`Extension not allowed: ${e}`);
    if (e === 'EXT_meshopt_compression' || e === 'KHR_draco_mesh_compression') warn(`Compressed geometry (${e}): vertex-level checks skipped`);
  }
  if (json.extensions?.KHR_lights_punctual) err('Lights are not allowed');
  stats.extensionsUsed = json.extensionsUsed ?? [];

  const nodes: Json[] = json.nodes ?? [];
  if (!json.scenes || json.scenes.length !== 1) err(`Exactly one scene required (found ${json.scenes ? json.scenes.length : 0})`);
  const sceneNodes: number[] = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  if (sceneNodes.length !== 1 || !nodes[sceneNodes[0] as number] || nodes[sceneNodes[0] as number].name !== 'Hoodie') err('Scene must have exactly one root node named "Hoodie"');
  const names: string[] = nodes.map((n) => n.name).filter(Boolean);
  stats.nodeNames = names;
  stats.meshNodeNames = nodes.filter((n) => n.mesh !== undefined && n.name).map((n) => n.name as string);
  if (new Set(names).size !== names.length) err('Node names must be unique');
  const meshNames: string[] = (json.meshes ?? []).map((m: Json) => m.name);
  stats.meshNames = meshNames;
  if (new Set(meshNames).size !== meshNames.length) err('Mesh names must be unique');
  for (const n of nodes) {
    if (n.skin !== undefined) err(`Node ${n.name} has a skin`);
    if (n.camera !== undefined) err(`Node ${n.name} has a camera`);
    if (n.matrix || n.translation || n.rotation || n.scale) {
      const id = (v: Vec | undefined, ref: Vec) => !v || v.every((x, i) => Math.abs(x - (ref[i] as number)) < 1e-9);
      const identity =
        id(n.matrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) && id(n.translation, [0, 0, 0]) && id(n.rotation, [0, 0, 0, 1]) && id(n.scale, [1, 1, 1]);
      if (!identity) err(`Node ${n.name} has a non-identity transform (scale 1, rotation 0, translation 0 required: bake transforms)`);
    }
  }
  const bodyNodeCount = nodes.filter((n) => n.name === 'hoodie_body').length;
  const bodyMesh = meshNames.indexOf('hoodie_body');
  const panelMeshIdx = meshNames.indexOf(panelName);
  if (bodyMesh < 0) err('Mesh "hoodie_body" is missing');
  if (panelMeshIdx < 0) err(`Back panel mesh "${panelName}" is missing`);
  if (bodyNodeCount !== 1) err('Exactly one node named "hoodie_body" is required');

  const mats: Json[] = json.materials ?? [];
  if (mats.length !== 2) err(`Exactly two materials required (found ${mats.length})`);
  const fabricIdx = mats.findIndex((m) => m.name === 'fabric');
  const panelIdx = mats.findIndex((m) => m.name === 'panel');
  if (fabricIdx < 0) err('Material "fabric" is missing');
  if (panelIdx < 0) err('Material "panel" is missing');
  for (const [label, i] of [['fabric', fabricIdx], ['panel', panelIdx]] as const) {
    if (i < 0) continue;
    const m = mats[i] as Json;
    const p = m.pbrMetallicRoughness ?? {};
    const bc: number[] = p.baseColorFactor ?? [1, 1, 1, 1];
    if (bc.length !== 4 || bc.some((v) => Math.abs(v - 1) > 1e-6)) err(`Material ${label}: baseColorFactor must be [1,1,1,1]`);
    if (Math.abs((p.roughnessFactor ?? 1) - 0.9) > 1e-6) err(`Material ${label}: roughnessFactor must be 0.9 (found ${p.roughnessFactor})`);
    if (Math.abs(p.metallicFactor ?? 1) > 1e-6) err(`Material ${label}: metallicFactor must be 0`);
    if (p.baseColorTexture || p.metallicRoughnessTexture || m.normalTexture || m.occlusionTexture || m.emissiveTexture) err(`Material ${label}: textures are not allowed`);
    if (m.emissiveFactor && m.emissiveFactor.some((v: number) => v !== 0)) err(`Material ${label}: emissive is not allowed`);
    if (m.alphaMode && m.alphaMode !== 'OPAQUE') warn(`Material ${label}: alphaMode ${m.alphaMode}`);
  }
  stats.materials = mats.map((m) => m.name);

  const accessors: Json[] = json.accessors ?? [];
  const views: Json[] = json.bufferViews ?? [];
  const readAcc = (ai: number): number[] => {
    const a = accessors[ai];
    if (!a) throw new Error(`accessor ${ai} missing`);
    if (a.sparse) throw new Error('sparse accessors unsupported');
    if (!bin) throw new Error('no BIN chunk');
    const bytes = COMP[a.componentType] as number;
    const nc = NCOMP[a.type] as number;
    const bv = views[a.bufferView];
    if (bv.extensions) throw new Error('compressed buffer view');
    const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const stride = bv.byteStride || bytes * nc;
    const out = new Array<number>(a.count * nc);
    const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    if (start + (a.count - 1) * stride + bytes * nc > bin.byteLength) throw new Error('data runs past the end of the file');
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < nc; c++) {
        const p = start + i * stride + c * bytes;
        let v: number;
        switch (a.componentType) {
          case 5126: v = view.getFloat32(p, true); break;
          case 5125: v = view.getUint32(p, true); break;
          case 5123: v = view.getUint16(p, true); break;
          case 5121: v = view.getUint8(p); break;
          case 5122: v = view.getInt16(p, true); break;
          default: v = view.getInt8(p);
        }
        if (a.normalized) v = a.componentType === 5122 ? Math.max(v / 32767, -1) : a.componentType === 5120 ? Math.max(v / 127, -1) : a.componentType === 5123 ? v / 65535 : v / 255;
        out[i * nc + c] = v;
      }
    }
    return out;
  };

  interface MeshData { P: number[]; N: number[]; I: number[]; mats: Set<string> }
  const meshData: Record<string, MeshData> = {};
  let totalTris = 0;
  stats.meshes = {};
  for (const mesh of (json.meshes ?? []) as Json[]) {
    let tris = 0;
    const P: number[] = [], N: number[] = [], I: number[] = [];
    const mats4 = new Set<string>();
    for (const prim of mesh.primitives as Json[]) {
      if ((prim.mode ?? 4) !== 4) err(`Mesh ${mesh.name}: only triangle lists are allowed`);
      if (prim.targets && prim.targets.length) err(`Mesh ${mesh.name}: morph targets not allowed`);
      if (prim.extensions?.KHR_draco_mesh_compression) continue;
      const at = prim.attributes as Record<string, number>;
      for (const k of Object.keys(at)) {
        if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(k) && !k.startsWith('TANGENT')) {
          if (k.startsWith('JOINTS') || k.startsWith('WEIGHTS')) err(`Mesh ${mesh.name}: skinning attributes not allowed`);
          else if (k.startsWith('TEXCOORD')) err(`Mesh ${mesh.name}: only one UV set (TEXCOORD_0) is allowed`);
          else if (k.startsWith('COLOR')) warn(`Mesh ${mesh.name}: vertex colours present (${k})`);
        }
      }
      if (at.POSITION === undefined) { err(`Mesh ${mesh.name}: POSITION missing`); continue; }
      if (at.NORMAL === undefined) err(`Mesh ${mesh.name}: NORMAL missing`);
      if (at.TEXCOORD_0 === undefined) err(`Mesh ${mesh.name}: TEXCOORD_0 missing`);
      if (prim.material === undefined) err(`Mesh ${mesh.name}: primitive without material`);
      else mats4.add(mats[prim.material]?.name);
      let pos: number[];
      try {
        pos = readAcc(at.POSITION);
      } catch (e) {
        const m = (e as Error).message;
        // Compressed or sparse data cannot be checked (warning); data that runs off the file is corrupt (error).
        if (/past the end/.test(m)) err(`Mesh ${mesh.name}: geometry is corrupt (${m})`);
        else warn(`Mesh ${mesh.name}: cannot read geometry (${m})`);
        continue;
      }
      let nrm: number[] | null;
      let idx: number[];
      try {
        nrm = at.NORMAL !== undefined ? readAcc(at.NORMAL) : null;
        idx = prim.indices !== undefined ? readAcc(prim.indices) : Array.from({ length: pos.length / 3 }, (_, i) => i);
      } catch (e) {
        err(`Mesh ${mesh.name}: geometry is corrupt (${(e as Error).message})`);
        continue;
      }
      if (idx.length % 3) err(`Mesh ${mesh.name}: index count not divisible by 3`);
      const vc = pos.length / 3;
      for (let k = 0; k < idx.length; k++) if ((idx[k] as number) >= vc) { err(`Mesh ${mesh.name}: index out of range`); break; }
      const base = P.length / 3;
      for (const v of pos) P.push(v);
      if (nrm) for (const v of nrm) N.push(v);
      for (const v of idx) I.push(v + base);
      tris += idx.length / 3;
    }
    stats.meshes[mesh.name] = { triangles: tris, materials: [...mats4] };
    meshData[mesh.name] = { P, N, I, mats: mats4 };
    totalTris += tris;
    for (let k = 0; k < P.length; k++) if (!Number.isFinite(P[k])) { err(`Mesh ${mesh.name}: non-finite vertex positions (NaN/Infinity)`); break; }
    for (let k = 0; k < N.length; k++) if (!Number.isFinite(N[k])) { err(`Mesh ${mesh.name}: non-finite normals`); break; }
    let badN = 0;
    for (let k = 0; k < N.length; k += 3) {
      const l = Math.hypot(N[k] as number, N[k + 1] as number, N[k + 2] as number);
      if (!(l > 0.98 && l < 1.02)) badN++;
    }
    if (badN) err(`Mesh ${mesh.name}: ${badN} normals are not unit length`);
  }
  stats.totalTriangles = totalTris;
  if (totalTris > GLB_LIMITS.trisHard) err(`Total triangles ${totalTris} exceed hard limit ${GLB_LIMITS.trisHard}`);
  else if (totalTris > GLB_LIMITS.trisTarget) warn(`Total triangles ${totalTris} exceed target ${GLB_LIMITS.trisTarget}`);

  for (const [name, d] of Object.entries(meshData)) {
    for (const m of d.mats) {
      if (name === panelName && m !== 'panel') err(`Mesh ${name} must use material "panel" only`);
      if (name !== panelName && m !== 'fabric') err(`Mesh ${name} must use material "fabric" only (found ${m})`);
    }
  }

  const bboxOf = (P: number[]) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < P.length; k += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a] as number, P[k + a] as number); mx[a] = Math.max(mx[a] as number, P[k + a] as number); }
    return { mn, mx };
  };
  const centroid = (P: number[]) => {
    const c = [0, 0, 0];
    for (let k = 0; k < P.length; k += 3) for (let a = 0; a < 3; a++) c[a] = (c[a] as number) + (P[k + a] as number);
    return c.map((v) => v / (P.length / 3));
  };
  const allMin = [Infinity, Infinity, Infinity], allMax = [-Infinity, -Infinity, -Infinity];
  for (const d of Object.values(meshData)) {
    if (!d.P.length) continue;
    const b = bboxOf(d.P);
    for (let a = 0; a < 3; a++) { allMin[a] = Math.min(allMin[a] as number, b.mn[a] as number); allMax[a] = Math.max(allMax[a] as number, b.mx[a] as number); }
  }
  if (Number.isFinite(allMin[0])) {
    const size = allMax.map((v, a) => v - (allMin[a] as number));
    stats.bbox = { min: allMin, max: allMax, size };
    const h = size[1] as number, w = size[0] as number;
    if (h < GLB_LIMITS.heightMin || h > GLB_LIMITS.heightMax) err(`Bounding-box height ${h.toFixed(3)} m outside ${GLB_LIMITS.heightMin}-${GLB_LIMITS.heightMax} m (units must be metres; shoulder-to-hem about 0.70 m)`);
    if (w < 0.4 || w > 1.2) err(`Bounding-box width ${w.toFixed(3)} m looks wrong for metres`);
    if ((allMin[1] as number) > -0.2 || (allMax[1] as number) < 0.1) warn('Origin is far from mid-chest (expected between hem and shoulders)');
  }

  const pd = meshData[panelName];
  if (pd && pd.P.length) {
    const pt = stats.meshes[panelName]?.triangles ?? 0;
    if (pt < GLB_LIMITS.panelTrisMin || pt > GLB_LIMITS.panelTrisMax) err(`Back panel has ${pt} triangles (required ${GLB_LIMITS.panelTrisMin}-${GLB_LIMITS.panelTrisMax})`);
    const b = bboxOf(pd.P);
    const w = (b.mx[0] as number) - (b.mn[0] as number), h = (b.mx[1] as number) - (b.mn[1] as number);
    const aspect = w / h;
    const c = centroid(pd.P);
    stats.panel = { triangles: pt, width: w, height: h, aspect, centroid: c };
    if (Math.abs(aspect - GLB_LIMITS.panelAspect) / GLB_LIMITS.panelAspect > GLB_LIMITS.panelAspectTol) err(`Back panel world aspect ${aspect.toFixed(4)} differs from 0.64 by more than 1%`);
    if ((c[2] as number) >= 0) err('Back panel centroid z must be < 0 (back faces -Z)');
  }
  const body = meshData.hoodie_body;
  if (body && body.P.length) {
    const b = bboxOf(body.P);
    let hoodVerts = 0;
    for (let k = 0; k < body.P.length; k += 3) if ((body.P[k + 1] as number) > 0.345) hoodVerts++;
    if (hoodVerts < 200) err('No hood geometry detected above the neckline');
    if ((b.mx[0] as number) < 0.3 || (b.mn[0] as number) > -0.3) err('Sleeves not detected (body bbox |x| < 0.3 m)');
  }
  return { ok: errors.length === 0, errors, warnings, stats };
}

/** Traffic-light grade of a measured value against target / hard limit (builder.md 7.1). */
export function gradeBudget(value: number, target: number, hard: number): 'ok' | 'warn' | 'bad' {
  return value > hard ? 'bad' : value > target ? 'warn' : 'ok';
}
