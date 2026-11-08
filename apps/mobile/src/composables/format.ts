/**
 * The one clock and duration vocabulary for every screen and the note.
 * Three views and the note each carried their own copy of these; a change
 * to the time format (12 h vs 24 h, seconds) now lands everywhere at once.
 */

const CLOCK: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

/** `HH:MM` in the device locale, or undefined when there is no timestamp. */
export function fmtClock(ms: number | null | undefined): string | undefined {
  if (ms === null || ms === undefined) return undefined;
  return new Date(ms).toLocaleTimeString([], CLOCK);
}

/** The current wall-clock time, for toast sub-lines. */
export function nowClock(): string {
  return new Date().toLocaleTimeString([], CLOCK);
}

/** `M:SS` for countdown and elapsed pills; never negative. */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
