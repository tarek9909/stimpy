import { clsx, type ClassValue } from 'clsx';

/** Class-name joiner. Components only ever receive `className` for layout, never colour. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
