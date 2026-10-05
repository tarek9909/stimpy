'use client';

import { useEffect, useState } from 'react';

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

function readConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

/** True on Data Saver or 2g/slow-2g: skip autoplay video, prefetching and preloading (state-and-errors 10.4). */
export function isDataSaver(): boolean {
  const c = readConnection();
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

/** Reactive version. Starts `false` so server HTML and first client render match. */
export function useSaveData(): boolean {
  const [saver, setSaver] = useState(false);
  useEffect(() => {
    const c = readConnection();
    const update = () => setSaver(isDataSaver());
    update();
    c?.addEventListener?.('change', update);
    return () => c?.removeEventListener?.('change', update);
  }, []);
  return saver;
}
