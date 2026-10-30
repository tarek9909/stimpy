// Builds the storefront Builder's model from the CLO3D export (../pp/pp.obj), following the contract of
// packages/builder/src/three/engine.ts: +Y up, front faces +Z, material `fabric` for the body, mesh `back_panel` with
// glTF UVs (origin top-left; seen from -Z, u grows toward -X and v toward -Y).
import { createReadStream, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const input = new URL('../../pp/pp.obj', import.meta.url);
const outputDir = new URL('../../website/frontend/web/public/models/', import.meta.url);

// The printable panel in the CLO file, on the back, and the rib frame stitched around it.
const PANEL_GROUP = 'Pattern_1976';
const FRAME_GROUPS = new Set(['Pattern2D_1225165', 'Pattern2D_1225167']);
// The hood hangs over the upper back and stays where it is.
const HOOD_GROUPS = new Set(['Pattern_7775799', 'Pattern_7775800']);
// The model is true to scale: the back measures 0.718 m from the neck (height 1.623 in the CLO file) to the hem. The
// print is 30 x 40 cm, starting 17 cm below the neck. It keeps the CLO panel's 30 cm width.
const NECK = 1.623;
const PANEL_TOP = NECK - 0.17;
const PANEL_BOTTOM = PANEL_TOP - 0.4;
// CLO heights: the panel, the frame around it, and the top of the hem rib, where the fabric stops moving.
const CLO_PANEL = { top: 1.527, bottom: 1.05 };
const CLO_FRAME = { top: 1.542, bottom: 1.04 };
const CLO_HEM_RIB = 0.985;

const positions = [];
const normals = [];
const newPart = () => ({ keys: new Map(), position: [], normal: [], index: [] });
const parts = { body: newPart(), frame: newPart(), panel: newPart(), hood: newPart() };
let current = parts.body;

function windingMatchesNormals(part, [a, b, c]) {
  const at = (values, vertex, axis) => values[vertex * 3 + axis];
  const edge = (from, to) => [0, 1, 2].map((axis) => at(part.position, to, axis) - at(part.position, from, axis));
  const [ux, uy, uz] = edge(a, b);
  const [vx, vy, vz] = edge(a, c);
  const face = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const facing = face.reduce((sum, value, axis) => sum + value * (at(part.normal, a, axis) + at(part.normal, b, axis) + at(part.normal, c, axis)), 0);
  return facing >= 0;
}

for await (const line of createInterface({ input: createReadStream(input) })) {
  const tokens = line.trim().split(/\s+/);
  const [type] = tokens;
  // CLO is Z-up with the front toward +Y: rotate so that Y is up and the front faces +Z.
  if (type === 'v') positions.push([-tokens[1], +tokens[3], +tokens[2]]);
  else if (type === 'vn') normals.push([-tokens[1], +tokens[3], +tokens[2]]);
  else if (type === 'g') current = tokens[1] === PANEL_GROUP ? parts.panel : FRAME_GROUPS.has(tokens[1]) ? parts.frame : HOOD_GROUPS.has(tokens[1]) ? parts.hood : parts.body;
  else if (type === 'f') {
    const corners = tokens.slice(1).map((corner) => {
      let vertex = current.keys.get(corner);
      if (vertex === undefined) {
        const [p, , n] = corner.split('/').map(Number);
        vertex = current.keys.size;
        current.keys.set(corner, vertex);
        current.position.push(...positions[p - 1]);
        current.normal.push(...normals[n - 1]);
      }
      return vertex;
    });
    for (let i = 1; i < corners.length - 1; i++) {
      // CLO's winding does not always agree with its normals, and double-sided shading then turns those triangles black.
      const triangle = [corners[0], corners[i], corners[i + 1]];
      if (!windingMatchesNormals(current, triangle)) triangle.reverse();
      current.index.push(...triangle);
    }
  }
}

// Center the garment on the origin.
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (const part of Object.values(parts)) {
  for (let i = 0; i < part.position.length; i++) {
    min[i % 3] = Math.min(min[i % 3], part.position[i]);
    max[i % 3] = Math.max(max[i % 3], part.position[i]);
  }
}
const center = min.map((value, axis) => (value + max[axis]) / 2);
for (const part of Object.values(parts)) {
  for (let i = 0; i < part.position.length; i++) part.position[i] -= center[i % 3];
}

// Move and shorten the panel by sliding the back of the hoodie down with it, so the fabric under and around it follows
// and no layer pokes through another. Only heights change. The slide fades out toward the neck, the hem rib and the sides.
const smoothstep = (low, high, x) => {
  const t = Math.min(1, Math.max(0, (x - low) / (high - low)));
  return t * t * (3 - 2 * t);
};
const panelScale = (PANEL_TOP - PANEL_BOTTOM) / (CLO_PANEL.top - CLO_PANEL.bottom);
const slid = (height) => PANEL_BOTTOM + (height - CLO_PANEL.bottom) * panelScale;
function slideTo(height) {
  if (height >= NECK || height <= CLO_HEM_RIB) return height;
  if (height > CLO_FRAME.top) {
    const t = (height - CLO_FRAME.top) / (NECK - CLO_FRAME.top);
    return slid(CLO_FRAME.top) + t * (NECK - slid(CLO_FRAME.top));
  }
  if (height < CLO_FRAME.bottom) {
    const t = (height - CLO_HEM_RIB) / (CLO_FRAME.bottom - CLO_HEM_RIB);
    return CLO_HEM_RIB + t * (slid(CLO_FRAME.bottom) - CLO_HEM_RIB);
  }
  return slid(height);
}
const frameX = (() => {
  let high = 0;
  for (let i = 0; i < parts.frame.position.length; i += 3) high = Math.max(high, Math.abs(parts.frame.position[i]));
  return high;
})();
for (const part of [parts.body, parts.frame, parts.panel]) {
  const p = part.position;
  for (let i = 0; i < p.length; i += 3) {
    const height = p[i + 1] + center[1];
    const amount = (1 - smoothstep(frameX, frameX + 0.1, Math.abs(p[i]))) * smoothstep(0.02, 0.07, -p[i + 2]);
    p[i + 1] += (slideTo(height) - height) * amount;
  }
}

// Planar panel UVs. The cloth's outline is wavy, so 0..1 spans the largest straight rectangle inside it: the panel
// shader trims everything outside, which gives the print straight edges with the frame showing around them.
const panelX = parts.panel.position.filter((_, i) => i % 3 === 0);
const panelY = parts.panel.position.filter((_, i) => i % 3 === 1);
const EDGE_BINS = 30;
const edgeBin = (value, low, high) => Math.min(EDGE_BINS - 1, Math.floor(((value - low) / (high - low)) * EDGE_BINS));
const [outerMinX, outerMaxX, outerMinY, outerMaxY] = [Math.min(...panelX), Math.max(...panelX), Math.min(...panelY), Math.max(...panelY)];
const bins = () => Array.from({ length: EDGE_BINS }, () => ({ low: Infinity, high: -Infinity }));
const [byX, byY] = [bins(), bins()];
for (let i = 0; i < panelX.length; i++) {
  const column = byX[edgeBin(panelX[i], outerMinX, outerMaxX)];
  column.low = Math.min(column.low, panelY[i]);
  column.high = Math.max(column.high, panelY[i]);
  const row = byY[edgeBin(panelY[i], outerMinY, outerMaxY)];
  row.low = Math.min(row.low, panelX[i]);
  row.high = Math.max(row.high, panelX[i]);
}
// The corner bins curve away with the cloth and would shrink the rectangle: skip them.
const inner = (list) => list.slice(1, -1);
const minY = Math.max(...inner(byX).map((bin) => bin.low));
const maxY = Math.min(...inner(byX).map((bin) => bin.high));
const minX = Math.max(...inner(byY).map((bin) => bin.low));
const maxX = Math.min(...inner(byY).map((bin) => bin.high));
const panelUv = [];
for (let i = 0; i < panelX.length; i++) {
  panelUv.push((maxX - panelX[i]) / (maxX - minX), (maxY - panelY[i]) / (maxY - minY));
}

// Scale so the trimmed rectangle is exactly the print size, with its top at PANEL_TOP.
const PANEL_WIDTH = 0.3;
const panelCenterX = (minX + maxX) / 2;
const scaleX = PANEL_WIDTH / (maxX - minX);
const scaleY = (PANEL_TOP - PANEL_BOTTOM) / (maxY - minY);
for (let i = 0; i < parts.panel.position.length; i += 3) {
  parts.panel.position[i] = panelCenterX + (parts.panel.position[i] - panelCenterX) * scaleX;
  parts.panel.position[i + 1] = PANEL_TOP - center[1] + (parts.panel.position[i + 1] - maxY) * scaleY;
}

// Keep the panel above everything under it. Cloth folds and the frame otherwise poke through it and break its outline.
const PANEL_CLEARANCE = 0.002;
const CELL = 0.01;
const cell = (x, y) => `${Math.round(x / CELL)},${Math.round(y / CELL)}`;
const surface = new Map();
for (const part of [parts.body, parts.frame]) {
  const q = part.position;
  for (let i = 0; i < q.length; i += 3) {
    if (q[i + 2] >= 0) continue;
    const key = cell(q[i], q[i + 1]);
    surface.set(key, Math.min(surface.get(key) ?? Infinity, q[i + 2]));
  }
}
const panelPosition = parts.panel.position;
const needed = new Map();
for (let i = 0; i < panelPosition.length; i += 3) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const under = surface.get(cell(panelPosition[i] + dx * CELL, panelPosition[i + 1] + dy * CELL));
      if (under === undefined) continue;
      const key = cell(panelPosition[i], panelPosition[i + 1]);
      needed.set(key, Math.max(needed.get(key) ?? 0, panelPosition[i + 2] - (under - PANEL_CLEARANCE)));
    }
  }
}
// Widen, then soften, so the lift never falls short of what a point needs and the panel stays smooth.
const around = (x, y, radius, read) => {
  const values = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) values.push(read(x + dx * CELL, y + dy * CELL));
  }
  return values;
};
const widened = (x, y) => Math.max(...around(x, y, 2, (a, b) => needed.get(cell(a, b)) ?? 0));
for (let i = 0; i < panelPosition.length; i += 3) {
  const values = around(panelPosition[i], panelPosition[i + 1], 2, widened);
  panelPosition[i + 2] -= values.reduce((sum, value) => sum + value, 0) / values.length;
}

// The frame and hood are fabric: from here on they are part of the body.
for (const [name, part] of [['frame', parts.frame], ['hood', parts.hood]]) {
  const vertexCount = parts.body.position.length / 3;
  for (const value of part.position) parts.body.position.push(value);
  for (const value of part.normal) parts.body.normal.push(value);
  for (const vertex of part.index) parts.body.index.push(vertex + vertexCount);
  for (const key of part.keys.keys()) parts.body.keys.set(`:${key}`, 0);
}

const doc = new Document();
const buffer = doc.createBuffer();
const accessor = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

function addMesh(name, part, material, uv) {
  const primitive = doc
    .createPrimitive()
    .setMaterial(material)
    .setIndices(accessor('SCALAR', new Uint32Array(part.index)))
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(part.position)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(part.normal)));
  if (uv) primitive.setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uv)));
  console.log(`${name}: ${part.keys.size} vertices, ${part.index.length / 3} triangles`);
  return doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive));
}

const fabric = doc.createMaterial('fabric').setRoughnessFactor(0.9).setMetallicFactor(0).setDoubleSided(true);
const panelMaterial = doc.createMaterial('panel').setRoughnessFactor(0.9).setMetallicFactor(0);
const root = doc
  .createNode('Hoodie')
  .addChild(addMesh('hoodie_body', parts.body, fabric))
  .addChild(addMesh('back_panel', parts.panel, panelMaterial, panelUv));
doc.createScene().addChild(root);

await MeshoptEncoder.ready;
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));

mkdirSync(outputDir, { recursive: true });
const output = fileURLToPath(new URL('hoodie.glb', outputDir));
await new NodeIO()
  .registerExtensions([KHRMeshQuantization, EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  .write(output, doc);
console.log(`Wrote ${output}; print ${PANEL_WIDTH} x ${(PANEL_TOP - PANEL_BOTTOM).toFixed(3)} m; size ${max.map((v, a) => (v - min[a]).toFixed(3)).join(' x ')} m`);
