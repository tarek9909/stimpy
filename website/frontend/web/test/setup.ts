import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Required by lib/env.ts (validated at import time).
process.env.NEXT_PUBLIC_API_URL ??= 'http://localhost:4111/api/v1';
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3101';

afterEach(() => cleanup());
