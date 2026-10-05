import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichText, parseInline, parseRichText } from '../src/components/RichText';

function html(text: string) {
  const { container } = render(<RichText text={text} />);
  return container;
}

describe('RichText structure', () => {
  it('renders blank-line paragraphs', () => {
    const c = html('First paragraph.\n\nSecond paragraph.');
    const ps = c.querySelectorAll('p');
    expect(ps).toHaveLength(2);
    expect(ps[0]).toHaveTextContent('First paragraph.');
    expect(ps[1]).toHaveTextContent('Second paragraph.');
  });

  it('renders **bold**', () => {
    const c = html('This is **very** good.');
    const strong = c.querySelector('strong');
    expect(strong).toHaveTextContent('very');
    expect(c.querySelector('p')).toHaveTextContent('This is very good.');
  });

  it('renders "- " lists', () => {
    const c = html('- one\n- two **bold**\n- three');
    const items = c.querySelectorAll('ul > li');
    expect(items).toHaveLength(3);
    expect(items[1]?.querySelector('strong')).toHaveTextContent('bold');
  });

  it('handles a paragraph followed by a list in one block', () => {
    const c = html('Intro line\n- a\n- b');
    expect(c.querySelectorAll('p')).toHaveLength(1);
    expect(c.querySelectorAll('li')).toHaveLength(2);
  });

  it('keeps single newlines as line breaks and normalises CRLF', () => {
    const c = html('line one\r\nline two');
    expect(c.querySelectorAll('br')).toHaveLength(1);
  });

  it('leaves unmatched or empty ** as literal text', () => {
    expect(parseInline('a **b')).toEqual([{ text: 'a **b', bold: false }]);
    expect(parseInline('a **** b')).toEqual([{ text: 'a **** b', bold: false }]);
    expect(parseInline('**x** and **y**')).toEqual([
      { text: 'x', bold: true },
      { text: ' and ', bold: false },
      { text: 'y', bold: true },
    ]);
  });

  it('renders nothing for empty, whitespace or null text', () => {
    expect(html('').childElementCount).toBe(0);
    expect(html('   \n\n  ').childElementCount).toBe(0);
    const { container } = render(<RichText text={null} />);
    expect(container.childElementCount).toBe(0);
  });

  it('parses blocks purely', () => {
    expect(parseRichText('a\n\n- b\n- c')).toHaveLength(2);
  });
});

const XSS_CASES = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">click</a>',
  '[click](javascript:alert(1))',
  '<iframe src="https://evil.example"></iframe>',
  '<svg onload=alert(1)>',
  '**<img src=x onerror=alert(1)>**',
  '- <b onmouseover=alert(1)>x</b>',
  '<style>body{display:none}</style>',
  '"><script>alert(1)</script>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '<!-- comment --><div>x</div>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
];

describe('RichText escapes everything else (XSS)', () => {
  it.each(XSS_CASES)('does not create elements from %s', (input) => {
    const c = html(input);
    const allowed = new Set(['DIV', 'P', 'UL', 'LI', 'STRONG', 'BR']);
    for (const el of Array.from(c.querySelectorAll('*'))) {
      expect(allowed.has(el.tagName), `unexpected <${el.tagName}>`).toBe(true);
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.startsWith('on')).toBe(false);
        expect(attr.name).not.toBe('href');
        expect(attr.name).not.toBe('src');
      }
    }
  });

  it('shows the markup as literal text', () => {
    const c = html('<script>alert(1)</script>');
    expect(c.textContent).toBe('<script>alert(1)</script>');
    expect(c.querySelector('script')).toBeNull();
  });

  it('does not decode entities', () => {
    const c = html('&lt;b&gt; and &amp;');
    expect(c.textContent).toBe('&lt;b&gt; and &amp;');
  });

  it('does not turn Markdown links or autolinks into anchors', () => {
    const c = html('[a](https://example.com) https://example.com');
    expect(c.querySelector('a')).toBeNull();
  });
});

describe('no dangerouslySetInnerHTML or framework imports in the package', () => {
  const root = join(__dirname, '..', 'src');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(root);

  it('never uses dangerouslySetInnerHTML', () => {
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it('never imports next/* or fetches data', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from ['"]next(\/|['"])/);
      expect(src, f).not.toMatch(/\bfetch\(/);
    }
  });
});

describe('React Server Component safety', () => {
  const root = join(__dirname, '..', 'src');
  const all: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) all.push(p);
    }
  };
  walk(root);
  const HOOKS = /\b(useState|useEffect|useLayoutEffect|useRef|useId|useMemo|useCallback|useContext|useImperativeHandle|createContext|useUI|useToast|useServerClock|useCountdown)\b\s*(\(|<)/;

  it('every module that uses hooks or context starts with "use client"', () => {
    for (const f of all) {
      const src = readFileSync(f, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (HOOKS.test(code)) {
        expect(src.trimStart().startsWith("'use client'"), `${f} uses hooks but has no 'use client'`).toBe(true);
      }
    }
  });

  it('pure helper modules are not client modules (server components can call them)', () => {
    for (const name of ['format.ts', 'clockMath.ts', 'constants.ts', 'buttonStyles.ts', 'utils.ts', 'surfaces.ts', 'cn.ts', 'types.ts', 'components/RichText.tsx', 'components/badges.tsx', 'components/PriceTag.tsx']) {
      expect(readFileSync(join(root, name), 'utf8').trimStart().startsWith("'use client'"), name).toBe(false);
    }
  });
});
