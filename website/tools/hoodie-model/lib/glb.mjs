// Minimal glTF 2.0 binary writer (no dependencies).
export function writeGlb(meshes, opts = {}) {
  // meshes: [{ name, material: 'fabric'|'panel', geo: {p,n,uv,i} }]
  const materials = [
    { name: 'fabric', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 }, ...(opts.sheen ? { extensions: { KHR_materials_sheen: { sheenColorFactor: opts.sheen.color, sheenRoughnessFactor: opts.sheen.roughness } } } : {}) },
    { name: 'panel', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.9 } },
  ];
  const chunks = [];
  let offset = 0;
  const bufferViews = [], accessors = [], gltfMeshes = [], nodes = [];
  const push = (buf, target) => {
    const pad = (4 - (buf.byteLength % 4)) % 4;
    const b = Buffer.concat([Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength), Buffer.alloc(pad)]);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.byteLength, ...(target ? { target } : {}) });
    chunks.push(b);
    offset += b.length;
    return bufferViews.length - 1;
  };
  for (const m of meshes) {
    const g = m.geo;
    const vc = g.p.length / 3;
    const pos = new Float32Array(g.p);
    const nrm = new Float32Array(g.n);
    const uv = new Float32Array(g.uv);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < pos.length; k += 3) for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], pos[k + a]);
      max[a] = Math.max(max[a], pos[k + a]);
    }
    const big = vc > 65535;
    const idx = big ? new Uint32Array(g.i) : new Uint16Array(g.i);
    const acc = (bv, comp, count, type, extra = {}) => {
      accessors.push({ bufferView: bv, componentType: comp, count, type, ...extra });
      return accessors.length - 1;
    };
    const aPos = acc(push(pos, 34962), 5126, vc, 'VEC3', { min, max });
    const aNrm = acc(push(nrm, 34962), 5126, vc, 'VEC3');
    const aUv = acc(push(uv, 34962), 5126, vc, 'VEC2');
    const aIdx = acc(push(idx, 34963), big ? 5125 : 5123, idx.length, 'SCALAR');
    gltfMeshes.push({
      name: m.name,
      primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv }, indices: aIdx, material: m.material === 'panel' ? 1 : 0, mode: 4 }],
    });
    nodes.push({ name: m.name, mesh: gltfMeshes.length - 1 });
  }
  const rootNode = { name: 'Hoodie', children: nodes.map((_, k) => k + 1) };
  const json = {
    asset: { version: '2.0', generator: 'stimpy hoodie-model generator' },
    ...(opts.sheen ? { extensionsUsed: ['KHR_materials_sheen'] } : {}),
    scene: 0,
    scenes: [{ name: 'Scene', nodes: [0] }],
    nodes: [rootNode, ...nodes],
    meshes: gltfMeshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const bin = Buffer.concat(chunks);
  const total = 12 + 8 + jsonBuf.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBuf.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonBuf, bh, bin]);
}
