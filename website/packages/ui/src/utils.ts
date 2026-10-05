import type { MutableRefObject, Ref, RefCallback } from 'react';

/** Assigns one DOM node to several refs (forwarded ref + internal ref). */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else (ref as MutableRefObject<T | null>).current = node;
    }
  };
}

/** True for absolute URLs that leave the site (`https://...`, `mailto:`, `tel:`, `//host`). */
export function isExternalHref(href: string | undefined): boolean {
  return !!href && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
}

/** `(prefers-reduced-motion: reduce)` right now. False where `matchMedia` is unavailable. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Tabbable descendants in DOM order, skipping hidden and `inert` subtrees. */
export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.hasAttribute('inert') &&
      !el.closest('[inert]') &&
      el.getAttribute('aria-hidden') !== 'true' &&
      (el.tabIndex >= 0 || el.tagName === 'SUMMARY'),
  );
}
