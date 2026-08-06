/**
 * Emergency protocol library — the ACLS-style reference content surfaced in
 * the Quick Reference screen. Data extracted verbatim from the legacy Apex
 * Dental single-file app; UI renders. Doses anchored to AHA 2025 ACLS where
 * the legacy already aligns with current guidelines.
 */

export type EmergencyCategory =
  | 'airway'
  | 'cardiac-ischemia'
  | 'cardiac-arrhythmia'
  | 'cardiac-arrest'
  | 'allergic'
  | 'neurological'
  | 'other';

/**
 * One row of a callout's draw table: a dose ("20 mg"), patient weight
 * ("150 lb (90 mg)"), or stocked presentation ("1 mg/ml vial") mapped to
 * the volume to draw for it.
 */
export interface DrawTableRow {
  readonly label: string;
  /** Canonical volume string — "N.N ml". */
  readonly ml: string;
}

/** Inline drug callout that sits next to a step. */
export interface EmergencyDrugCallout {
  readonly name: string;
  readonly dose: string;
  readonly route: 'IV' | 'IM' | 'SubQ' | 'SL' | 'IN' | 'PO' | 'inhaled';
  /**
   * Volume to draw — the hero line. "N.N ml", a range "N.N-N.N ml" with
   * endpoints positionally aligned to the dose range, or "N.N ml
   * (annotation)".
   */
  readonly volume?: string;
  /** Concentration as labelled — e.g. `"1 mg/ml (1:1000)"`. Optional. */
  readonly concentration?: string;
  /**
   * Dilution recipe rendered as a warning band ABOVE the draw line.
   * Always starts with "MIX FIRST:". The only free-text field allowed to
   * use "→" (for the dilution result).
   */
  readonly mixFirst?: string;
  /**
   * Structured dose / weight / presentation → volume rows, rendered as an
   * aligned table. Replaces the old prose "20 mg → 1.0ml; …" notes.
   */
  readonly drawTable?: ReadonlyArray<DrawTableRow>;
  /** True free text only ("give over 2 minutes"). Never carries volumes. */
  readonly notes?: string;
}

/** A single ordered step in a protocol. */
export interface ProtocolStep {
  readonly text: string;
  /** Optional drug to highlight next to this step. */
  readonly drug?: EmergencyDrugCallout;
  /**
   * `critical` — life-saving, rendered with a red banner.
   * `final` — escalation / call 911 / cricothyrotomy etc.
   * `normal` — routine step.
   */
  readonly severity?: 'critical' | 'final';
}

export interface EmergencyProtocol {
  readonly id: string;
  readonly category: EmergencyCategory;
  /** Display name — "Laryngospasm (Crowing/Stridor)". */
  readonly name: string;
  /** Short tagline — drives chips + category list rows. */
  readonly summary: string;
  /** Signs/symptoms keywords — drives search + the signs pill in detail header. */
  readonly signs: ReadonlyArray<string>;
  readonly steps: ReadonlyArray<ProtocolStep>;
  /** Yellow banner at top of detail when populated. */
  readonly contraindications?: ReadonlyArray<string>;
  /** IDs of protocols this one escalates to ("if no response → V-Fib"). */
  readonly relatedProtocols?: ReadonlyArray<string>;
  /** True if it appears in the home-screen shortcut row. */
  readonly critical?: boolean;
}

/**
 * Pre-canned list of protocols that show in the Quick Reference shortcut
 * row — the ones most likely to be opened in a crisis. Keep this list short
 * (~6) so the row stays one-line on iPhone portrait.
 */
export const CRITICAL_PROTOCOL_IDS: ReadonlyArray<string> = [
  'laryngospasm',
  'hypotension',
  'bradycardia',
  'anaphylaxis',
  'vfib_vtach',
  'oversedation_benzo',
];

export const EMERGENCY_PROTOCOLS: ReadonlyArray<EmergencyProtocol> = [
  {
    id: 'laryngospasm',
    category: 'airway',
    name: 'Laryngospasm (Crowing/Stridor)',
    summary: 'Bucking respiratory pattern, crowing sounds · BVM + Succinylcholine 20-40mg',
    signs: ['crowing', 'stridor', 'bucking respiratory pattern'],
    steps: [
      { text: 'Call 911', severity: 'critical' },
      { text: 'Remove objects, suction airway (also with Laryngoscope if possible)' },
      {
        text: 'Semi-supine, positive pressure O₂ with BVM (100% at 6L/min)',
        severity: 'critical',
      },
      { text: 'If no relief: 1-2 ml Normal Saline transtracheal' },
      {
        text: 'Last resort: Succinylcholine IV (1 mg/kg IM), then assist ventilation with BVM',
        drug: {
          name: 'Succinylcholine',
          dose: '20-40 mg',
          route: 'IV',
          volume: '1.0-2.0 ml',
          concentration: '20 mg/ml',
          drawTable: [
            { label: '20 mg', ml: '1.0 ml' },
            { label: '40 mg', ml: '2.0 ml' },
          ],
          notes: 'IM alternative 1 mg/kg (≈0.45 mg/lb); keep refrigerated',
        },
        severity: 'critical',
      },
      { text: 'Maintain Airway / Continue to assist ventilation' },
      { text: 'Prepare to intubate / Intubate if necessary (advanced airway)' },
      {
        text: 'If unable to intubate or ventilate, prepare to perform emergency cricothyrotomy',
        severity: 'final',
      },
      { text: 'Prepare to manage bradycardia (due to hypoxia)' },
    ],
    critical: true,
  },
  {
    id: 'bronchospasm',
    category: 'airway',
    name: 'Bronchospasm / Asthma (Wheezing)',
    summary: 'Wheezing, cough, dyspnea · Albuterol 2 puffs',
    signs: ['wheezing', 'cough', 'dyspnea'],
    steps: [
      { text: 'Upright position' },
      {
        text: 'Albuterol 2 puffs STAT, repeat q10-20 min',
        drug: { name: 'Albuterol', dose: '2 puffs', route: 'inhaled', notes: 'repeat q10-20 min' },
      },
      { text: 'O₂ to >94%' },
      {
        text: 'If severe: Epinephrine Sub-Q, repeat q20 min up to 1 mg',
        drug: {
          name: 'Epinephrine',
          dose: '0.3-0.5 mg',
          route: 'SubQ',
          volume: '0.3-0.5 ml',
          concentration: '1 mg/ml (1:1000)',
          drawTable: [
            { label: '0.3 mg', ml: '0.3 ml' },
            { label: '0.5 mg', ml: '0.5 ml' },
          ],
          notes: 'repeat q20 min up to 1 mg total',
        },
      },
      { text: '911 if unresolved', severity: 'critical' },
      { text: 'Reverse sedative PRN' },
      {
        text: 'If aspiration suspected: Diphenhydramine 50 mg IV + Dexamethasone 20 mg IV',
        drug: {
          name: 'Diphenhydramine',
          dose: '50 mg',
          route: 'IV',
          volume: '1.0 ml',
          concentration: '50 mg/ml',
        },
      },
      {
        text: 'Dexamethasone IV (steroid coverage)',
        drug: {
          name: 'Dexamethasone',
          dose: '20 mg',
          route: 'IV',
          concentration: '4 mg/ml (in-office stock) or 10 mg/ml',
          drawTable: [
            { label: '4 mg/ml vial (in-office stock)', ml: '5.0 ml' },
            { label: '10 mg/ml vial', ml: '2.0 ml' },
          ],
        },
      },
      {
        text: 'If unable to ventilate: Use BVM with 100% O₂',
        severity: 'critical',
      },
      {
        text: 'If unable to ventilate, prepare for intubation with Succinylcholine 20 mg IV and Call 911',
        drug: {
          name: 'Succinylcholine',
          dose: '20 mg',
          route: 'IV',
          volume: '1.0 ml',
          concentration: '20 mg/ml',
          notes: 'keep refrigerated',
        },
        severity: 'final',
      },
    ],
  },
  {
    id: 'hyperventilation',
    category: 'airway',
    name: 'Hyperventilation',
    summary: 'Rapid breathing, lightheaded, tingling hands · Reassure + paper bag',
    signs: ['rapid breathing', 'lightheaded', 'tingling hands'],
    steps: [
      { text: 'Terminate procedure' },
      { text: 'Remove objects from oral cavity' },
      { text: 'Attempt to calm the patient, DO NOT GIVE O₂' },
      {
        text: 'Have patient breathe into their cupped hands over the mouth and nose to reduce CO₂ elimination, if unresolved after 10 minutes',
      },
    ],
  },
  {
    id: 'hypoventilation',
    category: 'airway',
    name: 'Hypoventilation (Shallow/Slow Breathing)',
    summary: 'SpO₂ dropping, slow/shallow breaths · BVM + Flumazenil or Naloxone',
    signs: ['SpO₂ dropping', 'slow breaths', 'shallow breaths'],
    steps: [
      { text: "Call patient's name" },
      {
        text: "Head tilt/chin lift/jaw thrust, analyze patient's breathing (ensure monitors are properly placed)",
      },
      { text: 'Suction (use OPA/NPA if needed)' },
      {
        text: 'If not breathing adequately: Use BVM to assist',
        severity: 'critical',
      },
      { text: 'Reverse sedative if needed: Flumazenil for Versed; Naloxone for Fentanyl' },
    ],
    relatedProtocols: ['oversedation_benzo', 'oversedation_opioid'],
  },
  {
    id: 'emesis_aspiration',
    category: 'airway',
    name: 'Emesis / Aspiration',
    summary: 'Vomiting, gagging, aspiration · Trendelenburg + suction + Zofran 4mg IV',
    signs: ['vomiting', 'gagging', 'aspiration'],
    steps: [
      {
        text: 'For Emesis/Vomiting: Give Ondansetron 4mg IV over 2-5 minutes',
        drug: {
          name: 'Ondansetron',
          dose: '4 mg',
          route: 'IV',
          volume: '2.0 ml',
          concentration: '2 mg/ml',
          notes: 'give over 2-5 minutes',
        },
      },
      { text: 'For Aspiration: Head down / Turn to side' },
      { text: 'Suction oral cavity IMMEDIATELY' },
      { text: 'BVM with 100% O₂ if needed', severity: 'critical' },
      {
        text: 'If severe aspiration: Diphenhydramine 50mg IV',
        drug: {
          name: 'Diphenhydramine',
          dose: '50 mg',
          route: 'IV',
          volume: '1.0 ml',
          concentration: '50 mg/ml',
        },
      },
      {
        text: 'Dexamethasone IV (steroid coverage)',
        drug: {
          name: 'Dexamethasone',
          dose: '20 mg',
          route: 'IV',
          concentration: '4 mg/ml (in-office stock) or 10 mg/ml',
          drawTable: [
            { label: '4 mg/ml vial (in-office stock)', ml: '5.0 ml' },
            { label: '10 mg/ml vial', ml: '2.0 ml' },
          ],
        },
      },
      {
        text: 'Succinylcholine IV (if airway compromise)',
        drug: {
          name: 'Succinylcholine',
          dose: '20 mg',
          route: 'IV',
          volume: '1.0 ml',
          concentration: '20 mg/ml',
          notes: 'keep refrigerated',
        },
      },
      { text: 'Call 911', severity: 'critical' },
      { text: 'Intubate if necessary' },
      { text: 'Order Chest X-ray', severity: 'final' },
    ],
  },
  {
    id: 'choking',
    category: 'airway',
    name: 'Choking / Airway Obstruction',
    summary: 'Cannot speak/cough, cyanosis, silent chest · Heimlich maneuver',
    signs: ['cannot speak', 'cannot cough', 'cyanosis', 'silent chest'],
    steps: [
      { text: 'Conscious Patient: Heimlich maneuver / Back blows' },
      { text: 'If fails: direct visualization, Magill forceps removal' },
      { text: 'Unconscious Patient: Lay flat, call 911', severity: 'critical' },
      { text: 'Direct laryngoscope, suction, Magill forceps' },
      { text: 'BVM if needed', severity: 'critical' },
      { text: 'Cricothyrotomy if total obstruction', severity: 'final' },
      { text: 'If foreign body not recovered, order X-ray' },
    ],
  },
  {
    id: 'npa',
    category: 'airway',
    name: 'NPA (Nasopharyngeal Airway) - Use WITH BVM',
    summary: 'BVM difficult, tongue obstruction · Size 6-7 adults',
    signs: ['BVM difficult', 'tongue obstruction'],
    steps: [
      {
        text: 'Sizing: Small (6.0-6.5mm) small adults; Medium (7.0-7.5mm) average adults; Large (8.0-8.5mm) large adults. Diameter = pinky finger width.',
      },
      { text: 'Select appropriate size (nostril to earlobe measurement)' },
      { text: 'Lubricate generously with water-soluble gel' },
      { text: 'Check nostril patency (choose more open nostril)' },
      { text: 'Insert with bevel toward septum (middle of nose)' },
      { text: 'Advance gently along floor of nose (aim toward ear, NOT upward)' },
      { text: 'If resistance: STOP, try smaller size or other nostril' },
      { text: 'Advance until flange rests on nostril' },
      { text: 'Resume BVM ventilation with NPA in place', severity: 'critical' },
    ],
    contraindications: [
      'Severe facial trauma',
      'Suspected basilar skull fracture',
      'Known bleeding disorder or on anticoagulants',
    ],
  },
  {
    id: 'lma',
    category: 'airway',
    name: 'LMA (Laryngeal Mask Airway) - If BVM + NPA Fails',
    summary: 'BVM + NPA failing · Size 3-4 adults',
    signs: ['BVM failing', 'NPA failing'],
    steps: [
      {
        text: 'Sizing: Size 3 (30-50kg / 4-5ft); Size 4 (50-70kg / 5-6ft); Size 5 (70-100kg / >6ft). When in doubt, choose larger.',
      },
      { text: 'Select appropriate size based on height/weight' },
      { text: 'Completely deflate cuff (press flat against hard surface)' },
      { text: 'Lubricate back surface (cuff side) generously' },
      { text: 'Remove dentures if present' },
      { text: 'Head in sniffing position (extended neck, flexed head)' },
      { text: 'Hold LMA like a pen, cuff tip against hard palate' },
      { text: 'Press firmly along roof of mouth and advance' },
      { text: 'Use index finger to guide along hard palate' },
      { text: 'Advance until resistance felt (cuff in hypopharynx)' },
      {
        text: 'Inflate cuff without holding device: Size 3: 20 ml air; Size 4: 30 ml air; Size 5: 40 ml air',
      },
      { text: 'LMA should lift slightly (~1-2cm) when properly seated' },
      { text: 'Attach BVM to LMA connector', severity: 'critical' },
      {
        text: 'Ventilate and confirm: chest rise bilateral, breath sounds equal, no air leak, capnography square waveform',
      },
      { text: 'If unsuccessful: Try KING LT or prepare for cricothyrotomy', severity: 'final' },
    ],
    relatedProtocols: ['king_lt'],
  },
  {
    id: 'king_lt',
    category: 'airway',
    name: 'KING LT AIRWAY - If LMA Fails or Alternative',
    summary: 'LMA failed · Size 3 most adults',
    signs: ['LMA failed'],
    steps: [
      {
        text: 'Select size: Size 3 (most adults 4-5ft), Size 4 (adults 5-6ft), Size 5 (adults >6ft)',
      },
      { text: 'Lubricate device' },
      { text: 'Head in neutral/sniffing position' },
      { text: 'Insert with curved tip along hard palate' },
      { text: 'Advance until base of connector aligns with teeth/gums' },
      { text: 'Inflate cuff with syringe (follow device markings)' },
      { text: 'Confirm placement - chest rise, breath sounds bilateral' },
      { text: 'Connect to BVM and ventilate', severity: 'critical' },
    ],
  },
  {
    id: 'angina',
    category: 'cardiac-ischemia',
    name: 'Angina / Chest Pain',
    summary: 'Crushing chest pain, radiates to arm/jaw · Nitroglycerin 0.4mg SL',
    signs: ['crushing chest pain', 'arm radiation', 'jaw radiation'],
    steps: [
      { text: 'Stop procedure' },
      { text: 'Supine' },
      { text: 'O₂ 4L/min via nasal cannula (titrate to >94%)' },
      {
        text: 'Nitroglycerin SL (repeat q5min, max 3 doses)',
        drug: {
          name: 'Nitroglycerin',
          dose: '0.4 mg',
          route: 'SL',
          notes: 'repeat q5min, max 3 doses',
        },
      },
      { text: 'Place EKG monitor / Check all vitals' },
      { text: 'After 2nd Nitro dose: Call 911', severity: 'critical' },
      {
        text: 'Aspirin CHEWED',
        drug: { name: 'Aspirin', dose: '325 mg', route: 'PO', notes: 'chewed, not swallowed' },
      },
      {
        text: 'If pain continues: Fentanyl or N₂O',
        drug: {
          name: 'Fentanyl',
          dose: '25 mcg',
          route: 'IV',
          volume: '0.5 ml',
          concentration: '50 mcg/ml',
        },
      },
      { text: 'Activate ACLS protocol if indicated', severity: 'final' },
    ],
    contraindications: ['Viagra/Cialis/Levitra in last 24hr', 'BP <90 mmHg systolic', 'HR <50 BPM'],
    relatedProtocols: ['mi'],
  },
  {
    id: 'mi',
    category: 'cardiac-ischemia',
    name: 'Myocardial Infarction (HEART ATTACK)',
    summary: 'Severe chest pain, diaphoresis, arm/jaw radiation · Call 911 + Aspirin 325mg',
    signs: ['severe chest pain', 'diaphoresis', 'arm radiation', 'jaw radiation'],
    steps: [
      { text: 'CALL 911 IMMEDIATELY', severity: 'critical' },
      { text: 'Supine position' },
      { text: 'O₂ 4L/min via nasal cannula (titrate to >94%)' },
      {
        text: 'Aspirin CHEWED (not swallowed!)',
        drug: { name: 'Aspirin', dose: '325 mg', route: 'PO', notes: 'chewed, not swallowed' },
      },
      {
        text: 'Nitroglycerin SL (q5min, max 3 doses if no contraindication)',
        drug: {
          name: 'Nitroglycerin',
          dose: '0.4 mg',
          route: 'SL',
          notes: 'q5min, max 3 doses',
        },
      },
      {
        text: 'Fentanyl IV for pain (q10-20 min)',
        drug: {
          name: 'Fentanyl',
          dose: '25 mcg',
          route: 'IV',
          volume: '0.5 ml',
          concentration: '50 mcg/ml',
          notes: 'repeat q10-20 min',
        },
      },
      { text: 'Monitor vitals / Place EKG' },
      { text: 'Prepare for cardiac arrest - have AED ready', severity: 'final' },
    ],
    relatedProtocols: ['vfib_vtach'],
  },
  {
    id: 'hypertension',
    category: 'cardiac-ischemia',
    name: 'Hypertension / HBP (>180/120)',
    summary: 'BP >180/120 · Midazolam 1-2mg if anxiety',
    signs: ['BP >180/120', 'anxiety'],
    steps: [
      { text: 'Stop procedure' },
      {
        text: 'Give Midazolam (if secondary to anxiety)',
        drug: {
          name: 'Midazolam',
          dose: '1-2 mg',
          route: 'IV',
          volume: '0.2-0.4 ml',
          concentration: '5 mg/ml',
          drawTable: [
            { label: '1 mg', ml: '0.2 ml' },
            { label: '2 mg', ml: '0.4 ml' },
          ],
        },
      },
      { text: 'Patient in Supine Position' },
      { text: 'Give 100% O₂ and reassess patient' },
      { text: 'Check all monitor parameters' },
      {
        text: 'Give Labetalol IV over 2 minutes (maximum effects seen in 5 minutes)',
        drug: {
          name: 'Labetalol',
          dose: '20 mg',
          route: 'IV',
          volume: '4.0 ml',
          concentration: '5 mg/ml',
          notes: 'give slowly over 2 minutes',
        },
      },
      {
        text: 'Second-line: Hydralazine IV (if labetalol unavailable or contraindicated, e.g. asthma/bradycardia)',
        drug: {
          name: 'Hydralazine',
          dose: '5-10 mg',
          route: 'IV',
          volume: '0.25-0.5 ml',
          concentration: '20 mg/ml',
          drawTable: [
            { label: '5 mg', ml: '0.25 ml' },
            { label: '10 mg', ml: '0.5 ml' },
          ],
          notes: 'may repeat in ~20 min',
        },
      },
    ],
    relatedProtocols: ['hypertensive_crisis'],
  },
  {
    id: 'hypertensive_crisis',
    category: 'cardiac-ischemia',
    name: 'Hypertensive Crisis (>180/110)',
    summary: 'BP >180/110, severe headache, vision changes · Labetalol IV',
    signs: ['BP >180/110', 'severe headache', 'vision changes'],
    steps: [
      { text: 'Call 911', severity: 'critical' },
      { text: 'Supine position' },
      { text: 'O₂ to >94%' },
      {
        text: 'Labetalol IV over 2 minutes, repeat 20-40mg q10min, up to 300mg total',
        drug: {
          name: 'Labetalol',
          dose: '20 mg',
          route: 'IV',
          volume: '4.0 ml',
          concentration: '5 mg/ml',
          notes: 'over 2 minutes; repeat 20-40 mg q10 min up to 300 mg total',
        },
      },
      {
        text: 'Second-line: Hydralazine IV (if labetalol unavailable or contraindicated, e.g. asthma/bradycardia)',
        drug: {
          name: 'Hydralazine',
          dose: '5-10 mg',
          route: 'IV',
          volume: '0.25-0.5 ml',
          concentration: '20 mg/ml',
          drawTable: [
            { label: '5 mg', ml: '0.25 ml' },
            { label: '10 mg', ml: '0.5 ml' },
          ],
          notes: 'may repeat in ~20 min',
        },
      },
      { text: 'Monitor vitals continuously', severity: 'final' },
    ],
  },
  {
    id: 'hypotension',
    category: 'cardiac-ischemia',
    name: 'Hypotension (Low BP)',
    summary: 'Dizzy, SBP <85, pale · Atropine or Ephedrine IV',
    signs: ['dizzy', 'SBP <85', 'pale'],
    steps: [
      { text: 'Trendelenburg / Supine' },
      { text: 'IV fluids wide open' },
      { text: 'O₂ to >94%' },
      { text: 'Check heart rate' },
      {
        text: 'If Bradycardic (HR <60): Atropine IV (q3-5min, max 3mg)',
        drug: {
          name: 'Atropine',
          dose: '0.5 mg',
          route: 'IV',
          concentration: '1 mg/ml vial or 1 mg/10 ml prefilled',
          drawTable: [
            { label: '1 mg/ml vial', ml: '0.5 ml' },
            { label: '1 mg/10 ml prefilled', ml: '5.0 ml' },
          ],
          notes: 'q3-5 min, max 3 mg',
        },
      },
      {
        text: 'If Normal Heart Rate (60-100): Ephedrine IV',
        drug: {
          name: 'Ephedrine',
          dose: '2.5-5 mg',
          route: 'IV',
          volume: '0.5-1.0 ml',
          concentration: '5 mg/ml (after dilution)',
          mixFirst: 'MIX FIRST: 1 ml of 50 mg/ml + 9 ml saline → 5 mg/ml',
          drawTable: [
            { label: '2.5 mg', ml: '0.5 ml' },
            { label: '5 mg', ml: '1.0 ml' },
          ],
          notes: 'effects in 10 min; duration 4 hr',
        },
      },
      {
        text: 'If Tachycardic (HR >100): Consider vagal maneuvers first, then Phenylephrine IV',
        drug: {
          name: 'Phenylephrine',
          dose: '0.1 mg (100 mcg)',
          route: 'IV',
          volume: '1.0 ml',
          concentration: '100 mcg/ml (after dilution)',
          mixFirst:
            'MIX FIRST: dilute 1 ml of 10 mg/ml phenylephrine into 100 ml NS → 100 mcg/ml; never draw from the stock vial',
          drawTable: [{ label: '0.1 mg', ml: '1.0 ml' }],
        },
      },
      { text: 'Monitor vitals' },
      { text: 'Call 911 if unresponsive', severity: 'critical' },
    ],
    critical: true,
  },
  {
    id: 'bradycardia',
    category: 'cardiac-arrhythmia',
    name: 'Symptomatic Bradycardia (<50 BPM)',
    summary: 'HR <50 BPM, low BP · Atropine 0.5mg IV',
    signs: ['HR <50 BPM', 'low BP'],
    steps: [
      { text: 'Evaluate ABCs / ECG monitor' },
      { text: 'Secure Airway if needed' },
      { text: 'Open IV all the way to allow fluids to run in' },
      { text: 'Give Supplemental O₂ titrate to >94%' },
      { text: 'Determine Rhythm (Sinus Brady? Heart Blocks?)' },
      {
        text: 'If Symptomatic Bradycardia (with hypotension), Treat the Heart Rate: Atropine IV, repeat q3-5 min, max 3mg total',
        drug: {
          name: 'Atropine',
          dose: '1 mg',
          route: 'IV',
          concentration: '1 mg/ml vial or 1 mg/10 ml prefilled',
          drawTable: [
            { label: '1 mg/ml vial', ml: '1.0 ml' },
            { label: '1 mg/10 ml prefilled (full syringe)', ml: '10.0 ml' },
          ],
          notes: 'repeat q3-5 min, max 3 mg total',
        },
      },
      { text: 'Call 911', severity: 'critical' },
      {
        text: 'If unresponsive to Atropine — Push-dose Epinephrine (bridge to EMS)',
        drug: {
          name: 'Push-dose Epinephrine',
          dose: '5-10 mcg',
          route: 'IV',
          volume: '0.5-1.0 ml',
          concentration: '10 mcg/ml (after mixing — never draw stock 1 mg/ml)',
          mixFirst: 'MIX FIRST: 1 mg epi (1 ml of 1 mg/ml, 1:1000) into 100 ml NS → 10 mcg/ml',
          drawTable: [
            { label: '5 mcg', ml: '0.5 ml' },
            { label: '10 mcg', ml: '1.0 ml' },
          ],
          notes: 'give q2-3 min, titrate to response',
        },
        severity: 'final',
      },
    ],
    critical: true,
  },
  {
    id: 'sinus_tach',
    category: 'cardiac-arrhythmia',
    name: 'Sinus Tachycardia (>150 adult, >180 pediatric)',
    summary: 'HR >150, chest pain, hypotension · O₂ + treat underlying cause',
    signs: ['HR >150', 'chest pain', 'hypotension'],
    steps: [
      { text: 'Give supplemental O₂' },
      { text: 'Consider cause (hypovolemia, epinephrine reaction)' },
      { text: 'Monitor and reassure patient' },
      { text: 'Give fluids' },
    ],
  },
  {
    id: 'junctional_tach',
    category: 'cardiac-arrhythmia',
    name: 'Junctional Tachycardia',
    summary: 'Regular narrow tachycardia, HR 100-180 · Amiodarone 150mg IV over 10min',
    signs: ['regular narrow tachycardia', 'HR 100-180'],
    steps: [
      { text: 'Give Supplemental O₂' },
      {
        text: 'Amiodarone IV over 10 minutes',
        drug: {
          name: 'Amiodarone',
          dose: '150 mg',
          route: 'IV',
          volume: '3.0 ml',
          concentration: '50 mg/ml',
          notes: 'give over 10 minutes',
        },
      },
    ],
  },
  {
    id: 'svt',
    category: 'cardiac-arrhythmia',
    name: 'SVT / PSVT (>150 BPM)',
    summary: 'Sudden HR >150, palpitations · Vagal maneuver → Adenosine 6mg IV',
    signs: ['sudden HR >150', 'palpitations'],
    steps: [
      {
        text: 'Attempt Vagal Maneuver (Carotid Massage, bear down, cold water to face)',
      },
      { text: 'Supplemental O₂' },
      {
        text: 'Adenosine Rapid IV Push, repeat every 30 seconds, with 12mg as 2nd and 3rd dose',
        drug: {
          name: 'Adenosine',
          dose: '6 mg',
          route: 'IV',
          volume: '2.0 ml',
          concentration: '3 mg/ml',
          drawTable: [
            { label: '6 mg (1st dose)', ml: '2.0 ml' },
            { label: '12 mg (2nd/3rd dose)', ml: '4.0 ml' },
          ],
          notes: 'rapid IV push (1-2 seconds)',
        },
        severity: 'critical',
      },
      { text: 'Flush Adenosine with 10 ml of NS in IV line immediately' },
    ],
  },
  {
    id: 'afib',
    category: 'cardiac-arrhythmia',
    name: 'Atrial Fibrillation / Atrial Flutter',
    summary: 'Irregular HR, palpitations, hypotension · Amiodarone 150mg IV over 10min',
    signs: ['irregular HR', 'palpitations', 'hypotension'],
    steps: [
      { text: 'Give Supplemental O₂' },
      {
        text: 'Amiodarone IV over 10 minutes',
        drug: {
          name: 'Amiodarone',
          dose: '150 mg',
          route: 'IV',
          volume: '3.0 ml',
          concentration: '50 mg/ml',
          notes: 'give over 10 minutes',
        },
      },
    ],
  },
  {
    id: 'stable_vtach',
    category: 'cardiac-arrhythmia',
    name: 'Stable Ventricular Tachycardias (with pulse)',
    summary: 'Wide complex tachycardia, pulse present · Amiodarone 150mg IV over 10min',
    signs: ['wide complex tachycardia', 'pulse present'],
    steps: [
      { text: 'Give Supplemental O₂' },
      {
        text: 'Amiodarone IV over 10 minutes',
        drug: {
          name: 'Amiodarone',
          dose: '150 mg',
          route: 'IV',
          volume: '3.0 ml',
          concentration: '50 mg/ml',
          notes: 'give over 10 minutes',
        },
      },
      {
        text: 'Cardiac Lidocaine IV push, repeat in 5-10 minutes',
        drug: {
          name: 'Cardiac Lidocaine',
          dose: '0.6 mg/lb',
          route: 'IV',
          concentration: '20 mg/ml',
          drawTable: [
            { label: '150 lb (90 mg)', ml: '4.5 ml' },
            { label: '200 lb (120 mg)', ml: '6.0 ml' },
            { label: '250 lb (150 mg)', ml: '7.5 ml' },
          ],
          notes: 'over 165 lb exceeds one 100 mg/5 ml vial — only 1 stocked',
        },
      },
    ],
  },
  {
    id: 'wide_complex',
    category: 'cardiac-arrhythmia',
    name: 'Wide Complex Tachycardias',
    summary: 'Wide QRS, HR >100, unknown origin · Amiodarone 150mg IV over 10min',
    signs: ['wide QRS', 'HR >100', 'unknown origin'],
    steps: [
      { text: 'Give Supplemental O₂' },
      {
        text: 'Amiodarone IV over 10 minutes',
        drug: {
          name: 'Amiodarone',
          dose: '150 mg',
          route: 'IV',
          volume: '3.0 ml',
          concentration: '50 mg/ml',
          notes: 'give over 10 minutes',
        },
      },
    ],
  },
  {
    id: 'vfib_vtach',
    category: 'cardiac-arrest',
    name: 'V-Fib / Pulseless V-Tach (CARDIAC ARREST)',
    summary: 'CPR + AED · Epinephrine 1mg IV',
    signs: ['no pulse', 'shockable rhythm', 'V-Fib', 'pulseless V-Tach'],
    steps: [
      { text: 'Call for Help and Call for AED', severity: 'critical' },
      {
        text: 'CPR + AED (30:2, 100-120/min). Lower chair, lay patient flat, place CPR Board, begin 2-person CPR',
        severity: 'critical',
      },
      { text: 'Turn on the AED and follow instructions' },
      {
        text: 'If shockable rhythm: Shock, then IMMEDIATE CPR for 2 min',
        severity: 'critical',
      },
      { text: 'Establish Airway and appropriate ventilation' },
      { text: 'Start IV' },
      {
        text: 'After 2nd shock: Epinephrine IV push, repeat q3-5min',
        drug: {
          name: 'Epinephrine',
          dose: '1 mg',
          route: 'IV',
          volume: '1.0 ml',
          concentration: '1 mg/ml (1:1000)',
          notes: 'draw entire 1 ml ampule; repeat q3-5 min',
        },
        severity: 'critical',
      },
      {
        text: 'After 3rd shock: Amiodarone IV PUSH, then 150mg in 3-5min',
        drug: {
          name: 'Amiodarone',
          dose: '300 mg',
          route: 'IV',
          volume: '6.0 ml',
          concentration: '50 mg/ml',
          notes: 'IV PUSH; 300 mg = two 150 mg/3 ml vials; follow with 150 mg (3.0 ml) in 3-5 min',
        },
        severity: 'critical',
      },
      {
        text: 'Cardiac Lidocaine IV push, repeat in 3-5 minutes',
        drug: {
          name: 'Cardiac Lidocaine',
          dose: '0.6 mg/lb',
          route: 'IV',
          concentration: '20 mg/ml',
          drawTable: [
            { label: '150 lb (90 mg)', ml: '4.5 ml' },
            { label: '200 lb (120 mg)', ml: '6.0 ml' },
            { label: '250 lb (150 mg)', ml: '7.5 ml' },
          ],
          notes: 'over 165 lb exceeds one 100 mg/5 ml vial — only 1 stocked',
        },
      },
      {
        text: 'Continue with CPR and AED instructions until EMS arrives',
        severity: 'final',
      },
      {
        text: "Treatable causes (H's and T's): Hydrogen ion (acidosis), Hyperkalemia, Hypothermia, Hypovolemia, Tamponade, Tension pneumothorax, Thrombosis (coronary), Thrombosis (pulmonary)",
      },
    ],
    critical: true,
    relatedProtocols: ['pea_asystole'],
  },
  {
    id: 'pea_asystole',
    category: 'cardiac-arrest',
    name: 'PEA and Asystole (Non-Shockable Rhythms)',
    summary: 'CPR → Epinephrine 1mg IV q3-5min',
    signs: ['no pulse', 'non-shockable rhythm', 'PEA', 'asystole'],
    steps: [
      { text: 'Confirm Rhythm / ensure monitors properly connected' },
      { text: 'Call for Help and Call for AED', severity: 'critical' },
      { text: 'Begin Chest Compressions (CPR)', severity: 'critical' },
      {
        text: 'Lower chair, lay patient flat, place CPR Board, Begin two person CPR (100-120 bpm, One breath every 5-6 seconds)',
        severity: 'critical',
      },
      { text: 'Turn on the AED and follow instructions' },
      { text: 'Establish Airway and appropriate ventilation' },
      { text: 'Start IV and administer Bolus 500 ml NS' },
      { text: "Review possible causes (H's and T's)" },
      {
        text: 'Epinephrine IV push, repeat q3-5 min',
        drug: {
          name: 'Epinephrine',
          dose: '1 mg',
          route: 'IV',
          volume: '1.0 ml',
          concentration: '1 mg/ml (1:1000)',
          notes: 'draw entire 1 ml ampule; give as soon as IV access established; repeat q3-5 min',
        },
        severity: 'critical',
      },
      {
        text: 'Atropine is NOT indicated for PEA/Asystole (removed from ACLS since 2010; Epinephrine only per AHA 2025)',
        severity: 'final',
      },
    ],
    relatedProtocols: ['vfib_vtach'],
  },
  {
    id: 'anaphylaxis',
    category: 'allergic',
    name: 'Anaphylaxis (Severe Allergic Reaction)',
    summary: 'Hives, bronchospasm, hypotension, angioedema · Epinephrine 0.3mg IM THIGH',
    signs: ['hives', 'bronchospasm', 'hypotension', 'angioedema'],
    steps: [
      { text: 'CALL 911 IMMEDIATELY', severity: 'critical' },
      {
        text: 'Epinephrine IM (preferred) or IV — inject into THIGH',
        drug: {
          name: 'Epinephrine',
          dose: '0.3 mg',
          route: 'IM',
          volume: '0.3 ml',
          concentration: '1 mg/ml (1:1000)',
          notes: 'EpiPen auto-injector preferred; inject into thigh',
        },
        severity: 'critical',
      },
      { text: 'Supine position (or sitting if respiratory distress)' },
      { text: 'O₂ to >94%' },
      {
        text: 'Albuterol (if wheezing)',
        drug: { name: 'Albuterol', dose: '2-4 puffs', route: 'inhaled' },
      },
      { text: 'IV fluids wide open' },
      {
        text: 'Diphenhydramine IM or IV (if hives)',
        drug: {
          name: 'Diphenhydramine',
          dose: '25-50 mg',
          route: 'IV',
          volume: '0.5-1.0 ml',
          concentration: '50 mg/ml',
          drawTable: [
            { label: '25 mg', ml: '0.5 ml' },
            { label: '50 mg', ml: '1.0 ml' },
          ],
        },
      },
      {
        text: 'Solu-Medrol (methylprednisolone) IV (FIRST CHOICE - prevents rebound) OR Dexamethasone IV',
        drug: {
          name: 'Methylprednisolone (Solu-Medrol)',
          dose: '125 mg',
          route: 'IV',
          volume: '2.0 ml',
          concentration: '62.5 mg/ml',
          notes: 'Mix-O-Vial: press top, mix, swirl, draw; give full vial',
        },
      },
      {
        text: 'Alternative: Dexamethasone IV',
        drug: {
          name: 'Dexamethasone',
          dose: '8-12 mg',
          route: 'IV',
          concentration: '4 mg/ml (in-office stock) or 10 mg/ml',
          drawTable: [
            { label: '4 mg/ml: 8 mg', ml: '2.0 ml' },
            { label: '4 mg/ml: 12 mg', ml: '3.0 ml' },
            { label: '10 mg/ml: 8 mg', ml: '0.8 ml' },
            { label: '10 mg/ml: 12 mg', ml: '1.2 ml' },
          ],
        },
      },
      { text: 'Monitor vitals continuously', severity: 'final' },
    ],
    critical: true,
  },
  {
    id: 'oversedation_benzo',
    category: 'allergic',
    name: 'Oversedation (Benzodiazepine)',
    summary: 'Excessive sedation, slow respirations, SpO₂ dropping · BVM + Flumazenil 0.2mg IV',
    signs: ['excessive sedation', 'slow respirations', 'SpO₂ dropping'],
    steps: [
      { text: 'If hypoventilation: Use BVM to assist breathing', severity: 'critical' },
      {
        text: 'Flumazenil IV, repeat q3 min up to 1 mg',
        drug: {
          name: 'Flumazenil',
          dose: '0.2 mg',
          route: 'IV',
          volume: '2.0 ml',
          concentration: '0.1 mg/ml (0.5 mg/5 ml vial)',
          notes: 'give slowly over 15 sec; max 1.0 mg (10 ml) in 20 minutes',
        },
      },
    ],
    critical: true,
  },
  {
    id: 'oversedation_opioid',
    category: 'allergic',
    name: 'Oversedation (Opioid)',
    summary: 'Excessive sedation, pinpoint pupils, hypoventilation · BVM + Naloxone 0.4mg IV',
    signs: ['excessive sedation', 'pinpoint pupils', 'hypoventilation'],
    steps: [
      { text: 'If hypoventilation: Use BVM to assist breathing', severity: 'critical' },
      {
        text: 'Naloxone IV, q3min up to 10mg (or IM if no IV)',
        drug: {
          name: 'Naloxone',
          dose: '0.4-2 mg',
          route: 'IV',
          volume: '1.0 ml (0.4 mg)',
          concentration: '0.4 mg/ml',
          drawTable: [
            { label: '0.4 mg', ml: '1.0 ml' },
            { label: '2 mg (five 1 ml vials — 2 stocked)', ml: '5.0 ml' },
          ],
          notes: 'give slowly over 2-3 minutes; titrate q2-3 min',
        },
      },
    ],
  },
  {
    id: 'seizure',
    category: 'neurological',
    name: 'Seizure',
    summary: 'Tonic-clonic movements, LOC · Protect airway + Midazolam 5mg IM if >5min',
    signs: ['tonic-clonic movements', 'loss of consciousness'],
    steps: [
      { text: 'Remove objects / Protect patient from injury' },
      { text: 'Supine position' },
      {
        text: 'If seizure >5min: Midazolam IM/IV',
        drug: {
          name: 'Midazolam',
          dose: '5 mg',
          route: 'IM',
          volume: '1.0 ml',
          concentration: '5 mg/ml',
        },
      },
      {
        text: 'If continues: Diazepam IV/IM',
        drug: {
          name: 'Diazepam',
          dose: '5-10 mg',
          route: 'IV',
          volume: '1.0-2.0 ml',
          concentration: '5 mg/ml',
          drawTable: [
            { label: '5 mg', ml: '1.0 ml' },
            { label: '10 mg', ml: '2.0 ml' },
          ],
        },
      },
      { text: 'Call 911', severity: 'critical' },
      {
        text: 'Post-ictal: Head to side, suction, O₂, monitor, comfort patient. Observe 1 hour before discharge. Do NOT allow patient to drive home. Refer to PCP for follow-up.',
        severity: 'final',
      },
    ],
  },
  {
    id: 'syncope',
    category: 'neurological',
    name: 'Syncope (Fainting)',
    summary: 'Sudden unconsciousness, dizziness, pallor · Ammonia Capsule',
    signs: ['sudden unconsciousness', 'dizziness', 'pallor'],
    steps: [
      { text: 'Supine / Trendelenburg' },
      { text: 'Remove objects' },
      { text: 'O₂ to >94%' },
      { text: 'Ammonia capsule / sternal rub' },
      { text: 'Monitor vitals' },
      { text: 'Cold towel to forehead / reassure patient' },
      { text: 'If not conscious within 120 seconds: Call 911', severity: 'critical' },
      { text: 'Give patient 20 minutes to recover before discharge', severity: 'final' },
    ],
  },
  {
    id: 'stroke',
    category: 'neurological',
    name: 'Stroke',
    summary: 'FAST: Face droop, Arm weakness, Speech · Call 911 — Time = Brain',
    signs: ['face droop', 'arm weakness', 'speech difficulty', 'FAST'],
    steps: [
      { text: 'CALL 911 IMMEDIATELY', severity: 'critical' },
      { text: 'Supine or recovery position' },
      { text: 'O₂ as needed' },
      { text: 'Monitor vitals' },
      { text: 'Note time of symptom onset (critical for treatment)', severity: 'final' },
    ],
  },
  {
    id: 'hypoglycemia',
    category: 'other',
    name: 'Hypoglycemia (Diabetic - Sweaty, Confused, Shaky)',
    summary: 'Sweaty, dizzy, confused · D50W 25g IV if unconscious',
    signs: ['sweaty', 'dizzy', 'confused', 'shaky'],
    steps: [
      { text: 'Check blood glucose with Glucometer' },
      { text: 'Conscious: Oral glucose / orange juice' },
      {
        text: 'Unconscious + IV: D50W IV',
        drug: {
          name: 'D50W',
          dose: '25 g',
          route: 'IV',
          volume: '50 ml',
          concentration: '0.5 g/ml (50% Dextrose)',
          notes: 'use 50 ml prefilled syringe or draw entire vial into 60 cc syringe',
        },
      },
      {
        // Deliberate: no drug callout here. The practice decided (2026-08)
        // not to stock glucagon — an IV sedation office always has line
        // skills and D50W at hand, so the office path for the no-IV branch
        // is immediate access, not an IM injection the cart doesn't carry.
        text: 'Unconscious + No IV: establish IV access immediately for D50W — call 911 if unable. (Glucagon 1 mg IM is the no-IV alternative; deliberately not stocked — office protocol is immediate IV access.)',
        severity: 'critical',
      },
      {
        text: 'Recheck Blood Glucose after 15 minutes (target: 70-110mg/dl), repeat if needed',
      },
      { text: 'Once blood glucose normal, patient should eat a small snack', severity: 'final' },
    ],
  },
  {
    id: 'phlebitis',
    category: 'other',
    name: 'Phlebitis',
    summary: 'Edema, warmth, tenderness along vein · Remove IV + warm compress + elevate',
    signs: ['edema', 'warmth', 'tenderness along vein'],
    steps: [
      { text: 'Remove all rings immediately' },
      { text: 'Remove catheter' },
      { text: 'Elevate the extremity / limit use in affected limb' },
      { text: 'Warm moist towel to the area 20 min, 3-4 times per day' },
      { text: 'NSAID for pain' },
      { text: 'Few days resolution to full resolution in 3-4 weeks' },
      {
        text: 'Fever or malaise or general patient dissatisfaction are indication to consult / refer to a vascular surgeon',
        severity: 'final',
      },
    ],
  },
  {
    id: 'intraarterial',
    category: 'other',
    name: 'Intra-arterial Injection',
    summary: 'Pulsatile red blood, severe pain · Cardiac Lidocaine IV',
    signs: [
      'pulsatile cherry red blood',
      'severe pain radiating toward fingers',
      'pale/cool limb',
      'possible loss of radial pulse',
    ],
    steps: [
      { text: 'If NO medications have been given: Remove needle immediately' },
      { text: 'Apply pressure dressing' },
      { text: 'No further treatment needed — monitor patient' },
      { text: 'If medications HAVE been given: Leave needle/catheter in place' },
      {
        text: 'Give slow Cardiac Lidocaine IV through catheter to relieve arterial spasm',
        drug: {
          name: 'Cardiac Lidocaine',
          dose: '0.6 mg/lb',
          route: 'IV',
          concentration: '20 mg/ml',
          drawTable: [
            { label: '150 lb (90 mg)', ml: '4.5 ml' },
            { label: '200 lb (120 mg)', ml: '6.0 ml' },
            { label: '250 lb (150 mg)', ml: '7.5 ml' },
          ],
          notes:
            'give slowly through catheter to relieve arterial spasm; over 165 lb exceeds one 100 mg/5 ml vial — only 1 stocked',
        },
      },
      { text: 'Remove needle' },
      { text: 'Apply ice pack to area' },
      { text: 'Transport patient to ED immediately', severity: 'final' },
    ],
  },
];

export function findProtocol(id: string): EmergencyProtocol | undefined {
  return EMERGENCY_PROTOCOLS.find((p) => p.id === id);
}

export function protocolsByCategory(category: EmergencyCategory): ReadonlyArray<EmergencyProtocol> {
  return EMERGENCY_PROTOCOLS.filter((p) => p.category === category);
}
