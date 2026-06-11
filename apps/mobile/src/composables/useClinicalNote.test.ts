import { describe, expect, it } from 'vitest';

import { patientIntro } from './useClinicalNote';

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
