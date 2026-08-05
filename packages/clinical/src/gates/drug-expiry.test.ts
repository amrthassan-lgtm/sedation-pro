import { describe, expect, it } from 'vitest';

import { EXPIRY_WARN_DAYS, expiryStatus } from './drug-expiry';

describe('expiryStatus', () => {
  const DAY = 86_400_000;

  it('keeps a month-labeled drug valid through the last day of that month', () => {
    const lateOnLastDay = Date.UTC(2026, 7, 31, 23, 0, 0);
    const result = expiryStatus('2026-08', lateOnLastDay);
    expect(result.valid).toBe(true);
    expect(result.daysLeft).toBe(0);
    expect(result.severity).toBe('caution');
  });

  it('expires a month-labeled drug the moment the next month starts', () => {
    const justPastMidnight = Date.UTC(2026, 8, 1, 0, 1, 0);
    const result = expiryStatus('2026-08', justPastMidnight);
    expect(result.severity).toBe('limit');
    expect(result.daysLeft).toBe(-1);
    expect(result.valid).toBe(true);
  });

  it('warns inclusively at the window boundary and not one day beyond', () => {
    const expiresAt = expiryStatus('2026-08', 0).expiresAtMs;
    const at60 = expiryStatus('2026-08', expiresAt - 60 * DAY);
    const at61 = expiryStatus('2026-08', expiresAt - 61 * DAY - 1);
    expect(at60.severity).toBe('caution');
    expect(at61.severity).toBe('safe');
    expect(at61.daysLeft).toBe(61);
  });

  it('respects a custom warning window', () => {
    const expiresAt = expiryStatus('2026-08', 0).expiresAtMs;
    const now = expiresAt - 75 * DAY;
    expect(expiryStatus('2026-08', now).severity).toBe('safe');
    expect(expiryStatus('2026-08', now, 90).severity).toBe('caution');
    expect(EXPIRY_WARN_DAYS).toBe(60);
  });

  it('classifies far-future and long-expired stock', () => {
    const now = Date.UTC(2026, 7, 4);
    const future = expiryStatus('2028-05', now);
    expect(future.severity).toBe('safe');
    expect(future.daysLeft).toBeGreaterThan(600);
    const past = expiryStatus('2026-01', now);
    expect(past.severity).toBe('limit');
    expect(past.daysLeft).toBeLessThan(-180);
  });

  it('treats a full date as end of that day, not end of month', () => {
    const now = Date.UTC(2026, 7, 16);
    expect(expiryStatus('2026-08-15', now).severity).toBe('limit');
    expect(expiryStatus('2026-08', now).severity).toBe('caution');
  });

  it('resolves month ends correctly, including leap February', () => {
    expect(expiryStatus('2024-02', Date.UTC(2024, 1, 29, 12)).daysLeft).toBe(0);
    expect(expiryStatus('2026-01', Date.UTC(2026, 0, 31, 12)).daysLeft).toBe(0);
    expect(expiryStatus('2026-04', Date.UTC(2026, 3, 30, 12)).daysLeft).toBe(0);
    expect(expiryStatus('2026-04', Date.UTC(2026, 4, 1, 12)).daysLeft).toBe(-1);
  });

  it('rejects unreadable expirations as untrusted stock', () => {
    const now = Date.UTC(2026, 7, 4);
    for (const bad of ['', 'Aug-26', '2026-13', '2026-00', '2026-02-30', 'garbage', '26-08']) {
      const result = expiryStatus(bad, now);
      expect(result.valid).toBe(false);
      expect(result.severity).toBe('limit');
      expect(result.daysLeft).toBe(Number.NEGATIVE_INFINITY);
      expect(Number.isNaN(result.expiresAtMs)).toBe(true);
    }
  });

  it('accepts a valid full-date day at the month boundary', () => {
    const result = expiryStatus('2026-02-28', Date.UTC(2026, 1, 28, 12));
    expect(result.valid).toBe(true);
    expect(result.daysLeft).toBe(0);
  });
});
