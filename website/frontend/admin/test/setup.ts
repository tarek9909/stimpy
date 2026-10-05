import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

beforeEach(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

afterEach(() => {
  cleanup();
  document.body.removeAttribute('style');
  try {
    window.sessionStorage.clear();
    window.localStorage.clear();
  } catch {
    /* storage may be blocked */
  }
});

// jsdom's AbortSignal is not undici's: Node's Request rejects it. Drop signals in tests (no test relies on aborting a fetch).
const NodeRequest = globalThis.Request;
class TestRequest extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init && init.signal ? { ...init, signal: undefined } : init);
  }
}
globalThis.Request = TestRequest as typeof Request;
