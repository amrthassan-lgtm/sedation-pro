import { parseConcentrationMcgPerMl } from '@/engine/dose';
import { calloutAt, doseRangeOf } from '@/engine/protocol';
import type { Capno, Ctx, DoseEvent, Ending, Phase, PlayerEvent, Transition } from '@/engine/types';

import { reachedAt, toward } from './helpers';

/**
 * What every scenario does with the same vial. The cart is the same in
 * every room, and a drug acts on the patient, not on the reason it was
 * given: stock epinephrine in a vein is the same mistake in any emergency.
 * The thresholds are read from the protocols; the rates are pacing.
 */

const EPI_PEN = calloutAt('anaphylaxis', 'Auvi-Q 0.3 first');
const EPI_AMPULE = calloutAt('anaphylaxis', 'second IM dose from the ampule');
const SUCCINYLCHOLINE = calloutAt('laryngospasm', 'Succinylcholine IV');

const STOCK_EPI_MCG_PER_ML = (() => {
  const stock = parseConcentrationMcgPerMl(EPI_AMPULE.concentration);
  if (stock === null)
    throw new Error('The epinephrine ampule callout no longer states its strength');
  return stock;
})();
/** The thigh dose. In a vein it is an overdose at any dilution. */
const EPI_IM_DOSE_MCG = doseRangeOf(EPI_PEN).minMcg;

/** The protocol's own warning, quoted so a debrief can mark it on the step it sits in. */
export const NEVER_STOCK_EPI_IV = 'NEVER 1 mg/ml IV in a patient with a pulse';

/** Stock-strength epinephrine, or a whole thigh dose, pushed into the vein. */
export function epinephrineIntoVein(ctx: Ctx): DoseEvent | undefined {
  return ctx
    .given('epinephrine')
    .find(
      (d) =>
        d.route === 'IV' &&
        (d.mcgPerMl >= STOCK_EPI_MCG_PER_ML * 0.99 || d.mcg >= EPI_IM_DOSE_MCG * 0.99),
    );
}

/** A consequence a scenario wires in whole: the transition in `always`, the phase and the ending under `key`. */
export interface Consequence {
  readonly key: string;
  readonly transition: Transition;
  readonly phase: Phase;
  readonly ending: Ending;
}

/** `capno` is the trace the patient already had: the drug does not change his airway. */
export function epinephrineOverdose(capno: Capno): Consequence {
  return {
    key: 'overdose',
    transition: {
      when: (ctx) => epinephrineIntoVein(ctx) !== undefined && ctx.phase !== 'overdose',
      to: 'overdose',
      beat: {
        scene:
          'His heart rate leaps. He arches in the chair, clutching his chest, and the trace on the monitor turns wide and fast.',
        voice: { who: 'DA', line: 'Look at his heart rate!' },
        log: 'Epinephrine pushed into the vein',
        tone: 'bad',
      },
    },
    phase: {
      drive: () => ({
        spo2Rate: -0.05,
        hr: toward(178, 12),
        sbp: toward(236, 14),
        dbp: toward(132, 8),
        rr: 30,
        etco2: toward(34, 0.5),
        capno,
        airway: 'open',
        rhythm: 'vtach',
        look: { color: 'pale', eyes: 'open', note: 'clutching his chest' },
      }),
      transitions: [{ when: (ctx) => ctx.phaseT >= 12, to: 'end:overdose' }],
    },
    ending: {
      outcome: 'harm',
      title: 'Ventricular tachycardia',
      text: 'Epinephrine went into the vein at a dose meant for the thigh. He has a dangerous rhythm and crushing chest pain. The run stops here.',
    },
  };
}

const SUX_PARALYSES_AT_MCG = doseRangeOf(SUCCINYLCHOLINE).minMcg;
const SUX_IV_ONSET = 18;
const SUX_IM_ONSET = 170;

function paralysedAt(ctx: Ctx): number | null {
  const doses = ctx.given('succinylcholine');
  const iv = reachedAt(doses, SUX_PARALYSES_AT_MCG, (d) => d.route === 'IV');
  const any = reachedAt(doses, SUX_PARALYSES_AT_MCG);
  if (iv !== null) return iv + SUX_IV_ONSET;
  return any === null ? null : any + SUX_IM_ONSET;
}

/**
 * For a scenario with no paralysis of its own: succinylcholine given to a
 * patient who was breathing stops the breathing, and the run with it.
 */
export function wrongParalytic(capno: Capno): Consequence {
  return {
    key: 'paralysed',
    transition: {
      when: (ctx) => {
        const at = paralysedAt(ctx);
        return at !== null && ctx.t >= at && ctx.phase !== 'paralysed';
      },
      to: 'paralysed',
      beat: {
        scene:
          'A fine flicker runs under his skin, then he goes completely still. His eyes are open. He is not breathing at all.',
        voice: { who: 'DA', line: 'He’s stopped breathing completely!' },
        log: 'Paralysed by succinylcholine',
        tone: 'bad',
      },
    },
    phase: {
      drive: (ctx) => ({
        spo2Rate: ctx.on('bvm') ? -0.1 : -0.75,
        hr: toward(138, 2),
        sbp: toward(60, 0.4),
        dbp: toward(36, 0.3),
        rr: 0,
        etco2: ctx.on('bvm') ? toward(44, 2) : null,
        capno,
        airway: 'open',
        look: { color: 'grey', eyes: 'open', note: 'paralysed, not breathing' },
      }),
      transitions: [{ when: (ctx) => ctx.phaseT >= 12, to: 'end:paralysed' }],
    },
    ending: {
      outcome: 'harm',
      title: 'Paralysed',
      text: 'Succinylcholine has paralysed him: he is awake and cannot breathe. The run stops here.',
    },
  };
}

/** "Naloxone 1.0 ml IV", with a note when the syringe carried no label. */
export function doseLine(dose: DoseEvent): string {
  return `${dose.drugName} ${dose.ml.toFixed(1)} ml ${dose.route}${dose.labeled ? '' : ' (unlabeled)'}`;
}

export function doseOf(event: PlayerEvent): DoseEvent | null {
  return event.kind === 'dose' ? event.dose : null;
}
