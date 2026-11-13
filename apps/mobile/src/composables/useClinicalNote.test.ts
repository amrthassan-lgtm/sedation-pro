import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { patientIntro, useClinicalNote } from './useClinicalNote';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';

describe('patientIntro', () => {
  it('sets the age appositive off with commas and labels a bare MRN', () => {
    expect(patientIntro('Jane Doe', 47, '4471')).toBe('Jane Doe, a 47-year-old (MRN 4471),');
  });

  it('does not double-prefix an MRN the user already typed with "MRN"', () => {
    expect(patientIntro('Jane Doe', 47, 'MRN-4471')).toBe('Jane Doe, a 47-year-old (MRN-4471),');
    expect(patientIntro('Jane Doe', 47, 'mrn 4471')).toBe('Jane Doe, a 47-year-old (mrn 4471),');
  });

  it('drops the commas when there is no age appositive', () => {
    expect(patientIntro('Jane Doe', null, '4471')).toBe('Jane Doe (MRN 4471)');
  });

  it('omits the id clause when MRN is blank', () => {
    expect(patientIntro('Jane Doe', 47, '')).toBe('Jane Doe, a 47-year-old,');
    expect(patientIntro('Jane Doe', null, '  ')).toBe('Jane Doe');
  });

  it('falls back to a placeholder when the name is blank', () => {
    expect(patientIntro('', 47, 'MRN-1')).toBe('[patient], a 47-year-old (MRN-1),');
  });

  it('reads as a grammatical sentence once a verb follows', () => {
    const intro = patientIntro('Jane Doe', 47, 'MRN-4471');
    expect(`${intro} presented to Apex Dental.`).toBe(
      'Jane Doe, a 47-year-old (MRN-4471), presented to Apex Dental.',
    );
  });
});

describe('note dates print the day that was entered (Florida time)', () => {
  const realTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = realTz;
  });
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  function row(label: string): string | undefined {
    const note = useClinicalNote().value;
    for (const section of note.sections) {
      for (const [l, v] of section.rows) if (l === label) return v;
    }
    return undefined;
  }

  it('last medical exam 2024-11-28 prints as November 28, 2024', () => {
    usePatientStore().lastExamDate = '2024-11-28';
    expect(row('Date of last medical exam')).toMatch(/November 28, 2024/);
  });

  it('a return-visit date prints the same day', () => {
    const recovery = useRecoveryStore();
    recovery.returnVisitPlan = 'scheduled';
    recovery.returnVisitDate = '2026-12-01';
    expect(row('Return visit')).toMatch(/December 1, 2026/);
  });
});

describe('chronology rows from an earlier visit name their day', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
  });

  it('dates the assessment rows and leaves the sedation-day rows as clock times', async () => {
    const { useEventLogStore } = await import('@/stores/event-log');
    const log = useEventLogStore();
    const sedationDay = new Date(2026, 10, 9, 14, 0).getTime();
    const assessmentDay = new Date(2026, 9, 19, 10, 30).getTime();
    log.events = [
      {
        id: 'a',
        timestamp: assessmentDay,
        event: 'Phase 1 — Pre-Sedation Assessment',
        details: { Weight: '170 lb' },
      },
      {
        id: 'b',
        timestamp: assessmentDay + 60_000,
        event: 'Assessment Completed · sedation deferred',
        details: {},
      },
      { id: 'c', timestamp: sedationDay, event: 'IV Started', details: { Gauge: '22' } },
    ];

    const rows = useClinicalNote().value.chronology;

    expect(rows[0]?.detail).toMatch(/^On Oct 19, 2026 · Weight: 170 lb$/);
    expect(rows[1]?.detail).toBe('On Oct 19, 2026');
    expect(rows[2]?.detail).toBe('Gauge: 22');
  });

  it('adds nothing when every row is from the same day', async () => {
    const { useEventLogStore } = await import('@/stores/event-log');
    const log = useEventLogStore();
    const day = new Date(2026, 10, 9, 14, 0).getTime();
    log.events = [
      { id: 'a', timestamp: day, event: 'IV Started', details: { Gauge: '22' } },
      { id: 'b', timestamp: day + 60_000, event: 'Procedure Start', details: {} },
    ];

    const rows = useClinicalNote().value.chronology;

    expect(rows.map((r) => r.detail)).toEqual(['Gauge: 22', '']);
  });
});
