/**
 * Emergency inventory — the practice's physical crash-cart stock: drugs,
 * sedation-cart items, and the dated AED consumables, transcribed from
 * the paper inventory sheet (2026-08).
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
  /** '' for equipment (no NDC assigned) and for drug stock unread. */
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
  /**
   * 'sedation' marks sedation-cart stock (controlled substances + oral
   * premeds) tracked alongside the crash cart in this one list, per the
   * owner's choice. 'equipment' marks dated non-drug stock — AED pads
   * and battery, airway and O₂ supplies, IV supplies — which expires like
   * a drug and strands the rescue it serves when it lapses, so it earns
   * the same banner and reorder pressure. A supply whose expiry has not
   * been found yet is listed with an empty date on purpose (owner, 2026-11):
   * it stays in "needs attention" until someone reads the outer box.
   * Equipment never carries `protocolDrugNames` (a vitest invariant):
   * protocol callouts name drugs, and a pad must never satisfy one.
   * Absent = emergency kit.
   */
  readonly category?: 'sedation' | 'equipment';
  /**
   * Milligrams in one counted unit (one vial, syringe or bottle — whatever
   * `quantity` counts). Only rows for a drug in `PROTOCOL_COURSES` need it;
   * a vitest invariant enforces that, so the full-course check can never
   * silently skip a lot.
   */
  readonly mgPerUnit?: number;
  /**
   * Listed so the kit is complete (the Florida moderate-sedation rule names
   * it) but its date has not been read yet. Kept out of every warning count
   * and shown under "Awaiting photo" instead, so known gaps in the
   * paperwork never inflate the red badge. Only meaningful with an empty
   * `expiresOn`; a vitest invariant enforces that, and that such a row
   * never satisfies a protocol callout.
   */
  readonly awaitingPhoto?: boolean;
  /**
   * Confirmed on hand, and has no expiry by nature (a scale, a light, a CPR
   * board). Listed for the kit's completeness, never a warning, and shown
   * under "No expiry" rather than "In date". Same invariants as
   * `awaitingPhoto`: empty `expiresOn`, no protocol mapping, and never both
   * flags on one row.
   */
  readonly noExpiry?: boolean;
  /** Free-text action note for humans (NOT order tracking — see onOrder). */
  readonly notes?: string;
}

/** Vintage of the transcribed paper sheet — bump when re-verifying stock. */
export const INVENTORY_AS_OF = '2026-08';

/**
 * What one full protocol course of a drug needs, so the inventory can say
 * "in date, but not enough". Expiry alone missed this: a single in-date
 * 1 mg atropine syringe reads OK while the bradycardia protocol can call
 * for 3 mg. Each `protocolPhrase` must appear in that drug's protocol
 * callout (a vitest tripwire), so a protocol edit that changes the course
 * fails the suite instead of leaving a stale number here.
 */
export interface ProtocolCourse {
  /** Protocol drug-callout name, exactly as in `protocolDrugNames`. */
  readonly drug: string;
  readonly needMg: number;
  /** Shown to the clinician: how the protocol adds up to `needMg`. */
  readonly basis: string;
  readonly protocolPhrase: string;
}

export const PROTOCOL_COURSES: ReadonlyArray<ProtocolCourse> = [
  {
    drug: 'Atropine',
    needMg: 3,
    basis: '1 mg every 3–5 min, max 3 mg',
    protocolPhrase: 'max 3 mg',
  },
  {
    drug: 'Adenosine',
    needMg: 18,
    basis: '6 mg, then 12 mg (AHA 2025)',
    protocolPhrase: '12 mg (2nd dose)',
  },
  {
    drug: 'Flumazenil',
    needMg: 1,
    basis: '0.2 mg increments, max 1.0 mg',
    protocolPhrase: 'max 1.0 mg',
  },
  {
    drug: 'Nitroglycerin',
    needMg: 1.2,
    basis: '0.4 mg every 5 min, max 3 doses',
    protocolPhrase: 'max 3 doses',
  },
];

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
    onOrder: { sku: 'AUVI3-R', substitution: 'Auvi-Q 0.3 mg auto-injector' },
    notes: 'Shipped (inv 3747995): Auvi-Q lot G001-000011714486, exp 2028-01-17, NDC 71872-7329-01',
    protocolDrugNames: ['Epinephrine'],
  },
  {
    id: 'glucose-gel',
    drug: 'TRUEplus Glucose Gel',
    description: 'Oral glucose gel 15 g — 32 mL pouch',
    lot: '50889',
    ndc: '',
    quantity: 1,
    expiresOn: '2029-03',
    notes: 'Lot and expiry are embossed on the pouch seal (50889 · 03/2029)',
  },
  {
    id: 'adenosine-12-a',
    drug: 'Adenosine Injection',
    description: '12 mg / 4 mL — Simplist prefilled syringe',
    lot: '16UA2714',
    ndc: '63323-651-23',
    quantity: 1,
    mgPerUnit: 12,
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
    mgPerUnit: 6,
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
    mgPerUnit: 12,
    expiresOn: '2026-11',
    protocolDrugNames: ['Adenosine'],
  },
  {
    id: 'amiodarone-150-a',
    drug: 'Amiodarone HCl',
    description: '150 mg / 3 mL',
    lot: '25050731',
    ndc: '0143-9875-01',
    quantity: 1,
    expiresOn: '2027-04',
    protocolDrugNames: ['Amiodarone'],
  },
  {
    id: 'amiodarone-150-b',
    drug: 'Amiodarone HCl',
    description: '150 mg / 3 mL',
    lot: '25052641',
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
    onOrder: { sku: 'ASPI81-36O', substitution: '81 mg chewable ×36' },
    notes:
      'Shipped (inv 3747995): 81 mg chewable ×36, lot 6GE1743, exp 2029-04-30, NDC 70677-1134-01',
    protocolDrugNames: ['Aspirin'],
  },
  {
    id: 'atropine-1ml',
    drug: 'Atropine Sulfate Injection',
    description: '1 mg/mL',
    lot: 'A240543',
    ndc: '70069-641-01',
    quantity: 2,
    mgPerUnit: 1,
    expiresOn: '2026-09',
    onOrder: { sku: 'on order #2000017881', substitution: '1 mg ×2' },
    notes:
      'Shipped ×2 (inv 3748160): 1 mg/mL 1 mL vials, lot F985-A250596, exp 2027-11-30, NDC 71872-7340-01',
    protocolDrugNames: ['Atropine'],
  },
  {
    id: 'atropine-10ml',
    drug: 'Atropine Sulfate Injection',
    description: '1 mg / 10 mL',
    lot: 'A25178',
    ndc: '64253-400-30',
    quantity: 1,
    mgPerUnit: 1,
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
    onOrder: { sku: 'DIPH501V-R' },
    notes: 'Shipped ×2 (inv 3747995): lot AB071-E109A012, exp 2028-02-29, NDC 71872-7373-01',
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
    mgPerUnit: 0.5,
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
    mgPerUnit: 0.5,
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
    lot: 'A0740039',
    ndc: '83301-0059-1',
    quantity: 1,
    expiresOn: '2027-12',
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
    notes: 'Not used by any protocol — let expire and do not reorder',
  },
  {
    id: 'lidocaine-2pct',
    drug: 'Lidocaine HCl 2%',
    description: '100 mg / 5 mL — infiltration / nerve block',
    lot: '25430811',
    ndc: '0143-9594-01',
    quantity: 2,
    expiresOn: '2028-05',
    notes: 'Not used by any protocol — let expire and do not reorder',
  },
  {
    id: 'lidocaine-cardiac',
    drug: 'Lidocaine HCl 2% IV',
    description: '100 mg / 5 mL — cardiac arrhythmias',
    lot: '6133763',
    ndc: '63323-208-01',
    quantity: 25,
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
    notes:
      "2 vials per owner (Nov 2026); only lot 305756 photographed — confirm the second vial's lot/exp",
    protocolDrugNames: ['Naloxone'],
  },
  {
    id: 'nitroglycerin',
    drug: 'Nitroglycerin Sublingual Tablets',
    description: '0.4 mg — bottle of 25',
    lot: '51982GA1',
    ndc: '72888-139-32',
    quantity: 1,
    mgPerUnit: 10,
    expiresOn: '2027-09',
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
    notes: 'Not being replaced — the sedation-cart 20 mL vial covers emergencies',
    protocolDrugNames: ['Ondansetron'],
  },
  {
    id: 'ventolin',
    drug: 'Ventolin HFA (albuterol)',
    description: '90 mcg/actuation — 60 metered inhalations',
    lot: 'X58K',
    ndc: '0173-0682-24',
    quantity: 1,
    expiresOn: '2027-12',
    protocolDrugNames: ['Albuterol'],
  },
  {
    id: 'succinylcholine',
    drug: 'Succinylcholine',
    description: '20 mg/mL — KEEP REFRIGERATED',
    lot: 'AS1250127A',
    ndc: '',
    quantity: 1,
    expiresOn: '2027-02',
    notes: 'Red cap (Camber/Aspiro). Refrigerated; once out of the fridge, use within 14 days',
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
    notes:
      'Backordered at Young Surgical (Nov 2026) — source from another distributor; Florida requires an antihypoglycemic',
    protocolDrugNames: ['D50W'],
  },
  {
    // Replaces the two 12 mg/4 mL vials as they expire (Nov/Dec 2026):
    // a 12 mg protocol dose is two of these.
    id: 'adenosine-6-order',
    drug: 'Adenosine Injection',
    description: '6 mg / 2 mL',
    lot: '',
    ndc: '',
    quantity: 2,
    mgPerUnit: 6,
    expiresOn: '',
    onOrder: { sku: 'ADEN32V-R' },
    notes: 'Shipped ×2 (inv 3747995): lot F933-A4640039, exp 2027-11-30, NDC 71872-7335-01',
    protocolDrugNames: ['Adenosine'],
  },
  {
    id: 'solu-medrol',
    drug: 'Solu-Medrol (methylprednisolone)',
    description: '125 mg / 2 mL Act-O-Vial',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    onOrder: { sku: 'SOLU1252V-R' },
    notes: 'Shipped (inv 3747995): lot E014-RA5974, exp 2029-01-31, NDC 71872-7061-01',
    protocolDrugNames: ['Methylprednisolone (Solu-Medrol)'],
  },
  // Sedation cart (the safe), read from the packaging 2026-10 and counted
  // by the DA 2026-11. Quantity is vials for injectables, tablets for the
  // oral bottles.
  {
    id: 'midazolam-10ml',
    drug: 'Midazolam Injection',
    description: '5 mg/mL — 10 mL multiple-dose vial',
    lot: 'G1880032',
    ndc: '23155-601-42',
    quantity: 8,
    expiresOn: '2028-05',
    category: 'sedation',
    notes: '7 sealed + 1 in use (counted Nov 2026)',
    protocolDrugNames: ['Midazolam'],
  },
  {
    id: 'fentanyl-2ml',
    drug: 'Fentanyl Citrate Injection',
    description: '50 mcg/mL — 2 mL single-dose vial',
    lot: 'L25067',
    ndc: '0641-6027-25',
    quantity: 22,
    expiresOn: '2028-11',
    category: 'sedation',
    notes: '21 sealed + 1 in use (counted Nov 2026)',
    protocolDrugNames: ['Fentanyl'],
  },
  {
    id: 'fentanyl-50ml',
    drug: 'Fentanyl Citrate Injection',
    description: '50 mcg/mL — 50 mL single-dose vial',
    lot: 'K25113',
    ndc: '0641-6030-01',
    quantity: 1,
    expiresOn: '2028-10',
    category: 'sedation',
    notes: 'Sealed (Nov 2026)',
    protocolDrugNames: ['Fentanyl'],
  },
  {
    // Distinct from the crash-cart ondansetron row: the owner keeps one in
    // each cart (part of the fentanyl protocol here).
    id: 'ondansetron-20ml',
    drug: 'Ondansetron Injection',
    description: '2 mg/mL — 20 mL multiple-dose vial',
    lot: 'G1830058',
    ndc: '72266-124-01',
    quantity: 1,
    expiresOn: '2028-02',
    category: 'sedation',
    protocolDrugNames: ['Ondansetron'],
  },
  {
    id: 'triazolam-025',
    drug: 'Triazolam Tablets',
    description: '0.25 mg tablets — bottle of 100',
    lot: 'MA04039A',
    ndc: '70710-1289-1',
    quantity: 88,
    expiresOn: '2027-08',
    category: 'sedation',
  },
  {
    id: 'lorazepam-2',
    drug: 'Lorazepam Tablets',
    description: '2 mg tablets — bottle of 100',
    lot: '100071801',
    ndc: '0093-3427-01',
    quantity: 100,
    expiresOn: '2027-04',
    category: 'sedation',
    notes: 'Sealed bottle (Nov 2026)',
  },
  {
    id: 'diazepam-5',
    drug: 'Diazepam Tablets',
    description: '5 mg tablets — bottle of 100',
    lot: '100073178',
    ndc: '0172-3926-60',
    quantity: 99,
    expiresOn: '2027-05',
    category: 'sedation',
  },
  {
    // The label prints its values one row low (serial on the EXP line);
    // lot and expiry here are the values that belong to those fields.
    id: 'hydroxyzine-50',
    drug: 'Hydroxyzine HCl Tablets',
    description: '50 mg tablets — bottle of 100',
    lot: '120166',
    ndc: '16714-083-10',
    quantity: 98,
    expiresOn: '2028-04',
    category: 'sedation',
  },
  {
    id: 'aed-pads-adult',
    drug: 'Defibtech Defibrillation Pads',
    description: 'Adult AED electrode pads',
    lot: 'D050225-08',
    ndc: '',
    quantity: 1,
    expiresOn: '2027-11-30',
    category: 'equipment',
  },
  {
    id: 'aed-pads-pediatric',
    drug: 'Defibtech Defibrillation Pads',
    description: 'Pediatric AED electrode pads',
    lot: 'D022825-09',
    ndc: '',
    quantity: 1,
    expiresOn: '2027-08-31',
    category: 'equipment',
  },
  {
    id: 'aed-battery',
    drug: 'Defibtech Battery Pack',
    description: 'AED battery — DBP-1400 non-rechargeable',
    lot: 'SN 211175072',
    ndc: '',
    quantity: 1,
    expiresOn: '2030-12-31',
    category: 'equipment',
  },
  // Airway, O₂ and IV supplies, read from the packaging 2026-11.
  {
    id: 'bvm-adult',
    drug: 'Ambu SPUR II Resuscitator',
    description: 'Adult bag-valve mask (>30 kg)',
    lot: '1001167791',
    ndc: '',
    quantity: 1,
    expiresOn: '2028-04-11',
    category: 'equipment',
  },
  {
    id: 'ett-5',
    drug: 'Curaplex Endotracheal Tube',
    description: '5.0 mm cuffed, with stylette',
    lot: '1013060',
    ndc: '',
    quantity: 1,
    expiresOn: '2028-08-24',
    category: 'equipment',
  },
  {
    id: 'ett-6',
    drug: 'Curaplex Endotracheal Tube',
    description: '6.0 mm cuffed, with stylette',
    lot: '1013060',
    ndc: '',
    quantity: 1,
    expiresOn: '2028-08-24',
    category: 'equipment',
  },
  {
    id: 'ett-7',
    drug: 'Curaplex Endotracheal Tube',
    description: '7.0 mm cuffed, with stylette',
    lot: '1013204',
    ndc: '',
    quantity: 1,
    expiresOn: '2028-10-12',
    category: 'equipment',
  },
  {
    id: 'king-lts-d-4',
    drug: 'King LTS-D Airway',
    description: 'Size 4 (5–6 ft) supraglottic airway',
    lot: 'JUL24-07',
    ndc: '',
    quantity: 1,
    expiresOn: '2029-07-01',
    category: 'equipment',
  },
  {
    id: 'lma-3',
    drug: 'LarySeal Clear Laryngeal Mask Airway',
    description: 'Size 3 (30–50 kg) — cuff 20 mL',
    lot: '231201164',
    ndc: '',
    quantity: 1,
    expiresOn: '2028-11-01',
    category: 'equipment',
  },
  {
    id: 'lma-4',
    drug: 'LarySeal Clear Laryngeal Mask Airway',
    description: 'Size 4 (50–70 kg) — cuff 30 mL',
    lot: '240802933',
    ndc: '',
    quantity: 1,
    expiresOn: '2029-07-01',
    category: 'equipment',
  },
  {
    id: 'lma-5',
    drug: 'LarySeal Clear Laryngeal Mask Airway',
    description: 'Size 5 (70–100 kg) — cuff 40 mL',
    lot: '241001993',
    ndc: '',
    quantity: 1,
    expiresOn: '2029-09-01',
    category: 'equipment',
  },
  {
    id: 'laryseal-inflator',
    drug: 'LarySeal Cuff Inflator',
    description: 'Colour-coded 50 mL cuff syringe',
    lot: '231103838',
    ndc: '',
    quantity: 1,
    expiresOn: '2028-10-01',
    category: 'equipment',
  },
  {
    id: 'berman-airways',
    drug: 'Curaplex Berman Oral Airway Kit',
    description: 'Sizes 00, 1, 3, 4, 5, 6',
    lot: 'ASM0035900',
    ndc: '',
    quantity: 1,
    expiresOn: '2027-11-29',
    category: 'equipment',
  },
  {
    id: 'nrb-adult',
    drug: 'Curaplex Non-Rebreather Mask',
    description: 'Adult, 7 ft tubing + reservoir',
    lot: '1012868',
    ndc: '',
    quantity: 1,
    expiresOn: '2029-06-07',
    category: 'equipment',
  },
  {
    id: 'nrb-pediatric',
    drug: 'Hudson RCI Non-Rebreather Mask',
    description: 'Pediatric, 7 ft tubing',
    lot: '25A0A473',
    ndc: '',
    quantity: 1,
    expiresOn: '2030-01-13',
    category: 'equipment',
  },
  {
    id: 'cannula-pediatric',
    drug: 'Curaplex Nasal Cannula',
    description: 'Pediatric, 7 ft tubing',
    lot: '1012502',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
    notes: 'Everyday sedation supply — stock tracked, expiry not',
  },
  {
    id: 'iv-catheter-22',
    drug: 'BD Insyte Autoguard IV Catheter',
    description: '22 G × 1.00 in',
    lot: '4282305',
    ndc: '',
    quantity: 1,
    expiresOn: '2027-09-30',
    category: 'equipment',
  },
  {
    id: 'iv-admin-set',
    drug: 'Exelint IV Administration Set',
    description: '15 drop/mL, Y-site, 78 in',
    lot: '240304',
    ndc: '',
    quantity: 1,
    expiresOn: '2029-02-04',
    category: 'equipment',
  },
  {
    id: 'iv-extension',
    drug: 'Vygon Microbore Extension Set',
    description: '7 in, luer lock, slide clamp',
    lot: '240225BA',
    ndc: '',
    quantity: 1,
    expiresOn: '2028-02-24',
    category: 'equipment',
  },
  {
    id: 'd5w-1000',
    drug: '5% Dextrose Injection (D5W)',
    description: '1000 mL bag',
    lot: 'Y490603',
    ndc: '0338-0017-04',
    quantity: 1,
    expiresOn: '2027-10',
    category: 'equipment',
    notes: 'IV carrier fluid — not a substitute for D50W in hypoglycemia',
  },
  {
    id: 'lancets',
    drug: 'Accu-Chek Softclix Lancets',
    description: 'Box of 100',
    lot: '10825038',
    ndc: '',
    quantity: 1,
    expiresOn: '2029-02-28',
    category: 'equipment',
  },
  {
    id: 'suction-pump-manual',
    drug: 'Medsource Manual Suction Pump',
    description: 'Hand-powered, with canister + tubing (MS-001PMP)',
    lot: '1011479',
    ndc: '',
    quantity: 1,
    expiresOn: '2028-12-17',
    category: 'equipment',
  },
  {
    id: 'test-strips',
    drug: 'Accu-Chek Guide Test Strips',
    description: 'Vial of 50',
    lot: '105969',
    ndc: '',
    quantity: 1,
    expiresOn: '2027-04-26',
    category: 'equipment',
  },
  {
    id: 'yankauer',
    drug: 'Yankauer Suction Instrument',
    description: 'Bulb tip, control vent',
    lot: '202511141',
    ndc: '',
    quantity: 1,
    expiresOn: '2030-11-13',
    category: 'equipment',
  },
  {
    id: 'suction-tubing',
    drug: 'ConMed Suction Connecting Tubing',
    description: '6 ft, 1/4 in I.D.',
    lot: '202508056',
    ndc: '',
    quantity: 1,
    expiresOn: '2030-08-04',
    category: 'equipment',
  },
  {
    id: 'saline-500',
    drug: '0.9% Sodium Chloride Injection (NS)',
    description: '500 mL bag — IV grade',
    lot: 'Y489546',
    ndc: '0338-0049-03',
    quantity: 1,
    expiresOn: '2027-07',
    category: 'equipment',
  },
  {
    id: 'syringe-60',
    drug: 'Terumo 60 mL Syringe',
    description: 'Luer-lock, no needle — King LTS-D cuff (50–70 mL)',
    lot: '230503H',
    ndc: '',
    quantity: 1,
    expiresOn: '2028-04-30',
    category: 'equipment',
  },
  {
    id: 'cannula-adult',
    drug: 'Dynarex Nasal Oxygen Cannula',
    description: 'Adult, cushion tip, 7 ft tubing',
    lot: '57609',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
    notes: 'Everyday sedation supply — stock tracked, expiry not',
  },
  {
    id: 'cric-kit',
    drug: 'Chinook TMM-CR Cricothyrotomy Kit',
    description: 'Cuffed 6.0 trach tube, Kelly, #10 scalpel, 10 mL syringe, tracheal hook',
    lot: '96121125',
    ndc: '',
    quantity: 1,
    expiresOn: '2028-10-13',
    category: 'equipment',
  },
  {
    id: 'bvm-pediatric',
    drug: 'Ambu SPUR II Resuscitator',
    description: 'Pediatric bag-valve mask',
    lot: '1000639825',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    awaitingPhoto: true,
    notes: 'Read the expiry at the next emergency training',
  },
  {
    id: 'o2-mask-adult',
    drug: 'Dynarex Oxygen Mask',
    description: 'Adult medium-concentration, 7 ft tubing',
    lot: '57611',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
    notes: 'Not reordered — the adult non-rebreather replaces it',
  },
  {
    id: 'suction-catheters',
    drug: 'Cardinal Health Suction Catheter',
    description: 'Argyle 6 Fr graduated, chimney valve (REF 30688)',
    lot: '2233310564',
    ndc: '',
    quantity: 2,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
  },
  // Required by Florida 64B5-14.009 (Aug 2026); listed before the DA's
  // photos arrive so the kit is complete.
  {
    id: 'npa-set',
    drug: 'Nasopharyngeal Airways',
    description: 'Nasal airways, various sizes',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    awaitingPhoto: true,
    notes: 'On the January order: NasoSafe 6 mm, 7.5 mm, 8 mm + water-based lubricant',
  },
  {
    id: 'o2-cylinder',
    drug: 'Oxygen Cylinder (portable)',
    description: 'Positive-pressure O₂ backup',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
    notes: 'Checked full Nov 2026; hydro-test stamp not yet read',
  },
  {
    id: 'laryngoscope',
    drug: 'SunMed Standard Laryngoscope',
    description: 'Handle with MAC 4 blade',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
    notes: 'Keep spare batteries and a spare bulb with it (Florida 64B5-14.009)',
  },
  {
    id: 'laryngoscope-spares',
    drug: 'Laryngoscope Spare Batteries and Bulbs',
    description: 'Spare bulbs for the SunMed blade + batteries for the handle',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    awaitingPhoto: true,
    notes: 'Required by Florida 64B5-14.009(4)(b) — order bulbs, confirm batteries',
  },
  {
    id: 'magill-forceps',
    drug: 'Magill Forceps',
    description: 'Foreign-body / intubation forceps',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
  },
  {
    id: 'precordial-stethoscope',
    drug: 'Backup Precordial Stethoscope',
    description: 'Chest-mounted bell for heart rate and ventilation (11-400-00)',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
  },
  {
    id: 'thermometer',
    drug: 'Thermometer',
    description: 'Patient thermometer',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
  },
  {
    id: 'backup-light',
    drug: 'Backup Lighting',
    description: 'Battery light for power failure',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
  },
  {
    id: 'patient-scale',
    drug: 'Patient Scale',
    description: 'To weigh patients',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
  },
  {
    id: 'cpr-board',
    drug: 'CPR Board',
    description: 'Or a CPR-rated operating chair',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
  },
  {
    id: 'face-masks',
    drug: 'Full Face Masks',
    description: 'For the bag-valve masks, adult and pediatric',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
    notes: 'Come attached to the Ambu SPUR II bag-valve masks (adult and toddler)',
  },
  {
    id: 'capno-cannulas',
    drug: 'Capnography Sampling Cannulas',
    description: 'EtCO₂ nasal sampling line for the Edan X10 — one per case',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
    notes: 'Everyday sedation supply — stock tracked, expiry not',
  },
  {
    id: 'ekg-electrodes',
    drug: 'EKG Electrodes',
    description: 'For the Edan X10 monitor',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
    notes: 'Everyday sedation supply — stock tracked, expiry not',
  },
  {
    id: 'edan-x10',
    drug: 'Edan X10 Patient Monitor',
    description: 'EKG, SpO₂, NIBP and capnography (EtCO₂); made 2024-12-16',
    lot: 'SN 261590-M24C13490019',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
    notes: 'Service/inspection date: ask Sedation Resource (800-753-6376)',
  },
  {
    id: 'nitrous-flowmeter',
    drug: 'Porter MXR Nitrous/O₂ Flowmeter',
    description: 'N₂O / O₂ delivery with cylinders',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
  },
  {
    id: 'glucometer',
    drug: 'Accu-Chek Guide Meter',
    description: 'Uses the Accu-Chek Guide strips and Softclix lancets',
    lot: '',
    ndc: '',
    quantity: 1,
    expiresOn: '',
    category: 'equipment',
    noExpiry: true,
  },
];
