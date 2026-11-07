/**
 * IV Drug Reference card on the Quick Reference screen: the common doses and
 * the one-line reminders per drug. Presentation only. Concentration, colour,
 * syringe and tape come from the formulary, so this file never repeats them.
 */
export interface IvDrugReferenceSeed {
  /** Formulary drug id. */
  readonly id: string;
  readonly doses: ReadonlyArray<number>;
  readonly doseUnit: 'mg' | 'mcg';
  readonly note: string;
  readonly warning?: string;
}

export const IV_DRUG_REFERENCE: ReadonlyArray<IvDrugReferenceSeed> = [
  {
    id: 'versed',
    doses: [1, 2],
    doseUnit: 'mg',
    note: 'Test dose 1 mg always. Titrate 1-2 mg q3-5 min to effect. Max typically 5-8 mg.',
  },
  {
    id: 'fentanyl',
    doses: [25, 50],
    doseUnit: 'mcg',
    note: 'Titrate 25-50 mcg q5 min. Lowers BP slightly; use judiciously.',
    warning:
      'Codeine allergy: ask what the reaction was. Nausea or itching is not an allergy; fentanyl does not cross-react.',
  },
  {
    id: 'zofran',
    doses: [4],
    doseUnit: 'mg',
    note: 'At onset of nausea, prior history, or end of appointment. Give over 2-5 min.',
  },
  {
    id: 'flumazenil',
    doses: [0.2],
    doseUnit: 'mg',
    note: 'Draw 2 ml per dose over 15 sec. Repeat q1 min. Max 1.0 mg total (5 doses).',
    warning: 'Sleepiness can return · discharge held 120 min after any reversal.',
  },
  {
    id: 'naloxone',
    doses: [0.4],
    doseUnit: 'mg',
    note: 'Single-dose vial = 1 ml. Give over 2-3 min. Repeat q3 min PRN.',
    warning: 'Discharge held 120 min after any reversal.',
  },
];
