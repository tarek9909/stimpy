'use client';

import { useEffect, useLayoutEffect } from 'react';

/** `useLayoutEffect` that is silent during server rendering. */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
