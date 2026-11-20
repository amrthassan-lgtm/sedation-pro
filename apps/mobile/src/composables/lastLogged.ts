import type { LogEvent } from '@/stores/event-log';

import { fmtClock } from './format';

const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/**
 * What a repeatable dose button shows once it has been tapped: "✓ 02:14 PM"
 * for the last log row of this kind, with a count once there is more than
 * one ("✓ 02:14 PM · ×2"), or undefined when there is none.
 *
 * Read from the log itself, never kept beside it, so an Undo takes the mark
 * off the button with the row. A row from an earlier day carries its date:
 * a bedtime dose is recorded at the assessment and read again on the day of
 * sedation.
 */
export function lastLogged(
  events: ReadonlyArray<LogEvent>,
  event: string,
  details: Readonly<Record<string, string>> = {},
  now: number = Date.now(),
): string | undefined {
  const hits = events.filter(
    (e) => e.event === event && Object.entries(details).every(([k, v]) => e.details[k] === v),
  );
  const last = hits.at(-1);
  if (!last) return undefined;
  const day = sameDay(last.timestamp, now)
    ? ''
    : `${new Date(last.timestamp).toLocaleDateString([], DAY)}, `;
  return `✓ ${day}${fmtClock(last.timestamp)}${hits.length > 1 ? ` · ×${hits.length}` : ''}`;
}
