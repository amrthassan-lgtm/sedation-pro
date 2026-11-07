import { describe, expect, it } from 'vitest';

import { formatUsPhone, phoneIncomplete } from './phone';

describe('formatUsPhone', () => {
  it('formats ten digits however they were typed', () => {
    expect(formatUsPhone('5551234567')).toBe('(555) 123-4567');
    expect(formatUsPhone('555-123-4567')).toBe('(555) 123-4567');
    expect(formatUsPhone('1 555 123 4567')).toBe('(555) 123-4567');
  });
  it('leaves a partial number alone', () => {
    expect(formatUsPhone('555123')).toBe('555123');
    expect(formatUsPhone('')).toBe('');
  });
});

describe('phoneIncomplete', () => {
  it('flags a partial number, never an empty or complete one', () => {
    expect(phoneIncomplete('')).toBe(false);
    expect(phoneIncomplete('555123')).toBe(true);
    expect(phoneIncomplete('(555) 123-4567')).toBe(false);
    expect(phoneIncomplete('15551234567')).toBe(false);
  });
});
