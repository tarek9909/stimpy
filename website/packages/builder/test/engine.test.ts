import { describe, expect, it } from 'vitest';
import { LIGHTING } from '../src/three/lighting';
import { requiresMeshopt } from '../src/three/engine';

function glb(json: object): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  const buf = new ArrayBuffer(20 + padded.length);
  const v = new DataView(buf);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, buf.byteLength, true);
  v.setUint32(12, padded.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf, 20).set(padded);
  return buf;
}

describe('GLB header sniffing (meshopt WASM is only loaded when needed)', () => {
  it('plain models do not need the decoder', () => {
    expect(requiresMeshopt(glb({ asset: { version: '2.0' }, extensionsUsed: ['KHR_materials_sheen'] }))).toBe(false);
  });
  it('EXT_meshopt_compression models do', () => {
    expect(requiresMeshopt(glb({ asset: { version: '2.0' }, extensionsRequired: ['EXT_meshopt_compression'] }))).toBe(true);
  });
  it('garbage is not a GLB and never throws', () => {
    expect(requiresMeshopt(new TextEncoder().encode('not a glb at all, just text here').buffer as ArrayBuffer)).toBe(false);
    expect(requiresMeshopt(new ArrayBuffer(4))).toBe(false);
  });
});

describe('lighting presets keep the specified setups (builder.md 5.3)', () => {
  it('STUDIO: hemisphere + key + fill + rim (+ soft front fill); SOFT: ambient + hemisphere + one key; NIGHT: hemisphere + key + coral rim', () => {
    const kinds = (p: keyof typeof LIGHTING) => LIGHTING[p].map((l) => l.kind);
    expect(kinds('STUDIO').slice(0, 4)).toEqual(['hemisphere', 'directional', 'directional', 'directional']);
    expect(kinds('SOFT').slice(0, 3)).toEqual(['ambient', 'hemisphere', 'directional']);
    expect(kinds('NIGHT').slice(0, 3)).toEqual(['hemisphere', 'directional', 'directional']);
    const studioKey = LIGHTING.STUDIO[1];
    expect(studioKey && studioKey.kind === 'directional' && studioKey.position).toEqual([2, 3, -4]);
    const coral = LIGHTING.NIGHT[2];
    expect(coral && coral.kind === 'directional' && coral.color).toBe(0xff7a59);
  });
});
