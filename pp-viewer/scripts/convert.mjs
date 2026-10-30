// Converts the 71 MB CLO3D export (../pp/pp.obj) into a compressed GLB the browser can load.
import { createReadStream, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const input = new URL('../../pp/pp.obj', import.meta.url);
const output = new URL('../public/pp.glb', import.meta.url);

// CLO exports Z-up; glTF is Y-up.
const positions = [];
const normals = [];
const parts = new Map();
let current = null;

for await (const line of createInterface({ input: createReadStream(input) })) {
  const tokens = line.trim().split(/\s+/);
  const [type] = tokens;
  if (type === 'v') {
    positions.push([+tokens[1], +tokens[3], -tokens[2]]);
  } else if (type === 'vn') {
    normals.push([+tokens[1], +tokens[3], -tokens[2]]);
  } else if (type === 'usemtl') {
    if (!parts.has(tokens[1])) parts.set(tokens[1], { keys: new Map(), position: [], normal: [], index: [] });
    current = parts.get(tokens[1]);
  } else if (type === 'f') {
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
    for (let i = 1; i < corners.length - 1; i++) current.index.push(corners[0], corners[i], corners[i + 1]);
  }
}

const doc = new Document();
const buffer = doc.createBuffer();
const mesh = doc.createMesh('pp');

for (const [name, part] of parts) {
  const material = doc
    .createMaterial(name)
    .setBaseColorFactor([0.82, 0.82, 0.82, 1])
    .setRoughnessFactor(name.startsWith('Rib') ? 0.95 : 0.9)
    .setMetallicFactor(0)
    .setDoubleSided(true);
  const primitive = doc
    .createPrimitive()
    .setMaterial(material)
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(part.index)).setBuffer(buffer))
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(part.position)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(part.normal)).setBuffer(buffer));
  mesh.addPrimitive(primitive);
  console.log(`${name}: ${part.keys.size} vertices, ${part.index.length / 3} triangles`);
}

doc.createScene().addChild(doc.createNode('pp').setMesh(mesh));

await MeshoptEncoder.ready;
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
doc.createExtension(KHRMeshQuantization).setRequired(true);
doc.createExtension(EXTMeshoptCompression).setRequired(true);

mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
await new NodeIO()
  .registerExtensions([KHRMeshQuantization, EXTMeshoptCompression])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  .write(output.pathname.replace(/^\/([A-Za-z]:)/, '$1'), doc);
console.log('Wrote public/pp.glb');
