import { describe, expect, it } from 'vitest';

import { classifyEncounter } from './classify-encounter';

describe('classifyEncounter', () => {
  it('is an assessment when no sedative was administered', () => {
    expect(classifyEncounter({ oralPremedGiven: false, ivMedGiven: false })).toBe('assessment');
  });

  it('is a sedation encounter once an oral pre-med is given', () => {
    expect(classifyEncounter({ oralPremedGiven: true, ivMedGiven: false })).toBe('sedation');
  });

  it('is a sedation encounter once an IV drug is given', () => {
    expect(classifyEncounter({ oralPremedGiven: false, ivMedGiven: true })).toBe('sedation');
  });

  it('is a sedation encounter when both routes were used', () => {
    expect(classifyEncounter({ oralPremedGiven: true, ivMedGiven: true })).toBe('sedation');
  });
});
