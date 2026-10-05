import { Fragment, type ReactNode } from 'react';
import { cn } from '../cn';

/**
 * Safe renderer for API long text (policies, about, stories, FAQ answers).
 * Supports exactly: blank-line paragraphs, `**bold**`, and `- ` list items. EVERYTHING else is
 * plain text: React escapes it, there is no HTML parsing, no links, and no raw-HTML
 * injection API anywhere in this file. `<script>` shows up as the literal characters.
 */

export interface InlineSegment {
  text: string;
  bold: boolean;
}

export type RichBlock =
  | { type: 'p'; lines: InlineSegment[][] }
  | { type: 'ul'; items: InlineSegment[][] };

/** `**bold**` to segments. An unmatched or empty `**` stays literal. */
export function parseInline(input: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  let i = 0;
  let plain = '';
  while (i < input.length) {
    if (input.startsWith('**', i)) {
      const end = input.indexOf('**', i + 2);
      const inner = end === -1 ? '' : input.slice(i + 2, end);
      if (end !== -1 && inner.trim().length > 0) {
        if (plain) out.push({ text: plain, bold: false });
        plain = '';
        out.push({ text: inner, bold: true });
        i = end + 2;
        continue;
      }
    }
    plain += input[i];
    i += 1;
  }
  if (plain) out.push({ text: plain, bold: false });
  return out;
}

const LIST_ITEM = /^[ \t]*- (.*)$/;

/** Splits text into paragraph and list blocks. Pure, so it is unit-tested directly. */
export function parseRichText(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  const chunks = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/);
  for (const chunk of chunks) {
    if (chunk.trim() === '') continue;
    let para: InlineSegment[][] = [];
    let list: InlineSegment[][] = [];
    const flushPara = () => {
      if (para.length) blocks.push({ type: 'p', lines: para });
      para = [];
    };
    const flushList = () => {
      if (list.length) blocks.push({ type: 'ul', items: list });
      list = [];
    };
    for (const raw of chunk.split('\n')) {
      const item = LIST_ITEM.exec(raw);
      if (item) {
        flushPara();
        list.push(parseInline((item[1] ?? '').trim()));
      } else if (raw.trim() !== '') {
        flushList();
        para.push(parseInline(raw.trim()));
      }
    }
    flushPara();
    flushList();
  }
  return blocks;
}

function renderSegments(segments: InlineSegment[]): ReactNode {
  return segments.map((s, i) =>
    s.bold ? (
      <strong key={i} className="font-bold">
        {s.text}
      </strong>
    ) : (
      <Fragment key={i}>{s.text}</Fragment>
    ),
  );
}

export interface RichTextProps {
  text: string | null | undefined;
  className?: string;
}

export function RichText({ text, className }: RichTextProps) {
  if (!text || text.trim() === '') return null;
  const blocks = parseRichText(text);
  if (blocks.length === 0) return null;
  return (
    <div className={cn('space-y-4 text-body text-fg [overflow-wrap:anywhere]', className)}>
      {blocks.map((block, i) =>
        block.type === 'ul' ? (
          <ul key={i} className="list-disc space-y-1 pl-6">
            {block.items.map((item, j) => (
              <li key={j}>{renderSegments(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {renderSegments(line)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
