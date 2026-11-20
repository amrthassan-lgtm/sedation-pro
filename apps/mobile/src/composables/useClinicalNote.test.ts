import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { patientIntro, useClinicalNote } from './useClinicalNote';
import { useFormularyStore } from '@/stores/formulary';
import { useIVStore } from '@/stores/iv';
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

describe('a new case on a set-up tablet (owner, Nov 2026)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('the note names the staff typed at setup and the IV the practice lists start with', () => {
    const formulary = useFormularyStore();
    formulary.setList('providers', ['Dr. Jordan Rivera', 'Dr. Sam Patel']);
    formulary.setList('dentalAssistants', ['Alex Morgan, EFDA']);
    // The case is created after the lists, as it is on a new case.
    usePatientStore();
    useIVStore().ivStarted = true;

    const text = useClinicalNote().value.narrative.join(' ');
    expect(text).toContain(
      'Attending provider: Dr. Jordan Rivera. Dental assistant: Alex Morgan, EFDA.',
    );
    expect(text).toContain(
      'An IV catheter (22g) was placed in the Right dorsal hand after 1 attempt; D5W 1000 mL was initiated.',
    );
  });
});

describe('the note dates itself from the case, not from the day it is opened (v1 audit)', () => {
  const SIGNED = 'data:image/png;base64,iVBORw0KGgo=';
  const CASE_DAY = new Date(2026, 10, 9, 14, 0).getTime();

  beforeEach(async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const { useEventLogStore } = await import('@/stores/event-log');
    useEventLogStore().events = [
      { id: 'a', timestamp: CASE_DAY, event: 'IV Started', details: { Gauge: '22' } },
      { id: 'b', timestamp: CASE_DAY + 30 * 60_000, event: 'Procedure Start', details: {} },
    ];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a note opened the morning after carries the day of the case', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 10, 8, 30) });
    const note = useClinicalNote().value;
    expect(note.header.date).toBe('November 9, 2026');
    expect(note.narrative.join(' ')).toContain(' on November 9, 2026 for ');
  });

  it('a case with nothing logged yet is dated today', async () => {
    const { useEventLogStore } = await import('@/stores/event-log');
    useEventLogStore().events = [];
    vi.useFakeTimers({ now: new Date(2026, 10, 16, 9, 0) });
    expect(useClinicalNote().value.header.date).toBe('November 16, 2026');
  });

  it('prints the time the signature was drawn, not the time the note is opened', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 9, 15, 42) });
    useRecoveryStore().providerSignatureDataUrl = SIGNED;
    vi.setSystemTime(new Date(2026, 10, 9, 17, 5));
    expect(useClinicalNote().value.signatures.signedAt).toBe('03:42 PM');
  });

  it('names the date when the signature was drawn on a later day', () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 10, 8, 15) });
    useRecoveryStore().providerSignatureDataUrl = SIGNED;
    expect(useClinicalNote().value.signatures.signedAt).toBe('Nov 10, 2026, 08:15 AM');
  });

  it('a signature from before the time was kept prints no time rather than a wrong one', () => {
    localStorage.setItem(
      'sedation-pro:recovery:v6',
      JSON.stringify({ providerSignatureDataUrl: SIGNED }),
    );
    setActivePinia(createPinia());
    expect(useClinicalNote().value.signatures.signedAt).toBeNull();
  });
});
