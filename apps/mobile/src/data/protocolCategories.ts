import type { EmergencyCategory } from '@sedation-pro/clinical';

/**
 * The one place the protocol categories are named, grouped and coloured.
 * The engine carries seven fine-grained categories; the screens show five
 * swatches. Colours are the `--cat-*` tokens in tokens.css, applied through
 * the `.cat-<swatch>` classes in utilities.css.
 */
export type CategorySwatch = 'airway' | 'cardiac' | 'allergic' | 'neuro' | 'other';

export const CATEGORY_SWATCH: Readonly<Record<EmergencyCategory, CategorySwatch>> = {
  airway: 'airway',
  'cardiac-ischemia': 'cardiac',
  'cardiac-arrhythmia': 'cardiac',
  'cardiac-arrest': 'cardiac',
  allergic: 'allergic',
  neurological: 'neuro',
  other: 'other',
};

export function swatchFor(category: EmergencyCategory): CategorySwatch {
  return CATEGORY_SWATCH[category];
}

/** Caption over a protocol's title. */
export const CATEGORY_LABEL: Readonly<Record<EmergencyCategory, string>> = {
  airway: 'Airway',
  'cardiac-ischemia': 'Cardiac · Ischemia',
  'cardiac-arrhythmia': 'Cardiac · Arrhythmia',
  'cardiac-arrest': 'Cardiac · Arrest',
  allergic: 'Allergic & Toxicity',
  neurological: 'Neurological',
  other: 'Other',
};

export interface CategoryGroup {
  readonly id: string;
  readonly label: string;
  readonly swatch: CategorySwatch;
  /** Engine categories that roll up under this card on the landing page. */
  readonly categories: ReadonlyArray<EmergencyCategory>;
}

/** Landing-page cards, in display order. Cardiac rolls three categories into one card. */
export const CATEGORY_GROUPS: ReadonlyArray<CategoryGroup> = [
  { id: 'airway', label: 'Airway', swatch: 'airway', categories: ['airway'] },
  {
    id: 'cardiac',
    label: 'Cardiac',
    swatch: 'cardiac',
    categories: ['cardiac-ischemia', 'cardiac-arrhythmia', 'cardiac-arrest'],
  },
  { id: 'allergic', label: 'Allergic & Toxicity', swatch: 'allergic', categories: ['allergic'] },
  { id: 'neuro', label: 'Neurological', swatch: 'neuro', categories: ['neurological'] },
  { id: 'other', label: 'Other', swatch: 'other', categories: ['other'] },
];

export const CARDIAC_SUBHEADS: Readonly<Partial<Record<EmergencyCategory, string>>> = {
  'cardiac-ischemia': 'Ischemia & pressure',
  'cardiac-arrhythmia': 'Arrhythmias',
  'cardiac-arrest': 'Cardiac arrest',
};
