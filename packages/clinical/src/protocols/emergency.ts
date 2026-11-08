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
  readonly route: 'IV' | 'IM' | 'IA' | 'SubQ' | 'SL' | 'IN' | 'PO' | 'inhaled';
  /**
   * Volume to draw — the hero line. "N.N ml", a range "N.N-N.N ml" with
   * endpoints positionally aligned to the dose range, or "N.N ml
   * (annotation)".
   */
  readonly volume?: string;
  /** Concentration as labelled — e.g. `"1 mg/ml"`. Optional. */
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
  /** Syringe the practice draws this into (owner's kit plan: 1, 3 or 10 ml). */
  readonly syringeMl?: 1 | 3 | 10;
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
  /**
   * Protocols this step sends the clinician to ("go to MI", "No pulse:
   * CPR + AED", "LMA or King"). Rendered as tappable links under the step
   * so the jump happens mid-protocol, not after scrolling to the bottom.
   */
  readonly goTo?: ReadonlyArray<string>;
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
 * Shown under every protocol so an inspector (and the team) can see how
 * current the written protocols are. Bump it when a review lands.
 */
export const PROTOCOLS_REVIEWED =
  'Reviewed Nov 2026 against AHA 2025 and current specialty guidelines';

/**
 * Protocols that show in the Quick Reference shortcut grid — the ones most
 * likely to be opened in a crisis. The landing page splits them into the
 * mid-procedure group (`DURING_SEDATION_PROTOCOL_IDS`) and the rest.
 */
export const CRITICAL_PROTOCOL_IDS: ReadonlyArray<string> = [
  'oversedation_benzo',
  'oversedation_opioid',
  'hypoventilation',
  'laryngospasm',
  'anaphylaxis',
  'vfib_vtach',
  'hypotension',
  'bradycardia',
];

/** The emergencies that happen with the patient in the chair, mid-sedation. */
export const DURING_SEDATION_PROTOCOL_IDS: ReadonlyArray<string> = [
  'oversedation_benzo',
  'oversedation_opioid',
  'hypoventilation',
  'laryngospasm',
];

export const EMERGENCY_PROTOCOLS: ReadonlyArray<EmergencyProtocol> = [
  {
    id: 'laryngospasm',
    category: 'airway',
    name: 'Laryngospasm (Crowing/Stridor)',
    summary:
      'Crowing, stridor, no air movement · Jaw thrust + CPAP, then Succinylcholine 20-40mg IV',
    signs: ['crowing', 'stridor', 'bucking respiratory pattern'],
    relatedProtocols: ['hypoventilation', 'npa', 'lma'],
    steps: [
      { text: 'Stop the procedure. Remove packs and gauze, suction the throat' },
      {
        text: "Jaw thrust plus firm pressure at the laryngospasm notch (Larson's: behind the earlobe, between jaw and mastoid)",
      },
      {
        text: 'Tight mask seal, 100% O₂ at 15 L/min with the BVM, steady gentle pressure (CPAP)',
        severity: 'critical',
      },
      {
        text: 'No relief and SpO₂ falling: Succinylcholine IV, then ventilate with the BVM until breathing on their own',
        drug: {
          name: 'Succinylcholine',
          dose: '20-40 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '1.0-2.0 ml',
          concentration: '20 mg/ml',
          drawTable: [
            { label: '20 mg', ml: '1.0 ml' },
            { label: '40 mg', ml: '2.0 ml' },
          ],
          notes:
            '0.25-0.5 mg/kg; keep refrigerated; have atropine ready for a slow heart rate; label the syringe',
        },
        severity: 'critical',
      },
      { text: 'Call 911', severity: 'critical' },
      {
        text: 'Cannot ventilate: LMA or King, then cricothyrotomy',
        severity: 'final',
        goTo: ['lma', 'king_lt'],
      },
    ],
    critical: true,
  },
  {
    id: 'bronchospasm',
    category: 'airway',
    name: 'Bronchospasm / Asthma (Wheezing)',
    summary: 'Wheezing, cough, dyspnea · Albuterol 4-8 puffs, Epinephrine IM if severe',
    signs: ['wheezing', 'cough', 'dyspnea'],
    relatedProtocols: ['anaphylaxis', 'lma', 'king_lt'],
    steps: [
      { text: 'Stop the procedure. Sit upright, remove packs' },
      {
        text: 'Albuterol inhaler (spacer if available), repeat every 20 min',
        drug: { name: 'Albuterol', dose: '4-8 puffs', route: 'inhaled', notes: 'repeat q20 min' },
      },
      { text: 'O₂ to SpO₂ 93-95%' },
      {
        text: 'Severe (cannot speak in sentences, SpO₂ under 92%, quiet chest) or hives/swelling: Epinephrine IM into the thigh',
        drug: {
          name: 'Epinephrine',
          dose: '0.3-0.5 mg',
          route: 'IM',
          syringeMl: 3,
          volume: '0.3-0.5 ml',
          concentration: '1 mg/ml',
          notes:
            'same syringe and needle to draw and give, outer thigh, push firmly, through clothing is fine; repeat q5-15 min; label the syringe',
        },
        severity: 'critical',
      },
      {
        text: 'Solu-Medrol IV (first choice) or Dexamethasone IV',
        drug: {
          name: 'Methylprednisolone (Solu-Medrol)',
          dose: '125 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '2.0 ml',
          concentration: '62.5 mg/ml',
          notes:
            'Act-O-Vial: press the top to release the liquid, swirl, draw all 2 ml; label the syringe',
        },
      },
      {
        text: 'Alternative: Dexamethasone IV',
        drug: {
          name: 'Dexamethasone',
          dose: '8-12 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '2.0-3.0 ml (4 mg/ml stock)',
          concentration: '4 mg/ml (in-office stock) or 10 mg/ml',
          drawTable: [
            { label: '4 mg/ml: 8 mg', ml: '2.0 ml' },
            { label: '4 mg/ml: 12 mg', ml: '3.0 ml' },
            { label: '10 mg/ml: 8 mg', ml: '0.8 ml' },
            { label: '10 mg/ml: 12 mg', ml: '1.2 ml' },
          ],
          notes: 'label the syringe',
        },
      },
      {
        text: 'Not clearly better after the first albuterol round: Call 911',
        severity: 'critical',
      },
      {
        text: 'Cannot ventilate: BVM 100% O₂, then LMA or King',
        severity: 'final',
        goTo: ['lma', 'king_lt'],
      },
    ],
  },
  {
    id: 'hyperventilation',
    category: 'airway',
    name: 'Hyperventilation',
    summary: 'Rapid breathing, lightheaded, tingling hands · Check SpO₂, coach slow breathing',
    signs: ['rapid breathing', 'lightheaded', 'tingling hands'],
    relatedProtocols: ['syncope', 'hypoglycemia'],
    steps: [
      { text: 'Stop the procedure, remove objects, sit upright' },
      {
        text: 'Check SpO₂ and BP first: low SpO₂, chest pain or wheeze means it is not anxiety (see Hypoventilation, Bronchospasm, Angina)',
        severity: 'critical',
      },
      {
        text: 'Coach slow breathing: in through the nose, out through pursed lips or cupped hands. No paper bag',
      },
      { text: 'O₂ only if SpO₂ under 94%' },
      {
        text: 'Not settling after 10 min: Midazolam IV slowly (office protocol)',
        drug: {
          name: 'Midazolam',
          dose: '1-2 mg',
          route: 'IV',
          syringeMl: 1,
          volume: '0.2-0.4 ml',
          concentration: '5 mg/ml',
          drawTable: [
            { label: '1 mg', ml: '0.2 ml' },
            { label: '2 mg', ml: '0.4 ml' },
          ],
          notes: 'titrate slowly; watch for oversedation; label the syringe',
        },
        severity: 'final',
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
      { text: 'Turn off N₂O, 100% O₂. Stop giving sedatives', severity: 'critical' },
      { text: 'Stimulate: say their name loudly, shake the shoulder' },
      { text: 'Jaw thrust or chin lift, suction, oral airway or NPA' },
      {
        text: 'Still breathing poorly (SpO₂ falling, EtCO₂ waveform flat or rising): BVM, 1 breath every 6 seconds',
        severity: 'critical',
      },
      {
        text: 'Reverse: Naloxone for fentanyl, Flumazenil for midazolam (see Oversedation protocols)',
      },
      {
        text: 'No pulse: start CPR (Cardiac Arrest protocol)',
        severity: 'final',
        goTo: ['vfib_vtach', 'pea_asystole'],
      },
    ],
    relatedProtocols: ['oversedation_benzo', 'oversedation_opioid'],
    critical: true,
  },
  {
    id: 'emesis_aspiration',
    category: 'airway',
    name: 'Emesis / Aspiration',
    summary: 'Vomiting, gagging, aspiration · Side, head down, suction · Zofran 4mg IV',
    signs: ['vomiting', 'gagging', 'aspiration'],
    relatedProtocols: ['laryngospasm', 'bronchospasm', 'choking'],
    steps: [
      {
        text: 'Stop. Turn to the side, head down, suction mouth and throat immediately',
        severity: 'critical',
      },
      { text: 'Turn off N₂O, 100% O₂, stop sedatives' },
      {
        text: 'Nausea or vomiting with a clear airway: Ondansetron IV over 2-5 minutes',
        drug: {
          name: 'Ondansetron',
          dose: '4 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '2.0 ml',
          concentration: '2 mg/ml',
          notes: 'give over 2-5 minutes; label the syringe',
        },
      },
      {
        text: 'Signs of aspiration (cough, wheeze, SpO₂ falling): Call 911, keep suctioning, BVM if breathing poorly',
        severity: 'critical',
      },
      { text: 'Laryngospasm or bronchospasm after vomiting: follow those protocols' },
      {
        text: 'Suspected aspiration but stable: send to the ER for evaluation and a chest X-ray. Do not discharge home',
        severity: 'final',
      },
    ],
  },
  {
    id: 'choking',
    category: 'airway',
    name: 'Choking / Airway Obstruction',
    summary: 'Cannot speak or cough, cyanosis · 5 back blows + 5 abdominal thrusts',
    signs: ['cannot speak', 'cannot cough', 'cyanosis', 'silent chest'],
    relatedProtocols: ['laryngospasm', 'pea_asystole'],
    steps: [
      { text: 'Mild (can cough or speak): encourage coughing, do not interfere' },
      {
        text: 'Severe (cannot speak or cough): Call 911. 5 back blows, then 5 abdominal thrusts, repeat (chest thrusts if pregnant or too large)',
        severity: 'critical',
      },
      {
        text: 'Object visible (dropped crown, gauze): remove with Magill forceps under direct view (laryngoscope). No blind finger sweeps',
      },
      {
        text: 'Becomes unresponsive: CPR, compressions first. Look in the mouth before each breath',
        severity: 'critical',
      },
      { text: 'Cannot ventilate and cannot remove it: cricothyrotomy', severity: 'final' },
      { text: 'Object lost and not found: chest X-ray (swallowed or aspirated?)' },
    ],
  },
  {
    id: 'npa',
    category: 'airway',
    name: 'NPA (Nasopharyngeal Airway) - Use WITH BVM',
    summary: 'BVM difficult, tongue obstruction · 7.5 mm most adults',
    signs: ['BVM difficult', 'tongue obstruction'],
    relatedProtocols: ['lma', 'king_lt', 'hypoventilation'],
    steps: [
      {
        text: 'Size: nose tip to earlobe. Stock: 6 mm (small adult), 7.5 mm (average), 8 mm (large)',
      },
      { text: 'Lubricate generously; use the larger nostril' },
      {
        text: 'Bevel toward the septum; slide straight back along the floor of the nose (toward the ear, not up)',
      },
      { text: 'Resistance: stop, try the other nostril or a smaller size. Never force' },
      { text: 'Flange at the nostril; resume BVM', severity: 'critical' },
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
    summary: 'BVM + NPA failing · Size 4 most adults',
    signs: ['BVM failing', 'NPA failing'],
    steps: [
      {
        text: 'Size by weight: 3 (30-50 kg), 4 (50-70 kg), 5 (70-100 kg). When in doubt, go larger',
      },
      { text: 'Deflate the cuff fully, lubricate the back, remove dentures' },
      {
        text: 'Sniffing position. Hold it like a pen, press along the hard palate, advance until resistance',
      },
      {
        text: 'Inflate without holding it, using the colour-coded LarySeal syringe: 3 = 20 ml, 4 = 30 ml, 5 = 40 ml',
      },
      { text: 'Attach BVM; confirm chest rise and a capnography waveform', severity: 'critical' },
      { text: 'Fails: King or cricothyrotomy', severity: 'final', goTo: ['king_lt'] },
    ],
    relatedProtocols: ['king_lt', 'npa'],
  },
  {
    id: 'king_lt',
    category: 'airway',
    name: 'King LT Airway - If LMA Fails or Alternative',
    summary: 'LMA failed · Size 4 (5-6 ft) stocked',
    signs: ['LMA failed'],
    relatedProtocols: ['lma', 'npa'],
    steps: [
      { text: 'Size 4 (5-6 ft) is stocked' },
      { text: 'Lubricate; head neutral' },
      {
        text: 'Insert at the corner of the mouth, rotate to midline, advance until the connector base reaches the teeth',
      },
      { text: 'Inflate with the 60 ml syringe: 50-70 ml (check the IFU in the kit)' },
      {
        text: 'Pull back slowly while bagging until ventilation is easy; confirm chest rise and capnography',
        severity: 'critical',
      },
      { text: 'Fails: cricothyrotomy', severity: 'final' },
    ],
  },
  {
    id: 'angina',
    category: 'cardiac-ischemia',
    name: 'Angina / Chest Pain',
    summary: 'Crushing chest pain, arm or jaw ache · MONA, given A, N, O, M',
    signs: ['crushing chest pain', 'arm radiation', 'jaw radiation'],
    steps: [
      { text: 'Stop procedure. N₂O off' },
      { text: 'Sit semi-upright. Lie flat if SBP <90' },
      {
        text: 'O₂: nasal hood at 100% (N₂O off) or 4 L/min cannula. Mouth breathing: non-rebreather 15 L/min',
      },
      { text: 'EKG on. Check BP and HR' },
      {
        text: 'Nitroglycerin SL, only if SBP ≥90, HR 50-100, no ED drug',
        drug: {
          name: 'Nitroglycerin',
          dose: '0.4 mg',
          route: 'SL',
          notes: 'repeat q5 min, max 3 doses',
        },
      },
      {
        text: 'Pain not gone 5 min after 1st nitro: Call 911, go to MI',
        severity: 'critical',
        goTo: ['mi'],
      },
      {
        text: 'Aspirin 4 × 81 mg CHEWED',
        drug: {
          name: 'Aspirin',
          dose: '324 mg',
          route: 'PO',
          notes: '4 × 81 mg chewable tablets, chewed, not swallowed',
        },
      },
      {
        text: 'If pain continues: Fentanyl IV or N₂O. Watch breathing',
        drug: {
          name: 'Fentanyl',
          dose: '25 mcg',
          route: 'IV',
          syringeMl: 3,
          volume: '0.5 ml',
          concentration: '50 mcg/ml',
          notes: 'already sedated: watch breathing; label the syringe',
        },
      },
      { text: 'No pulse: CPR + AED', severity: 'final', goTo: ['vfib_vtach', 'pea_asystole'] },
    ],
    contraindications: [
      'Sildenafil (Viagra) or vardenafil (Levitra) in last 24 hr',
      'Tadalafil (Cialis) in last 48 hr',
      'SBP <90 mmHg',
      'HR <50 or >100 BPM',
      'Aspirin allergy or active GI bleed (aspirin)',
    ],
    relatedProtocols: ['mi', 'hypertensive_crisis'],
  },
  {
    id: 'mi',
    category: 'cardiac-ischemia',
    name: 'Myocardial Infarction (HEART ATTACK)',
    summary: 'Chest pain with sweating, nausea or short of breath · Call 911, MONA, AED pads on',
    signs: ['severe chest pain', 'diaphoresis', 'arm radiation', 'jaw radiation'],
    steps: [
      { text: 'CALL 911 IMMEDIATELY', severity: 'critical' },
      { text: 'Stop procedure. N₂O off' },
      { text: 'Sit semi-upright. Lie flat if SBP <90' },
      {
        text: 'Aspirin 4 × 81 mg CHEWED (not swallowed!)',
        drug: {
          name: 'Aspirin',
          dose: '324 mg',
          route: 'PO',
          notes: '4 × 81 mg chewable tablets, chewed, not swallowed',
        },
      },
      {
        text: 'Nitroglycerin SL, only if SBP ≥90, HR 50-100, no ED drug',
        drug: {
          name: 'Nitroglycerin',
          dose: '0.4 mg',
          route: 'SL',
          notes: 'q5 min, max 3 doses',
        },
      },
      {
        text: 'O₂: nasal hood at 100% (N₂O off) or 4 L/min cannula. Mouth breathing: non-rebreather 15 L/min',
      },
      { text: 'AED pads on now. EKG on. Vitals every 5 min', severity: 'critical' },
      {
        text: 'If pain continues: Fentanyl IV or N₂O. Watch breathing',
        drug: {
          name: 'Fentanyl',
          dose: '25 mcg',
          route: 'IV',
          syringeMl: 3,
          volume: '0.5 ml',
          concentration: '50 mcg/ml',
          notes: 'repeat q10-20 min; already sedated: watch breathing; label the syringe',
        },
      },
      { text: 'No pulse: CPR + AED', severity: 'final', goTo: ['vfib_vtach', 'pea_asystole'] },
    ],
    contraindications: [
      'Sildenafil (Viagra) or vardenafil (Levitra) in last 24 hr',
      'Tadalafil (Cialis) in last 48 hr',
      'SBP <90 mmHg',
      'HR <50 or >100 BPM',
      'Aspirin allergy or active GI bleed (aspirin)',
    ],
    relatedProtocols: ['angina', 'vfib_vtach'],
  },
  {
    id: 'hypertension',
    category: 'cardiac-ischemia',
    name: 'Hypertension / HBP (>180/120, no symptoms)',
    summary: 'BP >180/120, no symptoms · Recheck, no IV BP drug, refer',
    signs: ['BP >180/120', 'anxiety'],
    steps: [
      { text: 'Stop procedure' },
      { text: 'Recheck BP in 5 min (right cuff size)' },
      { text: '100% O₂ and reassess' },
      {
        text: 'If anxious: Midazolam IV',
        drug: {
          name: 'Midazolam',
          dose: '1-2 mg',
          route: 'IV',
          syringeMl: 1,
          volume: '0.2-0.4 ml',
          concentration: '5 mg/ml',
          drawTable: [
            { label: '1 mg', ml: '0.2 ml' },
            { label: '2 mg', ml: '0.4 ml' },
          ],
          notes: 'label the syringe',
        },
      },
      { text: 'No symptoms: no IV BP drug. Urgent care only. Refer to their physician today' },
      {
        text: 'Headache, chest pain, short of breath, vision change or weakness: go to Hypertensive Crisis',
        goTo: ['hypertensive_crisis'],
        severity: 'critical',
      },
    ],
    relatedProtocols: ['hypertensive_crisis'],
  },
  {
    id: 'hypertensive_crisis',
    category: 'cardiac-ischemia',
    name: 'Hypertensive Crisis (>180/120 + symptoms)',
    summary: 'BP >180/120 with headache, chest pain, vision change · Call 911 + Labetalol IV',
    signs: ['BP >180/120', 'severe headache', 'vision changes', 'chest pain', 'weakness'],
    steps: [
      { text: 'Call 911', severity: 'critical' },
      { text: 'Sit upright' },
      { text: 'O₂ to >94%' },
      {
        text: 'Labetalol IV over 2 minutes, repeat 20-40mg q10min, up to 300mg total',
        drug: {
          name: 'Labetalol',
          dose: '20 mg',
          route: 'IV',
          syringeMl: 10,
          volume: '4.0 ml',
          concentration: '5 mg/ml',
          notes: 'over 2 minutes; repeat 20-40 mg q10 min up to 300 mg total; label the syringe',
        },
      },
      {
        text: 'Second-line: Hydralazine IV (if labetalol unavailable or contraindicated, e.g. asthma/bradycardia)',
        drug: {
          name: 'Hydralazine',
          dose: '10 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '0.5 ml',
          concentration: '20 mg/ml',
          notes:
            'over 1-2 min; one dose, works in 10-20 min; EMS decides the next; label the syringe',
        },
      },
      { text: 'Lower BP no more than 25% in the first hour' },
      {
        text: 'Chest pain: go to MI. One-sided weakness or slurred speech: go to Stroke',
        goTo: ['mi', 'stroke'],
      },
      { text: 'Monitor vitals continuously', severity: 'final' },
    ],
    relatedProtocols: ['mi', 'stroke'],
  },
  {
    id: 'hypotension',
    category: 'cardiac-ischemia',
    name: 'Hypotension (Low BP)',
    summary: 'Dizzy, SBP <90, pale · Fluids, legs up, then drug by heart rate',
    signs: ['dizzy', 'SBP <90', 'pale'],
    relatedProtocols: [
      'bradycardia',
      'anaphylaxis',
      'oversedation_benzo',
      'oversedation_opioid',
      'syncope',
    ],
    steps: [
      { text: 'Stop sedatives. N₂O off, 100% O₂' },
      { text: 'Supine, legs up' },
      { text: '500 ml saline bolus, wide open' },
      { text: 'Look for the cause: oversedation, vasovagal, anaphylaxis' },
      { text: 'Check heart rate' },
      {
        text: 'If Bradycardic (HR <50): Atropine IV (q3-5min, max 3mg)',
        drug: {
          name: 'Atropine',
          dose: '1 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '1.0 ml (vial)',
          concentration: '1 mg/ml vial or 1 mg/10 ml prefilled',
          drawTable: [
            { label: '1 mg/ml vial', ml: '1.0 ml' },
            { label: '1 mg/10 ml prefilled (full syringe)', ml: '10.0 ml' },
          ],
          notes: 'q3-5 min, max 3 mg; label the syringe if drawn from a vial',
        },
      },
      {
        text: 'If HR 50-100: Ephedrine IV',
        drug: {
          name: 'Ephedrine',
          dose: '2.5-5 mg',
          route: 'IV',
          syringeMl: 10,
          volume: '0.5-1.0 ml',
          concentration: '5 mg/ml (after dilution)',
          mixFirst:
            'MIX FIRST: one 10 ml syringe, saline from the IV bag port; Draw 1 ml ephedrine 50 mg/ml + 9 ml saline = 5 mg/ml; Label it EPHEDRINE 5 mg/ml; Never inject from the stock vial',
          drawTable: [
            { label: '2.5 mg', ml: '0.5 ml' },
            { label: '5 mg', ml: '1.0 ml' },
          ],
          notes: 'onset ~1 min; lasts ~1 hr; repeat as needed, max 50 mg total',
        },
      },
      {
        text: 'If Tachycardic (HR >100): Phenylephrine IV',
        drug: {
          name: 'Phenylephrine',
          dose: '100 mcg',
          route: 'IV',
          syringeMl: 10,
          volume: '1.0 ml',
          concentration: '100 mcg/ml (after dilution)',
          mixFirst:
            'MIX FIRST: one 10 ml syringe, saline from the IV bag port; Draw 1 ml phenylephrine 10 mg/ml + 9 ml saline = 1 mg/ml; WASTE DOWN TO 1 ml; Draw saline back up to 10 ml = 100 mcg/ml; Label it PHENYLEPHRINE 100 mcg/ml; Never inject from the stock vial',
        },
      },
      { text: 'Phenylephrine not in stock: fluids, legs up, call 911 if SBP stays <90' },
      { text: 'No response to treatment, or unresponsive: Call 911', severity: 'critical' },
    ],
    critical: true,
  },
  {
    id: 'bradycardia',
    category: 'cardiac-arrhythmia',
    name: 'Symptomatic Bradycardia (<50 BPM)',
    summary: 'HR under 50 with low BP or confusion · Ventilate, then Atropine 1mg IV',
    signs: ['HR <50 BPM', 'low BP'],
    relatedProtocols: ['hypotension', 'pea_asystole'],
    steps: [
      {
        text: 'Ventilate first: jaw thrust, O₂, BVM if breathing is poor (hypoxia is the usual cause in sedation)',
        severity: 'critical',
      },
      { text: 'Monitor EKG, BP, SpO₂. IV open' },
      {
        text: 'Low BP, confusion, chest pain or shock: Atropine IV, repeat q3-5 min, max 3 mg',
        drug: {
          name: 'Atropine',
          dose: '1 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '1.0 ml (vial)',
          concentration: '1 mg/ml vial or 1 mg/10 ml prefilled',
          drawTable: [
            { label: '1 mg/ml vial', ml: '1.0 ml' },
            { label: '1 mg/10 ml prefilled (full syringe)', ml: '10.0 ml' },
          ],
          notes: 'repeat q3-5 min, max 3 mg total; label the syringe if drawn from a vial',
        },
      },
      { text: 'Call 911', severity: 'critical' },
      {
        text: 'Atropine not working: Push-dose Epinephrine (office bridge to EMS; AHA uses pacing or an infusion)',
        drug: {
          name: 'Push-dose Epinephrine',
          dose: '5-10 mcg',
          route: 'IV',
          syringeMl: 10,
          volume: '0.5-1.0 ml',
          concentration: '10 mcg/ml (after dilution)',
          mixFirst:
            'MIX FIRST: one 10 ml syringe, saline from the IV bag port; Draw 1 ml epinephrine 1 mg/ml + 9 ml saline = 100 mcg/ml; WASTE DOWN TO 1 ml; Draw saline back up to 10 ml = 10 mcg/ml; Label it EPI 10 mcg/ml; Never inject from the stock vial',
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
    summary: 'HR over 150, usually a response to pain, anxiety or fluids · Treat the cause',
    signs: ['HR >150', 'chest pain', 'hypotension'],
    relatedProtocols: ['svt', 'hypotension'],
    steps: [
      {
        text: 'Find the cause: pain, anxiety, hypoxia, low fluids, epinephrine in the local anesthetic',
      },
      { text: 'Stop procedure. O₂ if SpO₂ under 94%. Reassure and monitor' },
      { text: 'Low fluids or low BP: NS bolus (not D5W)' },
      { text: 'Chest pain, low BP or confusion: Call 911', severity: 'critical' },
    ],
  },
  {
    id: 'junctional_tach',
    category: 'cardiac-arrhythmia',
    name: 'Junctional Tachycardia',
    summary: 'Regular narrow tachycardia, HR 100-180 · Amiodarone 150mg IV over 10min',
    signs: ['regular narrow tachycardia', 'HR 100-180'],
    relatedProtocols: ['svt', 'afib', 'wide_complex', 'stable_vtach'],
    steps: [
      {
        text: 'Unstable (low BP, confusion, chest pain, short of breath)? Call 911: needs synchronized cardioversion, which the AED cannot do',
        severity: 'critical',
      },
      { text: 'Stop procedure. O₂ if SpO₂ under 94%. Monitor EKG, BP, SpO₂' },
      {
        text: 'Amiodarone IV over 10 minutes (office protocol; not an AHA pathway)',
        drug: {
          name: 'Amiodarone',
          dose: '150 mg',
          route: 'IV',
          syringeMl: 10,
          volume: '3.0 ml',
          concentration: '50 mg/ml',
          notes: 'give over 10 minutes; label the syringe',
        },
      },
      { text: 'Call 911', severity: 'critical' },
    ],
  },
  {
    id: 'svt',
    category: 'cardiac-arrhythmia',
    name: 'SVT / PSVT (>150 BPM)',
    summary: 'Sudden HR >150, palpitations · Modified Valsalva, then Adenosine 6mg IV',
    signs: ['sudden HR >150', 'palpitations'],
    relatedProtocols: ['afib', 'junctional_tach', 'wide_complex', 'stable_vtach'],
    steps: [
      {
        text: 'Unstable (low BP, confusion, chest pain, short of breath)? Call 911: needs synchronized cardioversion, which the AED cannot do',
        severity: 'critical',
      },
      {
        text: 'Modified Valsalva: blow into a 10 ml syringe for 15 seconds, then lay flat with legs raised for 15 seconds (avoid carotid massage)',
      },
      {
        text: 'Adenosine Rapid IV Push: 6 mg, then 12 mg after 1-2 minutes if not converted',
        drug: {
          name: 'Adenosine',
          dose: '6 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '2.0 ml',
          concentration: '3 mg/ml',
          drawTable: [
            { label: '6 mg (1st dose)', ml: '2.0 ml' },
            { label: '12 mg (2nd dose)', ml: '4.0 ml' },
          ],
          notes:
            '10 ml syringe for the 12 mg dose; push in 1-2 seconds, then a rapid 20 ml NS flush; avoid in asthma; never for irregular or polymorphic rhythms; label the syringe if drawn from a vial',
        },
        severity: 'critical',
      },
      { text: 'Still in SVT: Call 911', severity: 'critical' },
    ],
  },
  {
    id: 'afib',
    category: 'cardiac-arrhythmia',
    name: 'Atrial Fibrillation / Atrial Flutter',
    summary: 'Irregular HR, palpitations, hypotension · Amiodarone 150mg IV over 10min',
    signs: ['irregular HR', 'palpitations', 'hypotension'],
    relatedProtocols: ['svt', 'junctional_tach', 'wide_complex', 'stable_vtach'],
    steps: [
      {
        text: 'Unstable (low BP, confusion, chest pain, short of breath)? Call 911: needs synchronized cardioversion, which the AED cannot do',
        severity: 'critical',
      },
      { text: 'Stop procedure. O₂ if SpO₂ under 94%. Monitor EKG, BP, SpO₂' },
      {
        text: 'Amiodarone IV over 10 minutes (office protocol; AHA uses rate control first)',
        drug: {
          name: 'Amiodarone',
          dose: '150 mg',
          route: 'IV',
          syringeMl: 10,
          volume: '3.0 ml',
          concentration: '50 mg/ml',
          notes: 'give over 10 minutes; label the syringe',
        },
      },
      { text: 'Call 911', severity: 'critical' },
    ],
  },
  {
    id: 'stable_vtach',
    category: 'cardiac-arrhythmia',
    name: 'Stable Ventricular Tachycardias (with pulse)',
    summary: 'Wide complex tachycardia, pulse present · Amiodarone 150mg IV over 10min',
    signs: ['wide complex tachycardia', 'pulse present'],
    relatedProtocols: ['wide_complex', 'svt', 'afib', 'junctional_tach', 'vfib_vtach'],
    steps: [
      {
        text: 'Unstable (low BP, confusion, chest pain, short of breath)? Call 911: needs synchronized cardioversion, which the AED cannot do',
        severity: 'critical',
      },
      { text: 'Stop procedure. O₂ if SpO₂ under 94%. Monitor EKG, BP, SpO₂' },
      {
        text: 'Amiodarone IV over 10 minutes; repeat once if it recurs',
        drug: {
          name: 'Amiodarone',
          dose: '150 mg',
          route: 'IV',
          syringeMl: 10,
          volume: '3.0 ml',
          concentration: '50 mg/ml',
          notes: 'give over 10 minutes; repeat 150 mg if it recurs; label the syringe',
        },
      },
      {
        text: 'If amiodarone unavailable: Cardiac Lidocaine IV push; second dose is half',
        drug: {
          name: 'Cardiac Lidocaine',
          dose: '0.6 mg/lb',
          route: 'IV',
          syringeMl: 10,
          volume: '4.5-7.5 ml (by weight)',
          concentration: '20 mg/ml',
          drawTable: [
            { label: '150 lb (90 mg)', ml: '4.5 ml' },
            { label: '200 lb (120 mg)', ml: '6.0 ml' },
            { label: '250 lb (150 mg)', ml: '7.5 ml' },
          ],
          notes:
            'second dose 0.3 mg/lb in 5-10 min; max 1.4 mg/lb total; over 165 lb needs a second 100 mg/5 ml vial; label the syringe',
        },
      },
      { text: 'Call 911', severity: 'critical' },
    ],
  },
  {
    id: 'wide_complex',
    category: 'cardiac-arrhythmia',
    name: 'Wide Complex Tachycardias',
    summary: 'Wide QRS, HR >100, unknown origin · Amiodarone 150mg IV over 10min',
    signs: ['wide QRS', 'HR >100', 'unknown origin'],
    relatedProtocols: ['stable_vtach', 'svt', 'afib', 'junctional_tach', 'vfib_vtach'],
    steps: [
      {
        text: 'Unstable (low BP, confusion, chest pain, short of breath)? Call 911: needs synchronized cardioversion, which the AED cannot do',
        severity: 'critical',
      },
      { text: 'Stop procedure. O₂ if SpO₂ under 94%. Monitor EKG, BP, SpO₂' },
      {
        text: 'Amiodarone IV over 10 minutes; repeat once if it recurs',
        drug: {
          name: 'Amiodarone',
          dose: '150 mg',
          route: 'IV',
          syringeMl: 10,
          volume: '3.0 ml',
          concentration: '50 mg/ml',
          notes: 'give over 10 minutes; repeat 150 mg if it recurs; label the syringe',
        },
      },
      { text: 'Call 911', severity: 'critical' },
    ],
  },
  {
    id: 'vfib_vtach',
    category: 'cardiac-arrest',
    name: 'V-Fib / Pulseless V-Tach (CARDIAC ARREST)',
    summary: 'No pulse, not breathing · CPR + AED, Epinephrine 1mg IV after 2nd shock',
    signs: ['no pulse', 'shockable rhythm', 'V-Fib', 'pulseless V-Tach'],
    steps: [
      { text: 'Call for help, AED and 911', severity: 'critical' },
      {
        text: 'CPR on the CPR board: 100-120/min, 30:2 until an LMA/King/ET tube is placed, then 1 breath every 6 seconds with continuous compressions',
        goTo: ['lma', 'king_lt'],
        severity: 'critical',
      },
      { text: 'AED: shock when advised, then CPR for 2 minutes right away', severity: 'critical' },
      { text: 'IV access without stopping compressions' },
      {
        text: 'After 2nd shock: Epinephrine IV push, repeat q3-5min',
        drug: {
          name: 'Epinephrine',
          dose: '1 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '1.0 ml',
          concentration: '1 mg/ml',
          notes: 'draw the entire 1 ml ampule; repeat q3-5 min; label the syringe',
        },
        severity: 'critical',
      },
      {
        text: 'After 3rd shock: Amiodarone 300 mg IV push; second dose 150 mg',
        drug: {
          name: 'Amiodarone',
          dose: '300 mg',
          route: 'IV',
          syringeMl: 10,
          volume: '6.0 ml',
          concentration: '50 mg/ml',
          notes:
            'IV PUSH; 300 mg = two 150 mg/3 ml vials; second dose 150 mg (3.0 ml) at the next cycle; label the syringe',
        },
        severity: 'critical',
      },
      {
        text: 'If amiodarone unavailable: Cardiac Lidocaine IV push; second dose is half',
        drug: {
          name: 'Cardiac Lidocaine',
          dose: '0.6 mg/lb',
          route: 'IV',
          syringeMl: 10,
          volume: '4.5-7.5 ml (by weight)',
          concentration: '20 mg/ml',
          drawTable: [
            { label: '150 lb (90 mg)', ml: '4.5 ml' },
            { label: '200 lb (120 mg)', ml: '6.0 ml' },
            { label: '250 lb (150 mg)', ml: '7.5 ml' },
          ],
          notes:
            'second dose 0.3 mg/lb at the next cycle; over 165 lb needs a second 100 mg/5 ml vial; label the syringe',
        },
      },
      {
        text: 'Most likely cause here: Hypoxia (ventilate) or sedative Toxins (reverse with Naloxone / Flumazenil)',
        severity: 'critical',
      },
      {
        text: "Other H's and T's: Hypovolemia, Hydrogen ion (acidosis), Hypo/Hyperkalemia, Hypothermia, Tamponade, Tension pneumothorax, Thrombosis (coronary or pulmonary)",
      },
      { text: 'Continue CPR and AED until EMS takes over', severity: 'final' },
    ],
    critical: true,
    relatedProtocols: ['pea_asystole', 'lma'],
  },
  {
    id: 'pea_asystole',
    category: 'cardiac-arrest',
    name: 'PEA and Asystole (Non-Shockable Rhythms)',
    summary: 'No pulse, AED says no shock · CPR, Epinephrine 1mg IV q3-5min',
    signs: ['no pulse', 'non-shockable rhythm', 'PEA', 'asystole'],
    steps: [
      { text: 'Call for help, AED and 911', severity: 'critical' },
      {
        text: 'CPR on the CPR board: 100-120/min, 30:2 until an LMA/King/ET tube is placed, then 1 breath every 6 seconds with continuous compressions',
        goTo: ['lma', 'king_lt'],
        severity: 'critical',
      },
      { text: 'AED on: follow its prompts (shock only if advised)' },
      { text: 'IV access; bolus 500 ml NS' },
      {
        text: 'Epinephrine IV push as soon as possible, repeat q3-5 min',
        drug: {
          name: 'Epinephrine',
          dose: '1 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '1.0 ml',
          concentration: '1 mg/ml',
          notes: 'draw the entire 1 ml ampule; repeat q3-5 min; label the syringe',
        },
        severity: 'critical',
      },
      {
        text: 'Most likely cause here: Hypoxia (ventilate) or sedative Toxins (reverse with Naloxone / Flumazenil)',
        severity: 'critical',
      },
      {
        text: "Other H's and T's: Hypovolemia, Hydrogen ion (acidosis), Hypo/Hyperkalemia, Hypothermia, Tamponade, Tension pneumothorax, Thrombosis (coronary or pulmonary)",
      },
      { text: 'No atropine for PEA or asystole', severity: 'final' },
    ],
    relatedProtocols: ['vfib_vtach', 'lma'],
  },
  {
    id: 'anaphylaxis',
    category: 'allergic',
    name: 'Anaphylaxis (Severe Allergic Reaction)',
    summary: 'Hives, bronchospasm, hypotension, angioedema · Epinephrine IM THIGH first, then 911',
    signs: ['hives', 'bronchospasm', 'hypotension', 'angioedema'],
    relatedProtocols: ['bronchospasm', 'hypotension', 'laryngospasm'],
    steps: [
      {
        text: 'Epinephrine IM into the THIGH (Auvi-Q, or draw from the 1 mg/ml ampule). NEVER 1 mg/ml IV',
        drug: {
          name: 'Epinephrine',
          dose: '0.3-0.5 mg',
          route: 'IM',
          syringeMl: 3,
          volume: '0.3-0.5 ml',
          concentration: '1 mg/ml',
          drawTable: [
            { label: '0.3 mg', ml: '0.3 ml' },
            { label: '0.5 mg', ml: '0.5 ml' },
          ],
          notes:
            'same syringe and needle to draw and give, outer thigh, push firmly, through clothing is fine; repeat q5-15 min if not better; label the syringe if drawn from the ampule',
        },
        severity: 'critical',
      },
      { text: 'At the same time: DA calls 911', severity: 'critical' },
      { text: 'Lie flat, legs up (sit up if breathing hard). NEVER stand them up' },
      { text: 'O₂ to >94%' },
      {
        text: 'Albuterol (if wheezing)',
        drug: { name: 'Albuterol', dose: '4-8 puffs', route: 'inhaled', notes: 'repeat q20 min' },
      },
      { text: '500 ml saline bolus, wide open' },
      {
        text: 'Still low BP after 2 IM doses + fluids: Push-dose Epinephrine IV (office protocol)',
        drug: {
          name: 'Push-dose Epinephrine',
          dose: '10-20 mcg',
          route: 'IV',
          syringeMl: 10,
          volume: '1.0-2.0 ml',
          concentration: '10 mcg/ml (after dilution)',
          mixFirst:
            'MIX FIRST: one 10 ml syringe, saline from the IV bag port; Draw 1 ml epinephrine 1 mg/ml + 9 ml saline = 100 mcg/ml; WASTE DOWN TO 1 ml; Draw saline back up to 10 ml = 10 mcg/ml; Label it EPI 10 mcg/ml; Never inject from the stock vial',
          drawTable: [
            { label: '10 mcg', ml: '1.0 ml' },
            { label: '20 mcg', ml: '2.0 ml' },
          ],
          notes: 'q2-3 min, titrate to BP; 911 already called',
        },
        severity: 'critical',
      },
      {
        text: 'Diphenhydramine IV or IM: itch and hives only, does not treat airway or BP',
        drug: {
          name: 'Diphenhydramine',
          dose: '25-50 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '0.5-1.0 ml',
          concentration: '50 mg/ml',
          drawTable: [
            { label: '25 mg', ml: '0.5 ml' },
            { label: '50 mg', ml: '1.0 ml' },
          ],
          notes: 'label the syringe',
        },
      },
      {
        text: 'Steroid add-on after epinephrine: Solu-Medrol (methylprednisolone) IV',
        drug: {
          name: 'Methylprednisolone (Solu-Medrol)',
          dose: '125 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '2.0 ml',
          concentration: '62.5 mg/ml',
          notes:
            'Act-O-Vial: press the top to release the liquid, swirl, draw all 2 ml; label the syringe',
        },
      },
      {
        text: 'Alternative: Dexamethasone IV',
        drug: {
          name: 'Dexamethasone',
          dose: '8-12 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '2.0-3.0 ml (4 mg/ml stock)',
          concentration: '4 mg/ml (in-office stock) or 10 mg/ml',
          drawTable: [
            { label: '4 mg/ml: 8 mg', ml: '2.0 ml' },
            { label: '4 mg/ml: 12 mg', ml: '3.0 ml' },
            { label: '10 mg/ml: 8 mg', ml: '0.8 ml' },
            { label: '10 mg/ml: 12 mg', ml: '1.2 ml' },
          ],
          notes: 'label the syringe',
        },
      },
      { text: 'Monitor vitals continuously' },
      {
        text: 'Every anaphylaxis goes to the ER, even if better: it can come back',
        severity: 'final',
      },
    ],
    critical: true,
  },
  {
    id: 'oversedation_benzo',
    category: 'allergic',
    name: 'Oversedation (Benzodiazepine)',
    summary:
      'Excessive sedation, slow respirations, SpO₂ dropping · Airway, BVM + Flumazenil 0.2mg IV',
    signs: ['excessive sedation', 'slow respirations', 'SpO₂ dropping'],
    steps: [
      { text: 'Stop sedatives. N₂O off, 100% O₂', severity: 'critical' },
      { text: 'Stimulate: call their name, rub the sternum' },
      { text: 'Jaw thrust. BVM if breathing slow or SpO₂ falling', severity: 'critical' },
      { text: 'Fentanyl given too? Naloxone first (Opioid protocol)' },
      {
        text: 'Flumazenil IV over 15 sec, repeat every 1 min, max 1.0 mg',
        drug: {
          name: 'Flumazenil',
          dose: '0.2 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '2.0 ml',
          concentration: '0.1 mg/ml (0.5 mg/5 ml vial)',
          notes:
            'over 15 sec; repeat 0.2 mg every 1 min; max 1.0 mg (10 ml); if sleepiness returns, repeat no sooner than 20 min; label the syringe',
        },
      },
      {
        text: 'Sleepiness can come back: watch 2 hr after flumazenil (the app holds discharge 120 min)',
        severity: 'final',
      },
    ],
    contraindications: [
      'Long-term benzodiazepine use or seizure disorder: flumazenil can cause seizures',
    ],
    critical: true,
    relatedProtocols: ['oversedation_opioid', 'hypoventilation'],
  },
  {
    id: 'oversedation_opioid',
    category: 'allergic',
    name: 'Oversedation (Opioid)',
    summary:
      'Excessive sedation, pinpoint pupils, hypoventilation · Airway, BVM + Naloxone 0.4mg IV',
    signs: ['excessive sedation', 'pinpoint pupils', 'hypoventilation'],
    steps: [
      { text: 'Stop sedatives. N₂O off, 100% O₂', severity: 'critical' },
      { text: 'Stimulate: call their name, rub the sternum' },
      { text: 'Jaw thrust. BVM if breathing slow or SpO₂ falling', severity: 'critical' },
      {
        text: 'Naloxone IV, q3min up to 10mg (or IM if no IV)',
        drug: {
          name: 'Naloxone',
          dose: '0.4-2 mg',
          route: 'IV',
          syringeMl: 3,
          volume: '1.0 ml (0.4 mg)',
          concentration: '0.4 mg/ml',
          drawTable: [
            { label: '0.4 mg', ml: '1.0 ml' },
            { label: '2 mg (five 1 ml vials, 2 stocked)', ml: '5.0 ml' },
          ],
          notes: 'give slowly over 2-3 minutes; titrate q2-3 min; label the syringe',
        },
      },
      {
        text: 'Midazolam given too? Naloxone first, then flumazenil only if still not breathing well',
      },
      {
        text: 'Naloxone can wear off before fentanyl: watch 2 hr after the last dose (the app holds discharge 120 min)',
        severity: 'final',
      },
    ],
    relatedProtocols: ['oversedation_benzo', 'hypoventilation'],
    critical: true,
  },
  {
    id: 'malignant_hyperthermia',
    category: 'allergic',
    name: 'Malignant Hyperthermia (after Succinylcholine)',
    summary:
      'EtCO₂ climbing, jaw rigid, HR fast, temp rising · Stop, cool, 911: dantrolene not stocked',
    signs: [
      'EtCO₂ rising for no reason',
      'masseter / jaw rigidity',
      'tachycardia',
      'rigid muscles',
      'temperature rising',
    ],
    steps: [
      { text: 'Stop succinylcholine. 100% O₂ at 15 L/min, bag fast (2x normal rate)' },
      { text: 'Call 911. Say the words MALIGNANT HYPERTHERMIA', severity: 'critical' },
      {
        text: 'MHAUS hotline 1-800-644-9737 (24 hr) while waiting',
        severity: 'critical',
      },
      {
        // Deliberate: no drug callout. Dantrolene is not stocked (owner
        // decision 2026-11); EMS and the hospital give it.
        text: 'Dantrolene not stocked: EMS gives it (2.5 mg/kg IV). Only the airway and cooling are ours',
      },
      { text: 'Cool: ice packs to neck, armpits and groin. Cold saline IV wide open' },
      { text: 'Monitor EtCO₂, temperature, HR and rhythm every 5 min' },
      { text: 'Arrhythmia: treat by its protocol. No calcium channel blockers' },
      { text: 'Hand over to EMS: time of succinylcholine, dose, first sign', severity: 'final' },
    ],
    relatedProtocols: ['laryngospasm', 'vfib_vtach'],
  },
  {
    id: 'last',
    category: 'allergic',
    name: 'Local Anesthetic Toxicity (LAST)',
    summary: 'Ringing ears, metallic taste, confusion, then seizure · Stop, O₂, Midazolam, 911',
    signs: [
      'tinnitus',
      'metallic taste',
      'numb lips',
      'agitation',
      'confusion',
      'seizure',
      'arrhythmia',
    ],
    steps: [
      { text: 'Stop the injection. Note cartridges given' },
      { text: 'N₂O off, 100% O₂. Check the airway', severity: 'critical' },
      { text: 'Monitor: EKG, SpO₂, BP, EtCO₂' },
      { text: 'Call 911 early: it can progress to arrest', severity: 'critical' },
      {
        text: 'Seizure: Midazolam IV, repeat once',
        drug: {
          name: 'Midazolam',
          dose: '5 mg',
          route: 'IV',
          syringeMl: 1,
          volume: '1.0 ml',
          concentration: '5 mg/ml',
          notes: 'push slowly; repeat once after 5 min; BVM ready; label the syringe',
        },
      },
      {
        // Deliberate: no drug callout. 20% lipid emulsion is not stocked
        // (owner decision 2026-11); EMS and the hospital give it.
        text: 'Lipid emulsion 20% not stocked: EMS gives it. Tell them LAST',
      },
      {
        text: 'Arrhythmia or arrest: CPR, AED, small epinephrine doses. NO lidocaine as the antiarrhythmic',
        severity: 'critical',
      },
      {
        text: 'Prevent: aspirate, count cartridges, stay under the max dose for weight',
        severity: 'final',
      },
    ],
    relatedProtocols: ['seizure', 'vfib_vtach'],
  },
  {
    id: 'seizure',
    category: 'neurological',
    name: 'Seizure',
    summary: 'Tonic-clonic movements, LOC · Protect, O₂; 5 min: Midazolam 5mg IV + 911',
    signs: ['tonic-clonic movements', 'loss of consciousness'],
    steps: [
      { text: 'Note the time. Stop, clear the mouth' },
      { text: 'N₂O off, 100% O₂' },
      { text: 'Protect from injury. Do not restrain, nothing in the mouth' },
      {
        text: 'Seizure 5 min or more: Midazolam IV, repeat once after 5 min (IV diazepam not stocked)',
        drug: {
          name: 'Midazolam',
          dose: '5 mg',
          route: 'IV',
          syringeMl: 1,
          volume: '1.0 ml',
          concentration: '5 mg/ml',
          notes: 'push slowly; repeat once after 5 min; BVM ready; label the syringe',
        },
      },
      { text: 'Call 911 at 5 minutes', severity: 'critical' },
      { text: 'After: on the side, suction, O₂. Check glucose' },
      {
        text: 'First seizure, or needed midazolam: ER. Known epileptic, short, fully recovered: watch 1 hr, escort home, no driving',
        severity: 'final',
      },
    ],
    relatedProtocols: ['hypoglycemia', 'last'],
  },
  {
    id: 'syncope',
    category: 'neurological',
    name: 'Syncope (Fainting)',
    summary: 'Sudden unconsciousness, dizziness, pallor · Flat, legs up, O₂',
    signs: ['sudden unconsciousness', 'dizziness', 'pallor'],
    steps: [
      {
        text: 'Check breathing and pulse. No pulse: CPR + AED',
        severity: 'critical',
        goTo: ['vfib_vtach', 'pea_asystole'],
      },
      { text: 'Flat, legs up (not head-down)' },
      { text: 'N₂O off, 100% O₂. Sedated patient? Think oversedation' },
      { text: 'Loosen tight clothing. Cool cloth to the forehead' },
      { text: 'Stimulate: call their name, sternal rub' },
      { text: 'Monitor vitals. Slow to wake or diabetic: check glucose' },
      { text: 'Not conscious within 120 seconds: Call 911', severity: 'critical' },
      { text: 'Sit up slowly. 20 minutes to recover before discharge', severity: 'final' },
    ],
    relatedProtocols: ['oversedation_benzo', 'oversedation_opioid', 'hypoglycemia'],
  },
  {
    id: 'stroke',
    category: 'neurological',
    name: 'Stroke',
    summary: 'BE-FAST: Balance, Eyes, Face, Arm, Speech, Time · Call 911, check glucose',
    signs: [
      'face droop',
      'arm weakness',
      'speech difficulty',
      'balance loss',
      'vision loss',
      'BE-FAST',
    ],
    steps: [
      { text: 'BE-FAST: Balance, Eyes, Face droop, Arm weakness, Speech, Time' },
      { text: 'CALL 911 IMMEDIATELY', severity: 'critical' },
      { text: 'Write down the last known well time', severity: 'critical' },
      {
        text: 'Check glucose. Under 70: treat as hypoglycemia (it can look like a stroke)',
        goTo: ['hypoglycemia'],
      },
      { text: 'Nothing by mouth' },
      { text: 'O₂ only if SpO₂ <94%' },
      { text: 'Vomiting: recovery position, suction' },
      { text: 'No aspirin, no BP drugs: the hospital decides after a scan' },
      { text: 'Monitor vitals until EMS arrives', severity: 'final' },
    ],
    relatedProtocols: ['hypoglycemia'],
  },
  {
    id: 'hypoglycemia',
    category: 'other',
    name: 'Hypoglycemia (Diabetic - Sweaty, Confused, Shaky)',
    summary: 'Sweaty, confused, glucose <70 · Gel 15 g if awake, D50W 25g IV if not',
    signs: ['sweaty', 'dizzy', 'confused', 'shaky'],
    steps: [
      { text: 'Check blood glucose with Glucometer. Under 70 = low' },
      { text: 'Awake and can swallow: 1 glucose gel pouch (15 g)' },
      {
        text: 'Not awake: nothing by mouth. D50W IV',
        drug: {
          name: 'D50W',
          dose: '25 g',
          route: 'IV',
          volume: '50 ml',
          concentration: '0.5 g/ml (50% Dextrose)',
          notes:
            'use 50 ml prefilled syringe or draw entire vial into 60 cc syringe; label the syringe if drawn from a vial',
        },
        severity: 'critical',
      },
      {
        // Deliberate: no glucagon callout. Owner decision (2026-08, confirmed
        // 2026-11): sedation patients already have an IV, so the office path
        // is D50W; when D50W is out of stock the step below is 911.
        text: 'D50W not in stock, or no IV: Call 911 now (Glucagon not stocked)',
        severity: 'critical',
      },
      { text: 'Recheck glucose in 15 min. Still under 70: repeat' },
      { text: 'Once 70 or more: a small snack', severity: 'final' },
    ],
    relatedProtocols: ['stroke', 'syncope'],
  },
  {
    id: 'phlebitis',
    category: 'other',
    name: 'Phlebitis',
    summary: 'Edema, warmth, tenderness along vein · Remove IV + warm compress + elevate',
    signs: ['edema', 'warmth', 'tenderness along vein'],
    relatedProtocols: ['intraarterial'],
    steps: [
      { text: 'Remove all rings immediately' },
      { text: 'Remove catheter' },
      { text: 'Elevate the limb. Limit use' },
      { text: 'Warm moist towel 20 min, 3-4 times a day' },
      { text: 'NSAID for pain' },
      { text: 'Settles in days; full resolution in 3-4 weeks' },
      {
        text: 'Fever, spreading redness, pus or a hard cord: refer to their physician',
        severity: 'final',
      },
    ],
  },
  {
    id: 'intraarterial',
    category: 'other',
    name: 'Intra-arterial Injection',
    summary:
      'Pulsatile red blood, severe pain · Leave needle in, Cardiac Lidocaine into artery, 911',
    signs: [
      'pulsatile cherry red blood',
      'severe pain radiating toward fingers',
      'pale/cool limb',
      'possible loss of radial pulse',
    ],
    relatedProtocols: ['phlebitis'],
    steps: [
      { text: 'Check radial pulse. Compare color and temperature with the other hand' },
      { text: 'No drug given yet: remove needle, pressure 10 minutes. No damage done' },
      {
        text: 'Drug given: LEAVE NEEDLE IN PLACE. It is used to give the treatment',
        severity: 'critical',
      },
      {
        text: 'Cardiac Lidocaine slowly into the artery through the needle, to break the spasm',
        drug: {
          name: 'Cardiac Lidocaine',
          dose: '20-100 mg',
          route: 'IA',
          syringeMl: 10,
          volume: '1.0-5.0 ml',
          concentration: '20 mg/ml (2%)',
          drawTable: [
            { label: '20 mg', ml: '1.0 ml' },
            { label: '50 mg', ml: '2.5 ml' },
            { label: '100 mg (whole vial)', ml: '5.0 ml' },
          ],
          notes:
            'plain lidocaine only, never with epinephrine; DOCS manual: procaine 1% 2-10 ml (20-100 mg), same mg with the stocked cardiac lidocaine; label the syringe',
        },
      },
      { text: 'Keep the needle in. Tape it, label it ARTERIAL' },
      { text: 'Call 911: hospitalization is mandatory', severity: 'critical' },
      { text: 'Accompany the patient to the hospital', severity: 'final' },
    ],
  },
];

export function findProtocol(id: string): EmergencyProtocol | undefined {
  return EMERGENCY_PROTOCOLS.find((p) => p.id === id);
}

export function protocolsByCategory(category: EmergencyCategory): ReadonlyArray<EmergencyProtocol> {
  return EMERGENCY_PROTOCOLS.filter((p) => p.category === category);
}
