import { describe, expect, it } from 'vitest';

import {
  ageFromBirthdate,
  chartDisplayName,
  isUnsetOdDate,
  mapDiseasesToProblems,
  namesDisagree,
  odBoolean,
  summariseAllergies,
  summariseMedications,
} from './chartHistory';

/** The real chip vocabulary from Phase1View, so mapping is tested against it. */
const VOCAB = [
  'CVD',
  'Hypertension',
  'Diabetes',
  'Asthma',
  'Psychological',
  'Pregnancy',
  'Hypothyroidism',
  'GERD',
  'Liver disease',
  'Chronic pain',
  'Restless Leg Syndrome',
];

describe('Open Dental scalar quirks', () => {
  it('reads booleans that arrive as strings', () => {
    expect(odBoolean('true')).toBe(true);
    expect(odBoolean('True')).toBe(true);
    expect(odBoolean(true)).toBe(true);
    expect(odBoolean('false')).toBe(false);
    expect(odBoolean(false)).toBe(false);
  });

  it('treats anything unrecognised as false rather than guessing', () => {
    // An ambiguous "is this allergy active" must not promote the row into a
    // sedation assessment.
    expect(odBoolean(undefined)).toBe(false);
    expect(odBoolean(null)).toBe(false);
    expect(odBoolean(1)).toBe(false);
    expect(odBoolean('yes')).toBe(false);
  });

  it('recognises the never-set date', () => {
    expect(isUnsetOdDate('0001-01-01')).toBe(true);
    expect(isUnsetOdDate('')).toBe(true);
    expect(isUnsetOdDate(undefined)).toBe(true);
    expect(isUnsetOdDate('2026-03-01')).toBe(false);
  });
});

describe('age from the chart birthdate', () => {
  /**
   * The case that motivated the feature: a note recorded an age two years
   * below what the chart's birthdate gives. Age feeds dosing judgement, so
   * the two sources must not silently differ.
   */
  it('computes whole years, not elapsed-millisecond division', () => {
    expect(ageFromBirthdate('1987-01-01', new Date('2026-08-14T12:00:00Z'))).toBe(39);
  });

  it('has not counted the birthday until it arrives', () => {
    expect(ageFromBirthdate('1987-09-01', new Date('2026-08-31T12:00:00Z'))).toBe(38);
    expect(ageFromBirthdate('1987-09-01', new Date('2026-09-01T12:00:00Z'))).toBe(39);
    expect(ageFromBirthdate('1987-09-02', new Date('2026-09-01T12:00:00Z'))).toBe(38);
  });

  it('returns null for missing, unset or unparseable dates', () => {
    expect(ageFromBirthdate('', new Date())).toBeNull();
    expect(ageFromBirthdate(null, new Date())).toBeNull();
    expect(ageFromBirthdate('0001-01-01', new Date())).toBeNull();
    expect(ageFromBirthdate('not a date', new Date())).toBeNull();
  });
});

describe('diseases → medical-problem chips', () => {
  it('matches the vocabulary exactly', () => {
    const r = mapDiseasesToProblems([{ diseaseDefName: 'Asthma', ProbStatus: 'Active' }], VOCAB);
    expect(r.matched).toEqual(['Asthma']);
    expect(r.custom).toEqual([]);
  });

  it('matches case-insensitively and trimmed, keeping the vocabulary casing', () => {
    const r = mapDiseasesToProblems(
      [
        { diseaseDefName: '  hypertension ', ProbStatus: 'Active' },
        { diseaseDefName: 'gerd', ProbStatus: 'Active' },
      ],
      VOCAB,
    );
    expect(r.matched).toEqual(['Hypertension', 'GERD']);
  });

  /**
   * A condition dropped because the practice vocabulary has no chip for it
   * is a silent omission in a pre-sedation assessment.
   */
  it('carries an unmatched condition through verbatim as a custom chip', () => {
    const r = mapDiseasesToProblems([{ diseaseDefName: 'Migraines', ProbStatus: 'Active' }], VOCAB);
    expect(r.matched).toEqual([]);
    expect(r.custom).toEqual(['Migraines']);
    expect(r.all).toEqual(['Migraines']);
  });

  it('ignores inactive problems', () => {
    const r = mapDiseasesToProblems(
      [
        { diseaseDefName: 'Asthma', ProbStatus: 'Resolved' },
        { diseaseDefName: 'Diabetes', ProbStatus: 'Inactive' },
        { diseaseDefName: 'GERD', ProbStatus: 'Active' },
      ],
      VOCAB,
    );
    expect(r.all).toEqual(['GERD']);
  });

  it('dedupes and skips blank names', () => {
    const r = mapDiseasesToProblems(
      [
        { diseaseDefName: 'Asthma', ProbStatus: 'Active' },
        { diseaseDefName: 'asthma', ProbStatus: 'Active' },
        { diseaseDefName: '   ', ProbStatus: 'Active' },
      ],
      VOCAB,
    );
    expect(r.all).toEqual(['Asthma']);
  });
});

describe('allergies', () => {
  it('renders the sentinel as NKDA, never as *NKDA', () => {
    const r = summariseAllergies([{ defDescription: '*NKDA', StatusIsActive: 'true' }]);
    expect(r.text).toBe('NKDA');
    expect(r.nkda).toBe(true);
    expect(r.contradiction).toBe(false);
  });

  it('lists real allergies with their reactions', () => {
    const r = summariseAllergies([
      { defDescription: 'Penicillin', Reaction: 'Hives', StatusIsActive: 'true' },
      { defDescription: 'Latex', Reaction: '', StatusIsActive: 'true' },
    ]);
    expect(r.text).toBe('Penicillin (Hives), Latex');
    expect(r.nkda).toBe(false);
  });

  /**
   * A chart carrying both is contradictory. Silently picking a side is how
   * "no known allergies" ends up on the record of someone with a documented
   * one, so the caller gets told instead.
   */
  it('flags NKDA alongside real allergies rather than resolving it', () => {
    const r = summariseAllergies([
      { defDescription: '*NKDA', StatusIsActive: 'true' },
      { defDescription: 'Penicillin', StatusIsActive: 'true' },
    ]);
    expect(r.contradiction).toBe(true);
    expect(r.text).toBe('Penicillin');
  });

  it('ignores inactive allergy rows', () => {
    const r = summariseAllergies([
      { defDescription: 'Penicillin', StatusIsActive: 'false' },
      { defDescription: 'Latex', StatusIsActive: 'true' },
    ]);
    expect(r.text).toBe('Latex');
  });

  it('says nothing when the chart says nothing', () => {
    expect(summariseAllergies([]).text).toBe('');
    expect(summariseAllergies([]).nkda).toBe(false);
  });
});

describe('medications', () => {
  it('keeps rows with no stop date', () => {
    expect(
      summariseMedications([
        { medName: 'Ibuprofen', DateStart: '0001-01-01', DateStop: '0001-01-01' },
      ]),
    ).toBe('Ibuprofen');
  });

  /** A stopped drug listed as current misstates what the patient is on. */
  it('drops rows that have been stopped', () => {
    expect(
      summariseMedications([
        { medName: 'Ibuprofen', DateStop: '0001-01-01' },
        { medName: 'Warfarin', DateStop: '2026-01-15' },
      ]),
    ).toBe('Ibuprofen');
  });

  it('includes the patient note when present', () => {
    expect(summariseMedications([{ medName: 'Metformin', PatNote: '500mg BD' }])).toBe(
      'Metformin (500mg BD)',
    );
  });
});

describe('identity cross-checks', () => {
  it('formats the chart name last-first', () => {
    expect(chartDisplayName('Doe', 'Jane')).toBe('Doe, Jane');
    expect(chartDisplayName('Doe', '')).toBe('Doe');
  });

  it('accepts the same name in either order, any case', () => {
    expect(namesDisagree('Jane Doe', 'Doe', 'Jane')).toBe(false);
    expect(namesDisagree('doe, jane', 'Doe', 'Jane')).toBe(false);
  });

  it('tolerates a middle name on either side', () => {
    expect(namesDisagree('Jane Ann Doe', 'Doe', 'Jane')).toBe(false);
    expect(namesDisagree('Jane Doe', 'Doe', 'Jane Ann')).toBe(false);
  });

  it('flags a genuinely different person', () => {
    expect(namesDisagree('John Smith', 'Doe', 'Jane')).toBe(true);
  });

  it('stays quiet when either side is blank — nothing to compare', () => {
    expect(namesDisagree('', 'Doe', 'Jane')).toBe(false);
    expect(namesDisagree('Jane Doe', '', '')).toBe(false);
  });
});
