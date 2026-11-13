import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_VERSION } from './version';

describe('APP_VERSION', () => {
  it('matches the app package version', () => {
    // Vitest runs from the workspace root of this package (apps/mobile).
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    expect(pkg.name).toBe('@sedation-pro/mobile');
    expect(APP_VERSION).toBe(pkg.version);
  });
});
