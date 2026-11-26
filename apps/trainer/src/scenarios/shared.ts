import { TUBES } from '@/engine/catalog';
import { parseConcentrationMcgPerMl } from '@/engine/dose';
import { calloutAt, doseRangeOf, gaveProtocolDose, phraseInStep } from '@/engine/protocol';
import type {
  Beat,
  Capno,
  Ctx,
  DoseEvent,
  Drive,
  Ending,
  Phase,
  PlayerEvent,
  Prompt,
  Reaction,
  Target,
  TimeCut,
  Tone,
  Transition,
} from '@/engine/types';

import { reachedAt, toward } from './helpers';

/**
 * What every scenario does with the same vial. The cart is the same in
 * every room, and a drug acts on the patient, not on the reason it was
 * given: stock epinephrine in a vein is the same mistake in any emergency.
 * The thresholds are read from the protocols; the rates are pacing.
 *
 * The ambulance is here for the same reason: once it is called it arrives on
 * the same clock in every room, whatever state the story is in.
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

/**
 * The mask held against a spasm, in the Laryngospasm step's own words. The
 * BVM page draws how one or two people hold a mask; a scene that described a
 * grip of its own would teach a third.
 */
export const MASK_HELD = `${phraseInStep('laryngospasm', 'Tight mask seal', 'Tight mask seal')}, ${phraseInStep(
  'laryngospasm',
  'Tight mask seal',
  'steady gentle pressure',
)} on the bag.`;

/**
 * Since when a breath from the bag could go in, or `null` while it cannot.
 * The time lets a story ask how long air has been going in, not only whether.
 */
export type WayIn = (ctx: Ctx) => number | null;

/**
 * What the cart has for the BVM page's "Open the airway": Jaw thrust held or
 * the NPA in, and further down the same page, an LMA or a King in.
 */
const AIRWAY_OPENERS = ['jaw_thrust', 'npa', ...TUBES] as const;

/**
 * The BVM page opens the airway before it gives a breath: "head tilt and chin
 * lift, or jaw thrust. Snoring, or still blocked: NPA". The way in for a drill
 * with nothing in his mouth.
 */
export const airwayOpenedSince: WayIn = (ctx) => {
  const held = AIRWAY_OPENERS.filter((id) => ctx.on(id)).map((id) => ctx.last(id) ?? ctx.t);
  return held.length > 0 ? Math.min(...held) : null;
};

export function airwayOpened(ctx: Ctx): boolean {
  return airwayOpenedSince(ctx) !== null;
}

/**
 * Air from the bag is going in: someone is squeezing it and it has a way in.
 * A bag squeezed without one does nothing for him, and he goes on as if
 * nobody were bagging.
 */
export function bagMovesAir(ctx: Ctx, wayIn: WayIn = airwayOpenedSince): boolean {
  return ctx.on('bvm') && wayIn(ctx) !== null;
}

/** The sign of a breath that did not go in, in the BVM page's own words. */
const CHEST_NOT_RISING = phraseInStep(
  'bvm',
  'Chest not rising or bag hard to squeeze',
  'Chest not rising',
);

/*
 * What the assistant last said of the chest is kept as two things the story
 * counts as done, so `ctx.last` can say which came last. Neither is on the cart.
 */
const SAID_RISING = 'said:chest_rising';
const SAID_NOT_RISING = 'said:chest_not_rising';

/** For a beat that has itself just said air is going in: the chest is not spoken of again. */
export const AIR_SEEN_GOING_IN: ReadonlyArray<string> = [SAID_RISING];

/** What the assistant says of the chest under the bag. It names the sign and nothing to do about it. */
export function chestLine(rising: boolean): Beat {
  return rising
    ? {
        voice: { who: 'DA', line: 'Bagging. His chest is rising.' },
        log: 'BVM: chest rising',
        tone: 'good',
        counts: [SAID_RISING],
      }
    : {
        voice: { who: 'DA', line: `${CHEST_NOT_RISING}.` },
        log: `BVM: ${CHEST_NOT_RISING.toLowerCase()}`,
        tone: 'bad',
        counts: [SAID_NOT_RISING],
      };
}

/** A line the story has just said is left this long before the chest is spoken of. Pacing. */
const HEARD_FOR = 4;
/** Clock noise: the app's ticks are not round numbers. */
const SAME_MOMENT = 1e-6;

/**
 * What whoever has the bag now was last told of the chest, and whether that
 * was in this stretch of the story. A chest that is rising is said once for
 * as long as the bag stays in use; one that is not rising is said again when
 * the story moves on, because it is still what is wrong.
 */
function chestSaid(ctx: Ctx): { readonly rising: boolean | null; readonly here: boolean } {
  const bagOn = ctx.last('bvm') ?? Infinity;
  const phaseStart = ctx.t - ctx.phaseT;
  const since = (action: string, from: number): number => {
    const at = ctx.last(action);
    return at !== null && at >= from - SAME_MOMENT ? at : -Infinity;
  };
  const up = since(SAID_RISING, bagOn);
  const down = since(SAID_NOT_RISING, Math.max(bagOn, phaseStart));
  return {
    rising: up === down ? null : up > down,
    here: Math.max(up, down) >= phaseStart - SAME_MOMENT,
  };
}

const ventilatedIn = (phase: string): string => `ventilated:${phase}`;

/** Did air from the bag go in at any moment of that phase? Kept by `bagNeedsWayIn`. */
export function ventilatedDuring(run: Ctx, phase: string): boolean {
  return run.has(ventilatedIn(phase));
}

/**
 * A drill's phases with the bag held to the BVM page. In every phase the
 * monitor shows "bagged" only while a breath has a way in. In the phases
 * named in `breathesForHim`, where the bag is what moves his chest, the
 * assistant says when the chest stops or starts rising under a bag already
 * going, and the run remembers that air went in, for the grader.
 */
export function bagNeedsWayIn(
  phases: Readonly<Record<string, Phase>>,
  breathesForHim: ReadonlyArray<string>,
  wayIn: WayIn = airwayOpenedSince,
  takesTube: (ctx: Ctx) => boolean = paralysedNow,
): Record<string, Phase> {
  // A tube that went in while he could take one comes out once he no longer can.
  const tubeOut: Transition = {
    when: (ctx) => TUBES.some((id) => ctx.on(id)) && !takesTube(ctx),
    to: 'stay',
    beat: (ctx) => ({ off: TUBES, log: `${ctx.on('lma') ? 'LMA' : 'King'} out` }),
  };
  const watch: ReadonlyArray<Transition> = [
    {
      when: (ctx) => {
        if (!ctx.on('bvm')) return false;
        const said = chestSaid(ctx);
        return said.rising !== (wayIn(ctx) !== null) && (said.here || ctx.phaseT >= HEARD_FOR);
      },
      to: 'stay',
      beat: (ctx) => chestLine(wayIn(ctx) !== null),
    },
    {
      when: (ctx) => bagMovesAir(ctx, wayIn) && !ventilatedDuring(ctx, ctx.phase),
      to: 'stay',
      beat: (ctx) => ({ flags: [ventilatedIn(ctx.phase)] }),
    },
  ];
  return Object.fromEntries(
    Object.entries(phases).map(([id, phase]) => [
      id,
      {
        ...phase,
        drive: (ctx: Ctx): Drive => {
          const drive = phase.drive(ctx);
          return wayIn(ctx) === null ? { ...drive, airway: 'closed' } : drive;
        },
        // After the phase's own: speaking of the chest never holds the story up.
        transitions: breathesForHim.includes(id)
          ? [...phase.transitions, tubeOut, ...watch]
          : [...phase.transitions, tubeOut],
      },
    ]),
  );
}

/** The protocol's own warning, quoted so a debrief can mark it on the step it sits in. */
export const NEVER_STOCK_EPI_IV = 'NEVER 1 mg/ml IV in a patient with a pulse';

/**
 * Stock-strength epinephrine, or a whole thigh dose, pushed into the vein.
 * `hadPulse` leaves out a push the arrest page writes: the warning is the
 * page's own "in a patient with a pulse".
 */
export function epinephrineIntoVein(
  ctx: Ctx,
  hadPulse: (dose: DoseEvent) => boolean = () => true,
): DoseEvent | undefined {
  return ctx
    .given('epinephrine')
    .find(
      (d) =>
        d.route === 'IV' &&
        hadPulse(d) &&
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

/** How he was not breathing when a drug went in: the cords shut, paralysed, or not yet awake after an arrest. */
export type Apnoea = 'shut' | 'paralysed' | 'unresponsive';

/**
 * `capno` is the trace the patient already had: the drug does not change his
 * airway. A scenario where he may not be breathing at all says so through
 * `apnoea`, and the drug does not start him breathing either. `ventilated` is
 * that scenario's own answer to whether a bag is breathing for him. `hadPulse`
 * is for the one room where he may have none: a push the arrest page writes
 * is not this mistake.
 */
export function epinephrineOverdose(
  capno: Capno,
  apnoea: (ctx: Ctx) => Apnoea | null = () => null,
  ventilated: (ctx: Ctx) => boolean = (ctx) => ctx.on('bvm'),
  hadPulse: (dose: DoseEvent) => boolean = () => true,
): Consequence {
  return {
    key: 'overdose',
    transition: {
      when: (ctx) => epinephrineIntoVein(ctx, hadPulse) !== undefined && ctx.phase !== 'overdose',
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
        const limp = paralysed || ctx.has('overdose_unresponsive');
        const bagged = limp && ventilated(ctx);
        const breathing = !shut && !limp;
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
                note: shut
                  ? 'chest heaving, no sound'
                  : paralysed
                    ? 'paralysed, not breathing'
                    : 'unresponsive, not breathing',
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
export function baggedThroughParalysis(ctx: Ctx, wayIn: WayIn = airwayOpenedSince): boolean {
  const bagging = ctx.last('bvm');
  const open = wayIn(ctx);
  return (
    bagMovesAir(ctx, wayIn) &&
    bagging !== null &&
    open !== null &&
    // Air going in, in this paralysis and not an earlier one in the run.
    ctx.t - Math.max(bagging, open, ctx.t - ctx.phaseT) >= BAGGING_BEFORE_CUT &&
    ctx.vitals.spo2 >= 92
  );
}

/** How far the story is about to jump over a paralysis the team is bagging him through. */
export function paralysisSkip(ctx: Ctx, wayIn: WayIn = airwayOpenedSince): number {
  return ctx.phase === 'paralyzed' && baggedThroughParalysis(ctx, wayIn)
    ? PARALYSIS_CUT.seconds
    : 0;
}

/**
 * "ventilate with the BVM until breathing on their own", for the two drills
 * with a paralysis of their own (phases `paralyzed` and `breathing`). `null`
 * in a run with no paralysis, or one cut short by the epinephrine consequence
 * while the bag was still moving air. A bag that never moved air in the
 * paralysis did not ventilate him, however long it was squeezed.
 */
export function baggedUntilBreathing(run: Ctx, wayIn: WayIn = airwayOpenedSince): boolean | null {
  if (run.entered('paralyzed') === null) return null;
  if (!ventilatedDuring(run, 'paralyzed')) return false;
  // The run ended inside a paralysis: he never breathed on his own again.
  // With EMS taking over a bag still in use, the step was cut short, not missed.
  if (run.phase === 'paralyzed') {
    return run.has(EMS_ON_SCENE) && bagMovesAir(run, wayIn) ? null : false;
  }
  if (run.entered('breathing') !== null) return true;
  return run.phase === 'overdose' && bagMovesAir(run, wayIn) ? null : false;
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

/** The front desk's estimate when the call is made: "About eight minutes." */
export const EMS_ARRIVES_AFTER = 8 * 60;

/** Set by the beat that brings EMS into the room. */
export const EMS_ON_SCENE = 'ems_on_scene';

export const EMS_AT_THE_DOOR = 'EMS is at the door with a stretcher.';

/** When the ambulance that was called reaches the door. `null` while nobody has called. */
export function emsDueAt(ctx: Ctx): number | null {
  const called = ctx.at('call_911');
  return called === null ? null : called + EMS_ARRIVES_AFTER;
}

/** One state of the story, and what EMS walking in on it leads to. */
export interface EmsFinds {
  when(ctx: Ctx): boolean;
  /** A phase id, or `end:<ending key>`. */
  readonly to: string;
  /** What is seen at the door, and anything EMS asks. The line, the log and the card are added. */
  beat(ctx: Ctx): Beat;
}

/**
 * An ambulance that was called arrives when the front desk said it would,
 * whatever the story is doing by then. `skips` is how far the story is about
 * to jump from here (a protocol wait, a paralysis, the quiet once he is
 * stable): a jump that would carry past the arrival stops at the door
 * instead, under the arrival's own card. Goes in `always`, after anything
 * that ends the run in harm.
 */
export function emsArrives(
  finds: ReadonlyArray<EmsFinds>,
  skips: (ctx: Ctx) => number = () => 0,
): Transition[] {
  return finds.map((found) => ({
    when: (ctx) => {
      const due = emsDueAt(ctx);
      return due !== null && found.when(ctx) && ctx.t + skips(ctx) >= due;
    },
    to: found.to,
    beat: (ctx) => {
      const wait = (emsDueAt(ctx) ?? ctx.t) - ctx.t;
      const seen = found.beat(ctx);
      return {
        voice: { who: 'EMS', line: 'What have we got?' },
        log: 'EMS on scene',
        ...seen,
        flags: [...(seen.flags ?? []), EMS_ON_SCENE],
        // In real time they simply walk in: a card is only for a wait the story skipped.
        ...(wait > 0 ? { cut: { seconds: wait, title: 'EMS arrives' } } : {}),
      };
    },
  }));
}

/** A state EMS takes him from as he is: the ending's key, and what is seen, as one sentence. */
export interface AsFound {
  readonly key: string;
  readonly seen: string;
  when(ctx: Ctx): boolean;
}

/**
 * EMS takes over a patient the team has not finished with. Nothing is asked
 * at the door, and the run ends as he is: the scene and the ending say the
 * same sentence, and it states only what is seen.
 */
export function takenAsFound(state: AsFound): EmsFinds {
  return {
    when: state.when,
    to: `end:${state.key}`,
    beat: () => ({ scene: `${EMS_AT_THE_DOOR} ${state.seen}` }),
  };
}

export function endingsAsFound(states: ReadonlyArray<AsFound>): Record<string, Ending> {
  return Object.fromEntries(
    states.map((state) => [
      state.key,
      {
        outcome: 'handover',
        title: 'Handed over to EMS',
        text: `He leaves with EMS. ${state.seen}`,
      },
    ]),
  );
}

/** What EMS can find in either drill with a spasm and a paralysis of its own. */
export const FOUND = {
  bagged: 'He is still being bagged.',
  noAir: 'His chest is heaving and no air is moving.',
  paralysed: 'He is paralysed and not breathing.',
  awake: 'He is awake and breathing.',
} as const;

/** More of what sedated him, given after the scene opens. */
export function moreSedative(ctx: Ctx): boolean {
  return ctx.given('fentanyl').length + ctx.given('midazolam').length > 0;
}

/** Pacing, as "Shallow" first had it: a falling saturation falls this much faster. */
const DEEPER = 1.6;

/**
 * What more sedative does to him in any room: he gets deeper, so his own
 * breathing slows and his saturation does worse than it would have. It
 * changes nothing while he is not breathing for himself at all, and the
 * saturation of a patient being bagged is the bag's.
 */
export function deepened(ctx: Ctx, drive: Drive): Drive {
  if (!moreSedative(ctx) || drive.rr === 0) return drive;
  const bagged = ctx.on('bvm') && drive.airway === 'open';
  const { spo2Rate } = drive;
  return {
    ...drive,
    rr: Math.round(drive.rr / 2),
    spo2Rate: bagged ? spo2Rate : spo2Rate < 0 ? spo2Rate * DEEPER : spo2Rate / DEEPER,
  };
}

/** A drill's phases, each with the sedative's effect laid over its own drive. */
export function sedatable(phases: Readonly<Record<string, Phase>>): Record<string, Phase> {
  return Object.fromEntries(
    Object.entries(phases).map(([id, phase]) => [
      id,
      { ...phase, drive: (ctx: Ctx) => deepened(ctx, phase.drive(ctx)) },
    ]),
  );
}

/**
 * The assistant's remark when a sedative goes in. `briefed` is the briefing's
 * own "Given:" line: she says "more" only of a drug he has had, there or
 * earlier in the run.
 */
export function sedativeGiven(briefed: string, tone: Tone = 'neutral'): Reaction {
  return (ctx, e) => {
    const dose = doseOf(e);
    if (!dose) return undefined;
    const name = dose.drugName.toLowerCase();
    const more = briefed.toLowerCase().includes(name) || ctx.given(dose.drugKey).length > 1;
    return {
      voice: {
        who: 'DA',
        line: more ? `That’s more ${name} going in, Doc.` : `${dose.drugName}’s in.`,
      },
      log: doseLine(dose),
      tone,
    };
  };
}

/**
 * Asked by the front desk of a team that has gone on without calling (owner's
 * wording, Nov 2026). Without it a run that never calls had no ending.
 */
export const FRONT_DESK_ASKS: Prompt = {
  id: 'front_desk_911',
  voice: { who: 'Front desk', line: 'Do you want me to call 911?' },
  options: [
    { id: 'call', label: 'Call 911' },
    { id: 'not_yet', label: 'Not yet' },
  ],
};

/** When she last asked, or was last told "Not yet". The story's own marker, not on the cart. */
const ASKED_TO_CALL = 'asked:front_desk_911';

/** The front desk makes the call: said and logged the same whether it was tapped or answered. */
export const CALLED_911: Beat = {
  voice: { who: 'Front desk', line: '911 is on the way. About eight minutes.' },
  log: '911 called',
  tone: 'good',
};

/**
 * She asks once what she is watching has gone on for `afterSec` with nobody
 * called, and asks again the same wait after she last asked or was told "Not
 * yet". `since` is when it began, or `null` while it is not going on.
 */
export function frontDeskAsks(since: (ctx: Ctx) => number | null, afterSec: number): Transition {
  return {
    when: (ctx) => {
      const from = since(ctx);
      if (from === null || ctx.at('call_911') !== null) return false;
      const asked = ctx.last(ASKED_TO_CALL) ?? -Infinity;
      return ctx.t - Math.max(from, asked) >= afterSec;
    },
    to: 'stay',
    beat: { counts: [ASKED_TO_CALL], prompt: FRONT_DESK_ASKS },
  };
}

/** The call, by the tap on the cart or by her own two buttons. Goes in a drill's `reactions`. */
export const FRONT_DESK_REACTIONS: Readonly<Record<string, Reaction>> = {
  call_911: (ctx) =>
    ctx.count('call_911') > 1
      ? { voice: { who: 'Front desk', line: 'They’re already on the way.' } }
      : // Tapped while she is asking, the tap is the answer.
        { ...CALLED_911, settles: FRONT_DESK_ASKS.id },

  // "Call 911" is the call, exactly as the tap is. "Not yet" is only heard.
  'answer:front_desk_911': (_ctx, e) =>
    e.kind === 'answer' && e.optionId === 'call'
      ? { ...CALLED_911, counts: ['call_911'] }
      : { counts: [ASKED_TO_CALL] },
};

/** Everything the AED says, in any room: three lines and no more. */
export const AED_SAYS = {
  analysing: 'Analyzing. Stand clear.',
  shock: 'Shock advised.',
  noShock: 'No shock advised.',
} as const;

/**
 * He is paralysed: by a drill's own succinylcholine (phase `paralyzed`), or by
 * the wrong one (`wrongParalytic`'s phase), or he was when the epinephrine
 * consequence took the story over.
 */
export function paralysedNow(ctx: Ctx): boolean {
  return (
    ctx.phase === 'paralyzed' ||
    ctx.phase === 'paralysed' ||
    (ctx.phase === 'overdose' && ctx.has('overdose_paralysed'))
  );
}

/** A tube in a patient who can take one goes in; in one who still has his reflexes it comes straight out. */
export function tube(id: (typeof TUBES)[number], takesIt: (ctx: Ctx) => boolean): Reaction {
  const name = id === 'lma' ? 'LMA' : 'King';
  return (ctx, e) => {
    if (e.kind !== 'action') return undefined;
    if (!e.on) return { log: `${name} out` };
    return takesIt(ctx)
      ? { scene: `The ${name} is in.`, log: `${name} in` }
      : {
          scene: `He gags on the ${name} and it comes straight out.`,
          log: `${name}: gagged, taken out`,
          off: [id],
        };
  };
}

/**
 * What the five acts of an arrest meet in a patient who has a pulse, the same
 * in every room: the cart is the same everywhere, so every room has to answer
 * them. Each line says what is seen or found and nothing about what to do.
 * Goes in a drill's `reactions`.
 */
export const WITH_A_PULSE: Readonly<Record<string, Reaction>> = {
  pulse_check: () => ({ scene: 'You feel a pulse at his neck.', log: 'Pulse check: pulse felt' }),

  cpr: (_ctx, e) =>
    e.kind === 'action' && e.on
      ? {
          voice: { who: 'DA', line: 'He has a pulse.' },
          log: 'CPR stopped: he has a pulse',
          off: ['cpr'],
        }
      : undefined,

  aed: (ctx, e) => {
    if (e.kind !== 'action') return undefined;
    if (!e.on) return { log: 'AED off' };
    // The consequence's own wide, fast rhythm is not one to speak for.
    if (ctx.phase === 'overdose') return { log: 'AED pads on' };
    return { voice: { who: 'AED', line: AED_SAYS.noShock }, log: 'AED: no shock advised' };
  },

  lma: tube('lma', paralysedNow),
  king: tube('king', paralysedNow),
};

/** "Naloxone 1.0 ml IV", with a note when the syringe carried no label. */
export function doseLine(dose: DoseEvent): string {
  return `${dose.drugName} ${dose.ml.toFixed(1)} ml ${dose.route}${dose.labeled ? '' : ' (unlabeled)'}`;
}

export function doseOf(event: PlayerEvent): DoseEvent | null {
  return event.kind === 'dose' ? event.dose : null;
}
