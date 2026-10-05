'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '../cn';
import { ChevronDown } from '../icons';
import { RichText } from './RichText';

export interface AccordionItem {
  id: string;
  question: ReactNode;
  /** A string is rendered with RichText (safe tiny Markdown); a node is rendered as is. */
  answer: string | ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Several panels open at once. Default false: opening one closes the others. */
  allowMultiple?: boolean;
  defaultOpenIds?: string[];
  className?: string;
}

/**
 * FAQ disclosure built on native `<details>/<summary>`: it works with no JavaScript (progressive
 * enhancement) and exposes expanded state natively. React state mirrors it so single-open mode and
 * `aria-expanded` are consistent in every browser.
 */
export function Accordion({ items, allowMultiple = false, defaultOpenIds = [], className }: AccordionProps) {
  const group = useId();
  const [open, setOpen] = useState<string[]>(defaultOpenIds);

  const setItem = (id: string, isOpen: boolean) => {
    setOpen((prev) => {
      const has = prev.includes(id);
      if (isOpen === has) return prev;
      if (!isOpen) return prev.filter((x) => x !== id);
      return allowMultiple ? [...prev, id] : [id];
    });
  };

  return (
    <div className={cn('divide-y divide-line border-y border-base', className)}>
      {items.map((item) => {
        const isOpen = open.includes(item.id);
        return (
          <details
            key={item.id}
            open={isOpen}
            name={allowMultiple ? undefined : group}
            onToggle={(e) => setItem(item.id, (e.currentTarget as HTMLDetailsElement).open)}
            className="group"
          >
            <summary
              aria-expanded={isOpen}
              className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-h4 font-medium text-fg [&::-webkit-details-marker]:hidden"
            >
              <span>{item.question}</span>
              <ChevronDown
                width={24}
                height={24}
                aria-hidden="true"
                className="shrink-0 transition-transform duration-base ease-standard group-open:rotate-180"
              />
            </summary>
            <div className="pb-4 pr-8 text-fg">
              {typeof item.answer === 'string' ? <RichText text={item.answer} /> : item.answer}
            </div>
          </details>
        );
      })}
    </div>
  );
}
