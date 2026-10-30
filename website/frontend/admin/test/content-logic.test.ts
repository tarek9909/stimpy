import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLB_LIMITS, gradeBudget, validateHoodieGlb } from '../src/lib/glbValidator';
import { asToken, findTokens, insertAtCursor, unknownPlaceholders } from '../src/pages/content/placeholders';
import { faqGroups, filterFaqs, moveInView, normalizeGroup, UNGROUPED } from '../src/pages/content/faqLogic';

const GLB_PATH = resolve(__dirname, '../../../backend/seed-assets/models/hoodie.glb');
const real = () => new Uint8Array(readFileSync(GLB_PATH));

/** Rebuilds a GLB after `mutate` edited its JSON chunk (BIN chunk kept). */
function rebuild(bytes: Uint8Array, mutate: (json: Record<string, unknown>) => void, extraBin = 0): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen))) as Record<string, unknown>;
  mutate(json);
  let text = JSON.stringify(json);
  while (new TextEncoder().encode(text).length % 4) text += ' ';
  const jsonBytes = new TextEncoder().encode(text);
  const binOff = 20 + jsonLen + ((4 - (jsonLen % 4)) % 4);
  const binLen = dv.getUint32(binOff, true);
  const bin = bytes.subarray(binOff + 8, binOff + 8 + binLen);
  const padded = new Uint8Array(bin.length + extraBin);
  padded.set(bin);
  const total = 12 + 8 + jsonBytes.length + 8 + padded.length;
  const out = new Uint8Array(total);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true);
  o.setUint32(4, 2, true);
  o.setUint32(8, total, true);
  o.setUint32(12, jsonBytes.length, true);
  o.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const bo = 20 + jsonBytes.length;
  o.setUint32(bo, padded.length, true);
  o.setUint32(bo + 4, 0x004e4942, true);
  out.set(padded, bo + 8);
  return out;
}

describe('GLB validator port', () => {
  it('accepts the real seeded hoodie.glb with stats the dashboard shows', () => {
    const r = validateHoodieGlb(real());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.stats.totalTriangles).toBe(40228);
    expect(r.stats.materials).toEqual(['fabric', 'panel']);
    expect(r.stats.nodeNames).toEqual(expect.arrayContaining(['Hoodie', 'hoodie_body', 'back_panel']));
    expect(r.stats.skins).toBe(0);
    expect(r.stats.animations).toBe(0);
    expect(r.stats.panel?.aspect).toBeCloseTo(0.6382, 3);
    // 40,228 triangles is above the 40,000 target but below the hard limit: a warning, not an error.
    expect(r.warnings.join(' ')).toMatch(/exceed target 40000/);
  });

  it('matches the CLI validator numbers (same limits)', () => {
    expect(GLB_LIMITS.trisHard).toBe(80000);
    expect(gradeBudget(40228, GLB_LIMITS.trisTarget, GLB_LIMITS.trisHard)).toBe('warn');
    expect(gradeBudget(100, 40000, 80000)).toBe('ok');
    expect(gradeBudget(90000, 40000, 80000)).toBe('bad');
  });

  it('rejects a file that is not a GLB', () => {
    expect(validateHoodieGlb(new Uint8Array(64)).errors).toEqual(['Not a GLB (bad magic)']);
    const png = new Uint8Array(64);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    expect(validateHoodieGlb(png).ok).toBe(false);
  });

  it('reports a truncated file (header length mismatch)', () => {
    const b = real();
    const r = validateHoodieGlb(b.subarray(0, b.length - 100));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('GLB header length does not match file size');
  });

  it('reports a missing back-panel mesh by the chosen name', () => {
    const r = validateHoodieGlb(real(), { panelMesh: 'Back' });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Back panel mesh "Back" is missing');
  });

  it('reports a third material', () => {
    const r = validateHoodieGlb(rebuild(real(), (j) => { (j.materials as unknown[]).push({ name: 'extra' }); }));
    expect(r.errors).toContain('Exactly two materials required (found 3)');
  });

  it('reports skins and animations', () => {
    const r = validateHoodieGlb(rebuild(real(), (j) => { j.skins = [{ joints: [0] }]; j.animations = [{ channels: [], samplers: [] }]; }));
    expect(r.errors).toContain('Scene must not contain skins (found 1)');
    expect(r.errors).toContain('Scene must not contain animations (found 1)');
    expect(r.stats.skins).toBe(1);
    expect(r.stats.animations).toBe(1);
  });

  it('reports a wrong root node name and a disallowed extension', () => {
    const r = validateHoodieGlb(rebuild(real(), (j) => {
      (j.nodes as Array<{ name: string }>)[0]!.name = 'Root';
      j.extensionsUsed = ['KHR_materials_clearcoat'];
    }));
    expect(r.errors).toContain('Scene must have exactly one root node named "Hoodie"');
    expect(r.errors).toContain('Extension not allowed: KHR_materials_clearcoat');
  });

  it('reports a file over the 5 MB hard limit', () => {
    const r = validateHoodieGlb(rebuild(real(), () => undefined, 5 * 1024 * 1024));
    expect(r.errors.some((e) => /exceeds hard limit 5 MB/.test(e))).toBe(true);
  });

  it('reports a non-identity transform', () => {
    const r = validateHoodieGlb(rebuild(real(), (j) => { (j.nodes as Array<Record<string, unknown>>)[1]!.scale = [2, 2, 2]; }));
    expect(r.errors.some((e) => /non-identity transform/.test(e))).toBe(true);
  });
});

describe('placeholder chips', () => {
  const allowed = ['customer_name', '{order_number}', 'items'];
  it('normalises API placeholders and finds tokens', () => {
    expect(asToken('items')).toBe('{items}');
    expect(asToken('{items}')).toBe('{items}');
    expect(findTokens('Hi {customer_name}, {foo} and {order_number} {}')).toEqual(['{customer_name}', '{foo}', '{order_number}', '{}']);
  });
  it('flags unknown placeholders only, once each', () => {
    expect(unknownPlaceholders('Hi {customer_name} {foo} {foo} {Items}', allowed)).toEqual(['{foo}', '{Items}']);
    expect(unknownPlaceholders('Plain text', allowed)).toEqual([]);
  });
  it('inserts a chip at the caret and replaces a selection', () => {
    expect(insertAtCursor('Hello !', 6, 6, '{customer_name}')).toEqual({ value: 'Hello {customer_name}!', caret: 21 });
    expect(insertAtCursor('Hello XXX!', 6, 9, '{items}').value).toBe('Hello {items}!');
    expect(insertAtCursor('abc', 99, 99, '{x}').value).toBe('abc{x}');
  });
});

describe('FAQ groups and reorder', () => {
  const faqs = [
    { id: 1, group: 'Ordering' },
    { id: 2, group: 'Sizing' },
    { id: 3, group: 'Ordering' },
    { id: 4, group: null },
    { id: 5, group: ' ' },
    { id: 6, group: 'Sizing' },
  ];
  it('lists distinct groups and filters', () => {
    expect(faqGroups(faqs)).toEqual(['Ordering', 'Sizing']);
    expect(filterFaqs(faqs, 'Ordering').map((f) => f.id)).toEqual([1, 3]);
    expect(filterFaqs(faqs, UNGROUPED).map((f) => f.id)).toEqual([4, 5]);
    expect(filterFaqs(faqs, 'all')).toHaveLength(6);
  });
  it('blank group saves null', () => {
    expect(normalizeGroup('  ')).toBeNull();
    expect(normalizeGroup(' Care ')).toBe('Care');
  });
  it('moves inside the full list one step', () => {
    const all = [1, 2, 3, 4, 5, 6];
    expect(moveInView(all, all, 3, -1)).toEqual([1, 3, 2, 4, 5, 6]);
    expect(moveInView(all, all, 1, -1)).toEqual(all);
  });
  it('moves inside a filtered view while keeping one global order of ALL ids', () => {
    const all = [1, 2, 3, 4, 5, 6];
    const view = [1, 3]; // Ordering
    // 3 up in the view: takes the place before 1
    expect(moveInView(all, view, 3, -1)).toEqual([3, 1, 2, 4, 5, 6]);
    // 1 down in the view: goes after 3
    expect(moveInView(all, view, 1, 1)).toEqual([2, 3, 1, 4, 5, 6]);
    // edges are no-ops
    expect(moveInView(all, view, 1, -1)).toEqual(all);
    const next = moveInView(all, [2, 6], 6, -1);
    expect([...next].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(next.indexOf(6)).toBeLessThan(next.indexOf(2));
  });
});
