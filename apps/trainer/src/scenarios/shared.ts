import { parseConcentrationMcgPerMl } from '@/engine/dose';
import { calloutAt, doseRangeOf, gaveProtocolDose } from '@/engine/protocol';
import type {
  Capno,
  Ctx,
  DoseEvent,
  Ending,
  Phase,
  PlayerEvent,
  Target,
  TimeCut,
  Transition,
} from '@/engine/types';

import { reachedAt, toward } from './helpers';

/**
 * What every scenario does with the same vial. The cart is the same in
 * every room, and a drug acts on the patient, not on the reason it was
 * given: stock epinephrine in a vein is the same mistake in any emergency.
 * The thresholds are read from the protocols; the rates are pacing.
 */

const EPI_PEN = calloutAt('anaphylaxis', 'Auvi-Q 0.3 first');
const EPI_AMPULE = calloutAt('anaphylaxis', 'second IM dose from the ampule');
/** The cart's one paralytic, as the Laryngospasm page writes it. */
export const SUCCINYLCHOLINE = calloutAt('laryngospasm', 'Succinylcholine IV');

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

/** How he was not breathing when a drug went in: the cords shut, or paralysed. */
export type Apnoea = 'shut' | 'paralysed';

/**
 * `capno` is the trace the patient already had: the drug does not change his
 * airway. A scenario where he may not be breathing at all says so through
 * `apnoea`, and the drug does not start him breathing either.
 */
export function epinephrineOverdose(
  capno: Capno,
  apnoea: (ctx: Ctx) => Apnoea | null = () => null,
): Consequence {
  return {
    key: 'overdose',
    transition: {
      when: (ctx) => epinephrineIntoVein(ctx) !== undefined && ctx.phase !== 'overdose',
      to: 'overdose',
      beat: (ctx) => {
        const state = apnoea(ctx);
        return {
          scene:
            state === null
              ? 'His heart rate leaps. He arches in the chair, clutching his chest, and the trace on the monitor turns wide and fast.'
              : 'His heart rate leaps, and the trace on the monitor turns wide and fast.',
          voice: { who: 'DA', line: 'Look at his heart rate!' },
          log: 'Epinephrine pushed into the vein',
          tone: 'bad',
          flags: state === null ? [] : [`overdose_${state}`],
        };
      },
    },
    phase: {
      drive: (ctx) => {
        const shut = ctx.has('overdose_shut');
        const paralysed = ctx.has('overdose_paralysed');
        const bagged = paralysed && ctx.on('bvm');
        const breathing = !shut && !paralysed;
        return {
          spo2Rate: breathing ? -0.05 : bagged ? 0.3 : -0.5,
          hr: toward(178, 12),
          sbp: toward(236, 14),
          dbp: toward(132, 8),
          rr: breathing ? 30 : 0,
          etco2: breathing ? toward(34, 0.5) : bagged ? toward(40, 3) : null,
          capno,
          airway: shut ? 'closed' : 'open',
          rhythm: 'vtach',
          look: breathing
            ? { color: 'pale', eyes: 'open', note: 'clutching his chest' }
            : {
                color: 'grey',
                eyes: shut ? 'open' : 'closed',
                note: shut ? 'chest heaving, no sound' : 'paralysed, not breathing',
              },
        };
      },
      transitions: [{ when: (ctx) => ctx.phaseT >= 12, to: 'end:overdose' }],
    },
    ending: {
      outcome: 'harm',
      title: 'Ventricular tachycardia',
      text: 'Epinephrine went into the vein, and his heart is in a dangerous rhythm. The run stops here.',
    },
  };
}

const SUX_PARALYSES_AT_MCG = doseRangeOf(SUCCINYLCHOLINE).minMcg;
const SUX_IV_ONSET = 18;
const SUX_IM_ONSET = 170;

/**
 * When these doses paralyse him, or `null` if they are not enough. Into the
 * vein it takes seconds once the IV total reaches the protocol's dose; with
 * any of that total in the muscle it takes minutes. Whichever comes first.
 */
function paralysisAt(doses: ReadonlyArray<DoseEvent>): number | null {
  const iv = reachedAt(doses, SUX_PARALYSES_AT_MCG, (d) => d.route === 'IV');
  const any = reachedAt(doses, SUX_PARALYSES_AT_MCG);
  if (any === null) return null;
  return Math.min(iv === null ? Infinity : iv + SUX_IV_ONSET, any + SUX_IM_ONSET);
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
        const at = paralysisAt(ctx.given('succinylcholine'));
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

/**
 * Every succinylcholine dose in him so far, as flags. A beat that starts or
 * ends a paralysis sets them: whatever was in him then belonged to that
 * paralysis, and is never counted toward another.
 */
export function succinylcholineSoFar(ctx: Ctx): string[] {
  return ctx.given('succinylcholine').map((_, i) => `sux_${i}`);
}

/**
 * For a scenario with a paralysis of its own, where he can be paralysed more
 * than once: succinylcholine paralyses whenever enough of it is in, spasm or
 * not. Only doses no paralysis has used yet add up. The beat that paralyses
 * him sets `flags`.
 */
export function pendingParalysis(
  ctx: Ctx,
): { readonly at: number; readonly flags: string[] } | null {
  const fresh = ctx.given('succinylcholine').filter((_, i) => !ctx.has(`sux_${i}`));
  const at = paralysisAt(fresh);
  return at === null ? null : { at, flags: succinylcholineSoFar(ctx) };
}

/** "Succinylcholine IV": the protocol's dose, with every push of it by the protocol's route. */
export function succinylcholineAsWritten(doses: ReadonlyArray<DoseEvent>): boolean {
  return (
    doses.every((d) => d.route === SUCCINYLCHOLINE.route) &&
    gaveProtocolDose(SUCCINYLCHOLINE, doses)
  );
}

/** Deep hypoxia slows the heart, late: the reason atropine is kept ready. */
export function hypoxicHeartRate(ctx: Ctx, otherwise: number): Target {
  const spo2 = ctx.vitals.spo2;
  return spo2 < 70 ? toward(40, 1.5) : spo2 < 80 ? toward(48, 1) : toward(otherwise, 2);
}

/** Bagging has to be going this long, with a safe saturation, before the story skips ahead. */
const BAGGING_BEFORE_CUT = 15;

/** The team is breathing for him and it is working: nothing left to do but keep going. */
export function baggedThroughParalysis(ctx: Ctx): boolean {
  const bagging = ctx.last('bvm');
  return (
    ctx.on('bvm') &&
    bagging !== null &&
    // From this paralysis, not an earlier one in the run.
    ctx.t - Math.max(bagging, ctx.t - ctx.phaseT) >= BAGGING_BEFORE_CUT &&
    ctx.vitals.spo2 >= 92
  );
}

/**
 * "ventilate with the BVM until breathing on their own", for the two drills
 * with a paralysis of their own (phases `paralyzed` and `breathing`). `null`
 * in a run with no paralysis, or one cut short by the epinephrine consequence
 * while the bag was still on.
 */
export function baggedUntilBreathing(run: Ctx): boolean | null {
  if (run.entered('paralyzed') === null) return null;
  if (!run.onDuring('bvm', 'paralyzed')) return false;
  // The run ended inside a paralysis: he never breathed on his own again.
  if (run.phase === 'paralyzed') return false;
  if (run.entered('breathing') !== null) return true;
  return run.phase === 'overdose' && run.on('bvm') ? null : false;
}

/** Breathing well for long enough to close the story, with no dose in him still on its way to working. */
export function breathingWell(ctx: Ctx, seconds: number): boolean {
  return ctx.phaseT >= seconds && ctx.vitals.spo2 >= 95 && pendingParalysis(ctx) === null;
}

/**
 * The paralysis itself, skipped with a card. The card says what the protocol
 * says to do through it, and puts no length on the drug.
 */
export const PARALYSIS_CUT: TimeCut = {
  seconds: 4 * 60,
  title: 'Bagging until he breathes on his own',
};

/** "Naloxone 1.0 ml IV", with a note when the syringe carried no label. */
export function doseLine(dose: DoseEvent): string {
  return `${dose.drugName} ${dose.ml.toFixed(1)} ml ${dose.route}${dose.labeled ? '' : ' (unlabeled)'}`;
}

export function doseOf(event: PlayerEvent): DoseEvent | null {
  return event.kind === 'dose' ? event.dose : null;
}
