import { describe, expect, it } from 'vitest';

import { isStaleSession } from './persistence';

describe('isStaleSession', () => {
  const day = (iso: string) => new Date(iso).getTime();

  it('is not stale for two times on the same calendar day', () => {
    expect(isStaleSession(day('2026-05-15T08:00:00'), day('2026-05-15T23:59:59'))).toBe(false);
  });

  it('is stale across a midnight boundary even minutes apart', () => {
    expect(isStaleSession(day('2026-05-15T23:59:00'), day('2026-05-16T00:01:00'))).toBe(true);
  });

  it('is stale for a chart saved days earlier', () => {
    expect(isStaleSession(day('2026-05-10T14:00:00'), day('2026-05-15T09:00:00'))).toBe(true);
  });

  it('is not stale when saved later the same day than "now" (clock skew)', () => {
    // Defensive: even if savedAt is slightly ahead of now, same day → resume.
    expect(isStaleSession(day('2026-05-15T10:00:05'), day('2026-05-15T10:00:00'))).toBe(false);
  });

  it('returns false for non-finite inputs rather than throwing', () => {
    expect(isStaleSession(Number.NaN, Date.now())).toBe(false);
    expect(isStaleSession(Date.now(), Number.POSITIVE_INFINITY)).toBe(false);
  });
});
