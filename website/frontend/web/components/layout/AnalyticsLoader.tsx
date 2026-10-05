'use client';

import { useEffect } from 'react';
import { publicEnv } from '@/lib/env';

export interface AnalyticsInstallOptions {
  src?: string;
  domain?: string;
  appEnv: string;
  production: boolean;
  doNotTrack: boolean;
  globalPrivacyControl: boolean;
}

/** Install the first-party configured, cookieless Plausible-compatible script only in production and with consent signals clear. */
export function installAnalyticsScript(options: AnalyticsInstallOptions): (() => void) | null {
  if (
    !options.production ||
    options.appEnv !== 'production' ||
    !options.src ||
    !options.domain ||
    options.doNotTrack ||
    options.globalPrivacyControl
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(options.src);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const existing = document.querySelector<HTMLScriptElement>('script[data-stimpy-analytics]');
  if (existing) return () => undefined;

  const queue: Array<Parameters<NonNullable<Window['plausible']>>> = [];
  const placeholder = ((...args: Parameters<NonNullable<Window['plausible']>>) => queue.push(args)) as NonNullable<Window['plausible']>;
  placeholder.q = queue;
  placeholder.init = (config) => { placeholder.o = config; };
  const plausible = window.plausible ?? placeholder;
  plausible.q ??= [];
  plausible.init ??= (config) => { plausible.o = config; };
  plausible.init?.({ autoCapturePageviews: false });
  window.plausible = plausible;

  const script = document.createElement('script');
  script.async = true;
  script.defer = true;
  script.src = url.href;
  script.dataset.domain = options.domain;
  script.dataset.stimpyAnalytics = 'true';
  document.head.appendChild(script);
  return () => script.remove();
}

export function AnalyticsLoader() {
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    const cleanup = installAnalyticsScript({
      src: publicEnv.NEXT_PUBLIC_ANALYTICS_SRC,
      domain: publicEnv.NEXT_PUBLIC_ANALYTICS_DOMAIN,
      appEnv: publicEnv.NEXT_PUBLIC_APP_ENV,
      production: process.env.NODE_ENV === 'production',
      doNotTrack: nav.doNotTrack === '1',
      globalPrivacyControl: nav.globalPrivacyControl === true,
    });
    return cleanup ?? undefined;
  }, []);

  return null;
}
