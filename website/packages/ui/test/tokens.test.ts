import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/format';

const require = createRequire(import.meta.url);
const root = join(__dirname, '..');
const css = readFileSync(join(root, 'src', 'tokens.css'), 'utf8');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require('../tailwind-preset.cjs') as {
  theme: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- Tailwind config is untyped JS
  plugins: unknown[];
};

function cssVar(name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!m) throw new Error(`missing ${name} in tokens.css`);
  return (m[1] as string).toUpperCase();
}

describe('preset and tokens.css agree', () => {
  const pairs: Array<[string, string]> = [
    ['coral', '--color-coral'],
    ['ink', '--color-black'],
    ['white', '--color-white'],
    ['action', '--color-blue'],
    ['butter', '--color-butter'],
    ['sky', '--color-sky'],
    ['lilac', '--color-lilac'],
    ['cream', '--color-cream'],
    ['ink-70', '--color-ink-70'],
    ['ink-55', '--color-ink-55'],
    ['line', '--color-line'],
    ['line-strong', '--color-line-strong'],
    ['success', '--color-success'],
    ['danger', '--color-danger'],
    ['neutral', '--color-neutral'],
    ['disabled-bg', '--color-disabled-bg'],
    ['disabled-fg', '--color-disabled-fg'],
  ];
  it.each(pairs)('%s matches %s', (name, variable) => {
    expect((preset.theme.colors[name] as string).toUpperCase()).toBe(cssVar(variable));
  });

  it('matches the brand hex values from the brand identity', () => {
    expect(cssVar('--color-coral')).toBe('#FF7A59');
    expect(cssVar('--color-black')).toBe('#111111');
    expect(cssVar('--color-blue')).toBe('#2E63FF');
    expect(cssVar('--color-butter')).toBe('#FFE45C');
    expect(cssVar('--color-sky')).toBe('#5CC8FF');
    expect(cssVar('--color-lilac')).toBe('#C9B6FF');
    expect(cssVar('--color-cream')).toBe('#FFF4E6');
  });

  it('surface matches --color-surface', () => {
    expect((preset.theme.colors.surface.DEFAULT as string).toUpperCase()).toBe(cssVar('--color-surface'));
  });
});

describe('preset contract (design-system section 14)', () => {
  const t = preset.theme;

  it('REPLACES the palette: no Tailwind default colours exist', () => {
    const names = Object.keys(t.colors);
    for (const forbidden of ['red', 'blue', 'green', 'gray', 'slate', 'black', 'yellow', 'indigo', 'purple', 'pink', 'orange']) {
      expect(names, forbidden).not.toContain(forbidden);
    }
    expect(preset.theme.extend?.colors).toBeUndefined();
    expect(names).toEqual(
      expect.arrayContaining([
        'coral', 'ink', 'action', 'butter', 'sky', 'lilac', 'cream', 'ink-70', 'ink-55', 'line',
        'line-strong', 'surface', 'success', 'danger', 'neutral', 'fg', 'white',
      ]),
    );
  });

  it('exposes semantic variables', () => {
    expect(t.colors.fg.DEFAULT).toBe('var(--fg)');
    expect(t.colors.fg.muted).toBe('var(--fg-muted)');
    expect(t.colors.surface.base).toBe('var(--bg)');
    const border = t.borderColor({ theme: () => ({}) });
    expect(border.base).toBe('var(--border)');
    expect(border.control).toBe('var(--border-control)');
  });

  it('radii are 6/12/16/24 and full', () => {
    expect(t.borderRadius).toMatchObject({ sm: '6px', md: '12px', lg: '16px', xl: '24px', full: '9999px' });
  });

  it('has only shadow-float and shadow-overlay (plus none)', () => {
    expect(Object.keys(t.boxShadow).sort()).toEqual(['float', 'none', 'overlay']);
    expect(t.boxShadow.float).toBe('0 8px 24px rgba(17, 17, 17, 0.12)');
    expect(t.boxShadow.overlay).toBe('0 16px 48px rgba(17, 17, 17, 0.20)');
    expect(t.dropShadow).toEqual({});
  });

  it('breakpoints and container', () => {
    expect(t.screens).toEqual({ sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' });
    expect(t.container.center).toBe(true);
    expect(t.container.padding).toEqual({ DEFAULT: '1rem', md: '1.5rem', lg: '2rem' });
    expect(t.container.screens.xl).toBe('1264px'); // 1200px content + 2 x 32px padding
  });

  it('has the type scale', () => {
    for (const k of ['display', 'h1', 'h2', 'h3', 'h4', 'lead', 'body', 'body-sm', 'caption', 'price', 'button']) {
      expect(t.fontSize, k).toHaveProperty([k]);
    }
    expect(t.fontSize.display[0]).toBe('clamp(2.5rem, 1.6rem + 3.5vw, 4.5rem)');
    expect(t.fontSize.display[1]).toMatchObject({ lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' });
    expect(t.fontSize.body[0]).toBe('1rem');
    expect(t.fontSize['body-sm'][0]).toBe('0.875rem');
    expect(t.fontSize.caption[0]).toBe('0.75rem');
    expect(t.fontSize.h4[1].fontWeight).toBe('500');
    expect(t.fontWeight).toEqual({ normal: '400', medium: '500', bold: '700' });
  });

  it('fluid sizes land on the documented mobile and desktop values', () => {
    const fluid = (expr: string, vw: number) => {
      const m = /clamp\(([\d.]+)rem, ([\d.]+)rem \+ ([\d.]+)vw, ([\d.]+)rem\)/.exec(expr);
      if (!m) throw new Error(expr);
      const [min, base, slope, max] = m.slice(1).map(Number) as [number, number, number, number];
      return Math.min(max * 16, Math.max(min * 16, base * 16 + (slope * vw) / 100));
    };
    const px = (name: string, vw: number) => fluid(t.fontSize[name][0], vw);
    expect(px('display', 360)).toBeCloseTo(40, 0);
    // the documented clamp(2.5rem, 1.6rem + 3.5vw, 4.5rem) reaches 70.4px at 1280px (the doc rounds to 72)
    expect(Math.abs(px('display', 1280) - 72)).toBeLessThan(2);
    expect(px('h1', 360)).toBeCloseTo(32, 0);
    expect(px('h1', 1280)).toBeCloseTo(48, 0);
    expect(px('h2', 360)).toBeCloseTo(24, 0);
    expect(px('h2', 1280)).toBeCloseTo(36, 0);
    expect(px('h3', 360)).toBeCloseTo(20, 0);
    expect(px('h3', 1280)).toBeCloseTo(24, 0);
    expect(px('lead', 360)).toBeCloseTo(18, 0);
    expect(px('lead', 1280)).toBeCloseTo(20, 0);
  });

  it('has motion durations and easings including zip', () => {
    expect(t.transitionDuration).toMatchObject({ fast: '120ms', base: '200ms', slow: '320ms', zip: '450ms', 'zip-section': '600ms' });
    expect(t.transitionTimingFunction.standard).toBe('cubic-bezier(0.2, 0, 0, 1)');
    expect(t.transitionTimingFunction.in).toBe('cubic-bezier(0.4, 0, 1, 1)');
    expect(t.transitionTimingFunction.zip).toBe('cubic-bezier(0.65, 0, 0.35, 1)');
  });

  it('focus ring is 3px with a 2px offset', () => {
    expect(t.ringWidth.DEFAULT).toBe('3px');
    expect(t.ringOffsetWidth.DEFAULT).toBe('2px');
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid var\(--focus-ring\);\s*outline-offset:\s*2px;/);
  });

  it('exposes the logo clear-space spacing', () => {
    expect(t.extend.spacing.logo).toBe('var(--logo-clear)');
  });
});

describe('Tailwind output', () => {
  async function generate(content: string): Promise<string> {
    const postcss = require('postcss') as unknown as (plugins: unknown[]) => {
      process(css: string, opts: object): Promise<{ css: string }>;
    };
    const tailwind = require('tailwindcss') as (c: unknown) => unknown;
    const result = await postcss([tailwind({ presets: [preset], content: [{ raw: content, extension: 'html' }] })]).process(
      '@tailwind utilities;',
      { from: undefined },
    );
    return result.css;
  }

  it('generates the brand utilities', async () => {
    const out = await generate(
      'bg-coral text-ink bg-action bg-butter bg-sky bg-lilac bg-cream text-ink-70 text-ink-55 border-line border-line-strong bg-surface bg-success bg-danger bg-neutral text-fg text-fg-muted bg-surface-base border-base border-control p-logo shadow-float shadow-overlay duration-zip ease-zip rounded-lg rounded-sm text-h1 text-display text-body-sm tabular-nums bg-ink/40',
    );
    for (const cls of ['.bg-coral', '.text-ink', '.bg-action', '.bg-butter', '.bg-sky', '.bg-lilac', '.bg-cream', '.text-ink-70', '.border-line', '.bg-surface', '.bg-success', '.bg-danger', '.bg-neutral', '.text-fg', '.text-fg-muted', '.bg-surface-base', '.border-base', '.border-control', '.p-logo', '.shadow-float', '.shadow-overlay', '.duration-zip', '.ease-zip', '.rounded-lg', '.text-h1', '.text-display', '.tabular-nums']) {
      expect(out, cls).toContain(cls);
    }
    expect(out).toContain('background-color: rgb(255 122 89 / var(--tw-bg-opacity');
    expect(out).toContain('var(--logo-clear)');
    expect(out).toContain('border-radius: 16px');
    expect(out).toMatch(/\.bg-ink\\\/40/);
  });

  it('generates NOTHING for off-brand colours, Tailwind default shadows or radii', async () => {
    const out = await generate('bg-red-500 text-blue-600 bg-gray-100 text-slate-900 bg-black bg-yellow-300 shadow-md shadow-lg shadow-xl shadow shadow-sm rounded-3xl font-bold-x font-semibold font-light text-xs text-sm text-lg text-2xl bg-gradient-to-r from-red-500');
    expect(out.trim()).toBe('');
  });
});

describe('contrast pairs (design-system section 3, WCAG relative luminance)', () => {
  const C = {
    ink: cssVar('--color-black'),
    white: cssVar('--color-white'),
    coral: cssVar('--color-coral'),
    blue: cssVar('--color-blue'),
    butter: cssVar('--color-butter'),
    sky: cssVar('--color-sky'),
    lilac: cssVar('--color-lilac'),
    cream: cssVar('--color-cream'),
    ink70: cssVar('--color-ink-70'),
    ink55: cssVar('--color-ink-55'),
    lineStrong: cssVar('--color-line-strong'),
    success: cssVar('--color-success'),
    danger: cssVar('--color-danger'),
    neutral: cssVar('--color-neutral'),
    disabledBg: cssVar('--color-disabled-bg'),
    disabledFg: cssVar('--color-disabled-fg'),
    surface: cssVar('--color-surface'),
  };
  const darkMuted = /--fg-muted:\s*(#[0-9a-fA-F]{6})/.exec(css.slice(css.indexOf('.surface-dark')))?.[1] as string;
  const darkControl = /--border-control:\s*(#[0-9a-fA-F]{6})/.exec(css.slice(css.indexOf('.surface-dark')))?.[1] as string;

  const passes: Array<[string, string, string, number, number]> = [
    // label, fg, bg, expected (documented), minimum required
    ['black on white', C.ink, C.white, 18.9, 7],
    ['white on black', C.white, C.ink, 18.9, 7],
    ['black on coral', C.ink, C.coral, 7.4, 7],
    ['white on blue', C.white, C.blue, 4.8, 4.5],
    ['black on butter', C.ink, C.butter, 14.8, 7],
    ['black on sky', C.ink, C.sky, 10.0, 7],
    ['black on lilac', C.ink, C.lilac, 10.5, 7],
    ['black on cream', C.ink, C.cream, 17.4, 7],
    ['coral text on black', C.coral, C.ink, 7.4, 4.5],
    ['blue text on white', C.blue, C.white, 4.8, 4.5],
    ['ink-70 on white', C.ink70, C.white, 8.6, 4.5],
    ['ink-70 on cream', C.ink70, C.cream, 7.8, 4.5],
    ['ink-55 on white (helper text)', C.ink55, C.white, 5.3, 4.5],
    ['ink-55 on cream', C.ink55, C.cream, 4.8, 4.5],
    ['white on success', C.white, C.success, 5.4, 4.5],
    ['white on danger', C.white, C.danger, 5.6, 4.5],
    ['danger text on white', C.danger, C.white, 5.6, 4.5],
    ['white on neutral', C.white, C.neutral, 5.3, 4.5],
    ['line-strong control border on white (non-text 3:1)', C.lineStrong, C.white, 3.4, 3],
    ['line-strong control border on cream (non-text 3:1)', C.lineStrong, C.cream, 3.1, 3],
    ['dark --fg-muted on black', darkMuted, C.ink, 11.4, 4.5],
    ['dark --border-control on black (non-text 3:1)', darkControl, C.ink, 5.8, 3],
    ['black on surface', C.ink, C.surface, 17.5, 7],
    ['ink-70 on surface', C.ink70, C.surface, 7.9, 4.5],
    ['white on action blue as a button edge on black is >= 3:1 non-text', C.blue, C.ink, 3.9, 3],
  ];
  it.each(passes)('%s', (_label, fg, bg, expected, min) => {
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(min);
    expect(ratio).toBeGreaterThan(expected - 0.15);
    expect(ratio).toBeLessThan(expected + 0.25);
  });

  const fails: Array<[string, string, string, number]> = [
    ['white on coral', C.white, C.coral, 3],
    ['coral text on white', C.coral, C.white, 3],
    ['coral text on cream', C.coral, C.cream, 3],
    ['blue text on cream', C.blue, C.cream, 4.5],
    ['blue text on black', C.blue, C.ink, 4.5],
    ['ink-70 on coral (hence .surface-colored switches muted to full ink)', C.ink70, C.coral, 4.5],
  ];
  it.each(fails)('%s stays forbidden (ratio below the AA threshold)', (_label, fg, bg, below) => {
    expect(contrastRatio(fg, bg)).toBeLessThan(below);
  });

  it('colored bands use full ink for muted text (so muted text still passes)', () => {
    const block = css.slice(css.indexOf('.surface-colored'), css.indexOf('.surface-coral'));
    expect(block).toContain('--fg-muted: var(--color-black)');
    for (const bg of [C.coral, C.butter, C.sky, C.lilac, C.cream]) expect(contrastRatio(C.ink, bg)).toBeGreaterThanOrEqual(7);
  });

  it('records the legibility of disabled text (exempt from contrast, reported here)', () => {
    // design-system 2.2 asks for >= 4.5:1 on the page; on the disabled fill it is lower. Exempt (inactive control).
    expect(contrastRatio(C.disabledFg, C.white)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(C.disabledFg, C.disabledBg)).toBeGreaterThan(3);
  });
});

describe('no raw colours or off-scale styling in components', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) files.push(p);
    }
  };
  walk(join(root, 'src'));

  it('has no hex, rgb() or hsl() colour in any component source', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b(?![\w-])/);
      expect(src, f).not.toMatch(/\brgba?\(/);
      expect(src, f).not.toMatch(/\bhsla?\(/);
    }
  });

  it('has no arbitrary colour utilities (bg-[#...], text-[...color])', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\b(?:bg|text|border|ring|fill|stroke|from|to|via|shadow)-\[(?:#|rgb|hsl|var\(--color)/);
    }
  });

  it('has no gradients and only the two allowed shadows in class names', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/bg-gradient|linear-gradient|radial-gradient|backdrop-blur|blur-|drop-shadow/);
      for (const m of src.matchAll(/\bshadow-([a-z0-9-]+)/g)) {
        expect(['float', 'overlay', 'none']).toContain(m[1]);
      }
    }
  });

  it('only uses the three Poppins weights', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\bfont-(thin|extralight|light|semibold|extrabold|black)\b/);
    }
  });
});
