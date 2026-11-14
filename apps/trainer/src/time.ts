/** `m:ss` on the run clock. */
export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The story's wall clock ("10:42 AM"): the scenario's start time plus the
 * seconds played. Formatted by hand so it never depends on the device locale
 * or on what day it really is.
 */
export function fmtStoryClock(startsAtMin: number, seconds: number, withSeconds: boolean): string {
  const total = Math.floor(startsAtMin * 60 + Math.max(0, seconds)) % 86_400;
  const h24 = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mm = String(m).padStart(2, '0');
  const tail = withSeconds ? `:${String(s).padStart(2, '0')}` : '';
  return `${h12}:${mm}${tail} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** A mark in front of a timeline line, so its tone is never carried by colour alone. */
export function toneMark(tone: 'good' | 'bad' | 'neutral'): string {
  return tone === 'good' ? '▲ ' : tone === 'bad' ? '▼ ' : '';
}
