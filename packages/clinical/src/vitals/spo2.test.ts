import { describe, expect, it } from 'vitest';

import { classifySpo2 } from './spo2';

describe('classifySpo2', () => {
  it('classifies ≥ 95 as normal', () => {
    expect(classifySpo2(99)?.category).toBe('normal');
    expect(classifySpo2(95)?.category).toBe('normal');
    expect(classifySpo2(95)?.severity).toBe('safe');
  });

  it('classifies 90-94 as mild hypoxemia', () => {
    expect(classifySpo2(94)?.category).toBe('mild');
    expect(classifySpo2(90)?.category).toBe('mild');
    expect(classifySpo2(92)?.severity).toBe('caution');
  });

  it('classifies < 90 as severe and a crisis', () => {
    const r = classifySpo2(85);
    expect(r?.category).toBe('severe');
    expect(r?.severity).toBe('crisis');
  });

  it('rejects implausible readings', () => {
    expect(classifySpo2(0)).toBeNull();
    expect(classifySpo2(-1)).toBeNull();
    expect(classifySpo2(101)).toBeNull();
    expect(classifySpo2(Number.NaN)).toBeNull();
  });
});
