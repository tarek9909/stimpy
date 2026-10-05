// Dependency-free validator for the Builder's hoodie GLB contract (docs/website/frontend/builder.md section 7.1).
// Usage (CLI):  node tools/hoodie-model/validate.mjs [path/to/hoodie.glb] [--panel=back_panel] [--json]
// Usage (ES module):  import { validateHoodieGlb } from './validate.mjs';  validateHoodieGlb(buffer, { panelMesh: 'back_panel' })
//   -> { ok, errors: string[], warnings: string[], stats }
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const LIMITS = {
  trisTarget: 40000, trisHard: 80000,
  bytesTarget: 2.5 * 1024 * 1024, bytesHard: 5 * 1024 * 1024,
  panelTrisMin: 800, panelTrisMax: 2000,
  panelAspect: 0.64, panelAspectTol: 0.01,
  heightMin: 0.6, heightMax: 0.9, // whole-scene bbox height (hood included); shoulder-to-hem is about 0.70 m
};
const ALLOWED_EXT = new Set(['EXT_meshopt_compression', 'KHR_draco_mesh_compression', 'KHR_materials_sheen']);
const COMP = { 5120: [1, Int8Array], 5121: [1, Uint8Array], 5122: [2, Int16Array], 5123: [2, Uint16Array], 5125: [4, Uint32Array], 5126: [4, Float32Array] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function validateHoodieGlb(buffer, opts = {}) {
  const errors = [], warnings = [];
  const stats = {};
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const panelName = opts.panelMesh || 'back_panel';
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  stats.sizeBytes = buf.length;

  // ---- container
  if (buf.length < 28 || buf.readUInt32LE(0) !== 0x46546c67) return { ok: false, errors: ['Not a GLB (bad magic)'], warnings, stats };
  if (buf.readUInt32LE(4) !== 2) err('glTF container version is not 2');
  if (buf.readUInt32LE(8) !== buf.length) err('GLB header length does not match file size');
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942 && !bin) bin = data;
    off += 8 + len + ((4 - (len % 4)) % 4) * 0;
    off = Math.ceil(off / 4) * 4;
  }
  if (!json) return { ok: false, errors: ['No JSON chunk'], warnings, stats };
  if (!json.asset || json.asset.version !== '2.0') err('asset.version must be "2.0"');

  // ---- size
  if (buf.length > LIMITS.bytesHard) err(`File size ${(buf.length / 1048576).toFixed(2)} MB exceeds hard limit 5 MB`);
  else if (buf.length > LIMITS.bytesTarget) warn(`File size ${(buf.length / 1048576).toFixed(2)} MB exceeds target 2.5 MB`);

  // ---- forbidden features
  for (const k of ['skins', 'animations', 'cameras', 'textures', 'images', 'samplers']) {
    if (json[k] && json[k].length) err(`Scene must not contain ${k} (found ${json[k].length})`);
  }
  for (const e of json.extensionsUsed || []) {
    if (!ALLOWED_EXT.has(e)) err(`Extension not allowed: ${e}`);
    if (e === 'EXT_meshopt_compression' || e === 'KHR_draco_mesh_compression') warn(`Compressed geometry (${e}): vertex-level checks skipped`);
  }
  if (json.extensions && json.extensions.KHR_lights_punctual) err('Lights are not allowed');
  stats.extensionsUsed = json.extensionsUsed || [];

  // ---- scene / nodes
  const nodes = json.nodes || [];
  if (!json.scenes || json.scenes.length !== 1) err(`Exactly one scene required (found ${json.scenes ? json.scenes.length : 0})`);
  const sceneNodes = (json.scenes && json.scenes[json.scene || 0] && json.scenes[json.scene || 0].nodes) || [];
  if (sceneNodes.length !== 1 || !nodes[sceneNodes[0]] || nodes[sceneNodes[0]].name !== 'Hoodie') err('Scene must have exactly one root node named "Hoodie"');
  const names = nodes.map((n) => n.name).filter(Boolean);
  if (new Set(names).size !== names.length) err('Node names must be unique');
  const meshNames = (json.meshes || []).map((m) => m.name);
  if (new Set(meshNames).size !== meshNames.length) err('Mesh names must be unique');
  for (const n of nodes) {
    if (n.skin !== undefined) err(`Node ${n.name} has a skin`);
    if (n.camera !== undefined) err(`Node ${n.name} has a camera`);
    if (n.matrix || n.translation || n.rotation || n.scale) {
      const id = (v, ref) => v && v.every((x, i) => Math.abs(x - ref[i]) < 1e-9);
      const identity = (!n.matrix || id(n.matrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])) && (!n.translation || id(n.translation, [0, 0, 0])) && (!n.rotation || id(n.rotation, [0, 0, 0, 1])) && (!n.scale || id(n.scale, [1, 1, 1]));
      if (!identity) err(`Node ${n.name} has a non-identity transform (scale 1, rotation 0, translation 0 required: bake transforms)`);
    }
  }
  const bodyNodeCount = nodes.filter((n) => n.name === 'hoodie_body').length;
  const bodyMesh = (json.meshes || []).findIndex((m) => m.name === 'hoodie_body');
  const panelMeshIdx = (json.meshes || []).findIndex((m) => m.name === panelName);
  if (bodyMesh < 0) err('Mesh "hoodie_body" is missing');
  if (panelMeshIdx < 0) err(`Back panel mesh "${panelName}" is missing`);
  if (bodyNodeCount !== 1) err('Exactly one node named "hoodie_body" is required');

  // ---- materials
  const mats = json.materials || [];
  if (mats.length !== 2) err(`Exactly two materials required (found ${mats.length})`);
  const fabricIdx = mats.findIndex((m) => m.name === 'fabric');
  const panelIdx = mats.findIndex((m) => m.name === 'panel');
  if (fabricIdx < 0) err('Material "fabric" is missing');
  if (panelIdx < 0) err('Material "panel" is missing');
  for (const [label, i] of [['fabric', fabricIdx], ['panel', panelIdx]]) {
    if (i < 0) continue;
    const m = mats[i], p = m.pbrMetallicRoughness || {};
    const bc = p.baseColorFactor || [1, 1, 1, 1];
    if (bc.length !== 4 || bc.some((v) => Math.abs(v - 1) > 1e-6)) err(`Material ${label}: baseColorFactor must be [1,1,1,1]`);
    if (Math.abs((p.roughnessFactor ?? 1) - 0.9) > 1e-6) err(`Material ${label}: roughnessFactor must be 0.9 (found ${p.roughnessFactor})`);
    if (Math.abs(p.metallicFactor ?? 1) > 1e-6) err(`Material ${label}: metallicFactor must be 0`);
    if (p.baseColorTexture || p.metallicRoughnessTexture || m.normalTexture || m.occlusionTexture || m.emissiveTexture) err(`Material ${label}: textures are not allowed`);
    if (m.emissiveFactor && m.emissiveFactor.some((v) => v !== 0)) err(`Material ${label}: emissive is not allowed`);
    if (m.alphaMode && m.alphaMode !== 'OPAQUE') warn(`Material ${label}: alphaMode ${m.alphaMode}`);
  }
  stats.materials = mats.map((m) => m.name);

  // ---- geometry access
  const accessors = json.accessors || [], views = json.bufferViews || [];
  const readAcc = (ai) => {
    const a = accessors[ai];
    if (!a) throw new Error(`accessor ${ai} missing`);
    if (a.sparse) throw new Error('sparse accessors unsupported');
    const [bytes, Ctor] = COMP[a.componentType];
    const nc = NCOMP[a.type];
    const bv = views[a.bufferView];
    if (bv.extensions) throw new Error('compressed buffer view');
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const stride = bv.byteStride || bytes * nc;
    const out = new Float64Array(a.count * nc);
    const dv = new DataView(bin.buffer, bin.byteOffset + start - 0, undefined);
    const base = bin.byteOffset;
    const view = new DataView(bin.buffer, base, bin.byteLength);
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < nc; c++) {
        const p = start + i * stride + c * bytes;
        let v;
        if (Ctor === Float32Array) v = view.getFloat32(p, true);
        else if (Ctor === Uint32Array) v = view.getUint32(p, true);
        else if (Ctor === Uint16Array) v = view.getUint16(p, true);
        else if (Ctor === Uint8Array) v = view.getUint8(p);
        else if (Ctor === Int16Array) v = view.getInt16(p, true);
        else v = view.getInt8(p);
        if (a.normalized) v = Ctor === Int16Array ? Math.max(v / 32767, -1) : Ctor === Int8Array ? Math.max(v / 127, -1) : Ctor === Uint16Array ? v / 65535 : v / 255;
        out[i * nc + c] = v;
      }
    }
    return out;
  };

  const meshData = {};
  let totalTris = 0;
  stats.meshes = {};
  const meshOfNode = {};
  nodes.forEach((n) => { if (n.mesh !== undefined) meshOfNode[json.meshes[n.mesh].name] = n; });
  for (const mesh of json.meshes || []) {
    let tris = 0;
    const P = [], N = [], UV = [], I = [];
    const mats4 = new Set();
    for (const prim of mesh.primitives) {
      if ((prim.mode ?? 4) !== 4) err(`Mesh ${mesh.name}: only triangle lists are allowed`);
      if (prim.targets && prim.targets.length) err(`Mesh ${mesh.name}: morph targets not allowed`);
      if (prim.extensions && (prim.extensions.KHR_draco_mesh_compression)) continue;
      const at = prim.attributes;
      for (const k of Object.keys(at)) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(k) && !k.startsWith('TANGENT')) {
        if (k.startsWith('JOINTS') || k.startsWith('WEIGHTS')) err(`Mesh ${mesh.name}: skinning attributes not allowed`);
        else if (k.startsWith('TEXCOORD')) err(`Mesh ${mesh.name}: only one UV set (TEXCOORD_0) is allowed`);
        else if (k.startsWith('COLOR')) warn(`Mesh ${mesh.name}: vertex colours present (${k})`);
      }
      if (at.POSITION === undefined) { err(`Mesh ${mesh.name}: POSITION missing`); continue; }
      if (at.NORMAL === undefined) err(`Mesh ${mesh.name}: NORMAL missing`);
      if (at.TEXCOORD_0 === undefined) err(`Mesh ${mesh.name}: TEXCOORD_0 missing`);
      if (prim.material === undefined) err(`Mesh ${mesh.name}: primitive without material`);
      else mats4.add(mats[prim.material] && mats[prim.material].name);
      let pos;
      try { pos = readAcc(at.POSITION); } catch (e) { warn(`Mesh ${mesh.name}: cannot read geometry (${e.message})`); continue; }
      const nrm = at.NORMAL !== undefined ? readAcc(at.NORMAL) : null;
      const uv = at.TEXCOORD_0 !== undefined ? readAcc(at.TEXCOORD_0) : null;
      const idx = prim.indices !== undefined ? readAcc(prim.indices) : Array.from({ length: pos.length / 3 }, (_, i) => i);
      if (idx.length % 3) err(`Mesh ${mesh.name}: index count not divisible by 3`);
      const vc = pos.length / 3;
      for (let k = 0; k < idx.length; k++) if (idx[k] >= vc) { err(`Mesh ${mesh.name}: index out of range`); break; }
      const base = P.length / 3;
      for (const v of pos) P.push(v);
      if (nrm) for (const v of nrm) N.push(v);
      if (uv) for (const v of uv) UV.push(v);
      for (const v of idx) I.push(v + base);
      tris += idx.length / 3;
    }
    stats.meshes[mesh.name] = { triangles: tris, materials: [...mats4] };
    meshData[mesh.name] = { P, N, UV, I, mats: mats4 };
    totalTris += tris;
    for (let k = 0; k < P.length; k++) if (!Number.isFinite(P[k])) { err(`Mesh ${mesh.name}: non-finite vertex positions (NaN/Infinity)`); break; }
    for (let k = 0; k < N.length; k++) if (!Number.isFinite(N[k])) { err(`Mesh ${mesh.name}: non-finite normals`); break; }
    // normals unit length
    let badN = 0;
    for (let k = 0; k < N.length; k += 3) {
      const l = Math.hypot(N[k], N[k + 1], N[k + 2]);
      if (!(l > 0.98 && l < 1.02)) badN++;
    }
    if (badN) err(`Mesh ${mesh.name}: ${badN} normals are not unit length`);
  }
  stats.totalTriangles = totalTris;
  if (totalTris > LIMITS.trisHard) err(`Total triangles ${totalTris} exceed hard limit ${LIMITS.trisHard}`);
  else if (totalTris > LIMITS.trisTarget) warn(`Total triangles ${totalTris} exceed target ${LIMITS.trisTarget}`);

  // ---- material assignment
  for (const [name, d] of Object.entries(meshData)) {
    for (const m of d.mats) {
      if (name === panelName && m !== 'panel') err(`Mesh ${name} must use material "panel" only`);
      if (name !== panelName && m !== 'fabric') err(`Mesh ${name} must use material "fabric" only (found ${m})`);
    }
  }

  // ---- bounding box / orientation
  const allMin = [Infinity, Infinity, Infinity], allMax = [-Infinity, -Infinity, -Infinity];
  const bboxOf = (P) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < P.length; k += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[k + a]); mx[a] = Math.max(mx[a], P[k + a]); }
    return { mn, mx };
  };
  const centroid = (P) => {
    const c = [0, 0, 0];
    for (let k = 0; k < P.length; k += 3) for (let a = 0; a < 3; a++) c[a] += P[k + a];
    return c.map((v) => v / (P.length / 3));
  };
  for (const d of Object.values(meshData)) {
    if (!d.P.length) continue;
    const b = bboxOf(d.P);
    for (let a = 0; a < 3; a++) { allMin[a] = Math.min(allMin[a], b.mn[a]); allMax[a] = Math.max(allMax[a], b.mx[a]); }
  }
  if (Number.isFinite(allMin[0])) {
    const size = allMax.map((v, a) => v - allMin[a]);
    stats.bbox = { min: allMin, max: allMax, size };
    if (size[1] < LIMITS.heightMin || size[1] > LIMITS.heightMax) err(`Bounding-box height ${size[1].toFixed(3)} m outside ${LIMITS.heightMin}-${LIMITS.heightMax} m (units must be metres; shoulder-to-hem about 0.70 m)`);
    if (size[0] < 0.4 || size[0] > 1.2) err(`Bounding-box width ${size[0].toFixed(3)} m looks wrong for metres`);
    const cy = (allMin[1] + allMax[1]) / 2;
    if (Math.abs(allMin[1] + 0.0) > 0 && (allMin[1] > -0.2 || allMax[1] < 0.1)) warn('Origin is far from mid-chest (expected between hem and shoulders)');
    stats.originY = { hemY: allMin[1], topY: allMax[1], centreY: cy };
  }

  // ---- panel
  const pd = meshData[panelName];
  if (pd && pd.P.length) {
    const pt = stats.meshes[panelName].triangles;
    if (pt < LIMITS.panelTrisMin || pt > LIMITS.panelTrisMax) err(`Back panel has ${pt} triangles (required ${LIMITS.panelTrisMin}-${LIMITS.panelTrisMax})`);
    const b = bboxOf(pd.P);
    const w = b.mx[0] - b.mn[0], h = b.mx[1] - b.mn[1];
    const aspect = w / h;
    stats.panel = { triangles: pt, width: w, height: h, aspect, centroid: centroid(pd.P) };
    if (Math.abs(aspect - LIMITS.panelAspect) / LIMITS.panelAspect > LIMITS.panelAspectTol) err(`Back panel world aspect ${aspect.toFixed(4)} differs from 0.64 by more than 1%`);
    if (stats.panel.centroid[2] >= 0) err('Back panel centroid z must be < 0 (back faces -Z)');
    // UVs
    const U = pd.UV;
    if (U.length / 2 !== pd.P.length / 3) err('Panel UV count mismatch');
    else {
      let umin = 9, umax = -9, vmin = 9, vmax = -9;
      for (let k = 0; k < U.length; k += 2) { umin = Math.min(umin, U[k]); umax = Math.max(umax, U[k]); vmin = Math.min(vmin, U[k + 1]); vmax = Math.max(vmax, U[k + 1]); }
      stats.panel.uvRange = { umin, umax, vmin, vmax };
      const e = 1e-4;
      if (umin < -e || vmin < -e || umax > 1 + e || vmax > 1 + e) err('Panel UVs leave the 0..1 square');
      if (umin > e || vmin > e || umax < 1 - e || vmax < 1 - e) err('Panel UVs do not cover the full 0..1 square (no padding allowed)');
      // orientation: seen from -Z, screen-right is world -X, screen-up is +Y. u grows to the right, v (glTF) grows downward.
      const n = U.length / 2;
      let mx = 0, my = 0, mu = 0, mv = 0;
      for (let k = 0; k < n; k++) { mx += pd.P[3 * k]; my += pd.P[3 * k + 1]; mu += U[2 * k]; mv += U[2 * k + 1]; }
      mx /= n; my /= n; mu /= n; mv /= n;
      let cux = 0, cvy = 0, cuy = 0, cvx = 0, sx = 0, sy = 0, su = 0, sv = 0;
      for (let k = 0; k < n; k++) {
        const dx = pd.P[3 * k] - mx, dy = pd.P[3 * k + 1] - my, du = U[2 * k] - mu, dv = U[2 * k + 1] - mv;
        cux += du * dx; cvy += dv * dy; cuy += du * dy; cvx += dv * dx; sx += dx * dx; sy += dy * dy; su += du * du; sv += dv * dv;
      }
      const r = (c, a, b2) => c / Math.sqrt(a * b2 || 1);
      const ru = r(cux, su, sx), rv = r(cvy, sv, sy);
      stats.panel.uvCorrelation = { uVsX: ru, vVsY: rv, uVsY: r(cuy, su, sy), vVsX: r(cvx, sv, sx) };
      if (ru > -0.9) err(`Panel U must increase toward -X (artwork reads left-to-right from the back); corr(u,x)=${ru.toFixed(3)}`);
      if (rv > -0.9) err(`Panel V must increase toward -Y (glTF V down; artwork upright from the back); corr(v,y)=${rv.toFixed(3)}`);
      if (Math.abs(r(cuy, su, sy)) > 0.1 || Math.abs(r(cvx, sv, sx)) > 0.1) err('Panel UVs appear rotated/skewed');
      // mirrored / overlapping: all triangles must share UV orientation, and UV area must equal 1
      let pos = 0, neg = 0, uvArea = 0;
      const dens = [];
      for (let t = 0; t < pd.I.length; t += 3) {
        const [a, b2, c] = [pd.I[t], pd.I[t + 1], pd.I[t + 2]];
        const ax = U[2 * b2] - U[2 * a], ay = U[2 * b2 + 1] - U[2 * a + 1], bx = U[2 * c] - U[2 * a], by = U[2 * c + 1] - U[2 * a + 1];
        const A = 0.5 * (ax * by - ay * bx);
        if (A > 1e-12) pos++; else if (A < -1e-12) neg++;
        uvArea += Math.abs(A);
        const p = (i) => [pd.P[3 * i], pd.P[3 * i + 1], pd.P[3 * i + 2]];
        const pa = p(a), pb = p(b2), pc = p(c);
        const u1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], u2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
        const cr = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
        const wa = 0.5 * Math.hypot(cr[0], cr[1], cr[2]);
        if (wa > 1e-9 && Math.abs(A) > 1e-12) dens.push(Math.abs(A) / wa);
      }
      stats.panel.uvArea = uvArea;
      if (pos && neg) err(`Panel UVs are mirrored/overlapping (${pos} vs ${neg} triangles with opposite UV winding)`);
      // rounded corners bake: UV area slightly under 1 is expected. 0.97..1.0001 accepted
      if (uvArea > 1.0005) err(`Panel UV area ${uvArea.toFixed(4)} > 1: overlapping UVs`);
      if (uvArea < 0.97) warn(`Panel UV area ${uvArea.toFixed(4)} < 0.97 (gaps in the UV square)`);
      dens.sort((a, b2) => a - b2);
      const med = dens[Math.floor(dens.length / 2)];
      const bad = dens.filter((d) => Math.abs(d / med - 1) > 0.12).length;
      stats.panel.texelDensity = { median: med, outOfTolerance: bad, of: dens.length };
      if (bad / dens.length > 0.02) err(`Panel texel density is not uniform (${bad}/${dens.length} triangles deviate >12%)`);
    }
    // proud-of-body distance: ray from sample panel vertices along -normal to the body
    const body = meshData.hoodie_body;
    if (body && body.P.length && pd.N.length) {
      const dists = [];
      const step = Math.max(1, Math.floor(pd.P.length / 3 / 60));
      for (let k = 0; k < pd.P.length / 3; k += step) {
        const o = [pd.P[3 * k], pd.P[3 * k + 1], pd.P[3 * k + 2]];
        const d = [-pd.N[3 * k], -pd.N[3 * k + 1], -pd.N[3 * k + 2]];
        let best = Infinity;
        for (let t = 0; t < body.I.length; t += 3) {
          const i0 = body.I[t] * 3, i1 = body.I[t + 1] * 3, i2 = body.I[t + 2] * 3;
          const v0 = [body.P[i0], body.P[i0 + 1], body.P[i0 + 2]];
          // quick reject by distance
          if (Math.abs(v0[0] - o[0]) > 0.05 || Math.abs(v0[1] - o[1]) > 0.05 || Math.abs(v0[2] - o[2]) > 0.05) continue;
          const e1 = [body.P[i1] - v0[0], body.P[i1 + 1] - v0[1], body.P[i1 + 2] - v0[2]];
          const e2 = [body.P[i2] - v0[0], body.P[i2 + 1] - v0[1], body.P[i2 + 2] - v0[2]];
          const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
          const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
          if (Math.abs(det) < 1e-14) continue;
          const tv = [o[0] - v0[0], o[1] - v0[1], o[2] - v0[2]];
          const uu = (tv[0] * pv[0] + tv[1] * pv[1] + tv[2] * pv[2]) / det;
          if (uu < 0 || uu > 1) continue;
          const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
          const vv = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det;
          if (vv < 0 || uu + vv > 1) continue;
          const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
          if (tt > -0.01 && tt < best) best = tt;
        }
        if (Number.isFinite(best)) dists.push(best);
      }
      if (dists.length) {
        const mn = Math.min(...dists), mxd = Math.max(...dists), avg = dists.reduce((a, b2) => a + b2, 0) / dists.length;
        stats.panel.offsetFromBodyMm = { min: +(mn * 1000).toFixed(2), avg: +(avg * 1000).toFixed(2), max: +(mxd * 1000).toFixed(2), samples: dists.length };
        if (mn < 0.0007) err(`Panel is only ${(mn * 1000).toFixed(2)} mm from the body somewhere (z-fighting risk; need 1-2 mm)`);
        if (mxd > 0.0030) err(`Panel floats ${(mxd * 1000).toFixed(2)} mm above the body somewhere (need 1-2 mm)`);
      } else warn('Could not measure panel offset from body');
    }
  }

  // ---- facing +Z (front) via zip / pocket features
  const frontMeshes = ['zip', 'drawcords'].filter((n) => meshData[n] && meshData[n].P.length);
  if (!frontMeshes.length) warn('No "zip" or "drawcords" mesh to verify +Z facing');
  for (const n of frontMeshes) {
    const c = centroid(meshData[n].P);
    stats[`${n}Centroid`] = c;
    if (n === 'zip' && c[2] <= 0) err('Zip centroid z must be > 0 (front faces +Z)');
    if (n === 'drawcords' && c[2] <= 0) err('Drawcords centroid z must be > 0 (front faces +Z)');
  }

  // ---- zip outline around panel (geometry on fabric)
  const pz = meshData.panel_zip;
  if (!pz || !pz.P.length) warn('No "panel_zip" mesh found: the visible zip outline around the back panel must exist as fabric geometry');
  else if (pd && pd.P.length) {
    const bz = bboxOf(pz.P), bp = bboxOf(pd.P);
    const ok = bz.mn[0] < bp.mn[0] && bz.mx[0] > bp.mx[0] && bz.mn[1] < bp.mn[1] && bz.mx[1] > bp.mx[1];
    stats.panelZipTriangles = stats.meshes.panel_zip.triangles;
    if (!ok) err('panel_zip does not enclose the back panel');
    if (centroid(pz.P)[2] >= 0) err('panel_zip must be on the back (-Z)');
  }

  // ---- hood / sleeves sanity from bounding boxes of body
  const body = meshData.hoodie_body;
  if (body && body.P.length) {
    const b = bboxOf(body.P);
    stats.body = { bbox: b };
    if (b.mx[1] < 0.3) warn('Body top is low: is the hood present?');
    // hood present: vertices above 0.34 behind the neck and behind the front (z < 0) and sleeves reach |x| > 0.3
    let hoodVerts = 0;
    for (let k = 0; k < body.P.length; k += 3) if (body.P[k + 1] > 0.345) hoodVerts++;
    stats.hoodVerticesAboveShoulderLine = hoodVerts;
    if (hoodVerts < 200) err('No hood geometry detected above the neckline');
    if (b.mx[0] < 0.3 || b.mn[0] > -0.3) err('Sleeves not detected (body bbox |x| < 0.3 m)');
  }
  return { ok: errors.length === 0, errors, warnings, stats };
}

// ---- CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const file = arg ? resolve(arg) : resolve(fileURLToPath(import.meta.url), '../../../backend/seed-assets/models/hoodie.glb');
  const panelArg = process.argv.find((a) => a.startsWith('--panel='));
  const res = validateHoodieGlb(readFileSync(file), { panelMesh: panelArg ? panelArg.split('=')[1] : 'back_panel' });
  if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(`Validating ${file}`);
    const s = res.stats;
    console.log(`  size ${(s.sizeBytes / 1024).toFixed(0)} KB, triangles ${s.totalTriangles}, materials ${JSON.stringify(s.materials)}`);
    for (const [n, m] of Object.entries(s.meshes || {})) console.log(`  mesh ${n}: ${m.triangles} tris on ${m.materials.join(',')}`);
    if (s.bbox) console.log(`  bbox size ${s.bbox.size.map((v) => v.toFixed(3)).join(' x ')} m  (y ${s.bbox.min[1].toFixed(3)} .. ${s.bbox.max[1].toFixed(3)})`);
    if (s.panel) {
      console.log(`  panel: ${s.panel.width.toFixed(4)} x ${s.panel.height.toFixed(4)} m, aspect ${s.panel.aspect.toFixed(4)}, centroid z ${s.panel.centroid[2].toFixed(3)}`);
      if (s.panel.uvRange) console.log(`  panel UV range u ${s.panel.uvRange.umin.toFixed(4)}..${s.panel.uvRange.umax.toFixed(4)} v ${s.panel.uvRange.vmin.toFixed(4)}..${s.panel.uvRange.vmax.toFixed(4)}, corr(u,x)=${s.panel.uvCorrelation.uVsX.toFixed(3)} corr(v,y)=${s.panel.uvCorrelation.vVsY.toFixed(3)}, uvArea ${s.panel.uvArea.toFixed(4)}`);
      if (s.panel.offsetFromBodyMm) console.log(`  panel offset from body (mm): ${JSON.stringify(s.panel.offsetFromBodyMm)}`);
      if (s.panel.texelDensity) console.log(`  texel density median ${s.panel.texelDensity.median.toFixed(3)}, outliers ${s.panel.texelDensity.outOfTolerance}/${s.panel.texelDensity.of}`);
    }
    if (s.zipCentroid) console.log(`  zip centroid z ${s.zipCentroid[2].toFixed(3)} (front is +Z)`);
    for (const w of res.warnings) console.log(`  WARN  ${w}`);
    for (const e of res.errors) console.log(`  ERROR ${e}`);
    console.log(res.ok ? 'RESULT: OK' : 'RESULT: FAILED');
  }
  process.exit(res.ok ? 0 : 1);
}
