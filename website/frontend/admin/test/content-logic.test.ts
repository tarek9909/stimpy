import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLB_LIMITS, gradeBudget, validateHoodieGlb } from '../src/lib/glbValidator';
import {
  DEFAULT_PLACEMENT,
  dragBy,
  fractionToPercent,
  heightFraction,
  insideFraction,
  nudge,
  normalizeRotation,
  panelBox,
  percentToFraction,
  resizeFromPointer,
  resizeTo,
  rotationFromPointer,
  validatePlacement,
} from '../src/pages/content/placement';
import { asToken, findTokens, insertAtCursor, unknownPlaceholders } from '../src/pages/content/placeholders';
import { faqGroups, filterFaqs, moveInView, normalizeGroup, UNGROUPED } from '../src/pages/content/faqLogic';
import {
  builderOptionScope,
  effectiveModeOf,
  emptyColorEntry,
  formFingerprint,
  meshProblem,
  modeNotes,
  readinessOf,
  toPreviewData,
  toPutBody,
  validateBuilder,
  withAllColors,
  type AdminBuilder,
} from '../src/pages/content/builderForm';

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

describe('2D placement maths', () => {
  const W = 1000, H = 1250;
  it('x/y are the CENTRE of the panel and the box height is width / 0.64', () => {
    const b = panelBox({ x: 0.5, y: 0.46, width: 0.36, rotation: 0 }, W, H);
    expect(b.width).toBeCloseTo(360);
    expect(b.height).toBeCloseTo(562.5);
    expect(b.cx).toBeCloseTo(500);
    expect(b.cy).toBeCloseTo(575);
    expect(b.left).toBeCloseTo(320);
    expect(b.top).toBeCloseTo(575 - 281.25);
    expect(b.height / b.width).toBeCloseTo(1 / 0.64);
  });
  it('derives the height fraction instead of storing it', () => {
    expect(heightFraction({ x: 0.5, y: 0.5, width: 0.32, rotation: 0 }, 1000, 1250)).toBeCloseTo(0.4);
  });
  it('resizing keeps the 0.64 lock and the centre', () => {
    const p = resizeTo(DEFAULT_PLACEMENT, 0.5);
    const b = panelBox(p, W, H);
    expect(b.height / b.width).toBeCloseTo(1 / 0.64);
    expect(p.x).toBe(DEFAULT_PLACEMENT.x);
    expect(resizeTo(DEFAULT_PLACEMENT, 5).width).toBe(1);
    expect(resizeTo(DEFAULT_PLACEMENT, 0).width).toBe(0.05);
  });
  it('corner-handle resize uses the distance to the centre along the diagonal', () => {
    const p = { x: 0.5, y: 0.5, width: 0.4, rotation: 0 };
    const b = panelBox(p, W, H);
    // pointer exactly on the bottom-right corner reproduces the same width
    const same = resizeFromPointer(p, { x: b.left + b.width, y: b.top + b.height }, W, H);
    expect(same.width).toBeCloseTo(0.4, 3);
    const bigger = resizeFromPointer(p, { x: b.left + b.width + 100, y: b.top + b.height + 100 }, W, H);
    expect(bigger.width).toBeGreaterThan(0.4);
  });
  it('dragging moves the centre by the pixel delta and clamps to the image', () => {
    const p = dragBy({ x: 0.5, y: 0.5, width: 0.3, rotation: 0 }, 100, -125, W, H);
    expect(p.x).toBeCloseTo(0.6);
    expect(p.y).toBeCloseTo(0.4);
    expect(dragBy(p, 9999, 9999, W, H)).toMatchObject({ x: 1, y: 1 });
  });
  it('rotation is clockwise about the centre: pointer right of centre = +90, left = -90, below = 180', () => {
    const p = { x: 0.5, y: 0.5, width: 0.3, rotation: 0 };
    expect(rotationFromPointer(p, { x: 700, y: 625 }, W, H).rotation).toBeCloseTo(90);
    expect(rotationFromPointer(p, { x: 300, y: 625 }, W, H).rotation).toBeCloseTo(-90);
    expect(rotationFromPointer(p, { x: 500, y: 100 }, W, H).rotation).toBeCloseTo(0);
    expect(Math.abs(rotationFromPointer(p, { x: 500, y: 1000 }, W, H).rotation)).toBeCloseTo(180);
    expect(normalizeRotation(270)).toBe(-90);
    expect(normalizeRotation(-190)).toBe(170);
  });
  it('arrow keys nudge by 0.5%, Shift by 2%, +/- resize', () => {
    const p = { x: 0.5, y: 0.5, width: 0.3, rotation: 0 };
    expect(nudge(p, 'ArrowRight', false).x).toBeCloseTo(0.505);
    expect(nudge(p, 'ArrowUp', true).y).toBeCloseTo(0.48);
    expect(nudge(p, '+', false).width).toBeCloseTo(0.305);
    expect(nudge(p, '-', true).width).toBeCloseTo(0.28);
    expect(nudge(p, 'a', false)).toBe(p);
  });
  it('validates ranges and the at-least-50%-inside rule', () => {
    expect(validatePlacement({ x: 0.5, y: 0.46, width: 0.36, rotation: 0 })).toEqual([]);
    expect(validatePlacement({ x: 1.2, y: 0.5, width: 0.3, rotation: 0 })[0]).toMatch(/X must be/);
    expect(validatePlacement({ x: 0.5, y: 0.5, width: 0, rotation: 0 })[0]).toMatch(/Width/);
    expect(validatePlacement({ x: 0.5, y: 0.5, width: 0.3, rotation: 200 })[0]).toMatch(/Rotation/);
    expect(validatePlacement({ x: 1, y: 1, width: 0.3, rotation: 0 })[0]).toMatch(/half/);
    expect(validatePlacement({ x: 1, y: 0.5, width: 0.3, rotation: 0 })).toEqual([]);
    expect(insideFraction({ x: 0.5, y: 0.5, width: 0.3, rotation: 0 }, W, H)).toBeCloseTo(1);
    expect(insideFraction({ x: 1, y: 0.5, width: 0.3, rotation: 0 }, W, H)).toBeCloseTo(0.5);
  });
  it('percent fields show fractions as percentages and parse them back', () => {
    expect(fractionToPercent(0.425)).toBe('42.5');
    expect(fractionToPercent(0.36)).toBe('36');
    expect(percentToFraction('42.5')).toBe(0.425);
    expect(percentToFraction('42,5 %')).toBe(0.425);
    expect(percentToFraction('abc')).toBeNull();
    expect(percentToFraction('')).toBeNull();
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

const baseForm = (): AdminBuilder => ({
  mode: 'BOTH',
  defaultView: '3D',
  hoodieId: 1,
  hoodie: { id: 1, slug: 'stimpy-hoodie', name: 'Stimpy Hoodie' },
  model3d: { url: 'http://x/uploads/a.glb', sizeBytes: 978332, backPanelMesh: 'back_panel', panelAspect: 0.64, camera: { position: [0, 0.02, -2.5], target: [0, 0, 0], fov: 32 }, lighting: 'STUDIO' },
  colors: [
    { colorId: 1, tint: '#111111', texture3d: null, hoodieImage2d: 'http://x/a.webp', overlay2d: 'http://x/o.webp', placement2d: { x: 0.5, y: 0.46, width: 0.36, rotation: 0 } },
    { colorId: 2, tint: '#FFF4E6', texture3d: null, hoodieImage2d: null, overlay2d: null, placement2d: null },
  ],
  stimpieTextures: [{ stimpieId: 4, textureUrl: 'http://x/t.webp' }],
  assetsReady: { model3d: true, colors2d: [], overlays2d: 1, stimpieTextures: 1 },
  warnings: [],
});

describe('Builder form mapping', () => {
  it('previews only the selected hoodie options and falls back when that hoodie is hidden', () => {
    const hoodies = [
      { id: 1, slug: 'first', name: 'First', active: true, colorIds: [1], sizeIds: [10] },
      { id: 2, slug: 'second', name: 'Second', active: true, colorIds: [2, 3], sizeIds: [11] },
    ];
    const colors = [{ id: 1, active: true }, { id: 2, active: true }, { id: 3, active: false }, { id: 4, active: true }];
    const sizes = [{ id: 10, active: true }, { id: 11, active: true }];
    expect(builderOptionScope(2, hoodies, colors, sizes).colors.map((c) => c.id)).toEqual([2]);
    const hidden = hoodies.map((h) => ({ ...h, active: h.id !== 2 }));
    const fallback = builderOptionScope(2, hidden, colors, sizes);
    expect(fallback.hoodie?.id).toBe(1);
    expect(fallback.colors.map((c) => c.id)).toEqual([1]);
    expect(builderOptionScope(2, hoodies, colors, [{ id: 10, active: true }, { id: 11, active: false }]).colors).toEqual([]);
    expect(builderOptionScope(null, [], colors, sizes).colors).toEqual([]);
  });
  it('PUT body is the full writable object without the read-only mirrors', () => {
    const body = toPutBody(baseForm());
    expect(Object.keys(body).sort()).toEqual(['colors', 'defaultView', 'hoodieId', 'mode', 'model3d', 'stimpieTextures']);
    expect(body.colors[0]).toEqual({ colorId: 1, hoodieImage2d: 'http://x/a.webp', overlay2d: 'http://x/o.webp', placement2d: { x: 0.5, y: 0.46, width: 0.36, rotation: 0 } });
    expect(JSON.stringify(body)).not.toMatch(/tint|texture3d|assetsReady|warnings|sizeBytes/);
    expect(body.model3d?.camera).toEqual({ position: [0, 0.02, -2.5], target: [0, 0, 0], fov: 32 });
    expect(toPutBody({ ...baseForm(), model3d: null }).model3d).toBeNull();
  });
  it('trims the mesh name and gives every colour an entry', () => {
    const f = baseForm();
    f.model3d!.backPanelMesh = ' back_panel ';
    expect(toPutBody(f).model3d?.backPanelMesh).toBe('back_panel');
    const more = withAllColors(f, [1, 2, 3]);
    expect(more.colors.map((c) => c.colorId)).toEqual([1, 2, 3]);
    expect(more.colors[2]).toEqual(emptyColorEntry(3));
    expect(withAllColors(f, [1, 2])).toBe(f);
  });
  it('mode resolution follows business-rules 12', () => {
    expect(effectiveModeOf(baseForm())).toBe('BOTH');
    expect(effectiveModeOf({ ...baseForm(), model3d: null })).toBe('2D');
    expect(effectiveModeOf({ ...baseForm(), mode: '2D' })).toBe('2D');
    expect(effectiveModeOf({ ...baseForm(), mode: '3D' })).toBe('3D');
    const noMesh = baseForm();
    noMesh.model3d!.backPanelMesh = '';
    expect(effectiveModeOf(noMesh)).toBe('2D');
  });
  it('readiness counts like the server and warns about missing assets', () => {
    const f = baseForm();
    const r = readinessOf(f, [1, 2]);
    expect(r).toEqual({ model3d: true, colors2d: [{ colorId: 1, ready: true }, { colorId: 2, ready: false }], overlays2d: 1, stimpieTextures: 1 });
    expect(modeNotes(f, r)).toEqual([]);
    const none = { ...f, model3d: null };
    expect(modeNotes(none, readinessOf(none, [1, 2]))[0]).toBe('No 3D model is configured. The website will use 2D until the model is configured in code.');
    const empty = { ...f, mode: '2D' as const, colors: f.colors.map((c) => emptyColorEntry(c.colorId)) };
    expect(modeNotes(empty, readinessOf(empty, [1, 2])).join(' ')).toMatch(/No colour has a 2D image/);
  });
  it('blocking validation: editable colour placement', () => {
    expect(validateBuilder(baseForm())).toEqual({});
    const f = baseForm();
    f.model3d!.backPanelMesh = '';
    f.model3d!.camera.fov = 5;
    f.model3d!.camera.position = [0, NaN, 1];
    f.model3d!.panelAspect = 0;
    f.colors[0]!.placement2d = { x: 2, y: 0.5, width: 0.3, rotation: 0 };
    expect(Object.keys(validateBuilder(f)).sort()).toEqual(['colors.0.placement2d']);
  });
  it('preview data: BOTH toggle regardless of the edited mode, and 2D without a model', () => {
    const colors = [{ id: 1, name: 'Black', hex: '#111111', position: 1 }];
    const d = toPreviewData({ form: { ...baseForm(), mode: '2D' }, colors, stimpies: [] });
    expect(d.config.effectiveMode).toBe('BOTH');
    expect(d.config.defaultView).toBe('2D');
    expect(d.config.mode).toBe('2D');
    expect(d.config.colors).toHaveLength(2);
    expect(toPreviewData({ form: { ...baseForm(), mode: '3D' }, colors, stimpies: [] }).config.defaultView).toBe('3D');
    const noModel = toPreviewData({ form: { ...baseForm(), model3d: null }, colors, stimpies: [] });
    expect(noModel.config.effectiveMode).toBe('2D');
    expect(noModel.config.model3d).toBeNull();
  });
  it('dirty fingerprint ignores read-only mirrors and changes with writable fields', () => {
    const a = baseForm();
    const b = { ...baseForm(), warnings: ['x'], assetsReady: { model3d: false, colors2d: [], overlays2d: 0, stimpieTextures: 0 } };
    expect(formFingerprint(a)).toBe(formFingerprint(b));
    const c = baseForm();
    c.colors[0]!.placement2d = { x: 0.4, y: 0.46, width: 0.36, rotation: 0 };
    expect(formFingerprint(c)).not.toBe(formFingerprint(a));
  });
  it('flags a back-panel mesh that is not in the parsed names', () => {
    expect(meshProblem('Back', ['Hoodie', 'back_panel'])).toBe("Mesh 'Back' not found in this model");
    expect(meshProblem('back_panel', ['Hoodie', 'back_panel'])).toBeNull();
    expect(meshProblem('x', null)).toBeNull();
  });
});
