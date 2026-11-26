import { CART_VIALS, TUBES } from '@/engine/catalog';
import { CPR } from '@/engine/engine';
import { administrations, calloutAt, gaveProtocolDose, numberInStep } from '@/engine/protocol';
import type {
  Ctx,
  CyclePause,
  DoseEvent,
  Drive,
  Fact,
  Look,
  Prompt,
  Reaction,
  Scenario,
  Transition,
} from '@/engine/types';
import { fmtClock } from '@/time';

import { toward } from './helpers';
import {
  AED_SAYS,
  airwayOpened,
  type AsFound,
  bagMovesAir,
  bagNeedsWayIn,
  chestLine,
  doseLine,
  doseOf,
  EMS_ON_SCENE,
  emsArrives,
  endingsAsFound,
  epinephrineOverdose,
  FRONT_DESK_REACTIONS,
  frontDeskAsks,
  sedatable,
  sedativeGiven,
  takenAsFound,
  tube,
  ventilatedDuring,
  WITH_A_PULSE,
} from './shared';

/**
 * "Shockable": a sedated patient stops answering in the middle of an
 * extraction. The monitor is already on him, so the rhythm is on the screen
 * from that second: wide and fast, with no pulse wave under it.
 *
 * Graded against V-Fib / Pulseless V-Tach alone. The assistant compresses and
 * the player runs the code from the bag: the breaths in her pauses are the
 * player's to give. The AED is one button and speaks for itself. It takes
 * her hands off when it analyses, and after a shock nobody is on the chest
 * until the player says so. Each round is played for half a minute and its
 * two minutes are then skipped with a card. The pulse comes back in the round
 * after the third shock, and only if the page was followed up to there.
 *
 * The 1 mg ampule into the vein is the mistake in every other room. Here it
 * is the page's own dose for as long as he has no pulse, and the same mistake
 * again once he has one. Every delay below is pacing; what is correct comes
 * from the protocol text the rubric points at.
 */

const PAGE = 'vfib_vtach';
const SHOCK_STEP = 'AED: shock when advised';
const EPI_STEP = 'Epinephrine IV push';
const AMIO_STEP = 'Amiodarone 300 mg IV push';

const EPINEPHRINE = calloutAt(PAGE, EPI_STEP);
const AMIODARONE = calloutAt(PAGE, AMIO_STEP);
/** The two reversals the page names, each as its own page writes it. */
const NALOXONE = calloutAt('oversedation_opioid', 'Naloxone IV');
const FLUMAZENIL = calloutAt('oversedation_benzo', 'Flumazenil IV');
type Callout = typeof EPINEPHRINE;

/** The page's "CPR for 2 minutes". */
const CPR_MINUTES = numberInStep(PAGE, SHOCK_STEP, /CPR for (\d+) minutes/);
const ROUND_SEC = CPR_MINUTES * 60;
/** The shock each drug follows, read from its own step. */
const EPI_AFTER_SHOCK = numberInStep(PAGE, EPI_STEP, /After (\d+)\w+ shock/);
const AMIO_AFTER_SHOCK = numberInStep(PAGE, AMIO_STEP, /After (\d+)\w+ shock/);
/** "repeat q3-5min": no sooner than the first of the two. */
const EPI_REPEAT_NO_SOONER = numberInStep(PAGE, EPI_STEP, /repeat q(\d+)-\d+min/) * 60;

/** The quiet seconds before he stops answering. */
const ARRESTS_AFTER = 6;
/** With the pads on, the AED takes this long before it analyses. */
const PADS_ON_SEC = 5;
/** Its analysis takes this long. */
const ANALYSIS_SEC = 4;
/** A shock given within this long of the advice is the page's "when advised". */
const WHEN_ADVISED_SEC = 15;
/** CPR back on within this long of a shock is the page's "right away". */
const RIGHT_AWAY_SEC = 10;
/** A round is played for this long before the story skips to the end of its two minutes. */
const ROUND_PLAYED_SEC = 30;
/** A round whose drug has not been touched is played for this long before it is skipped all the same. */
const ROUND_WAITS_SEC = 60;
/** The story does not skip while a syringe is being handled. */
const HANDS_BUSY_SEC = 8;
/** Saline within this long of a push is the flush that follows it. */
const FLUSH_WITHIN_SEC = 20;
/** Compressions carry a drug round for this long before it can act. */
const CIRCULATES_SEC = 10;
/** This long with nobody on his chest, and the run is over. */
const LOST_AFTER_SEC = 180;
/**
 * The front desk asks this long into the arrest if nobody has called, and as
 * long again after each time she asks. Pacing: the page says to call at once.
 */
const FRONT_DESK_ASKS_AFTER_SEC = 120;
/** A pulse nobody has felt for: after this long he moves under her hands. */
const MOVES_AFTER_SEC = 20;

const NUMBER = ['zero', 'one', 'two', 'three', 'four', 'five'] as const;
const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth'] as const;
const numberWord = (n: number): string => NUMBER[n] ?? String(n);
const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** The card over a skipped round, with the page's own number of minutes. */
const ROUND_CUT_TITLE = `${capital(numberWord(CPR_MINUTES))} minutes of CPR`;

const GIVEN = 'Given: midazolam 4 mg and fentanyl 50 mcg. Last dose eight minutes ago.';

/*
 * The story's own markers, kept as things it counts as done so `ctx.last` and
 * `ctx.count` can read them back. None of them is on the cart.
 */
const ANALYSIS = 'aed:analysis';
const ADVISED = 'aed:advised';
const NO_SHOCK = 'aed:no_shock';
const SHOCK = 'shock';
const ROUND_SKIPPED = 'round:skipped';
const CPR_STARTED = 'cpr:started';

const nthShock = (n: number): string => `${SHOCK}:${n}`;
const rightAway = (n: number): string => `cpr_right_away@${n}`;
const flushed = (drugKey: string, index: number): string => `flushed:${drugKey}:${index}`;
const SHOCK_LATE = 'shock_late';
const PULSE_FELT = 'pulse_felt';
const BAGGED_ON_A_TUBE = 'bagged_on_a_tube';

const DROWSY: Look = { color: 'pink', eyes: 'closed', note: 'drowsy' };
const DOWN: Look = { color: 'grey', eyes: 'closed', note: 'unresponsive, not breathing' };
const PULSE_BACK: Look = { color: 'pale', eyes: 'closed', note: 'unresponsive, colour returning' };

const SHOCK_ADVISED: Prompt = {
  id: 'shock',
  voice: { who: 'AED', line: AED_SAYS.shock },
  options: [{ id: 'shock', label: 'Shock' }],
};

function arrestedAt(ctx: Ctx): number | null {
  return ctx.entered('arrest');
}

/** When the arrest ended with a pulse, or `null` while it has not. */
function pulseBackAt(ctx: Ctx): number | null {
  return ctx.entered('rosc');
}

/** A push counts for the arrest page only while he had no pulse. */
function inArrest(dose: DoseEvent): boolean {
  return dose.phase === 'arrest';
}

const OVERDOSE = epinephrineOverdose(
  'normal',
  // Before the arrest he is awake enough to feel it; after it he is not.
  (ctx) => (arrestedAt(ctx) === null ? null : 'unresponsive'),
  bagMovesAir,
  (dose) => !inArrest(dose),
);

// ---------------------------------------------------------------- the AED

type AedStage = 'off' | 'placed' | 'analysing' | 'advised' | 'timing';

/** When the AED last gave its verdict: a shock delivered, or none advised. */
function verdictAt(ctx: Ctx): number | null {
  const times = [ctx.last(SHOCK), ctx.last(NO_SHOCK)].filter((t): t is number => t !== null);
  return times.length > 0 ? Math.max(...times) : null;
}

/** Where the AED is in its own loop: pads on, analysing, waiting for the button, or timing the round. */
function aedStage(ctx: Ctx): AedStage {
  if (!ctx.on('aed')) return 'off';
  const padsOn = ctx.last('aed') ?? 0;
  const analysis = ctx.last(ANALYSIS);
  if (analysis === null || analysis < padsOn) return 'placed';
  if ((verdictAt(ctx) ?? -Infinity) >= analysis) return 'timing';
  return (ctx.last(ADVISED) ?? -Infinity) >= analysis ? 'advised' : 'analysing';
}

/**
 * It analyses once the pads have been on a moment, and again when the round
 * since its last verdict has had the page's two minutes of CPR. With nobody
 * on the chest it does not wait for them: two minutes by the clock.
 */
function analysisDue(ctx: Ctx): boolean {
  const stage = aedStage(ctx);
  if (stage === 'placed') return ctx.t - (ctx.last('aed') ?? ctx.t) >= PADS_ON_SEC;
  if (stage !== 'timing') return false;
  const from = verdictAt(ctx) ?? ctx.t;
  return ctx.onFor('cpr', from) >= ROUND_SEC || (!ctx.on('cpr') && ctx.t - from >= ROUND_SEC);
}

function verdictDue(ctx: Ctx): boolean {
  return aedStage(ctx) === 'analysing' && ctx.t - (ctx.last(ANALYSIS) ?? ctx.t) >= ANALYSIS_SEC;
}

/** "Stand clear": her hands come off by themselves, as the toggle shows. */
const AED_ANALYSES: Transition = {
  when: analysisDue,
  to: 'stay',
  beat: {
    voice: { who: 'AED', line: AED_SAYS.analysing },
    log: 'AED: analyzing',
    counts: [ANALYSIS],
    off: ['cpr'],
  },
};

const AED_ADVISES_A_SHOCK: Transition = {
  when: verdictDue,
  to: 'stay',
  beat: { log: 'AED: shock advised', counts: [ADVISED], prompt: SHOCK_ADVISED },
};

const AED_ADVISES_NONE: Transition = {
  when: verdictDue,
  to: 'stay',
  beat: {
    voice: { who: 'AED', line: AED_SAYS.noShock },
    log: 'AED: no shock advised',
    counts: [NO_SHOCK],
  },
};

/**
 * Hands are off his chest because the AED asked for it: it is analysing, or
 * has just advised or given a shock. Only if they were on it when it asked.
 */
function clearForTheAed(ctx: Ctx): boolean {
  const analysis = ctx.last(ANALYSIS);
  if (analysis === null || (ctx.lastOff('cpr') ?? -Infinity) < analysis) return false;
  const stage = aedStage(ctx);
  if (stage === 'analysing') return true;
  if (stage === 'advised') return ctx.t - (ctx.last(ADVISED) ?? ctx.t) <= WHEN_ADVISED_SEC;
  const shock = ctx.last(SHOCK);
  return stage === 'timing' && shock !== null && ctx.t - shock <= RIGHT_AWAY_SEC;
}

/** The code is being run: she is on the chest, or off it only for the AED. */
function cprGoing(ctx: Ctx): boolean {
  return ctx.on('cpr') || clearForTheAed(ctx);
}

// ---------------------------------------------------------------- the rounds

/** When the round being played began: the AED's last verdict, or the last skip, or the arrest. */
function roundBegan(ctx: Ctx): number {
  if (aedStage(ctx) === 'timing') return verdictAt(ctx) ?? ctx.t;
  return Math.max(
    arrestedAt(ctx) ?? ctx.t,
    verdictAt(ctx) ?? -Infinity,
    ctx.last(ROUND_SKIPPED) ?? -Infinity,
  );
}

/** Every push into the vein within the flush's reach, as the flags that mark it flushed. */
function pushesToFlush(ctx: Ctx): string[] {
  return CART_VIALS.flatMap((vial) =>
    ctx
      .given(vial.key)
      .map((dose, i) => ({ dose, flag: flushed(vial.key, i) }))
      .filter(({ dose }) => dose.route === 'IV' && ctx.t - dose.t <= FLUSH_WITHIN_SEC)
      .map(({ flag }) => flag),
  );
}

/** Nothing is in the player's hands: no syringe just handled, and no push still waiting for its flush. */
function handsFree(ctx: Ctx): boolean {
  if (ctx.benchAt !== null && ctx.t - ctx.benchAt < HANDS_BUSY_SEC) return false;
  return pushesToFlush(ctx).every((flag) => ctx.has(flag));
}

/**
 * The round after the shock a drug follows, with none of that drug given yet.
 * The story gives such a round longer before it skips it: the minute and a
 * half it would skip is the time the page gives for the drug.
 */
function drugStillToGive(ctx: Ctx): boolean {
  if (aedStage(ctx) !== 'timing') return false;
  const shocks = ctx.count(SHOCK);
  const none = (drugKey: string): boolean => !ctx.given(drugKey).some(inArrest);
  return (
    (shocks === EPI_AFTER_SHOCK && none('epinephrine')) ||
    (shocks === AMIO_AFTER_SHOCK && none('amiodarone'))
  );
}

/** How far the story is about to skip: the rest of the round's two minutes, once enough of it was played. */
function roundSkip(ctx: Ctx): number {
  if (ctx.phase !== 'arrest' || !ctx.on('cpr') || !handsFree(ctx)) return 0;
  const stage = aedStage(ctx);
  if (stage !== 'timing' && stage !== 'off') return 0;
  // A round the pulse can still come back in is played out, not skipped.
  if (pageFollowed(ctx)) return 0;
  const played = ctx.onFor('cpr', roundBegan(ctx));
  const enough = drugStillToGive(ctx) ? ROUND_WAITS_SEC : ROUND_PLAYED_SEC;
  return played >= enough ? Math.max(0, ROUND_SEC - played) : 0;
}

// ---------------------------------------------------------------- the drugs

function shockAt(ctx: Ctx, n: number): number | null {
  return ctx.at(nthShock(n));
}

/**
 * A drug the page gives after a numbered shock: `null` while that shock has
 * not come and none was given, false if any of it went in before the shock
 * or other than as the callout writes it.
 */
function afterItsShock(ctx: Ctx, drugKey: string, callout: Callout, n: number): boolean | null {
  const doses = ctx.given(drugKey).filter(inArrest);
  const shock = shockAt(ctx, n);
  if (doses.length === 0) return shock === null ? null : false;
  if (shock === null || doses.some((d) => d.t < shock)) return false;
  return doses.every((d) => d.route === callout.route) && gaveProtocolDose(callout, doses);
}

function epinephrineAsWritten(ctx: Ctx): boolean | null {
  const asWritten = afterItsShock(ctx, 'epinephrine', EPINEPHRINE, EPI_AFTER_SHOCK);
  if (asWritten !== true) return asWritten;
  const given = administrations(ctx.given('epinephrine').filter(inArrest));
  return given.slice(1).every((a, i) => a.t - (given[i]?.t ?? a.t) >= EPI_REPEAT_NO_SOONER - 1);
}

function amiodaroneAsWritten(ctx: Ctx): boolean | null {
  return afterItsShock(ctx, 'amiodarone', AMIODARONE, AMIO_AFTER_SHOCK);
}

/** Every push of the drug during the arrest was followed by saline; `null` when none was given. */
function flushedBehind(run: Ctx, drugKey: string): boolean | null {
  const pushes = run
    .given(drugKey)
    .map((dose, i) => ({ dose, i }))
    .filter(({ dose }) => inArrest(dose) && dose.route === 'IV');
  return pushes.length === 0 ? null : pushes.every(({ i }) => run.has(flushed(drugKey, i)));
}

function labeled(run: Ctx, drugKey: string): boolean | null {
  const doses = run.given(drugKey).filter(inArrest);
  return doses.length === 0 ? null : doses.every((d) => d.labeled);
}

/** A reversal given in the arrest went in by its own page's route and dose. One not given is not wrong. */
function reversalAsWritten(callout: Callout, doses: ReadonlyArray<DoseEvent>): boolean {
  if (doses.length === 0) return true;
  return doses.every((d) => d.route === callout.route) && gaveProtocolDose(callout, doses);
}

// ---------------------------------------------------------------- the pulse

/**
 * Everything the page asks for up to the round after the amiodarone's shock,
 * except the breaths: each shock followed by CPR right away, and each drug
 * given as written after its own shock.
 */
function pageFollowed(ctx: Ctx): boolean {
  if (ctx.count(SHOCK) !== AMIO_AFTER_SHOCK) return false;
  for (let n = 1; n <= AMIO_AFTER_SHOCK; n += 1) if (!ctx.has(rightAway(n))) return false;
  return epinephrineAsWritten(ctx) === true && amiodaroneAsWritten(ctx) === true;
}

/** The pulse comes back: the page was followed, air is going in, and compressions have carried the last drug round. */
function pulseReturns(ctx: Ctx): boolean {
  if (aedStage(ctx) !== 'timing' || !pageFollowed(ctx)) return false;
  if (!ctx.on('cpr') || !bagMovesAir(ctx)) return false;
  return ctx.onFor('cpr', ctx.last('give:amiodarone') ?? ctx.t) >= CIRCULATES_SEC;
}

/** How long his chest has been left, right now. Zero while she is on it. */
function chestLeftFor(ctx: Ctx): number {
  const arrest = arrestedAt(ctx);
  if (arrest === null || ctx.phase !== 'arrest' || ctx.on('cpr')) return 0;
  return ctx.t - Math.max(arrest, ctx.lastOff('cpr') ?? -Infinity);
}

function down(ctx: Ctx): Drive {
  const compressing = ctx.on('cpr');
  const air = compressing && bagMovesAir(ctx);
  // Never on the screen while he has no pulse: it is what the oximeter finds when one comes
  // back. It falls with nobody on his chest, holds under compressions, and settles with air.
  const gap = (ctx.on('o2') ? 96 : 92) - ctx.vitals.spo2;
  const settling = Math.abs(gap) < 0.5 ? 0 : Math.sign(gap) * 0.2;
  const falling = ctx.vitals.spo2 > 76 ? -0.15 : 0;
  return {
    spo2Rate: air ? settling : compressing ? 0 : falling,
    hr: toward(188, 40),
    // Left where it was: with no pulse the cuff reads nothing, and the debrief draws none.
    sbp: toward(ctx.vitals.sbp, 0),
    dbp: toward(ctx.vitals.dbp, 0),
    rr: 0,
    // Compressions with breaths going in bring a low trace back. Either alone brings none.
    etco2: air ? toward(13, 2) : null,
    capno: 'normal',
    airway: 'open',
    rhythm: 'vtach',
    pulse: false,
    look: DOWN,
  };
}

// ---------------------------------------------------------------- the grading

function pausesInArrest(run: Ctx): ReadonlyArray<CyclePause> {
  const until = pulseBackAt(run) ?? Infinity;
  return run.pauses().filter((p) => p.t < until && p.ended !== null);
}

const bothBreaths = (pause: CyclePause): boolean => pause.wentIn >= CPR.breaths;

function tubeWentIn(run: Ctx): boolean {
  return TUBES.some((id) => run.onDuring(id, 'arrest'));
}

/**
 * "30:2": at least half of her pauses got both breaths, and went in. `null`
 * when there was never a pause to give them in: a tube from the start, or too
 * little CPR for her to reach one.
 */
function breathsInThePauses(run: Ctx): boolean | null {
  const arrest = arrestedAt(run);
  if (arrest === null || run.at(CPR_STARTED) === null) return null;
  const pauses = pausesInArrest(run);
  if (pauses.length === 0) {
    const cprSec = run.onFor('cpr', arrest) - run.onFor('cpr', pulseBackAt(run) ?? run.t);
    return tubeWentIn(run) || cprSec < ROUND_PLAYED_SEC ? null : false;
  }
  const full = pauses.filter(bothBreaths).length;
  return full > 0 && full * 2 >= pauses.length;
}

/** Each shock so far was followed by CPR within the page's "right away"; the last may still have been due. */
function cprAfterEveryShock(run: Ctx): boolean | null {
  const shocks = run.count(SHOCK);
  if (shocks === 0) return null;
  const lastStillDue =
    !run.has(rightAway(shocks)) && run.t - (run.last(SHOCK) ?? run.t) <= RIGHT_AWAY_SEC;
  const counted = lastStillDue ? shocks - 1 : shocks;
  if (counted === 0) return null;
  for (let n = 1; n <= counted; n += 1) if (!run.has(rightAway(n))) return false;
  return true;
}

/** Every shock the AED advised was given, and within the page's "when advised". */
function shockedWhenAdvised(run: Ctx): boolean | null {
  const advised = run.count(ADVISED);
  const shocks = run.count(SHOCK);
  if (advised === 0) return null;
  const lastStillDue =
    shocks === advised - 1 && run.t - (run.last(ADVISED) ?? run.t) <= WHEN_ADVISED_SEC;
  if (lastStillDue && shocks === 0) return null;
  return (shocks === advised || lastStillDue) && !run.has(SHOCK_LATE);
}

/** How EMS finds him if they are at the door before the story is over. */
const TAKEN: ReadonlyArray<AsFound> = [
  {
    key: 'ems_cpr',
    seen: 'CPR is still going.',
    when: (ctx) => ctx.phase === 'arrest' && cprGoing(ctx),
  },
  {
    key: 'ems_no_cpr',
    seen: 'He has no pulse, and nobody is on his chest.',
    when: (ctx) => ctx.phase === 'arrest' && !cprGoing(ctx),
  },
  { key: 'ems_pulse', seen: 'He has a pulse again.', when: (ctx) => ctx.phase === 'rosc' },
];

function facts(run: Ctx): ReadonlyArray<Fact> {
  const arrest = arrestedAt(run);
  const started = run.at(CPR_STARTED);
  if (arrest === null || started === null) return [];
  const until = pulseBackAt(run) ?? run.t;
  const compressed = run.onFor('cpr', arrest) - run.onFor('cpr', until);
  const pauses = pausesInArrest(run);
  const shock = run.at(SHOCK);
  return [
    { label: 'CPR started', value: fmtClock(started) },
    { label: 'First shock', value: shock === null ? 'None' : fmtClock(shock) },
    {
      label: 'Nobody on his chest, in all',
      value: fmtClock(Math.max(0, until - arrest - compressed)),
    },
    {
      label: 'Pauses with both breaths',
      value: `${pauses.filter(bothBreaths).length} of ${pauses.length}`,
    },
  ];
}

const reversalGiven: Reaction = (_ctx, e) => {
  const dose = doseOf(e);
  if (!dose) return undefined;
  return { voice: { who: 'DA', line: `${dose.drugName}’s in.` }, log: doseLine(dose) };
};

/** He can take a tube from the moment he arrests: he has no reflexes left to fight it. */
const takesTube = (ctx: Ctx): boolean => arrestedAt(ctx) !== null;

export const shockable: Scenario = {
  id: 'shockable',
  title: 'Shockable',
  tagline: 'Nothing about this morning is unusual.',
  protocols: [PAGE],
  floridaTopics: ['Cardiac arrest'],
  patient: { name: 'Mr. Garrett', summary: '58-year-old man, 215 lb' },
  setup: [
    'Surgical extraction of #18 and #19. #18 is out and you are sectioning #19.',
    'IV: 20 G, left forearm, D5W running.',
    GIVEN,
    'History: high blood pressure and high cholesterol, both treated.',
    'N₂O/O₂ by nasal hood. Edan monitor with capnography.',
  ],
  startsAtMin: 10 * 60 + 5,
  initial: {
    phase: 'working',
    // The cuff last read two minutes ago: its next reading finds no pressure to read.
    nibpAgeSec: 120,
    vitals: { hr: 78, spo2: 97, sbp: 132, dbp: 82, etco2: 37, rr: 13 },
    capno: 'normal',
    look: DROWSY,
    scene: 'You are sectioning #19. He is drowsy and answers when you speak to him.',
  },

  always: [
    OVERDOSE.transition,
    {
      when: (ctx) => chestLeftFor(ctx) >= LOST_AFTER_SEC,
      to: 'end:lost',
      beat: {
        log: `${capital(numberWord(LOST_AFTER_SEC / 60))} minutes with nobody on his chest`,
        tone: 'bad',
      },
    },
    ...emsArrives(TAKEN.map(takenAsFound), roundSkip),
  ],

  phases: sedatable(
    bagNeedsWayIn(
      {
        working: {
          drive: () => ({
            spo2Rate: -0.01,
            hr: toward(78, 0.5),
            sbp: toward(132, 0.3),
            dbp: toward(82, 0.2),
            rr: 13,
            etco2: toward(37, 0.2),
            capno: 'normal',
            airway: 'open',
            look: DROWSY,
          }),
          transitions: [
            {
              when: (ctx) => ctx.phaseT >= ARRESTS_AFTER,
              to: 'arrest',
              beat: {
                scene:
                  'He stops answering. His arm slides off the armrest, and his chest is still.',
                voice: { who: 'DA', line: 'Doc, he’s not answering.' },
                log: 'Unresponsive, not breathing',
                tone: 'bad',
              },
            },
            AED_ANALYSES,
            AED_ADVISES_NONE,
          ],
        },

        arrest: {
          drive: down,
          transitions: [
            {
              when: pulseReturns,
              to: 'rosc',
              beat: {
                scene:
                  'The trace on the monitor has changed: narrow, regular beats, with a pulse wave under them.',
                voice: { who: 'DA', line: 'Doc, look at the monitor.' },
                log: 'Organised rhythm, pulse wave back',
                tone: 'good',
                settles: SHOCK_ADVISED.id,
              },
            },
            AED_ANALYSES,
            AED_ADVISES_A_SHOCK,
            {
              // The round's two minutes, skipped whole once enough of it was played.
              when: (ctx) => roundSkip(ctx) > 0,
              to: 'stay',
              beat: (ctx) => ({
                cut: { seconds: roundSkip(ctx), title: ROUND_CUT_TITLE },
                counts: [ROUND_SKIPPED],
              }),
            },
            {
              // Said once the page's "right away" has passed, so it does not hand over the step.
              when: (ctx) => {
                const shock = ctx.last(SHOCK);
                return (
                  shock !== null &&
                  !ctx.on('cpr') &&
                  aedStage(ctx) === 'timing' &&
                  ctx.t - shock >= RIGHT_AWAY_SEC + 2 &&
                  (ctx.last('cpr') ?? -Infinity) < shock &&
                  !ctx.has(`idle@${ctx.count(SHOCK)}`)
                );
              },
              to: 'stay',
              beat: (ctx) => ({
                voice: { who: 'DA', line: 'Nobody’s on his chest, Doc.' },
                flags: [`idle@${ctx.count(SHOCK)}`],
              }),
            },
            {
              when: (ctx) =>
                TUBES.some((id) => ctx.on(id)) &&
                ctx.on('cpr') &&
                bagMovesAir(ctx) &&
                !ctx.has(BAGGED_ON_A_TUBE),
              to: 'stay',
              beat: { flags: [BAGGED_ON_A_TUBE] },
            },
            // With nobody called, she asks. Not over the AED, whose question comes first,
            // and not in the seconds after a shock, when the chest comes first.
            frontDeskAsks((ctx) => {
              const stage = aedStage(ctx);
              const shock = ctx.last(SHOCK);
              const busy =
                stage === 'analysing' ||
                stage === 'advised' ||
                (shock !== null && ctx.t - shock < RIGHT_AWAY_SEC + 2);
              return busy ? null : arrestedAt(ctx);
            }, FRONT_DESK_ASKS_AFTER_SEC),
          ],
          nudges: [
            {
              after: 8,
              when: (ctx) => ctx.at(CPR_STARTED) === null,
              voice: { who: 'DA', line: 'He’s not breathing, Doc!' },
            },
            {
              after: 14,
              when: (ctx) => ctx.at(CPR_STARTED) === null,
              voice: { who: 'DA', line: 'Do you want me on his chest?' },
              coachedOnly: true,
            },
            {
              after: 22,
              when: (ctx) => ctx.at('aed') === null,
              voice: { who: 'Front desk', line: 'Do you want the AED?' },
              coachedOnly: true,
            },
            {
              after: 30,
              when: (ctx) => ctx.at(CPR_STARTED) !== null && ctx.at('bvm') === null,
              voice: { who: 'DA', line: 'Is anyone breathing for him?' },
              coachedOnly: true,
            },
            {
              after: 0,
              when: (ctx) => drugWaiting(ctx, 'epinephrine', EPI_AFTER_SHOCK),
              voice: {
                who: 'DA',
                line: `That was the ${ORDINAL[EPI_AFTER_SHOCK]} shock. Do you want the epinephrine?`,
              },
              coachedOnly: true,
            },
            {
              after: 0,
              when: (ctx) => drugWaiting(ctx, 'amiodarone', AMIO_AFTER_SHOCK),
              voice: {
                who: 'DA',
                line: `That was the ${ORDINAL[AMIO_AFTER_SHOCK]} shock. Do you want the amiodarone?`,
              },
              coachedOnly: true,
            },
          ],
        },

        rosc: {
          drive: (ctx) => {
            const air = bagMovesAir(ctx);
            return {
              spo2Rate: air ? (ctx.on('o2') ? 0.5 : 0.25) : -0.1,
              hr: toward(106, 30),
              sbp: toward(118, 1),
              dbp: toward(72, 1),
              rr: 0,
              // A heart that is moving blood again brings the CO₂ up at once.
              etco2: air ? toward(46, 12) : null,
              capno: 'normal',
              airway: 'open',
              look: PULSE_BACK,
            };
          },
          transitions: [
            {
              when: (ctx) => ctx.has(PULSE_FELT) && ctx.at('call_911') !== null,
              to: 'end:pulse_ems',
            },
            { when: (ctx) => ctx.has(PULSE_FELT), to: 'end:pulse' },
            {
              // Nobody has felt for it: he tells them himself.
              when: (ctx) => ctx.phaseT >= MOVES_AFTER_SEC,
              to: 'stay',
              beat: {
                log: 'He coughs and moves: compressions stopped',
                tone: 'good',
                off: ['cpr'],
                flags: [PULSE_FELT],
              },
            },
            AED_ANALYSES,
            AED_ADVISES_NONE,
          ],
        },

        [OVERDOSE.key]: OVERDOSE.phase,
      },
      ['arrest', 'rosc'],
      undefined,
      takesTube,
    ),
  ),

  reactions: {
    ...FRONT_DESK_REACTIONS,

    stop: () => ({ log: 'Procedure stopped', voice: { who: 'DA', line: 'Instruments out.' } }),

    o2: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? { voice: { who: 'DA', line: 'Nitrous off. Oxygen at 100%.' }, log: 'N₂O off, 100% O₂' }
        : undefined,

    stimulate: (ctx) =>
      ctx.phase === 'arrest'
        ? { scene: 'He does not respond.', log: 'Stimulated: no response' }
        : undefined,

    pulse_check: (ctx, e) => {
      if (ctx.phase === 'arrest') {
        return {
          scene: 'You feel for a pulse at his neck. There is none.',
          log: 'Pulse check: no pulse',
        };
      }
      if (ctx.phase === 'rosc') {
        return { log: 'Pulse check: pulse felt', tone: 'good', off: ['cpr'], flags: [PULSE_FELT] };
      }
      return WITH_A_PULSE.pulse_check?.(ctx, e);
    },

    cpr: (ctx, e) => {
      if (e.kind !== 'action') return undefined;
      if (ctx.phase !== 'arrest') return WITH_A_PULSE.cpr?.(ctx, e);
      if (!e.on) {
        return {
          voice: { who: 'DA', line: 'Stopped? He has no pulse!' },
          log: 'CPR stopped',
          tone: 'bad',
        };
      }
      const first = ctx.at(CPR_STARTED) === null;
      const shocks = ctx.count(SHOCK);
      const shock = ctx.last(SHOCK);
      const prompt =
        shock !== null && ctx.t - shock <= RIGHT_AWAY_SEC && !ctx.has(rightAway(shocks));
      return {
        voice: {
          who: 'DA',
          line: first ? 'Compressions going. One, two, three…' : 'Back on his chest.',
        },
        log: first ? 'CPR started' : 'CPR resumed',
        tone: first || prompt ? 'good' : 'neutral',
        counts: first ? [CPR_STARTED] : [],
        flags: prompt ? [rightAway(shocks)] : [],
      };
    },

    aed: (_ctx, e) => {
      if (e.kind !== 'action') return undefined;
      // Pads off, and its question comes down with them.
      return e.on ? { log: 'AED pads on' } : { log: 'AED off', settles: SHOCK_ADVISED.id };
    },

    'answer:shock': (ctx) => {
      const n = ctx.count(SHOCK) + 1;
      const late = ctx.t - (ctx.last(ADVISED) ?? ctx.t) > WHEN_ADVISED_SEC;
      return {
        scene: 'His body jerks once under the pads.',
        log: `Shock ${n} delivered`,
        tone: late ? 'neutral' : 'good',
        counts: [SHOCK, nthShock(n)],
        // Nobody touches him for a shock, and nobody is back on his chest until told.
        off: ['cpr'],
        flags: late ? [SHOCK_LATE] : [],
      };
    },

    bvm: (ctx, e) => {
      if (e.kind !== 'action') return undefined;
      if (!e.on) return { log: 'BVM stopped' };
      return arrestedAt(ctx) === null ? undefined : chestLine(airwayOpened(ctx));
    },

    lma: tube('lma', takesTube),
    king: tube('king', takesTube),

    saline: (ctx) => {
      const behind = pushesToFlush(ctx);
      return behind.length > 0
        ? { scene: 'Saline runs in behind the push.', log: 'Saline flush', flags: behind }
        : undefined;
    },

    'give:epinephrine': (ctx, e) => {
      const dose = doseOf(e);
      // A pen is logged by its own name: nothing was drawn, so there is no volume to state.
      if (!dose || dose.device !== null) return undefined;
      // With a pulse, the vein is the overdose beat's to tell.
      if (ctx.phase !== 'arrest') return { log: doseLine(dose) };
      return {
        voice: { who: 'DA', line: 'Epinephrine’s in.' },
        log: doseLine(dose),
        tone: epinephrineAsWritten(ctx) === true ? 'good' : 'neutral',
      };
    },

    'give:amiodarone': (ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      return {
        voice: { who: 'DA', line: 'Amiodarone’s in.' },
        log: doseLine(dose),
        tone: ctx.phase === 'arrest' && amiodaroneAsWritten(ctx) === true ? 'good' : 'neutral',
      };
    },

    'give:naloxone': reversalGiven,
    'give:flumazenil': reversalGiven,
    'give:fentanyl': sedativeGiven(GIVEN),
    'give:midazolam': sedativeGiven(GIVEN),
  },

  endings: {
    pulse_ems: {
      outcome: 'recovered',
      title: 'A pulse again',
      text: 'His heart is beating on its own and he has a pulse. He still needs the bag, and EMS is on the way to take him.',
    },
    pulse: {
      outcome: 'recovered',
      title: 'A pulse again',
      text: 'His heart is beating on its own and he has a pulse. He still needs the bag. Nobody has called 911.',
    },
    lost: {
      outcome: 'arrest',
      title: 'Too long without CPR',
      text: `Nobody was on his chest for ${numberWord(LOST_AFTER_SEC / 60)} minutes. The run stops here.`,
    },
    [OVERDOSE.key]: OVERDOSE.ending,
    ...endingsAsFound(TAKEN),
  },

  rubric: [
    {
      id: 'help',
      ref: { protocol: PAGE, step: 'Call for help, AED and 911' },
      tier: 'core',
      parts: [
        {
          quote: 'AED',
          check: (run) => (arrestedAt(run) === null ? null : run.onDuring('aed', 'arrest')),
        },
        {
          // While it mattered: before his pulse was back.
          quote: '911',
          check: (run) => {
            if (arrestedAt(run) === null) return null;
            const called = run.at('call_911');
            return called !== null && called <= (pulseBackAt(run) ?? Infinity);
          },
        },
      ],
      when: (run) => run.at('call_911'),
    },
    {
      id: 'cpr',
      ref: { protocol: PAGE, step: 'CPR on the CPR board' },
      tier: 'core',
      parts: [
        {
          quote: 'CPR on the CPR board',
          check: (run) => (arrestedAt(run) === null ? null : run.at(CPR_STARTED) !== null),
        },
        { quote: `${CPR.compressions}:${CPR.breaths}`, check: breathsInThePauses },
        {
          // Only with a tube in. Then: the bag was squeezed through it while she compressed.
          quote: '1 breath every 6 seconds with continuous compressions',
          check: (run) => (tubeWentIn(run) ? run.has(BAGGED_ON_A_TUBE) : null),
        },
      ],
      when: (run) => run.at(CPR_STARTED),
    },
    {
      id: 'shock',
      ref: { protocol: PAGE, step: SHOCK_STEP },
      tier: 'core',
      parts: [
        { quote: 'shock when advised', check: shockedWhenAdvised },
        { quote: 'then CPR for 2 minutes right away', check: cprAfterEveryShock },
      ],
      when: (run) => run.at(SHOCK),
    },
    {
      id: 'epinephrine',
      ref: { protocol: PAGE, step: EPI_STEP },
      tier: 'core',
      check: epinephrineAsWritten,
      when: (run) => run.given('epinephrine').find(inArrest)?.t ?? null,
    },
    {
      id: 'epinephrine_flush',
      ref: { protocol: PAGE, drug: 'Epinephrine', note: 'push, then a 20 ml saline flush' },
      tier: 'core',
      check: (run) => flushedBehind(run, 'epinephrine'),
    },
    {
      id: 'epinephrine_label',
      ref: { protocol: PAGE, drug: 'Epinephrine', note: 'label the syringe' },
      tier: 'core',
      check: (run) => labeled(run, 'epinephrine'),
    },
    {
      id: 'amiodarone',
      ref: { protocol: PAGE, step: AMIO_STEP },
      tier: 'core',
      check: amiodaroneAsWritten,
      when: (run) => run.given('amiodarone').find(inArrest)?.t ?? null,
    },
    {
      id: 'amiodarone_flush',
      ref: { protocol: PAGE, drug: 'Amiodarone', note: 'IV PUSH, then a 20 ml saline flush' },
      tier: 'core',
      check: (run) => flushedBehind(run, 'amiodarone'),
    },
    {
      id: 'amiodarone_label',
      ref: { protocol: PAGE, drug: 'Amiodarone', note: 'label the syringes' },
      tier: 'core',
      check: (run) => labeled(run, 'amiodarone'),
    },
    {
      id: 'cause',
      ref: { protocol: PAGE, step: 'Most likely cause here' },
      tier: 'core',
      parts: [
        {
          // Air from the bag went in while he had no pulse.
          quote: 'Hypoxia (ventilate)',
          check: (run) => (arrestedAt(run) === null ? null : ventilatedDuring(run, 'arrest')),
        },
        {
          // Either, or both: each one given has to be as its own page writes it.
          quote: 'reverse with Naloxone / Flumazenil',
          check: (run) => {
            if (arrestedAt(run) === null) return null;
            const naloxone = run.given('naloxone').filter(inArrest);
            const flumazenil = run.given('flumazenil').filter(inArrest);
            if (naloxone.length + flumazenil.length === 0) return false;
            return (
              reversalAsWritten(NALOXONE, naloxone) && reversalAsWritten(FLUMAZENIL, flumazenil)
            );
          },
        },
      ],
      when: (run) =>
        [...run.given('naloxone'), ...run.given('flumazenil')].find(inArrest)?.t ?? null,
    },
    {
      id: 'until_ems',
      ref: { protocol: PAGE, step: 'Continue CPR and AED until EMS takes over' },
      tier: 'core',
      parts: [
        {
          // Not reached in a run where his pulse came back. Lost before EMS, it was not continued.
          quote: 'Continue CPR',
          check: (run) => {
            if (arrestedAt(run) === null || pulseBackAt(run) !== null) return null;
            return run.has(EMS_ON_SCENE) ? cprGoing(run) : run.phase === 'arrest' ? false : null;
          },
        },
        {
          quote: 'AED',
          check: (run) => {
            if (arrestedAt(run) === null || pulseBackAt(run) !== null) return null;
            return run.has(EMS_ON_SCENE) ? run.on('aed') : run.phase === 'arrest' ? false : null;
          },
        },
      ],
    },
  ],

  facts,
};

/** In a practice run: the shock has gone in, she is back on the chest, and the drug has not been touched. */
function drugWaiting(ctx: Ctx, drugKey: string, afterShock: number): boolean {
  const shock = shockAt(ctx, afterShock);
  return (
    ctx.count(SHOCK) === afterShock &&
    shock !== null &&
    ctx.on('cpr') &&
    ctx.t - shock >= HANDS_BUSY_SEC &&
    ctx.given(drugKey).length === 0 &&
    handsFree(ctx)
  );
}
