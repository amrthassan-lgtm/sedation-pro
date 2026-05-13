import { describe, expect, it } from 'vitest';

import { nicotineProtocol } from './nicotine';

describe('nicotineProtocol', () => {
  it('returns 12 hours for under 10 cigs/day', () => {
    expect(nicotineProtocol(0)?.tier).toBe('no-smoking-12h');
    expect(nicotineProtocol(5)?.hoursBefore).toBe(12);
    expect(nicotineProtocol(9)?.tier).toBe('no-smoking-12h');
  });

  it('returns 8 hours for 10-19 cigs/day', () => {
    expect(nicotineProtocol(10)?.tier).toBe('no-smoking-8h');
    expect(nicotineProtocol(15)?.hoursBefore).toBe(8);
    expect(nicotineProtocol(19)?.tier).toBe('no-smoking-8h');
  });

  it('returns 4 hours for 20-29 cigs/day', () => {
    expect(nicotineProtocol(20)?.tier).toBe('no-smoking-4h');
    expect(nicotineProtocol(25)?.hoursBefore).toBe(4);
  });

  it('advises smoking immediately for 30+ cigs/day', () => {
    expect(nicotineProtocol(30)?.tier).toBe('smoke-immediately');
    expect(nicotineProtocol(50)?.hoursBefore).toBe(0);
  });

  it('returns null for invalid input', () => {
    expect(nicotineProtocol(-1)).toBeNull();
    expect(nicotineProtocol(Number.NaN)).toBeNull();
  });
});
