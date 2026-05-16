import { describe, expect, it } from 'vitest';

import { clinicalNoteToText } from './clinicalNoteText';
import type { ClinicalNote } from './useClinicalNote';

const BASE: ClinicalNote = {
  header: {
    patient: 'Jane Doe',
    mrn: '12345',
    date: 'May 16, 2026',
    provider: 'Dr. Hassan',
    assistants: 'A. Smith',
    procedure: 'EXT #19',
  },
  narrative: ['Patient tolerated the procedure well.', 'No complications noted.'],
  sections: [
    {
      heading: 'Pre-Sedation Assessment',
      rows: [
        ['ASA classification', 'II'],
        ['Mallampati', 'II'],
      ],
    },
  ],
  chronology: [
    { time: '09:00', event: 'Pre-Op Vitals', detail: 'HR 72 bpm · BP 118/76' },
    { time: '09:15', event: 'IV Start', detail: '' },
  ],
  signatures: {
    providerDataUrl: 'data:image/jpeg;base64,abc',
    companion: 'John Doe (spouse)',
    signedAt: '11:02',
  },
  generatedAt: '5/16/2026, 11:05:00 AM',
};

describe('clinicalNoteToText', () => {
  it('renders header, narrative, sections, chronology, and signatures', () => {
    const text = clinicalNoteToText(BASE);
    expect(text).toContain('Patient:          Jane Doe');
    expect(text).toContain('MRN:              12345');
    expect(text).toContain('CLINICAL NARRATIVE');
    expect(text).toContain('Patient tolerated the procedure well.');
    expect(text).toContain('PRE-SEDATION ASSESSMENT');
    expect(text).toContain('ASA classification: II');
    expect(text).toContain('CHRONOLOGICAL RECORD');
    expect(text).toContain('09:00  Pre-Op Vitals  —  HR 72 bpm · BP 118/76');
    // Empty detail → no trailing em-dash.
    expect(text).toContain('09:15  IV Start');
    expect(text).not.toContain('09:15  IV Start  —');
    expect(text).toContain('Provider: signed · 11:02');
    expect(text).toContain('Responsible companion: John Doe (spouse)');
    expect(text).toContain('Generated 5/16/2026, 11:05:00 AM · Sedation Pro v0.1');
  });

  it('flags an unsigned note explicitly', () => {
    const text = clinicalNoteToText({
      ...BASE,
      signatures: { providerDataUrl: null, companion: '', signedAt: null },
    });
    expect(text).toContain('Provider: NOT SIGNED');
    expect(text).toContain('Responsible companion: —');
  });

  it('omits empty narrative and chronology blocks', () => {
    const text = clinicalNoteToText({ ...BASE, narrative: [], chronology: [] });
    expect(text).not.toContain('CLINICAL NARRATIVE');
    expect(text).not.toContain('CHRONOLOGICAL RECORD');
    // Sections still render.
    expect(text).toContain('PRE-SEDATION ASSESSMENT');
  });

  it('is deterministic — same note in, same string out', () => {
    expect(clinicalNoteToText(BASE)).toBe(clinicalNoteToText(BASE));
  });
});
