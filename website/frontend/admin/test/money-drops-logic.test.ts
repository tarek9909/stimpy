import { describe, expect, it } from 'vitest';
import { addDays, averageProfitCents, describeRange, detectPreset, formatPercent, presetRange, unitsPerHour } from '../src/lib/ranges';
import { dropControls, dropSchema, formatDuration, hoursToSellOut, launchInPast, NEW_DROP, overlappingLive, toDropBody } from '../src/pages/drops/dropForm';
import { formatMoney } from '../src/lib/format';

describe('range presets (business time zone dates)', () => {
  it('this month, last month, last 30 days, all time', () => {
    expect(presetRange('month', '2026-10-02')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('last-month', '2026-10-02')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('last-month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('30d', '2026-10-02')).toEqual({ from: '2026-09-03', to: '2026-10-02' });
    expect(presetRange('all', '2026-10-02')).toEqual({ from: null, to: null });
    expect(presetRange('month', '2028-02-10').to).toBe('2028-02-29');
  });
  it('detects the active preset or custom', () => {
    expect(detectPreset({ from: '2026-10-01', to: '2026-10-31' }, '2026-10-02')).toBe('month');
    expect(detectPreset({ from: null, to: null }, '2026-10-02')).toBe('all');
    expect(detectPreset({ from: '2026-10-05', to: '2026-10-06' }, '2026-10-02')).toBe('custom');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(describeRange({ from: null, to: null })).toBe('All time');
  });
});

describe('finance and insights formatting', () => {
  it('money comes from cents with two decimals and a minus sign for losses', () => {
    expect(formatMoney(4500)).toBe('$45.00');
    expect(formatMoney(-400)).toBe('-$4.00');
    expect(formatMoney(125000)).toBe('$1,250.00');
  });
  it('ratios are fractions: 0.285 -> 28.5%', () => {
    expect(formatPercent(0.285)).toBe('28.5%');
    expect(formatPercent(0.3)).toBe('30%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1.2)).toBe('120%');
  });
  it('average profit per order rounds to whole cents and survives zero orders', () => {
    expect(averageProfitCents(1000, 3)).toBe(333);
    expect(averageProfitCents(-1000, 3)).toBe(-333);
    expect(averageProfitCents(500, 0)).toBe(0);
  });
  it('units per hour since launch', () => {
    const start = '2026-10-01T10:00:00.000Z';
    expect(unitsPerHour(12, start, Date.parse('2026-10-01T16:00:00.000Z'))).toBe(2);
    expect(unitsPerHour(1, start, Date.parse('2026-10-01T09:00:00.000Z'))).toBeNull();
  });
});

describe('drop form and state controls', () => {
  const valid = { ...NEW_DROP, name: 'Drop 03', startsAt: '2026-11-01T18:00:00.000Z' };
  it('requires a name, valid accent hex, launch and an end after launch', () => {
    expect(dropSchema.safeParse(valid).success).toBe(true);
    const bad = dropSchema.safeParse({ ...valid, name: ' ', accentHex: 'sky', startsAt: null });
    expect(bad.success).toBe(false);
    const paths = bad.success ? [] : bad.error.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['name', 'accentHex', 'startsAt']));
    const end = dropSchema.safeParse({ ...valid, endsAt: '2026-11-01T17:00:00.000Z' });
    expect(end.success ? '' : end.error.issues[0]?.message).toBe('The end must be after the launch.');
  });
  it('builds the API body with the assigned Stimpie ids', () => {
    const body = toDropBody({ ...valid, stimpieIds: [3, 5], story: 's', accentHex: '#5cc8ff' });
    expect(body).toMatchObject({ name: 'Drop 03', accentHex: '#5CC8FF', stimpieIds: [3, 5], endsAt: null, startsAt: '2026-11-01T18:00:00.000Z' });
  });
  it('state controls: upcoming editable, live can end, ended read-only', () => {
    expect(dropControls('UPCOMING')).toMatchObject({ canEdit: true, startsAtLocked: false, canEnd: false });
    expect(dropControls('LIVE')).toMatchObject({ canEdit: true, startsAtLocked: true, canEnd: true });
    expect(dropControls('SOLD_OUT')).toMatchObject({ canEdit: false, startsAtLocked: true, canEnd: true });
    expect(dropControls('ENDED')).toMatchObject({ canEdit: false, canEnd: false });
  });
  it('UI checks: past launch and overlapping live drop', () => {
    expect(launchInPast('2026-01-01T00:00:00.000Z', Date.parse('2026-02-01T00:00:00.000Z'))).toBe(true);
    expect(launchInPast('2026-03-01T00:00:00.000Z', Date.parse('2026-02-01T00:00:00.000Z'))).toBe(false);
    expect(overlappingLive([{ id: 1, state: 'LIVE', name: 'Drop 01' }, { id: 2, state: 'UPCOMING', name: 'Drop 02' }], 2)).toBe('Drop 01');
    expect(overlappingLive([{ id: 1, state: 'LIVE', name: 'Drop 01' }], 1)).toBeNull();
  });
  it('time to sell out', () => {
    expect(hoursToSellOut('2026-10-01T10:00:00.000Z', '2026-10-01T13:30:00.000Z')).toBe(3.5);
    expect(hoursToSellOut('2026-10-01T10:00:00.000Z', null)).toBeNull();
    expect(formatDuration(3.5)).toBe('3 h 30 min');
    expect(formatDuration(0.25)).toBe('15 min');
    expect(formatDuration(52)).toBe('2 days 4 h');
  });
});
