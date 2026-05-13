import { describe, expect, it } from 'vitest';

import { CLINICAL_LIB_VERSION } from './index';

describe('@sedation-pro/clinical', () => {
  it('exports a semver-shaped version constant', () => {
    expect(CLINICAL_LIB_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
