/**
 * Emergency medication inventory — the practice's physical crash-cart
 * stock, transcribed from the paper inventory sheet (2026-08).
 *
 * This file IS the source of truth, by the practice owner's choice:
 * stock changes are made here (via a Claude session or a GitHub edit),
 * committed, and every device picks up the new list on the next deploy.
 * The app never edits inventory on-device — that keeps all tablets and
 * phones showing the same list with zero sync machinery.
 *
 * Expirations follow the pharma month convention: `'YYYY-MM'` means
 * usable through the LAST day of that month (the engine's
 * `expiryStatus` resolves this). An empty `expiresOn` marks stock whose
 * expiry is unknown — the inventory screen surfaces it as needing
 * attention until a real date lands here.
 */

export interface InventoryItem {
  /** Stable slug used as the render key; never reuse across drugs. */
  readonly id: string;
  readonly drug: string;
  /** Strength / form as printed on the packaging. */
  readonly description: string;
  /** '' when not yet known (item on order or label unread). */
  readonly lot: string;
  readonly ndc: string;
  readonly quantity: number;
  /** 'YYYY-MM' (or 'YYYY-MM-DD'); '' when unknown. */
  readonly expiresOn: string;
  /** Replacement purchase in flight. */
  readonly onOrder?: {
    readonly sku: string;
    /** Form change vs the current row, e.g. spray → tablets. */
    readonly substitution?: string;
  };
  /**
   * Opt-in link to `EMERGENCY_PROTOCOLS` drug-callout names (exact
   * spelling — a vitest tripwire verifies each against the real
   * protocol data). Absence renders NOTHING on protocol screens, never
   * "not stocked". The infiltration lidocaines deliberately carry no
   * mapping: they must never satisfy a 'Cardiac Lidocaine' lookup
   * (wrong-vial hazard).
   */
  readonly protocolDrugNames?: ReadonlyArray<string>;
  /** Free-text action note for humans (NOT order tracking — see onOrder). */
  readonly notes?: string;
}

/** Vintage of the transcribed paper sheet — bump when re-verifying stock. */
export const INVENTORY_AS_OF = '2026-08';

/**
 * Protocol drug callouts that are deliberately NOT part of the stocked
 * emergency kit: controlled substances live in the sedation cart with
 * their own tracking. Excluded from the "not stocked" gap report so it
 * only surfaces genuine purchasing decisions.
 */
export const CONTROLLED_EXCLUSIONS: ReadonlyArray<string> = ['Midazolam', 'Fentanyl', 'Diazepam'];

export const EMERGENCY_INVENTORY: ReadonlyArray<InventoryItem> = [
  {
    id: 'epi-autoinjector-015',
    drug: 'Epinephrine Injection',
    description: 'Auto-injector 0.15 mg',
    lot: 'G250809Z',
    ndc: '0115-1695-30',
    quantity: 1,
    expiresOn: '2027-04',
    protocolDrugNames: ['Epinephrine'],
  },
  {
    id: 'epi-autoinjector-03',
    drug: 'Epinephrine Injection',
    description: 'Auto-injector 0.3 mg',
    lot: 'G250206X',
    ndc: '0115-1694-30',
    quantity: 1,
    expiresOn: '2026-08',
    protocolDrugNames: ['Epinephrine'],
  },
  {
    id: 'glucose-gel',
    drug: 'Glutose15',
    description: 'Oral glucose gel 15 g',
    lot: '3301800',
    ndc: '0574-0069-15',
    quantity: 1,
    expiresOn: '2026-06',
    onOrder: { sku: 'GLUT15' },
  },
  {
    id: 'adenosine-12-a',
    drug: 'Adenosine Injection',
    description: '12 mg / 4 mL',
    lot: '16UA2714',
    ndc: '63323-651-23',
    quantity: 1,
    expiresOn: '2026-12',
    protocolDrugNames: ['Adenosine'],
  },
  {
    id: 'adenosine-6',
    drug: 'Adenosine Injection',
    description: '6 mg / 2 mL',
    lot: '6037350',
    ndc: '63323-651-00',
    quantity: 1,
    expiresOn: '2028-04',
    protocolDrugNames: ['Adenosine'],
  },
  {
    id: 'adenosine-12-b',
    drug: 'Adenosine Injection',
    description: '12 mg / 4 mL',
    lot: '6033978',
    ndc: '63323-651-01',
    quantity: 1,
    expiresOn: '2026-11',
    protocolDrugNames: ['Adenosine'],
  },
  {
    id: 'epi-vial-adrenalin',
    drug: 'Adrenalin (epinephrine)',
    description: '1 mg/mL vial',
    lot: '80192',
    ndc: '42023-159-01',
    quantity: 2,
    expiresOn: '2026-06',
    protocolDrugNames: ['Epinephrine'],
  },
  {
    id: 'amiodarone-150-a',
    drug: 'Amiodarone HCl',
    description: '150 mg / 3 mL',
    lot: '2050731',
    ndc: '0143-9875-01',
    quantity: 1,
    expiresOn: '2027-04',
    protocolDrugNames: ['Amiodarone'],
  },
  {
    id: 'amiodarone-150-b',
    drug: 'Amiodarone HCl',
    description: '150 mg / 3 mL',
    lot: '2052641',
    ndc: '0143-9875-01',
    quantity: 1,
    expiresOn: '2027-10',
    protocolDrugNames: ['Amiodarone'],
  },
  {
    id: 'amiodarone-900',
    drug: 'Amiodarone HCl',
    description: '900 mg / 18 mL',
    lot: '3252148',
    ndc: '67457-153-18',
    quantity: 1,
    expiresOn: '2027-08',
    protocolDrugNames: ['Amiodarone'],
  },
  {
    id: 'aspirin',
    drug: 'Aspirin',
    description: '325 mg tablets',
    lot: '9262',
    ndc: '68599-1311-3',
    quantity: 1,
    expiresOn: '2026-09',
    protocolDrugNames: ['Aspirin'],
  },
  {
    id: 'atropine-1ml',
    drug: 'Atropine Sulfate Injection',
    description: '1 mg/mL',
    lot: 'A240543',
    ndc: '70069-641-01',
    quantity: 2,
    expiresOn: '2026-09',
    protocolDrugNames: ['Atropine'],
  },
  {
    id: 'atropine-10ml',
    drug: 'Atropine Sulfate Injection',
    description: '1 mg / 10 mL',
    lot: 'A25178',
    ndc: '64253-400-30',
    quantity: 1,
    expiresOn: '2027-02',
    protocolDrugNames: ['Atropine'],
  },
  {
    id: 'dexamethasone',
    drug: 'Dexamethasone Sodium Phosphate',
    description: '4 mg/mL injection',
    lot: 'H25060',
    ndc: '0641-6145-01',
    quantity: 1,
    expiresOn: '2027-08',
    protocolDrugNames: ['Dexamethasone'],
  },
  {
    id: 'diphenhydramine',
    drug: 'Diphenhydramine HCl',
    description: '50 mg/mL injection',
    lot: 'H24059',
    ndc: '0641-0376-21',
    quantity: 2,
    expiresOn: '2026-08',
    protocolDrugNames: ['Diphenhydramine'],
  },
  {
    id: 'ephedrine',
    drug: 'Ephedrine Sulfate Injection',
    description: '50 mg/mL',
    lot: 'AP250183B',
    ndc: '16714-037-01',
    quantity: 1,
    expiresOn: '2027-04',
    protocolDrugNames: ['Ephedrine'],
  },
  {
    id: 'epi-vial',
    drug: 'Epinephrine Injection',
    description: '1 mg/mL vial',
    lot: '251561',
    ndc: '54288-103-01',
    quantity: 3,
    expiresOn: '2027-02',
    protocolDrugNames: ['Epinephrine', 'Push-dose Epinephrine'],
  },
  {
    id: 'flumazenil-a',
    drug: 'Flumazenil Injection',
    description: '0.5 mg / 5 mL',
    lot: '24021511',
    ndc: '0143-9784-01',
    quantity: 1,
    expiresOn: '2027-07',
    protocolDrugNames: ['Flumazenil'],
  },
  {
    id: 'flumazenil-b',
    drug: 'Flumazenil Injection',
    description: '0.5 mg / 5 mL',
    lot: '25430221',
    ndc: '0143-9784-01',
    quantity: 2,
    expiresOn: '2028-05',
    protocolDrugNames: ['Flumazenil'],
  },
  {
    id: 'hydralazine',
    drug: 'Hydralazine HCl Injection',
    description: '20 mg/mL',
    lot: '3HH25011A',
    ndc: '55150-400-01',
    quantity: 1,
    expiresOn: '2027-06',
    protocolDrugNames: ['Hydralazine'],
  },
  {
    id: 'labetalol',
    drug: 'Labetalol HCl Injection',
    description: '200 mg / 40 mL (5 mg/mL)',
    lot: '90000709',
    ndc: '25021-317-40',
    quantity: 1,
    expiresOn: '2026-03',
    onOrder: { sku: 'LABE540V' },
    protocolDrugNames: ['Labetalol'],
  },
  {
    id: 'lidocaine-1pct',
    drug: 'Lidocaine HCl 1%',
    description: '200 mg / 20 mL — infiltration / nerve block',
    lot: '3LC25033A',
    ndc: '55150-252-20',
    quantity: 1,
    expiresOn: '2028-02',
  },
  {
    id: 'lidocaine-2pct',
    drug: 'Lidocaine HCl 2%',
    description: '100 mg / 5 mL — infiltration / nerve block',
    lot: '25430811',
    ndc: '0143-9594-01',
    quantity: 2,
    expiresOn: '2028-05',
  },
  {
    id: 'lidocaine-cardiac',
    drug: 'Lidocaine HCl 2% IV',
    description: '100 mg / 5 mL — cardiac arrhythmias',
    lot: '6133763',
    ndc: '63323-208-01',
    quantity: 1,
    expiresOn: '2027-12',
    protocolDrugNames: ['Cardiac Lidocaine'],
  },
  {
    id: 'naloxone-vial',
    drug: 'Naloxone HCl Injection',
    description: '0.4 mg/mL',
    lot: '305756',
    ndc: '36000-308-01',
    quantity: 2,
    expiresOn: '2027-03',
    protocolDrugNames: ['Naloxone'],
  },
  {
    id: 'narcan-spray',
    drug: 'Narcan (naloxone) Nasal Spray',
    description: '4 mg',
    lot: '230745',
    ndc: '69547-627-02',
    quantity: 2,
    expiresOn: '2026-05',
    protocolDrugNames: ['Naloxone'],
  },
  {
    id: 'nitroglycerin',
    drug: 'Nitroglycerin Lingual Spray',
    description: '400 mcg/spray',
    lot: '202727',
    ndc: '28595-120-49',
    quantity: 1,
    expiresOn: '2026-05',
    onOrder: { sku: 'NITR4-25O-R', substitution: '0.4 mg tablets ×25' },
    protocolDrugNames: ['Nitroglycerin'],
  },
  {
    id: 'ondansetron',
    drug: 'Ondansetron Injection',
    description: '4 mg / 2 mL',
    lot: 'G1420196',
    ndc: '72266-123-01',
    quantity: 1,
    expiresOn: '2027-02',
    protocolDrugNames: ['Ondansetron'],
  },
  {
    id: 'ventolin',
    drug: 'Ventolin HFA (albuterol)',
    description: '90 mcg/actuation inhaler',
    lot: 'K95L',
    ndc: '0173-0682-24',
    quantity: 1,
    expiresOn: '2026-01',
    onOrder: { sku: 'VENT60', substitution: '60-dose inhaler' },
    protocolDrugNames: ['Albuterol'],
  },
  {
    id: 'succinylcholine',
    drug: 'Succinylcholine',
    description: '20 mg/mL — KEEP REFRIGERATED',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    notes:
      'In the fridge but off the paper sheet — read lot + expiry from the vial and update here',
    protocolDrugNames: ['Succinylcholine'],
  },
  {
    id: 'd50w',
    drug: 'Dextrose 50% (D50W)',
    description: '0.5 g/mL, 50 mL single-dose vial',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    onOrder: { sku: 'DEXT5050V-E' },
    notes: 'New line item — fills the hypoglycemia IV-route gap',
    protocolDrugNames: ['D50W'],
  },
];
