import { describe, expect, it } from 'vitest';

import { diazepamGate } from './diazepam-osa';

describe('diazepamGate', () => {
  it('blocks when OSA status has not been collected', () => {
    expect(diazepamGate(null)).toBe('block-missing-osa');
    expect(diazepamGate(undefined)).toBe('block-missing-osa');
  });

  it('allows when patient has no OSA history', () => {
    expect(diazepamGate('none')).toBe('allow');
  });

  it('requires override for documented OSA or CPAP', () => {
    expect(diazepamGate('osa-diagnosed')).toBe('requires-override-osa');
    expect(diazepamGate('cpap-prescribed')).toBe('requires-override-osa');
  });
});
