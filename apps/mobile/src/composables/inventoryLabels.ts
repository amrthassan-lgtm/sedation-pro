import type { Severity } from '@sedation-pro/clinical';

import type { ClassifiedItem, CourseCoverage } from './useInventoryStatus';

/**
 * How a cart item is described, shared by the Inventory screen and the
 * protocol pages, so one LMA or one vial reads the same on both.
 */

/** Ordered and not here yet: it has no date to read. */
export function isInbound(c: ClassifiedItem): boolean {
  return Boolean(c.item.onOrder) && !c.status.valid;
}

export function pillSeverity(c: ClassifiedItem): Severity | 'empty' {
  if (c.item.noExpiry) return 'safe';
  if (isInbound(c)) return 'empty';
  if (!c.status.valid) return 'empty';
  return c.status.severity;
}

export function pillLabel(c: ClassifiedItem): string {
  if (c.item.awaitingPhoto) return 'No date';
  if (c.item.noExpiry) return 'On hand';
  if (isInbound(c)) return 'On order';
  if (!c.status.valid) return 'No date';
  if (c.status.daysLeft < 0) return 'Expired';
  if (c.status.severity === 'caution') return `${c.status.daysLeft} d`;
  return 'OK';
}

/** "Nov 2027" for a labeled month, "Jan 17, 2028" when the day is printed. */
export function formatExpiry(expiresOn: string): string {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(expiresOn);
  if (!match) return '—';
  const day = match[3];
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, day === undefined ? 1 : Number(day)),
  ).toLocaleDateString(undefined, {
    ...(day === undefined ? {} : { day: 'numeric' }),
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Have 4 mg · need 8 mg · 2 mg on order": in-date stock against one course. */
export function courseLine(course: CourseCoverage): string {
  const order = course.onOrderMg > 0 ? ` · ${course.onOrderMg} mg on order` : '';
  return `Have ${course.haveMg} mg · need ${course.needMg} mg${order}`;
}
