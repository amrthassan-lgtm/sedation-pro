import type {
  BedtimeDrug,
  Formulary,
  FormularyTimings,
  IVCeilings,
  IVDrug,
  LocalAnesthetic,
  OralDrug,
} from './types';

const IV_DRUGS: ReadonlyArray<IVDrug> = [
  {
    id: 'versed',
    name: 'Midazolam (Versed)',
    shortName: 'Versed',
    category: 'benzodiazepine',
    concentration: { value: 5, unit: 'mg/ml' },
    route: 'IV',
    color: '#f97316',
    minWaitMin: 3,
    readyAtMin: 5,
    notes: '1cc tuberculin · ORANGE tape',
  },
  {
    id: 'fentanyl',
    name: 'Fentanyl',
    shortName: 'Fentanyl',
    category: 'opioid',
    concentration: { value: 50, unit: 'mcg/ml' },
    route: 'IV',
    color: '#3b82f6',
    minWaitMin: 5,
    readyAtMin: 5,
    notes: '3cc syringe · BLUE tape',
  },
  {
    id: 'zofran',
    name: 'Ondansetron (Zofran)',
    shortName: 'Zofran',
    category: 'antiemetic',
    concentration: { value: 2, unit: 'mg/ml' },
    route: 'IV',
    color: '#94a3b8',
    minWaitMin: 0,
    notes: '3cc syringe · WHITE tape · give over 2-5 min',
  },
  {
    id: 'flumazenil',
    name: 'Flumazenil',
    shortName: 'Flumazenil',
    category: 'benzodiazepine-reversal',
    concentration: { value: 0.1, unit: 'mg/ml' },
    route: 'IV',
    color: '#facc15',
    minWaitMin: 3,
    isReversal: true,
    notes: 'Wait 3 min between doses · max 1.0 mg total',
  },
  {
    id: 'naloxone',
    name: 'Naloxone (Narcan)',
    shortName: 'Naloxone',
    category: 'opioid-reversal',
    concentration: { value: 0.4, unit: 'mg/ml' },
    route: 'IV',
    color: '#fb7185',
    minWaitMin: 3,
    isReversal: true,
    notes: 'Single dose vial 1 ml · give over 2-3 min',
  },
];

const ORAL_DRUGS: ReadonlyArray<OralDrug> = [
  {
    id: 'triazolam',
    name: 'Triazolam (Halcion)',
    shortName: 'Triazolam',
    category: 'benzodiazepine',
    concentration: { value: 0.25, unit: 'mg/ml' },
    route: 'PO',
    color: '#8b5cf6',
    notes: 'Given 30-90 min pre-op',
    attributes: [
      { label: 'Onset', value: '30–90 min pre-op' },
      { label: 'Use when', value: 'First-line anxiolytic' },
      {
        label: 'Caution',
        value: 'CNS depressant — conservative IV titration with Versed',
        tone: 'caution',
      },
    ],
  },
  {
    id: 'lorazepam',
    name: 'Lorazepam (Ativan)',
    shortName: 'Lorazepam',
    category: 'benzodiazepine',
    concentration: { value: 1, unit: 'mg/ml' },
    route: 'PO',
    color: '#8b5cf6',
    notes: 'Alternative for patients on CYP3A4 inhibitors',
    attributes: [
      {
        label: 'Use when',
        value: 'Alternative on CYP3A4 inhibitors (macrolides, antifungals, HIV antivirals)',
      },
    ],
  },
  {
    id: 'hydroxyzine',
    name: 'Hydroxyzine (Vistaril)',
    shortName: 'Hydroxyzine',
    category: 'antiemetic',
    concentration: { value: 25, unit: 'mg/ml' },
    route: 'PO',
    color: '#8b5cf6',
    notes: 'Non-benzo · no reversal agent',
    attributes: [
      { label: 'Class', value: 'Non-benzodiazepine antihistamine' },
      { label: 'Use when', value: 'Benzo-abuse hx · resp compromise · chronic nausea' },
      { label: 'Caution', value: 'No reversal — wears off over 4–6 h', tone: 'limit' },
    ],
  },
];

const BEDTIME_DRUGS: ReadonlyArray<BedtimeDrug> = [
  {
    id: 'diazepam',
    name: 'Diazepam (Valium)',
    shortName: 'Diazepam',
    category: 'benzodiazepine',
    concentration: { value: 5, unit: 'mg/ml' },
    route: 'PO',
    color: '#8b5cf6',
    notes: 'Bedtime night before · contraindicated with OSA',
  },
];

const LOCAL_ANESTHETICS: ReadonlyArray<LocalAnesthetic> = [
  {
    id: 'lidocaine-2-epi100k',
    name: '2% Lidocaine 1:100k epi',
    mgPerCarpule: 36,
    maxDoseMgPerKg: 7,
    halfLifeMin: 100,
    color: '#ef4444',
  },
  {
    id: 'septocaine-4-epi100k',
    name: '4% Septocaine 1:100k epi',
    mgPerCarpule: 72,
    maxDoseMgPerKg: 7,
    halfLifeMin: 30,
    color: '#facc15',
  },
  {
    id: 'septocaine-4-epi200k',
    name: '4% Septocaine 1:200k epi',
    mgPerCarpule: 72,
    maxDoseMgPerKg: 7,
    halfLifeMin: 30,
    color: '#94a3b8',
  },
  {
    id: 'marcaine-0_25-epi200k',
    name: '0.25% Marcaine 1:200k epi',
    mgPerCarpule: 4.5,
    maxDoseMgPerKg: 2,
    halfLifeMin: 170,
    color: '#3b82f6',
  },
  {
    id: 'mepivacaine-3-plain',
    name: '3% Mepivacaine (plain)',
    mgPerCarpule: 54,
    maxDoseMgPerKg: 6.6,
    halfLifeMin: 100,
    color: '#d4a574',
  },
];

const DEFAULT_CEILINGS: IVCeilings = {
  versedMaxMg: 15,
  fentanylMaxMcg: 100,
  benzoOpioidSynergyReduction: 0.3,
};

const DEFAULT_TIMINGS: FormularyTimings = {
  versedMinWaitMin: 3,
  // Apex protocol: Versed is re-dosable as soon as the 3-min safety wait
  // clears — there is no separate "peak/ramp" window. Setting ready === min
  // collapses the ramping tier (same mechanism Fentanyl uses). A practice
  // that wants a distinct ramp window sets versedReadyMin > versedMinWaitMin.
  versedReadyMin: 3,
  fentanylMinWaitMin: 5,
  premedWaitMin: 30,
  releaseWaitMin: 20,
  flumazenilDischargeWaitMin: 120,
};

/**
 * Apex Dental default formulary. Bundled so the engine works out-of-the-box,
 * but practices can override any subset by composing their own `Formulary`
 * and passing it to engine functions.
 */
export const DEFAULT_FORMULARY: Formulary = {
  iv: IV_DRUGS,
  oral: ORAL_DRUGS,
  bedtime: BEDTIME_DRUGS,
  locals: LOCAL_ANESTHETICS,
  ceilings: DEFAULT_CEILINGS,
  timings: DEFAULT_TIMINGS,
};
