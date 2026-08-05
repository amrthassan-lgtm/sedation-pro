import type { Millis, Severity } from '../types';

/**
 * Default early-warning window before a drug's expiration, in days.
 * ≈ 2 months — enough lead time to reorder before the item lapses.
 */
export const EXPIRY_WARN_DAYS = 60;

export interface ExpiryStatus {
  /**
   * `'limit'` — expired or unreadable expiry (an emergency drug whose
   * expiration can't be trusted is not trusted stock). `'caution'` —
   * within the warning window. `'safe'` — comfortably in date.
   * `'crisis'` is deliberately never used here; it stays reserved for
   * live clinical crisis states.
   */
  readonly severity: Severity;
  /** Whole days until expiry; negative once expired; -Infinity when invalid. */
  readonly daysLeft: number;
  /** Resolved expiry instant (last ms of the labeled period, UTC), or NaN. */
  readonly expiresAtMs: Millis;
  readonly valid: boolean;
}

const EXPIRY_PATTERN = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/**
 * Classify a drug expiration label against `now`.
 *
 * Pharma convention: a month-labeled expiration ("Aug-26", stored as
 * `'2026-08'`) means the drug is usable through the LAST day of that
 * month. A full `'YYYY-MM-DD'` means through the end of that day.
 * UTC-anchored so results are timezone-deterministic; a few hours of
 * skew is irrelevant at day granularity against a 60-day window.
 */
export function expiryStatus(
  expiresOn: string,
  now: Millis,
  warnDays: number = EXPIRY_WARN_DAYS,
): ExpiryStatus {
  const expiresAtMs = parseExpiryEnd(expiresOn);
  if (Number.isNaN(expiresAtMs)) {
    return {
      severity: 'limit',
      daysLeft: Number.NEGATIVE_INFINITY,
      expiresAtMs: Number.NaN,
      valid: false,
    };
  }
  const daysLeft = Math.floor((expiresAtMs - now) / 86_400_000);
  const severity: Severity = daysLeft < 0 ? 'limit' : daysLeft <= warnDays ? 'caution' : 'safe';
  return { severity, daysLeft, expiresAtMs, valid: true };
}

/** Last ms (UTC) of the labeled month or day, or NaN when unparseable. */
function parseExpiryEnd(expiresOn: string): Millis {
  const match = EXPIRY_PATTERN.exec(expiresOn);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return Number.NaN;
  if (match[3] === undefined) {
    // Date.UTC(y, month, 1) is the first ms of the FOLLOWING month
    // (month is already 1-based here against UTC's 0-based argument).
    return Date.UTC(year, month, 1) - 1;
  }
  const day = Number(match[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return Number.NaN;
  return Date.UTC(year, month - 1, day + 1) - 1;
}
