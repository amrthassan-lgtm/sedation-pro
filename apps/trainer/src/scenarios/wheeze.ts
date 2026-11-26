import { findDevice } from '@/engine/catalog';
import {
  administrations,
  calloutAt,
  doseRangeOf,
  gaveProtocolDose,
  minutesInStep,
  overProtocolDose,
  phraseInStep,
} from '@/engine/protocol';
import type { Ctx, DoseEvent, Drive, Look, Reaction, Scenario } from '@/engine/types';

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
  moreSedative,
  NEVER_STOCK_EPI_IV,
  sedatable,
  sedativeGiven,
  takenAsFound,
  WITH_A_PULSE,
  wrongParalytic,
} from './shared';

/**
 * "Wheeze": a reaction a few minutes after an IV antiemetic, in a sedated
 * patient who cannot say what he feels.
 *
 * Graded against Anaphylaxis. Two traps come straight from the cart as it
 * really is: there is one adult auto-injector, so the second dose has to be
 * drawn from the ampule, and a drawn 1 mg/ml syringe sits next to an IV
 * port. As in every scenario, the rates and delays here are pacing; what is
 * correct comes from the protocol text the rubric points at.
 *
 * This version resolves after the second IM dose and fluids.
 */

const PEN = calloutAt('anaphylaxis', 'Auvi-Q 0.3 first');
const AMPULE = calloutAt('anaphylaxis', 'second IM dose from the ampule');
const DIPHENHYDRAMINE = calloutAt('anaphylaxis', 'Diphenhydramine IV or IM');
const STEROID = calloutAt('anaphylaxis', 'Steroid add-on after epinephrine');
const DEXAMETHASONE = calloutAt('anaphylaxis', 'Alternative: Dexamethasone IV');
const ALBUTEROL = calloutAt('anaphylaxis', 'Albuterol (if wheezing)');

/** The patient responds once the protocol's IM dose is in the muscle. */
const IM_DOSE_MCG = doseRangeOf(PEN).minMcg;
/** The protocol's wait before the second dose, and between repeats, read from the step itself. */
const SECOND_DOSE_AFTER =
  minutesInStep('anaphylaxis', 'second IM dose', /(\d+) min, not better/) * 60;
const REPEAT_NO_SOONER =
  minutesInStep('anaphylaxis', 'second IM dose', /Repeat every (\d+)-\d+ min/) * 60;
const INHALER = findDevice('albuterol');
if (!INHALER) throw new Error('The cart no longer has the albuterol inhaler');
const MCG_PER_PUFF = INHALER.mcg;
const NEVER = NEVER_STOCK_EPI_IV;
const GIVEN = 'Given: midazolam 3 mg and fentanyl 25 mcg. He is drowsy and answers when spoken to.';
/** How long the story waits on a pressure that will not come up before it moves on. */
const STUCK_LONG_ENOUGH = 60;
/** The pressure at which he is steady enough to hand over. */
const STEADY_SBP = 96;

const OVERDOSE = epinephrineOverdose('sharkfin');
const PARALYSED = wrongParalytic('sharkfin');

const FLUSHED: Look = { color: 'flushed', eyes: 'closed', note: 'welts on the neck and chest' };
const GREY: Look = { color: 'grey', eyes: 'closed', note: 'hives everywhere, sweaty' };
const BETTER: Look = { color: 'pink', eyes: 'open', note: 'hives fading' };

function im(doses: ReadonlyArray<DoseEvent>): ReadonlyArray<DoseEvent> {
  return doses.filter((d) => d.route === 'IM');
}

function firstImAt(ctx: Ctx): number | null {
  return reachedAt(im(ctx.given('epinephrine')), IM_DOSE_MCG);
}

function secondImAt(ctx: Ctx): number | null {
  const relapse = ctx.entered('relapse');
  if (relapse === null) return null;
  return reachedAt(
    im(ctx.given('epinephrine')).filter((d) => d.t >= relapse),
    IM_DOSE_MCG,
  );
}

/** Every epinephrine injection into muscle, pen or ampule, oldest first. */
function shots(ctx: Ctx) {
  return administrations(im(ctx.given('epinephrine')));
}

function fluidsRunning(ctx: Ctx): boolean {
  return ctx.at('saline') !== null;
}

/** A position counts while he is left in it, not for having been tried. */
function positioned(ctx: Ctx): boolean {
  return ctx.on('pos_flat_legs_up') || ctx.on('pos_sit_up');
}

/** Everything the protocol asks for alongside the first dose is under way. */
function firstRoundDone(ctx: Ctx): boolean {
  return ctx.at('call_911') !== null && ctx.on('o2') && positioned(ctx) && fluidsRunning(ctx);
}

function steady(ctx: Ctx): boolean {
  return ctx.vitals.sbp >= STEADY_SBP;
}

/** The first dose has had the wait the story gives it before the look at five minutes. */
function firstDoseWaitOver(ctx: Ctx): boolean {
  return ctx.phaseT >= 45 || (ctx.phaseT >= 15 && firstRoundDone(ctx));
}

/** What is left of the protocol's five minutes after the first dose. */
function secondDoseWaitLeft(ctx: Ctx): number {
  return Math.max(0, SECOND_DOSE_AFTER - (ctx.t - (firstImAt(ctx) ?? ctx.t)));
}

/** After the second dose: steady, or stuck long enough that the story stops waiting on him. */
function waitedOnHim(ctx: Ctx, steadyFor: number): boolean {
  return (ctx.phaseT >= steadyFor && steady(ctx)) || ctx.phaseT >= STUCK_LONG_ENOUGH;
}

/** How far the story is about to jump from here, so an ambulance due inside the jump arrives first. */
function skips(ctx: Ctx): number {
  if (ctx.phase === 'responding' && firstDoseWaitOver(ctx)) return secondDoseWaitLeft(ctx);
  if (ctx.phase === 'settling' && waitedOnHim(ctx, 20)) return Infinity;
  return 0;
}

/**
 * How EMS finds him if they are at the door before the second dose has
 * settled him: the wheeze and the hives are there from the first minute until
 * then. He is taken as he is, with no question about where he goes.
 */
const TAKEN: ReadonlyArray<AsFound> = [
  {
    key: 'ems_reacting',
    seen: `He is still ${phraseInStep(
      'anaphylaxis',
      'Albuterol (if wheezing)',
      'wheezing',
    )}, and the hives have not faded.`,
    when: (ctx) => ctx.phase === 'onset' || ctx.phase === 'responding' || ctx.phase === 'relapse',
  },
];

/** He is the team's to treat in every phase up to EMS at the door. */
const BEFORE_EMS = ['onset', 'responding', 'relapse', 'settling'] as const;

/** On at some point while he was theirs to treat. Switched on with EMS at the door is too late to count. */
function heldBeforeEms(run: Ctx, toggle: string): boolean {
  return BEFORE_EMS.some((phase) => run.onDuring(toggle, phase));
}

/** Done before EMS was at the door, however early. */
function doneBeforeEms(run: Ctx, action: string): boolean {
  const done = run.at(action);
  const arrived = run.entered('handover');
  return done !== null && (arrived === null || done < arrived);
}

function reacting(ctx: Ctx, worse: boolean): Drive {
  const o2 = ctx.on('o2') ? 0.035 : 0;
  const flat = ctx.on('pos_flat_legs_up');
  const fluids = fluidsRunning(ctx) ? 8 : 0;
  // Low enough that fluids and position alone never hold him: only epinephrine does.
  const floor = 40;
  return {
    // Flat with the legs up helps the pressure and makes the breathing harder.
    spo2Rate: (worse ? -0.035 : -0.03) + o2 - (flat ? 0.008 : 0),
    hr: toward(worse ? 140 : 132, 0.25),
    sbp: toward(floor + fluids + (flat ? 6 : 0), worse ? 0.1 : 0.25),
    dbp: toward(30 + fluids / 2, 0.08),
    rr: worse ? 28 : 24,
    etco2: toward(worse ? 42 : 39, 0.05),
    capno: 'sharkfin',
    airway: 'open',
    look: worse ? GREY : FLUSHED,
  };
}

/** "after epinephrine": none of these doses went in before the first epinephrine did. */
function afterEpinephrine(run: Ctx, doses: ReadonlyArray<DoseEvent>): boolean {
  const first = run.given('epinephrine')[0];
  return first !== undefined && doses.every((d) => d.t >= first.t);
}

/** Said of his breathing only while it is true: more sedative slows it. */
const reversalGiven: Reaction = (ctx, e) => {
  const dose = doseOf(e);
  if (!dose) return undefined;
  return {
    voice: {
      who: 'DA',
      line: moreSedative(ctx)
        ? `${dose.drugName}’s in.`
        : `${dose.drugName}’s in. He’s breathing fast, though, not slow.`,
    },
    log: doseLine(dose),
  };
};

export const wheeze: Scenario = {
  id: 'wheeze',
  title: 'Wheeze',
  tagline: 'Halfway through an extraction. Something is different.',
  protocols: ['anaphylaxis'],
  floridaTopics: ['Allergic and toxicity reactions'],
  patient: { name: 'Mr. Alvarez', summary: '46-year-old man, 200 lb' },
  setup: [
    'Extraction of #3 and #14. You are halfway through #14.',
    'IV: 22 G, right dorsal hand, D5W running.',
    GIVEN,
    'Three minutes ago he gagged and said he felt sick. You pushed ondansetron 4 mg IV, slowly.',
    'N₂O/O₂ by nasal hood. Edan monitor with capnography.',
  ],
  startsAtMin: 11 * 60 + 20,
  initial: {
    phase: 'onset',
    // The cuff last read three minutes ago: the pressure on screen is already old.
    nibpAgeSec: 180,
    vitals: { hr: 96, spo2: 97, sbp: 124, dbp: 78, etco2: 36, rr: 18 },
    capno: 'sharkfin',
    look: { color: 'flushed', eyes: 'closed', note: 'face flushed' },
    scene: 'The nausea has settled and you are back at work on #14. He shifts in the chair.',
  },

  always: [
    OVERDOSE.transition,
    PARALYSED.transition,
    {
      when: (ctx) => ctx.vitals.sbp < 55 || ctx.vitals.spo2 < 60,
      to: 'end:arrest',
      beat: { log: 'Pressure lost: no pulse', tone: 'bad' },
    },
    ...emsArrives(
      [
        ...TAKEN.map(takenAsFound),
        {
          // Whether or not he is steady: they arrive on their own clock.
          when: (ctx) => ctx.phase === 'settling',
          to: 'handover',
          beat: (ctx) => ({
            scene: steady(ctx)
              ? `${EMS_AT_THE_DOOR} He is awake, pink and breathing easily, and he says he feels fine now.`
              : `${EMS_AT_THE_DOOR} He is awake and breathing more easily, but he is pale and his pressure has not come up.`,
            tone: 'good',
            prompt: {
              id: 'disposition',
              voice: {
                who: 'EMS',
                line: steady(ctx)
                  ? 'He looks a lot better. Where is he going?'
                  : 'Where is he going?',
              },
              options: [
                { id: 'er', label: 'To the ER with you' },
                { id: 'observe', label: 'We will watch him here' },
                { id: 'home', label: 'Home with his escort' },
                { id: 'finish', label: 'We will finish the procedure' },
              ],
            },
          }),
        },
      ],
      skips,
    ),
  ],

  phases: sedatable({
    onset: {
      drive: (ctx) => reacting(ctx, false),
      transitions: [
        {
          when: (ctx) => ctx.phaseT >= 12 && !ctx.has('welts_seen'),
          to: 'stay',
          beat: {
            scene:
              'Blotchy red welts above his collar, spreading onto his chest. Each breath now ends in a soft whistle.',
            voice: { who: 'DA', line: 'Doc… look at his neck.' },
            log: 'Welts on the neck, wheeze',
            flags: ['welts_seen'],
          },
        },
        {
          when: (ctx) => firstImAt(ctx) !== null,
          to: 'responding',
          beat: {
            scene: 'The whistle softens a little. For the moment he is holding.',
            log: 'Responding to epinephrine',
            tone: 'good',
          },
        },
      ],
      nudges: [
        {
          after: 45,
          when: (ctx) => ctx.given('epinephrine').length === 0,
          voice: { who: 'DA', line: 'His lips look puffy. He’s scratching at his arm.' },
        },
        {
          after: 70,
          when: (ctx) => ctx.given('epinephrine').length === 0,
          voice: { who: 'DA', line: 'This looks like an allergic reaction. Epinephrine?' },
          coachedOnly: true,
        },
      ],
    },

    responding: {
      drive: (ctx) => ({
        spo2Rate: ctx.on('o2') ? 0.06 : 0.02,
        hr: toward(120, 0.4),
        sbp: toward(fluidsRunning(ctx) ? 100 : 94, 0.5),
        dbp: toward(58, 0.3),
        rr: 22,
        etco2: toward(37, 0.1),
        capno: 'sharkfin',
        airway: 'open',
        look: FLUSHED,
      }),
      transitions: [
        {
          // The wait for the second dose is skipped, never shortened: the
          // story resumes exactly five minutes after the first one went in.
          when: firstDoseWaitOver,
          to: 'relapse',
          beat: (ctx) => ({
            scene:
              'The hives are everywhere now. His tongue is thick and there is a harsh edge to each breath in. He is grey and sweaty.',
            voice: {
              who: 'DA',
              // Only true of the pen if the pen is what went in.
              line:
                ctx.at('auviq_adult') !== null
                  ? 'That’s five minutes since the pen, Doc. And that was our only adult pen.'
                  : 'That’s five minutes since the first dose, Doc.',
            },
            log: 'Five minutes on: worse again',
            tone: 'bad',
            cut: {
              seconds: secondDoseWaitLeft(ctx),
              title: 'Five minutes after the first dose',
              vitals: {
                hr: 132,
                spo2: ctx.on('o2') ? 93 : 91,
                sbp: fluidsRunning(ctx) ? 82 : 76,
                dbp: fluidsRunning(ctx) ? 46 : 42,
                etco2: 41,
                rr: 26,
              },
            },
          }),
        },
      ],
      nudges: [
        {
          after: 20,
          when: (ctx) => ctx.at('call_911') === null,
          voice: { who: 'Front desk', line: 'Do you need me to call anyone?' },
          coachedOnly: true,
        },
      ],
    },

    relapse: {
      drive: (ctx) => reacting(ctx, true),
      transitions: [
        {
          when: (ctx) => secondImAt(ctx) !== null,
          to: 'settling',
          beat: {
            scene: 'Second dose in. The harsh edge on his breathing eases almost at once.',
            log: 'Second IM dose given',
            tone: 'good',
          },
        },
      ],
      nudges: [
        {
          after: 25,
          when: (ctx) => secondImAt(ctx) === null,
          voice: { who: 'DA', line: 'Pressure’s still falling. He looks worse.' },
        },
        {
          after: 50,
          when: (ctx) => secondImAt(ctx) === null,
          voice: { who: 'DA', line: 'The ampules are in the drug tray. Do you want one drawn up?' },
          coachedOnly: true,
        },
      ],
    },

    settling: {
      drive: (ctx) => {
        const fluids = fluidsRunning(ctx);
        return {
          spo2Rate: ctx.on('o2') ? 0.08 : 0.04,
          hr: toward(108, 0.5),
          // Without fluids the second dose holds him, but the pressure will not come up.
          sbp: toward(fluids ? 108 : 84, 0.45),
          dbp: toward(fluids ? 66 : 48, 0.3),
          rr: 20,
          etco2: toward(37, 0.2),
          capno: ctx.phaseT > 20 ? 'normal' : 'sharkfin',
          airway: 'open',
          look: BETTER,
        };
      },
      // An ambulance that was called is handled for every phase in `always`.
      transitions: [
        {
          when: (ctx) =>
            ctx.at('call_911') === null &&
            waitedOnHim(ctx, 30) &&
            ctx.answer('late_911') === null &&
            !ctx.has('asked_late_911'),
          to: 'stay',
          beat: (ctx) => ({
            flags: ['asked_late_911'],
            prompt: {
              id: 'late_911',
              voice: {
                who: 'Front desk',
                line: steady(ctx)
                  ? 'He looks better. Do you still want an ambulance?'
                  : 'Do you want an ambulance?',
              },
              options: [
                { id: 'call', label: 'Call 911' },
                { id: 'no', label: 'No, we will watch him' },
              ],
            },
          }),
        },
        {
          when: (ctx) => ctx.answer('late_911') === 'no',
          to: 'end:no_ems',
        },
      ],
      nudges: [
        {
          after: 18,
          // Said only while it is true: a late second dose leaves him lower than that.
          when: (ctx) => {
            const sbp = Math.round(ctx.vitals.sbp);
            return !fluidsRunning(ctx) && sbp >= 80 && sbp < 90;
          },
          voice: { who: 'DA', line: 'Pressure’s stuck in the eighties.' },
        },
      ],
    },

    handover: {
      drive: (ctx) => ({
        spo2Rate: 0.05,
        hr: toward(104, 0.3),
        sbp: toward(fluidsRunning(ctx) ? 112 : 86, 0.2),
        dbp: toward(fluidsRunning(ctx) ? 68 : 50, 0.2),
        rr: 18,
        etco2: toward(37, 0.2),
        capno: 'normal',
        airway: 'open',
        look: BETTER,
      }),
      transitions: [
        { when: (ctx) => ctx.answer('disposition') === 'er', to: 'end:er' },
        { when: (ctx) => ctx.answer('disposition') !== null, to: 'end:kept' },
      ],
    },

    [OVERDOSE.key]: OVERDOSE.phase,
    [PARALYSED.key]: PARALYSED.phase,
  }),

  reactions: {
    ...WITH_A_PULSE,

    stop: () => ({ log: 'Procedure stopped', voice: { who: 'DA', line: 'Instruments out.' } }),

    o2: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? { voice: { who: 'DA', line: 'Nitrous off. Oxygen at 100%.' }, log: 'N₂O off, 100% O₂' }
        : undefined,

    stimulate: () => ({
      scene:
        'He opens his eyes and mumbles something you cannot make out, then pulls at the nasal hood.',
      log: 'Stimulated',
    }),

    pos_flat_legs_up: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? {
            scene: 'Chair flat, legs up. His breathing gets noisier lying back.',
            log: 'Flat, legs up',
          }
        : undefined,

    pos_sit_up: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? { scene: 'Back of the chair up. He takes a deeper breath.', log: 'Sitting up' }
        : undefined,

    saline: (ctx) =>
      ctx.count('saline') > 1
        ? { voice: { who: 'DA', line: 'It’s already running wide open.' } }
        : {
            voice: { who: 'DA', line: 'Saline’s up in place of the D5W. Wide open.' },
            log: 'Saline bolus running',
            tone: 'good',
          },

    call_911: (ctx) =>
      ctx.count('call_911') > 1
        ? { voice: { who: 'Front desk', line: 'They’re already on the way.' } }
        : {
            voice: { who: 'Front desk', line: '911 is on the way. About eight minutes.' },
            log: '911 called',
            tone: 'good',
          },

    auviq_adult: (ctx) => ({
      voice: {
        who: 'DA',
        line: ctx.phase === 'onset' ? 'Pen’s in. I have the time.' : 'Pen’s in.',
      },
      log: 'Auvi-Q 0.3 mg, thigh',
      tone: 'good',
    }),

    pen_peds: () => ({
      voice: { who: 'DA', line: 'That was the pediatric pen, Doc.' },
      log: 'Auto-injector 0.15 mg (pediatric), thigh',
    }),

    albuterol: (_ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      const puffs = Math.round(dose.mcg / MCG_PER_PUFF);
      return {
        scene: 'You hold the spacer to his face. Sedated, he takes some of it.',
        log: `Albuterol, ${puffs} ${puffs === 1 ? 'puff' : 'puffs'}`,
      };
    },

    'draw:epinephrine': (ctx) =>
      ctx.phase === 'relapse'
        ? {
            voice: {
              who: 'DA',
              // A temptation, on purpose, and nothing more: no claim about what it would do.
              line: 'Want me to push that in the line, Doc?',
            },
          }
        : undefined,

    'give:epinephrine': (ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      // The vein is handled by the overdose beat; this is the thigh.
      if (dose.route !== 'IM') return { log: doseLine(dose) };
      const injected = shots(ctx).at(-1);
      if (injected && overProtocolDose(AMPULE, injected.mcg)) {
        return {
          scene:
            'Within a minute his pulse is hammering at his neck. He is shaking and white around the mouth.',
          voice: { who: 'DA', line: 'That was a lot more than the pen, Doc.' },
          log: doseLine(dose),
          tone: 'bad',
          bump: { hr: 34, sbp: 30 },
        };
      }
      return { voice: { who: 'DA', line: 'In the thigh. I have the time.' }, log: doseLine(dose) };
    },

    'give:fentanyl': sedativeGiven(GIVEN),
    'give:midazolam': sedativeGiven(GIVEN),
    'give:naloxone': reversalGiven,
    'give:flumazenil': reversalGiven,

    'answer:late_911': (_ctx, e) =>
      e.kind === 'answer' && e.optionId === 'call'
        ? {
            voice: { who: 'Front desk', line: 'Calling now.' },
            log: '911 called',
            counts: ['call_911'],
          }
        : { log: 'No ambulance called' },

    'answer:disposition': (_ctx, e) =>
      e.kind === 'answer'
        ? { log: e.optionId === 'er' ? 'Sent to the ER with EMS' : 'Kept out of the ER' }
        : undefined,
  },

  endings: {
    er: {
      outcome: 'handover',
      title: 'Handed over to EMS',
      text: 'He leaves on the stretcher, awake and talking, for observation in the ER.',
    },
    kept: {
      outcome: 'recovered',
      title: 'Better, and not in the ER',
      text: 'He is better for now and EMS has left without him. This reaction can come back.',
    },
    no_ems: {
      outcome: 'recovered',
      title: 'Better, and nobody is coming',
      text: 'He is better for now. No ambulance was called, and this reaction can come back.',
    },
    ...endingsAsFound(TAKEN),
    [OVERDOSE.key]: OVERDOSE.ending,
    [PARALYSED.key]: PARALYSED.ending,
    arrest: {
      outcome: 'arrest',
      title: 'No pulse',
      text: 'His pressure fell too far for too long, and his pulse is gone. The run stops here.',
    },
  },

  rubric: [
    {
      id: 'pen_first',
      ref: { protocol: 'anaphylaxis', step: 'Auvi-Q 0.3 first' },
      tier: 'core',
      parts: [
        {
          quote: 'Auvi-Q 0.3 first',
          check: (run) => run.given('epinephrine')[0]?.device === 'auviq_adult',
        },
        {
          quote: NEVER,
          check: (run) => {
            const relapse = run.entered('relapse');
            const early = (d: DoseEvent): boolean => relapse === null || d.t < relapse;
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
      ref: { protocol: 'anaphylaxis', step: 'DA calls 911' },
      tier: 'core',
      parts: [
        {
          // With the first dose: before the story has moved on to the second.
          quote: 'At the same time',
          check: (run) => {
            const called = run.at('call_911');
            if (called === null) return false;
            const relapse = run.entered('relapse');
            return relapse === null || called < relapse;
          },
        },
        { quote: 'DA calls 911', check: (run) => run.at('call_911') !== null },
      ],
      when: (run) => run.at('call_911'),
    },
    {
      id: 'position',
      ref: { protocol: 'anaphylaxis', step: 'Lie flat, legs up' },
      tier: 'core',
      check: (run) =>
        positioned(run) &&
        (heldBeforeEms(run, 'pos_flat_legs_up') || heldBeforeEms(run, 'pos_sit_up')),
      when: (run) => run.last('pos_flat_legs_up') ?? run.last('pos_sit_up'),
    },
    {
      id: 'o2',
      ref: { protocol: 'anaphylaxis', step: 'O₂ to >94%' },
      tier: 'core',
      // A target, so it counts while the oxygen is still on, if it went on before EMS arrived.
      check: (run) => run.on('o2') && heldBeforeEms(run, 'o2'),
      when: (run) => run.last('o2'),
    },
    {
      id: 'albuterol',
      ref: { protocol: 'anaphylaxis', step: 'Albuterol (if wheezing)' },
      tier: 'extra',
      check: (run) => {
        const puffs = run.given('albuterol').reduce((sum, d) => sum + d.mcg, 0) / MCG_PER_PUFF;
        const range = /^(\d+)-(\d+) puffs$/.exec(ALBUTEROL.dose);
        if (!range) return puffs > 0;
        return puffs >= Number(range[1]) && puffs <= Number(range[2]);
      },
      when: (run) => run.at('albuterol'),
    },
    {
      id: 'fluids',
      ref: { protocol: 'anaphylaxis', step: '500 ml saline bolus, wide open' },
      tier: 'core',
      check: (run) => doneBeforeEms(run, 'saline'),
      when: (run) => run.at('saline'),
    },
    {
      id: 'second_im',
      ref: { protocol: 'anaphylaxis', step: 'second IM dose from the ampule' },
      tier: 'core',
      parts: [
        {
          quote: '5 min, not better',
          check: (run) => {
            const [first, second] = shots(run);
            if (!first || !second) return null;
            return second.t - first.t >= SECOND_DOSE_AFTER - 1;
          },
        },
        {
          quote: 'second IM dose from the ampule',
          check: (run) => {
            // Any injection over the ampule dose, at any point, is not this step.
            if (shots(run).some((a) => overProtocolDose(AMPULE, a.mcg))) return false;
            const relapse = run.entered('relapse');
            if (relapse === null) return null;
            const drawn = run
              .given('epinephrine')
              .filter((d) => d.t >= relapse && d.device === null);
            return gaveProtocolDose(AMPULE, drawn);
          },
        },
        {
          quote: 'Repeat every 5-15 min',
          check: (run) => {
            const given = shots(run);
            if (given.length < 3) return null;
            return given
              .slice(2)
              .every((a, i) => a.t - (given[i + 1]?.t ?? a.t) >= REPEAT_NO_SOONER - 1);
          },
        },
        {
          quote: NEVER,
          check: (run) => {
            const relapse = run.entered('relapse');
            if (relapse === null) return null;
            if (!run.given('epinephrine').some((d) => d.t >= relapse)) return null;
            const vein = epinephrineIntoVein(run);
            return !(vein && vein.t >= relapse);
          },
        },
      ],
      when: (run) => {
        const relapse = run.entered('relapse');
        return relapse === null
          ? null
          : (run.given('epinephrine').find((d) => d.t >= relapse && d.device === null)?.t ?? null);
      },
    },
    {
      id: 'epi_label',
      ref: { protocol: 'anaphylaxis', drug: 'Epinephrine', note: 'label the syringe' },
      tier: 'core',
      check: (run) => {
        const drawn = run.given('epinephrine').filter((d) => d.device === null);
        return drawn.length === 0 ? null : drawn.every((d) => d.labeled);
      },
    },
    {
      id: 'diphenhydramine',
      ref: { protocol: 'anaphylaxis', step: 'Diphenhydramine IV or IM' },
      tier: 'extra',
      check: (run) => {
        const doses = run.given('diphenhydramine');
        const range = doseRangeOf(DIPHENHYDRAMINE);
        const total = doses.reduce((sum, d) => sum + d.mcg, 0);
        return total >= range.minMcg * 0.99 && total <= range.maxMcg * 1.01;
      },
      when: (run) => run.given('diphenhydramine')[0]?.t ?? null,
    },
    {
      id: 'steroid',
      ref: { protocol: 'anaphylaxis', step: 'Steroid add-on after epinephrine' },
      tier: 'extra',
      check: (run) => {
        const given = run.given('solumedrol');
        // The written alternative was used instead: this line does not apply.
        if (given.length === 0 && run.given('dexamethasone').length > 0) return null;
        return afterEpinephrine(run, given) && gaveProtocolDose(STEROID, given);
      },
      when: (run) => run.given('solumedrol')[0]?.t ?? null,
    },
    {
      id: 'dexamethasone',
      ref: { protocol: 'anaphylaxis', step: 'Alternative: Dexamethasone IV' },
      tier: 'extra',
      check: (run) => {
        const given = run.given('dexamethasone');
        if (given.length === 0) return null;
        return afterEpinephrine(run, given) && gaveProtocolDose(DEXAMETHASONE, given);
      },
      when: (run) => run.given('dexamethasone')[0]?.t ?? null,
    },
    {
      id: 'er',
      ref: { protocol: 'anaphylaxis', step: 'Every anaphylaxis goes to the ER' },
      tier: 'core',
      check: (run) => {
        const answer = run.answer('disposition');
        if (answer !== null) return answer === 'er';
        // Never asked: only counts against the run if it ended without EMS by choice.
        return run.answer('late_911') === 'no' ? false : null;
      },
    },
  ],
};
