import { DEFAULT_FORMULARY } from '@sedation-pro/clinical';

import type { StockVial } from './syringe';
import type { ProtocolRef } from './types';

/**
 * The cart: everything the player can do or reach for.
 *
 * It is the same in every scenario on purpose. A pad that only offered the
 * buttons a scenario needs would hand the player the diagnosis; the real
 * cart does not rearrange itself around the emergency, so neither does this
 * one. Scenarios decide what an action *does*, never whether it is offered.
 *
 * Labels say what the thing is and nothing about how to use it: no dose,
 * rate or technique. Those are the player's to supply.
 */

export type ActionGroup = 'team' | 'breathing' | 'airway' | 'position' | 'circulation';

export interface CartAction {
  readonly id: string;
  readonly group: ActionGroup;
  /** `toggle` stays on until tapped again; `instant` is done each time it is tapped. */
  readonly kind: 'toggle' | 'instant';
  readonly label: string;
  readonly detail?: string;
  /** Extra words the call-out box matches ("bag", "ambu"). */
  readonly aliases: ReadonlyArray<string>;
  /** Other toggles that switch off when this one switches on (positions). */
  readonly excludes?: ReadonlyArray<string>;
  /**
   * Where the protocols use this action's words. The label itself is a
   * phrase from one of them, so the cart speaks in the practice's own terms. Never shown to the player
   * (it would name the emergency); a test holds each one to the protocol text
   * so the cart cannot offer something the protocols do not say.
   */
  readonly from: ReadonlyArray<ProtocolRef>;
}

export const GROUP_LABELS: Readonly<Record<ActionGroup, string>> = {
  team: 'Team',
  breathing: 'Breathing',
  airway: 'Airway',
  position: 'Position',
  circulation: 'Circulation',
};

const POSITIONS = ['pos_flat_legs_up', 'pos_sit_up', 'pos_side'] as const;

export const CART_ACTIONS: ReadonlyArray<CartAction> = [
  {
    id: 'stop',
    group: 'team',
    kind: 'instant',
    label: 'Stop the procedure',
    aliases: ['stop', 'hands out', 'instruments out'],
    from: [
      { protocol: 'laryngospasm', step: 'Stop the procedure' },
      { protocol: 'bronchospasm', step: 'Stop the procedure' },
    ],
  },
  {
    id: 'call_911',
    group: 'team',
    kind: 'instant',
    label: 'Call 911',
    aliases: ['ems', 'ambulance', 'help', 'nine one one'],
    from: [
      { protocol: 'laryngospasm', step: 'Call 911' },
      { protocol: 'anaphylaxis', step: 'DA calls 911' },
    ],
  },
  {
    id: 'o2',
    group: 'breathing',
    kind: 'toggle',
    label: 'N₂O off, 100% O₂',
    aliases: ['oxygen', 'nitrous off', 'n2o off', 'o2', '100%'],
    from: [
      { protocol: 'hypoventilation', step: 'Turn off N₂O, 100% O₂' },
      { protocol: 'oversedation_opioid', step: 'N₂O off, 100% O₂' },
      { protocol: 'anaphylaxis', step: 'O₂ to >94%' },
    ],
  },
  {
    id: 'stimulate',
    group: 'breathing',
    kind: 'instant',
    label: 'Stimulate',
    aliases: ['wake', 'shake', 'sternal rub', 'call his name', 'call her name'],
    from: [
      { protocol: 'hypoventilation', step: 'Stimulate: say their name loudly' },
      { protocol: 'oversedation_opioid', step: 'Stimulate: call their name, rub the sternum' },
    ],
  },
  {
    id: 'bvm',
    group: 'breathing',
    kind: 'toggle',
    label: 'BVM',
    aliases: ['bag', 'bag valve mask', 'ambu', 'ventilate', 'bag him', 'bag her', 'breathe for'],
    from: [
      { protocol: 'hypoventilation', step: 'BVM, 1 breath every 6 seconds' },
      { protocol: 'oversedation_opioid', step: 'BVM if breathing slow or SpO₂ falling' },
      { protocol: 'laryngospasm', step: 'ventilate with the BVM until breathing on their own' },
    ],
  },
  {
    id: 'cpap',
    group: 'breathing',
    kind: 'toggle',
    label: 'Tight mask seal',
    aliases: ['cpap', 'mask seal', 'positive pressure', 'hold pressure'],
    from: [{ protocol: 'laryngospasm', step: 'steady gentle pressure (CPAP)' }],
  },
  {
    id: 'jaw_thrust',
    group: 'airway',
    kind: 'toggle',
    label: 'Jaw thrust',
    aliases: ['chin lift', 'open the airway', 'jaw'],
    from: [
      { protocol: 'hypoventilation', step: 'Jaw thrust or chin lift' },
      { protocol: 'oversedation_opioid', step: 'Jaw thrust' },
      { protocol: 'laryngospasm', step: 'Jaw thrust plus firm pressure' },
    ],
  },
  {
    id: 'suction',
    group: 'airway',
    kind: 'instant',
    label: 'Suction',
    aliases: ['yankauer', 'remove packs', 'gauze out', 'clear the throat'],
    from: [
      { protocol: 'laryngospasm', step: 'Remove packs and gauze, suction the throat' },
      { protocol: 'hypoventilation', step: 'suction' },
    ],
  },
  {
    id: 'larson',
    group: 'airway',
    kind: 'toggle',
    label: 'Pressure at the laryngospasm notch',
    aliases: ['larson', 'larsons', "larson's point", 'notch', 'behind the earlobe'],
    from: [{ protocol: 'laryngospasm', step: 'firm pressure at the laryngospasm notch' }],
  },
  {
    id: 'oral_airway',
    group: 'airway',
    kind: 'toggle',
    label: 'Oral airway or NPA',
    aliases: ['opa', 'npa', 'nasal airway', 'guedel'],
    from: [{ protocol: 'hypoventilation', step: 'oral airway or NPA' }],
  },
  {
    id: 'pos_flat_legs_up',
    group: 'position',
    kind: 'toggle',
    label: 'Lie flat, legs up',
    aliases: ['supine', 'trendelenburg', 'legs up', 'lay flat'],
    excludes: POSITIONS.filter((p) => p !== 'pos_flat_legs_up'),
    from: [{ protocol: 'anaphylaxis', step: 'Lie flat, legs up' }],
  },
  {
    id: 'pos_sit_up',
    group: 'position',
    kind: 'toggle',
    label: 'Sit up',
    aliases: ['upright', 'sit him up', 'sit her up'],
    excludes: POSITIONS.filter((p) => p !== 'pos_sit_up'),
    from: [{ protocol: 'anaphylaxis', step: 'sit up if breathing hard' }],
  },
  {
    id: 'pos_side',
    group: 'position',
    kind: 'toggle',
    label: 'Turn to the side, head down',
    aliases: ['recovery position', 'turn', 'lateral'],
    excludes: POSITIONS.filter((p) => p !== 'pos_side'),
    from: [{ protocol: 'emesis_aspiration', step: 'Turn to the side, head down' }],
  },
  {
    id: 'saline',
    group: 'circulation',
    kind: 'instant',
    label: 'Saline bolus',
    aliases: ['fluids', 'bolus', 'normal saline', 'ns', 'fluid'],
    from: [{ protocol: 'anaphylaxis', step: '500 ml saline bolus, wide open' }],
  },
];

/** A single-use or metered item that is given without drawing anything up. */
export interface CartDevice {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly aliases: ReadonlyArray<string>;
  /** How many are on the cart. `null` = not counted (an inhaler). */
  readonly stock: number | null;
  readonly drugKey: string;
  readonly drugName: string;
  /** Mass delivered each time it is used (per puff for the inhaler). */
  readonly mcg: number;
  /** Set when the player chooses a count: the most puffs offered. */
  readonly maxUnits?: number;
  readonly route: 'IM' | 'inhaled';
  readonly tint: string;
  readonly from: ReadonlyArray<ProtocolRef>;
}

const EPI_TINT = 'var(--color-purple)';

export const CART_DEVICES: ReadonlyArray<CartDevice> = [
  {
    id: 'auviq_adult',
    label: 'Auvi-Q 0.3 mg',
    detail: 'Adult auto-injector',
    aliases: ['epipen', 'pen', 'auto-injector', 'autoinjector', 'auvi q', 'epinephrine pen'],
    stock: 1,
    drugKey: 'epinephrine',
    drugName: 'Epinephrine',
    mcg: 300,
    route: 'IM',
    tint: EPI_TINT,
    from: [{ protocol: 'anaphylaxis', step: 'Auvi-Q 0.3 first' }],
  },
  {
    // Not an Auvi-Q on the practice's cart, so it is not named or handled as one.
    id: 'pen_peds',
    label: 'Epinephrine auto-injector 0.15 mg',
    detail: 'Pediatric',
    aliases: ['pediatric pen', 'kid pen', 'junior', 'child pen'],
    stock: 1,
    drugKey: 'epinephrine',
    drugName: 'Epinephrine',
    mcg: 150,
    route: 'IM',
    tint: EPI_TINT,
    // The pediatric pen is on the cart but in no adult protocol, which is the point of offering it.
    from: [],
  },
  {
    id: 'albuterol',
    label: 'Albuterol inhaler',
    detail: 'With the spacer',
    aliases: ['puffer', 'inhaler', 'ventolin', 'salbutamol', 'proair'],
    stock: null,
    drugKey: 'albuterol',
    drugName: 'Albuterol',
    // Per puff. The player chooses how many.
    mcg: 90,
    maxUnits: 8,
    route: 'inhaled',
    tint: 'var(--color-slate)',
    from: [{ protocol: 'anaphylaxis', step: 'Albuterol (if wheezing)' }],
  },
];

export interface CartVial extends StockVial {
  readonly aliases: ReadonlyArray<string>;
  /** Protocol callout names this vial is drawn for. A test checks the concentrations agree. */
  readonly callouts: ReadonlyArray<string>;
}

const NEUTRAL_TINT = 'var(--color-slate)';

/** Tray drugs take their concentration and tape colour from the formulary, so the two cannot drift. */
function fromFormulary(
  id: string,
  key: string,
  name: string,
  presentation: string,
  callouts: ReadonlyArray<string>,
  aliases: ReadonlyArray<string>,
): CartVial {
  const drug = DEFAULT_FORMULARY.iv.find((d) => d.id === id);
  if (drug === undefined) throw new Error(`Formulary has no IV drug "${id}"`);
  const perMl = drug.concentration.unit.startsWith('mcg')
    ? drug.concentration.value
    : drug.concentration.value * 1_000;
  return {
    key,
    name,
    presentation,
    mcgPerMl: perMl,
    tint: drug.color ?? NEUTRAL_TINT,
    callouts,
    aliases,
  };
}

function vial(
  key: string,
  name: string,
  presentation: string,
  mcgPerMl: number,
  callouts: ReadonlyArray<string>,
  aliases: ReadonlyArray<string> = [],
  tint: string = NEUTRAL_TINT,
): CartVial {
  return { key, name, presentation, mcgPerMl, tint, callouts, aliases };
}

/** Alphabetical, the way the drawer is scanned. */
export const CART_VIALS: ReadonlyArray<CartVial> = [
  vial('adenosine', 'Adenosine', '3 mg/ml · 2 ml vial', 3_000, ['Adenosine'], ['adenocard']),
  vial('amiodarone', 'Amiodarone', '50 mg/ml · 3 ml vial', 50_000, ['Amiodarone'], ['cordarone']),
  vial('atropine', 'Atropine', '1 mg/ml · 1 ml vial', 1_000, ['Atropine']),
  vial(
    'dexamethasone',
    'Dexamethasone',
    '4 mg/ml vial',
    4_000,
    ['Dexamethasone'],
    ['decadron', 'steroid'],
  ),
  vial(
    'diphenhydramine',
    'Diphenhydramine',
    '50 mg/ml · 1 ml vial',
    50_000,
    ['Diphenhydramine'],
    ['benadryl', 'antihistamine'],
  ),
  vial('ephedrine', 'Ephedrine', '50 mg/ml · 1 ml vial', 50_000, ['Ephedrine']),
  vial(
    'epinephrine',
    'Epinephrine',
    '1 mg/ml · 1 ml ampule',
    1_000,
    ['Epinephrine', 'Push-dose Epinephrine'],
    ['epi', 'adrenaline', 'ampule', 'adrenalin'],
    EPI_TINT,
  ),
  fromFormulary('fentanyl', 'fentanyl', 'Fentanyl', '50 mcg/ml', ['Fentanyl'], []),
  fromFormulary(
    'flumazenil',
    'flumazenil',
    'Flumazenil',
    '0.1 mg/ml · 5 ml vial',
    ['Flumazenil'],
    ['romazicon', 'reversal'],
  ),
  vial('hydralazine', 'Hydralazine', '20 mg/ml · 1 ml vial', 20_000, ['Hydralazine']),
  vial('labetalol', 'Labetalol', '5 mg/ml vial', 5_000, ['Labetalol']),
  vial('lidocaine', 'Lidocaine 2% (cardiac)', '20 mg/ml · 5 ml vial', 20_000, [
    'Cardiac Lidocaine',
  ]),
  fromFormulary('versed', 'midazolam', 'Midazolam', '5 mg/ml', ['Midazolam'], ['versed']),
  fromFormulary(
    'naloxone',
    'naloxone',
    'Naloxone',
    '0.4 mg/ml · 1 ml vial',
    ['Naloxone'],
    ['narcan', 'reversal'],
  ),
  fromFormulary(
    'zofran',
    'ondansetron',
    'Ondansetron',
    '2 mg/ml · 2 ml vial',
    ['Ondansetron'],
    ['zofran'],
  ),
  vial(
    'phenylephrine',
    'Phenylephrine',
    '10 mg/ml · 1 ml vial',
    10_000,
    ['Phenylephrine'],
    ['neo', 'neosynephrine'],
  ),
  vial(
    'solumedrol',
    'Solu-Medrol',
    '125 mg Act-O-Vial · 62.5 mg/ml',
    62_500,
    ['Methylprednisolone (Solu-Medrol)'],
    ['methylprednisolone', 'steroid', 'act-o-vial'],
  ),
  vial(
    'succinylcholine',
    'Succinylcholine',
    '20 mg/ml · 10 ml vial, in the fridge',
    20_000,
    ['Succinylcholine'],
    ['sux', 'succs', 'anectine', 'paralytic'],
  ),
];

export function findVial(key: string): CartVial | undefined {
  return CART_VIALS.find((v) => v.key === key);
}

export function findDevice(id: string): CartDevice | undefined {
  return CART_DEVICES.find((d) => d.id === id);
}

export function findAction(id: string): CartAction | undefined {
  return CART_ACTIONS.find((a) => a.id === id);
}

/** The vial a protocol callout is drawn from, by the callout's own name. */
export function vialForCallout(calloutName: string): CartVial | undefined {
  return CART_VIALS.find((v) => v.callouts.includes(calloutName));
}

export type CartEntry =
  | {
      readonly kind: 'action';
      readonly id: string;
      readonly label: string;
      readonly detail: string;
    }
  | {
      readonly kind: 'device';
      readonly id: string;
      readonly label: string;
      readonly detail: string;
    }
  | { readonly kind: 'vial'; readonly id: string; readonly label: string; readonly detail: string };

interface Searchable {
  readonly entry: CartEntry;
  /** Every way of saying it, the label's own spellings first. */
  readonly words: ReadonlyArray<{ readonly phrase: string; readonly isLabel: boolean }>;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/₂/g, '2')
    .replace(/[^a-z0-9% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A hyphenated name is also findable typed as one word: "auviq" for Auvi-Q,
 * "solumedrol" for Solu-Medrol.
 */
function spellings(text: string): string[] {
  const joined = text.replace(/-/g, '');
  return joined === text ? [normalize(text)] : [normalize(text), normalize(joined)];
}

function words(label: string, others: ReadonlyArray<string>): Searchable['words'] {
  return [
    ...spellings(label).map((phrase) => ({ phrase, isLabel: true })),
    ...others.flatMap(spellings).map((phrase) => ({ phrase, isLabel: false })),
  ];
}

const SEARCH_INDEX: ReadonlyArray<Searchable> = [
  ...CART_ACTIONS.map((a) => ({
    entry: { kind: 'action' as const, id: a.id, label: a.label, detail: a.detail ?? '' },
    words: words(a.label, a.aliases),
  })),
  ...CART_DEVICES.map((d) => ({
    entry: { kind: 'device' as const, id: d.id, label: d.label, detail: d.detail },
    words: words(d.label, [d.drugName, ...d.aliases]),
  })),
  ...CART_VIALS.map((v) => ({
    entry: { kind: 'vial' as const, id: v.key, label: v.name, detail: v.presentation },
    words: words(v.name, v.aliases),
  })),
];

/**
 * The call-out box: type what you would say in the room.
 *
 * Every word typed must start a word of the entry ("jaw" finds Jaw thrust,
 * "bag" finds BVM through its alias). A match on the label ranks above a
 * match on an alias, and an entry whose name starts with the query ranks
 * first, so "epi" offers the Auvi-Q and the ampule, not ephedrine.
 */
export function searchCart(query: string, limit = 6): ReadonlyArray<CartEntry> {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [];
  const scored: Array<{ entry: CartEntry; score: number }> = [];
  for (const item of SEARCH_INDEX) {
    let best = 0;
    for (const { phrase, isLabel } of item.words) {
      const tokens = phrase.split(' ');
      const all = terms.every((term) => tokens.some((tok) => tok.startsWith(term)));
      if (!all) continue;
      const prefix = phrase.startsWith(terms.join(' '));
      best = Math.max(best, (isLabel ? 2 : 1) + (prefix ? 2 : 0));
    }
    if (best > 0) scored.push({ entry: item.entry, score: best });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
    .slice(0, limit)
    .map((s) => s.entry);
}
