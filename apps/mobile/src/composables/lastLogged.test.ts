import { describe, expect, it } from 'vitest';

import type { LogEvent } from '@/stores/event-log';

import { fmtClock } from './format';
import { lastLogged } from './lastLogged';

const NOW = new Date(2026, 10, 19, 14, 30).getTime();
const MIN = 60_000;

function row(minutesAgo: number, event: string, details: Record<string, string> = {}): LogEvent {
  return { id: `e${minutesAgo}`, timestamp: NOW - minutesAgo * MIN, event, details };
}

describe('lastLogged', () => {
  it('is undefined until a row of that kind is in the log', () => {
    expect(lastLogged([], 'Preoperative Oral Dose', {}, NOW)).toBeUndefined();
    expect(
      lastLogged([row(5, 'Pre-Op Vitals')], 'Preoperative Oral Dose', {}, NOW),
    ).toBeUndefined();
  });

  it('shows the time of the last matching row, and a count from the second one', () => {
    const tri = { Drug: 'Triazolam', Dose: '0.25 mg' };
    const once = [row(20, 'Preoperative Oral Dose', tri)];
    expect(lastLogged(once, 'Preoperative Oral Dose', tri, NOW)).toBe(
      `✓ ${fmtClock(NOW - 20 * MIN)}`,
    );
    const twice = [...once, row(3, 'Preoperative Oral Dose', tri)];
    expect(lastLogged(twice, 'Preoperative Oral Dose', tri, NOW)).toBe(
      `✓ ${fmtClock(NOW - 3 * MIN)} · ×2`,
    );
  });

  it('marks only the button of the drug and dose that was given', () => {
    const log = [
      row(9, 'Preoperative Oral Dose', {
        Drug: 'Triazolam',
        Dose: '0.25 mg',
        Route: 'PO swallowed',
      }),
    ];
    const at = (drug: string, dose: string) =>
      lastLogged(log, 'Preoperative Oral Dose', { Drug: drug, Dose: dose }, NOW);
    expect(at('Triazolam', '0.25 mg')).toBeDefined();
    expect(at('Triazolam', '0.5 mg')).toBeUndefined();
    expect(at('Lorazepam', '0.25 mg')).toBeUndefined();
    expect(lastLogged(log, 'Bedtime Premedication', { Drug: 'Triazolam' }, NOW)).toBeUndefined();
  });

  it('the mark goes when the row is undone, because it is read from the log', () => {
    const log = [row(4, 'Bedtime Premedication', { Drug: 'Diazepam', Dose: '5 mg' })];
    const key = { Drug: 'Diazepam', Dose: '5 mg' };
    expect(lastLogged(log, 'Bedtime Premedication', key, NOW)).toBeDefined();
    log.pop();
    expect(lastLogged(log, 'Bedtime Premedication', key, NOW)).toBeUndefined();
  });

  it('a row from an earlier day carries its date', () => {
    const threeDays = 3 * 24 * 60;
    const log = [row(threeDays, 'Bedtime Premedication', { Drug: 'Diazepam', Dose: '5 mg' })];
    const text = lastLogged(log, 'Bedtime Premedication', { Drug: 'Diazepam', Dose: '5 mg' }, NOW);
    expect(text).toBe(`✓ Nov 16, ${fmtClock(NOW - threeDays * MIN)}`);
  });
});
