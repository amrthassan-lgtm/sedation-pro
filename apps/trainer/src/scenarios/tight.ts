import { findDevice } from '@/engine/catalog';
import {
  administrations,
  calloutAt,
  doseRangeOf,
  gaveProtocolDose,
  minutesInStep,
  numberInStep,
  overProtocolDose,
  phraseInStep,
} from '@/engine/protocol';
import type { Beat, Ctx, DoseEvent, Look, Scenario, Transition } from '@/engine/types';

import { reachedAt, toward } from './helpers';
import {
  type AsFound,
  doseLine,
  doseOf,
  EMS_AT_THE_DOOR,
  emsArrives,
  endingsAsFound,
  epinephrineIntoVein,
  epinephrineOverdose,
  NEVER_STOCK_EPI_IV,
  sedatable,
  sedativeGiven,
  takenAsFound,
  WITH_A_PULSE,
  wrongParalytic,
} from './shared';

/**
 * "Cough": an asthmatic who starts to wheeze during a crown preparation,
 * awake enough to talk, with no rash. Its first name was "Tight", which is
 * still its id: run records are kept under the id.
 *
 * Graded against Bronchospasm. It is the counterpart to "Wheeze": there the
 * mistake is waiting on epinephrine, here it is reaching for it before the
 * inhaler, and then missing the moment the protocol does call for it. The
 * signs of that moment are the step's own words (cannot speak in sentences,
 * SpO₂ under 92%, quiet chest). The pen works in this run, so the second
 * dose is a step to leave alone. As in every scenario, the rates and delays
 * here are pacing; what is correct comes from the protocol text the rubric
 * points at.
 */

const ALBUTEROL = calloutAt('bronchospasm', 'Albuterol inhaler');
const PEN = calloutAt('bronchospasm', 'Auvi-Q 0.3 first');
const AMPULE = calloutAt('bronchospasm', 'second IM dose from the ampule');
const STEROID = calloutAt('bronchospasm', 'Solu-Medrol IV (first choice)');
const DEXAMETHASONE = calloutAt('bronchospasm', 'Alternative: Dexamethasone IV');

const INHALER = findDevice('albuterol');
if (!INHALER) throw new Error('The cart no longer has the albuterol inhaler');
const MCG_PER_PUFF = INHALER.mcg;

const PUFFS = /^(\d+)-(\d+) puffs$/.exec(ALBUTEROL.dose);
if (!PUFFS) throw new Error(`Cannot read the albuterol round "${ALBUTEROL.dose}"`);
const ROUND_MIN_PUFFS = Number(PUFFS[1]);
const ROUND_MAX_PUFFS = Number(PUFFS[2]);

const REPEAT_ALBUTEROL_AFTER =
  minutesInStep('bronchospasm', 'Albuterol inhaler', /repeat every (\d+) min/) * 60;
/** The saturation the protocol calls severe, read from the step itself. */
const SEVERE_SPO2 = numberInStep('bronchospasm', 'Auvi-Q 0.3 first', /SpO₂ under (\d+)%/);
const IM_DOSE_MCG = doseRangeOf(PEN).minMcg;
const RECHECK_AFTER = minutesInStep('bronchospasm', 'second IM dose', /(\d+) min, not better/) * 60;
const NEVER = NEVER_STOCK_EPI_IV;

/**
 * How long the story gives the inhaler before it looks again. Pacing: no
 * protocol states it, so the card and the log name the round, in the page's
 * words, and put no number of minutes on it.
 */
const INHALER_GIVEN_TIME = 5 * 60;
const AFTER_THE_ROUND = `After ${phraseInStep(
  'bronchospasm',
  'Not clearly better',
  'the first albuterol round',
)}`;
/** The story looks at him again this long after epinephrine starts to work, by way of a cut. */
const LOOKS_AGAIN_AFTER = 25;
/** Better, and this long with nothing left to do but wait for an ambulance that is coming. */
const WAITS_FOR_EMS_AFTER = 20;
/** The one word the step has for how the inhaler is taken. */
const SPACER = phraseInStep('bronchospasm', 'Albuterol inhaler', 'spacer');
const GIVEN = 'Given: midazolam 2 mg. He is relaxed, awake and talking.';

const OVERDOSE = epinephrineOverdose('sharkfin');
const PARALYSED = wrongParalytic('sharkfin');

const COUGHING: Look = { color: 'pink', eyes: 'open', note: 'coughing, no rash' };
const EASIER: Look = { color: 'pink', eyes: 'open', note: 'breathing a little easier' };
const STRUGGLING: Look = { color: 'dusky', eyes: 'open', note: 'two words at a time' };
const MOVING_AIR: Look = { color: 'pink', eyes: 'open', note: 'wheeze loud again' };
const TALKING: Look = { color: 'pink', eyes: 'open', note: 'speaking in full sentences' };

function im(doses: ReadonlyArray<DoseEvent>): ReadonlyArray<DoseEvent> {
  return doses.filter((d) => d.route === 'IM');
}

/** When the protocol's IM dose was in the muscle. */
function epinephrineAt(ctx: Ctx): number | null {
  return reachedAt(im(ctx.given('epinephrine')), IM_DOSE_MCG);
}

/** Every epinephrine injection into muscle, pen or ampule, oldest first. */
function shots(ctx: Ctx) {
  return administrations(im(ctx.given('epinephrine')));
}

/** Albuterol by round: puffs taken back to back are one round. */
function rounds(ctx: Ctx) {
  return administrations(ctx.given('albuterol')).map((a) => ({
    t: a.t,
    puffs: Math.round(a.mcg / MCG_PER_PUFF),
  }));
}

function firstRoundAt(ctx: Ctx): number | null {
  return reachedAt(ctx.given('albuterol'), ROUND_MIN_PUFFS * MCG_PER_PUFF);
}

/** Everything the protocol asks for around the inhaler is under way. */
function settledIn(ctx: Ctx): boolean {
  return ctx.at('stop') !== null && ctx.on('pos_sit_up') && ctx.on('o2');
}

/** The inhaler has had the wait the story gives it: time to look at him again. */
function inhalerWaitOver(ctx: Ctx): boolean {
  return ctx.phaseT >= 40 || (ctx.phaseT >= 12 && settledIn(ctx));
}

function inhalerWaitLeft(ctx: Ctx): number {
  return Math.max(0, INHALER_GIVEN_TIME - (ctx.t - (firstRoundAt(ctx) ?? ctx.t)));
}

/** What is left of the protocol's five minutes after the first dose. */
function recheckLeft(ctx: Ctx): number {
  return Math.max(0, RECHECK_AFTER - (ctx.t - (epinephrineAt(ctx) ?? ctx.t)));
}

/** How far the story is about to jump from here, so an ambulance due inside the jump arrives first. */
function skips(ctx: Ctx): number {
  if (ctx.phase === 'eased' && epinephrineAt(ctx) === null && inhalerWaitOver(ctx)) {
    return inhalerWaitLeft(ctx);
  }
  if (ctx.phase === 'opening' && ctx.phaseT >= LOOKS_AGAIN_AFTER) return recheckLeft(ctx);
  if (ctx.phase === 'better' && ctx.phaseT >= WAITS_FOR_EMS_AFTER) return Infinity;
  return 0;
}

/** Lying back makes this breathing harder, whatever else is being done. */
function flatPenalty(ctx: Ctx): number {
  return ctx.on('pos_flat_legs_up') ? 0.012 : 0;
}

/** He is wheezing in every phase up to the look that finds him better. */
const WHEEZING = ['tight', 'eased', 'severe', 'opening'] as const;

/** Done for the wheeze: before he was better, however early. Afterwards is too late to count. */
function doneWhileWheezing(run: Ctx, action: string): boolean {
  const done = run.at(action);
  const better = run.entered('better');
  return done !== null && (better === null || done < better);
}

/**
 * How EMS finds him if they are at the door before he is better. The severe
 * sign is the step's own; in every other phase up to the look he is wheezing.
 */
const TAKEN: ReadonlyArray<AsFound> = [
  {
    key: 'ems_severe',
    seen: `He ${phraseInStep('bronchospasm', 'Auvi-Q 0.3 first', 'cannot speak in sentences')}.`,
    when: (ctx) => ctx.phase === 'severe',
  },
  {
    key: 'ems_wheezing',
    seen: 'He is still wheezing.',
    when: (ctx) => ctx.phase === 'tight' || ctx.phase === 'eased' || ctx.phase === 'opening',
  },
];

const SEVERE_SCENE =
  'He starts to tell you something and gets two words out between breaths. The whistle has almost gone: his chest is hardly moving any air.';

/** Epinephrine opens his airways whenever it goes in. Whether it was time is the rubric's question. */
const EPINEPHRINE_WORKS: Transition = {
  when: (ctx) => epinephrineAt(ctx) !== null,
  to: 'opening',
  beat: (ctx): Beat => ({
    scene:
      ctx.phase === 'severe'
        ? 'Within a minute the whistle is back, loud on every breath out. Air is moving again.'
        : 'Within a minute his breathing loosens. His hands have a fine shake.',
    log: 'Responding to epinephrine',
    tone: 'good',
  }),
};

export const tight: Scenario = {
  id: 'tight',
  title: 'Cough',
  tagline: 'A crown preparation that keeps being interrupted.',
  protocols: ['bronchospasm'],
  floridaTopics: ['Bronchospasm'],
  patient: { name: 'Mr. Brooks', summary: '38-year-old man, 175 lb' },
  setup: [
    'Crown preparation on #30. A gauze throat screen is in place.',
    'IV: 22 G, left forearm, D5W running.',
    GIVEN,
    'History: asthma since childhood. He uses an inhaler a few times a month and did not bring it.',
    'N₂O/O₂ by nasal hood. Edan monitor with capnography.',
  ],
  startsAtMin: 14 * 60 + 10,
  initial: {
    phase: 'tight',
    vitals: { hr: 92, spo2: 96, sbp: 132, dbp: 84, etco2: 38, rr: 20 },
    capno: 'sharkfin',
    look: { color: 'pink', eyes: 'open', note: 'clearing his throat' },
    scene:
      'You are refining the margin on #30. He clears his throat, then coughs into the suction.',
  },

  always: [
    OVERDOSE.transition,
    PARALYSED.transition,
    {
      when: (ctx) => ctx.vitals.spo2 < 60,
      to: 'end:arrest',
      beat: { log: 'Pulse lost', tone: 'bad' },
    },
    ...emsArrives(
      [
        ...TAKEN.map(takenAsFound),
        {
          when: (ctx) => ctx.phase === 'better',
          to: 'end:handover',
          beat: () => ({
            scene: `${EMS_AT_THE_DOOR} He is sitting up, breathing easily, and tells them what happened himself.`,
            tone: 'good',
          }),
        },
      ],
      skips,
    ),
  ],

  phases: sedatable({
    tight: {
      drive: (ctx) => ({
        spo2Rate: (ctx.on('o2') ? 0.01 : -0.02) - flatPenalty(ctx),
        hr: toward(108, 0.3),
        sbp: toward(138, 0.2),
        dbp: toward(86, 0.1),
        rr: 24,
        etco2: toward(41, 0.05),
        capno: 'sharkfin',
        airway: 'open',
        look: COUGHING,
      }),
      transitions: [
        {
          when: (ctx) => ctx.phaseT >= 10 && !ctx.has('heard'),
          to: 'stay',
          beat: {
            scene:
              'He coughs twice more. Each breath out now ends in a long, musical whistle. His skin is its usual colour: no welts, no swelling.',
            voice: { who: 'Patient', line: 'My chest… feels tight.' },
            log: 'Cough, whistle on breathing out',
            flags: ['heard'],
          },
        },
        EPINEPHRINE_WORKS,
        {
          when: (ctx) => firstRoundAt(ctx) !== null,
          to: 'eased',
          beat: {
            scene: 'The whistle loosens a little.',
            log: 'First albuterol round in',
            tone: 'good',
          },
        },
        {
          // The protocol's own sign, or simply time without the inhaler.
          when: (ctx) => Math.round(ctx.vitals.spo2) < SEVERE_SPO2 || ctx.phaseT >= 90,
          to: 'severe',
          beat: {
            scene: SEVERE_SCENE,
            voice: { who: 'DA', line: 'I can barely hear the whistle now.' },
            log: 'Worse: two words at a time, chest quiet',
            tone: 'bad',
          },
        },
      ],
      nudges: [
        {
          after: 30,
          when: (ctx) => ctx.given('albuterol').length === 0,
          voice: { who: 'DA', line: 'He’s working hard to breathe, Doc.' },
        },
        {
          after: 55,
          when: (ctx) => ctx.given('albuterol').length === 0,
          voice: { who: 'DA', line: 'His chart says asthma. Do you want the inhaler?' },
          coachedOnly: true,
        },
      ],
    },

    eased: {
      drive: (ctx) => ({
        spo2Rate: (ctx.on('o2') ? 0.03 : 0) - flatPenalty(ctx),
        hr: toward(112, 0.3),
        sbp: toward(136, 0.2),
        dbp: toward(84, 0.1),
        rr: 22,
        etco2: toward(40, 0.05),
        capno: 'sharkfin',
        airway: 'open',
        look: EASIER,
      }),
      transitions: [
        EPINEPHRINE_WORKS,
        {
          // The inhaler is given its time in one cut, never a shortened wait.
          when: inhalerWaitOver,
          to: 'severe',
          beat: (ctx) => ({
            scene: `He is no better. ${SEVERE_SCENE}`,
            voice: { who: 'DA', line: 'I can barely hear the whistle now.' },
            log: `${AFTER_THE_ROUND}: worse, chest quiet`,
            tone: 'bad',
            cut: {
              seconds: inhalerWaitLeft(ctx),
              title: AFTER_THE_ROUND,
              vitals: {
                hr: 126,
                spo2: ctx.on('o2') ? SEVERE_SPO2 - 2 : SEVERE_SPO2 - 4,
                sbp: 146,
                dbp: 90,
                etco2: 47,
                rr: 30,
              },
            },
          }),
        },
      ],
    },

    severe: {
      drive: (ctx) => ({
        spo2Rate: (ctx.on('o2') ? -0.03 : -0.06) - flatPenalty(ctx),
        hr: toward(138, 0.3),
        sbp: toward(150, 0.2),
        dbp: toward(92, 0.1),
        rr: 30,
        etco2: toward(54, 0.08),
        capno: 'sharkfin',
        airway: 'open',
        look: STRUGGLING,
      }),
      transitions: [EPINEPHRINE_WORKS],
      nudges: [
        {
          after: 20,
          when: (ctx) => ctx.given('epinephrine').length === 0,
          voice: { who: 'DA', line: 'He can’t get a sentence out.' },
        },
        {
          after: 45,
          when: (ctx) => ctx.given('epinephrine').length === 0,
          voice: { who: 'DA', line: 'Do you want the pen?' },
          coachedOnly: true,
        },
      ],
    },

    opening: {
      drive: (ctx) => ({
        spo2Rate: (ctx.on('o2') ? 0.1 : 0.05) - flatPenalty(ctx),
        hr: toward(124, 0.5),
        sbp: toward(142, 0.3),
        dbp: toward(84, 0.2),
        rr: 24,
        etco2: toward(42, 0.2),
        capno: 'sharkfin',
        airway: 'open',
        look: MOVING_AIR,
      }),
      transitions: [
        {
          // The protocol's five minutes are skipped whole, and the story looks again exactly then.
          when: (ctx) => ctx.phaseT >= LOOKS_AGAIN_AFTER,
          to: 'better',
          beat: (ctx) => ({
            scene:
              'He is speaking in full sentences. The whistle is soft, and only at the end of each breath out.',
            voice: {
              who: 'DA',
              // A temptation, on purpose, and nothing more: no claim about what it would do.
              line:
                ctx.at('auviq_adult') !== null
                  ? 'That’s five minutes since the pen, Doc. Do you want a second dose drawn up?'
                  : 'That’s five minutes since the first dose, Doc. Do you want a second one drawn up?',
            },
            log: 'Five minutes on: better',
            tone: 'good',
            cut: {
              seconds: recheckLeft(ctx),
              title: 'Five minutes after the first dose',
              vitals: {
                hr: 116,
                spo2: ctx.on('o2') ? 97 : 94,
                sbp: 136,
                dbp: 82,
                etco2: 39,
                rr: 20,
              },
            },
          }),
        },
      ],
      nudges: [
        {
          after: 12,
          when: (ctx) => ctx.at('call_911') === null,
          voice: { who: 'Front desk', line: 'Do you need me to call anyone?' },
          coachedOnly: true,
        },
      ],
    },

    better: {
      drive: (ctx) => ({
        spo2Rate: (ctx.on('o2') ? 0.05 : 0.02) - flatPenalty(ctx),
        hr: toward(108, 0.3),
        sbp: toward(130, 0.2),
        dbp: toward(80, 0.1),
        rr: 18,
        etco2: toward(38, 0.2),
        capno: ctx.phaseT > 15 ? 'normal' : 'sharkfin',
        airway: 'open',
        look: TALKING,
      }),
      // An ambulance that was called is handled for every phase in `always`.
      transitions: [
        {
          when: (ctx) =>
            ctx.at('call_911') === null && ctx.phaseT >= 30 && !ctx.has('asked_late_911'),
          to: 'stay',
          beat: {
            flags: ['asked_late_911'],
            prompt: {
              id: 'late_911',
              voice: {
                who: 'Front desk',
                line: 'He looks better. Do you still want an ambulance?',
              },
              options: [
                { id: 'call', label: 'Call 911' },
                { id: 'no', label: 'No, we will watch him' },
              ],
            },
          },
        },
        { when: (ctx) => ctx.answer('late_911') === 'no', to: 'end:no_ems' },
      ],
    },

    [OVERDOSE.key]: OVERDOSE.phase,
    [PARALYSED.key]: PARALYSED.phase,
  }),

  reactions: {
    ...WITH_A_PULSE,

    stop: () => ({ log: 'Procedure stopped', voice: { who: 'DA', line: 'Instruments out.' } }),

    suction: (ctx) =>
      ctx.count('suction') > 1
        ? { log: 'Suctioned' }
        : {
            scene: 'The throat screen comes out and you clear his mouth.',
            log: 'Packs out, suctioned',
          },

    o2: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? { voice: { who: 'DA', line: 'Nitrous off. Oxygen at 100%.' }, log: 'N₂O off, 100% O₂' }
        : undefined,

    pos_sit_up: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? { scene: 'Back of the chair up. He leans forward on his hands.', log: 'Sitting up' }
        : undefined,

    pos_flat_legs_up: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? {
            scene: 'Chair flat, legs up. He fights to sit back up: lying down is harder work.',
            log: 'Flat, legs up',
          }
        : undefined,

    // Only while he can: paralysed by the wrong drug, he takes the bag.
    bvm: (ctx, e) =>
      e.kind === 'action' && e.on && ctx.phase !== PARALYSED.key
        ? {
            scene: 'He pushes the mask away. He is awake and breathing for himself.',
            off: ['bvm'],
          }
        : undefined,

    call_911: (ctx) =>
      ctx.count('call_911') > 1
        ? { voice: { who: 'Front desk', line: 'They’re already on the way.' } }
        : {
            voice: { who: 'Front desk', line: '911 is on the way. About eight minutes.' },
            log: '911 called',
            tone: 'good',
          },

    albuterol: (ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      const puffs = Math.round(dose.mcg / MCG_PER_PUFF);
      return {
        scene:
          ctx.phase === 'severe'
            ? 'He cannot hold a breath long enough to take it in.'
            : `He breathes each puff in through the ${SPACER}.`,
        log: `Albuterol, ${puffs} ${puffs === 1 ? 'puff' : 'puffs'}`,
      };
    },

    auviq_adult: () => ({
      voice: { who: 'DA', line: 'Pen’s in. I have the time.' },
      log: 'Auvi-Q 0.3 mg, thigh',
    }),

    pen_peds: () => ({
      voice: { who: 'DA', line: 'That was the pediatric pen, Doc.' },
      log: 'Auto-injector 0.15 mg (pediatric), thigh',
    }),

    'give:epinephrine': (ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      // The vein is handled by the overdose beat; this is the thigh.
      if (dose.route !== 'IM') return { log: doseLine(dose) };
      const given = shots(ctx);
      const injected = given.at(-1);
      const tooMuch = injected !== undefined && overProtocolDose(AMPULE, injected.mcg);
      const onTopOfOne = given.length > 1 && (ctx.phase === 'opening' || ctx.phase === 'better');
      if (tooMuch || onTopOfOne) {
        return {
          scene: 'Within a minute his pulse is hammering at his neck and his hands are shaking.',
          voice: { who: 'DA', line: 'His heart rate’s jumped, Doc.' },
          log: doseLine(dose),
          tone: 'bad',
          bump: { hr: 30, sbp: 26 },
        };
      }
      return { voice: { who: 'DA', line: 'In the thigh. I have the time.' }, log: doseLine(dose) };
    },

    'give:fentanyl': sedativeGiven(GIVEN),
    'give:midazolam': sedativeGiven(GIVEN),

    'give:naloxone': (_ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      return {
        voice: { who: 'DA', line: 'Naloxone’s in. He was awake and talking already.' },
        log: doseLine(dose),
      };
    },

    'give:flumazenil': (_ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      return {
        voice: { who: 'DA', line: 'Flumazenil’s in. He was awake and talking already.' },
        log: doseLine(dose),
      };
    },

    'answer:late_911': (_ctx, e) =>
      e.kind === 'answer' && e.optionId === 'call'
        ? {
            voice: { who: 'Front desk', line: 'Calling now.' },
            log: '911 called',
            counts: ['call_911'],
          }
        : { log: 'No ambulance called' },
  },

  endings: {
    handover: {
      outcome: 'handover',
      title: 'Handed over to EMS',
      text: 'He leaves with EMS, breathing easily and speaking in full sentences.',
    },
    no_ems: {
      outcome: 'recovered',
      title: 'Better, and nobody is coming',
      text: 'He is breathing easily for now. No ambulance was called.',
    },
    ...endingsAsFound(TAKEN),
    [OVERDOSE.key]: OVERDOSE.ending,
    [PARALYSED.key]: PARALYSED.ending,
    arrest: {
      outcome: 'arrest',
      title: 'No pulse',
      text: 'He could not move enough air for too long, and his pulse is gone. The run stops here.',
    },
  },

  rubric: [
    {
      id: 'stop',
      ref: { protocol: 'bronchospasm', step: 'Stop the procedure. Sit upright' },
      tier: 'core',
      parts: [
        { quote: 'Stop the procedure', check: (run) => doneWhileWheezing(run, 'stop') },
        {
          // A position counts while he is left in it, not for having been tried,
          // and only if he was put in it while he was still wheezing.
          quote: 'Sit upright',
          check: (run) =>
            run.on('pos_sit_up') && WHEEZING.some((phase) => run.onDuring('pos_sit_up', phase)),
        },
        { quote: 'remove packs', check: (run) => doneWhileWheezing(run, 'suction') },
      ],
      when: (run) => run.at('stop'),
    },
    {
      id: 'albuterol',
      ref: { protocol: 'bronchospasm', step: 'Albuterol inhaler' },
      tier: 'core',
      parts: [
        {
          quote: 'Albuterol inhaler',
          check: (run) => {
            const first = rounds(run)[0];
            return (
              first !== undefined &&
              first.puffs >= ROUND_MIN_PUFFS &&
              first.puffs <= ROUND_MAX_PUFFS
            );
          },
        },
        {
          quote: 'repeat every 20 min',
          check: (run) => {
            const given = rounds(run);
            if (given.length < 2) return null;
            return given
              .slice(1)
              .every((r, i) => r.t - (given[i]?.t ?? r.t) >= REPEAT_ALBUTEROL_AFTER - 1);
          },
        },
      ],
      when: (run) => run.at('albuterol'),
    },
    {
      id: 'o2',
      ref: { protocol: 'bronchospasm', step: 'O₂ to SpO₂ 93-95%' },
      tier: 'core',
      // A target with an upper bound, so never "still on at the end". His
      // saturation is under it from the severe signs until the pen has worked:
      // oxygen counts if it was on then, and a run without those signs never
      // reaches the step.
      check: (run) => {
        if (run.entered('severe') === null) return null;
        return run.onDuring('o2', 'severe') || run.onDuring('o2', 'opening');
      },
      when: (run) => run.last('o2'),
    },
    {
      id: 'pen_when_severe',
      ref: { protocol: 'bronchospasm', step: 'Auvi-Q 0.3 first' },
      tier: 'core',
      parts: [
        {
          // The signs came first: no epinephrine before the story showed them.
          quote: `Severe (cannot speak in sentences, SpO₂ under ${SEVERE_SPO2}%, quiet chest)`,
          check: (run) => {
            const first = run.given('epinephrine')[0];
            const severe = run.entered('severe');
            if (first === undefined) return severe === null ? null : false;
            return severe !== null && first.t >= severe;
          },
        },
        {
          quote: 'Auvi-Q 0.3 first',
          check: (run) => {
            const first = run.given('epinephrine')[0];
            if (first === undefined) return run.entered('severe') === null ? null : false;
            return first.device === 'auviq_adult';
          },
        },
        {
          quote: NEVER,
          check: (run) => {
            const recheck = run.entered('better');
            const early = (d: DoseEvent): boolean => recheck === null || d.t < recheck;
            // Not pushing it is no credit when no epinephrine was given at all.
            if (!run.given('epinephrine').some(early)) return null;
            const vein = epinephrineIntoVein(run);
            return !(vein && early(vein));
          },
        },
      ],
      when: (run) => run.at('auviq_adult'),
    },
    {
      id: 'call_911',
      ref: { protocol: 'bronchospasm', step: 'DA calls 911' },
      tier: 'core',
      parts: [
        {
          // With the pen: before the story has moved on to the five-minute look.
          quote: 'At the same time',
          check: (run) => {
            const called = run.at('call_911');
            if (called === null) return false;
            const recheck = run.entered('better');
            return recheck === null || called < recheck;
          },
        },
        { quote: 'DA calls 911', check: (run) => run.at('call_911') !== null },
      ],
      when: (run) => run.at('call_911'),
    },
    {
      id: 'second_im',
      ref: { protocol: 'bronchospasm', step: 'second IM dose from the ampule' },
      tier: 'core',
      parts: [
        {
          // In this run he is better at five minutes, so a second injection is early or not called for.
          quote: '5 min, not better',
          check: (run) => (shots(run).length > 1 ? false : null),
        },
        {
          quote: 'second IM dose from the ampule',
          check: (run) => {
            const given = shots(run);
            // Any injection over the ampule dose, at any point, is not this step.
            if (given.some((a) => overProtocolDose(AMPULE, a.mcg))) return false;
            const second = given[1];
            if (second === undefined) return null;
            const drawn = run
              .given('epinephrine')
              .filter((d) => d.t >= second.t && d.device === null);
            return gaveProtocolDose(AMPULE, drawn);
          },
        },
        {
          quote: NEVER,
          check: (run) => {
            const recheck = run.entered('better');
            if (recheck === null) return null;
            if (!run.given('epinephrine').some((d) => d.t >= recheck)) return null;
            const vein = epinephrineIntoVein(run);
            return !(vein && vein.t >= recheck);
          },
        },
      ],
      when: (run) => shots(run)[1]?.t ?? null,
    },
    {
      id: 'epi_label',
      ref: { protocol: 'bronchospasm', drug: 'Epinephrine', note: 'label the syringe' },
      tier: 'core',
      check: (run) => {
        const drawn = run.given('epinephrine').filter((d) => d.device === null);
        return drawn.length === 0 ? null : drawn.every((d) => d.labeled);
      },
    },
    {
      id: 'steroid',
      ref: { protocol: 'bronchospasm', step: 'Solu-Medrol IV (first choice)' },
      tier: 'extra',
      check: (run) => {
        const given = run.given('solumedrol');
        // The written alternative was used instead: this line does not apply.
        if (given.length === 0 && run.given('dexamethasone').length > 0) return null;
        return gaveProtocolDose(STEROID, given);
      },
      when: (run) => run.given('solumedrol')[0]?.t ?? null,
    },
    {
      id: 'dexamethasone',
      ref: { protocol: 'bronchospasm', step: 'Alternative: Dexamethasone IV' },
      tier: 'extra',
      check: (run) => {
        const given = run.given('dexamethasone');
        return given.length === 0 ? null : gaveProtocolDose(DEXAMETHASONE, given);
      },
      when: (run) => run.given('dexamethasone')[0]?.t ?? null,
    },
    {
      // The same call as "DA calls 911", worded where the protocol ties it to the inhaler.
      id: 'albuterol_911',
      ref: { protocol: 'bronchospasm', step: 'Not clearly better after the first albuterol round' },
      tier: 'echo',
      check: (run) => {
        if (firstRoundAt(run) === null || run.entered('severe') === null) return null;
        return run.at('call_911') !== null;
      },
      when: (run) => run.at('call_911'),
    },
  ],
};
