import {
  calloutAt,
  doseRangeOf,
  gaveProtocolDose,
  numberInStep,
  overProtocolDose,
  phraseInStep,
} from '@/engine/protocol';
import type { Beat, Ctx, Drive, Look, Phase, Prompt, Scenario } from '@/engine/types';

import { reachedAt, toward, within } from './helpers';
import {
  AIR_SEEN_GOING_IN,
  airwayOpened,
  airwayOpenedSince,
  type AsFound,
  baggedThroughParalysis,
  baggedUntilBreathing,
  bagMovesAir,
  bagNeedsWayIn,
  breathingWell,
  chestLine,
  doseLine,
  doseOf,
  emsArrives,
  endingsAsFound,
  epinephrineOverdose,
  FOUND,
  hypoxicHeartRate,
  MASK_HELD,
  moreSedative,
  PARALYSIS_CUT,
  paralysisSkip,
  pendingParalysis,
  sedatable,
  sedativeGiven,
  SUCCINYLCHOLINE,
  succinylcholineAsWritten,
  succinylcholineSoFar,
  takenAsFound,
  ventilatedDuring,
} from './shared';

/**
 * "Shallow": a sedated patient stops breathing well, is bagged and reversed,
 * wakes, then goes into laryngospasm. Its first name was "Quiet", which is
 * still its id: run records are kept under the id.
 *
 * Graded against Hypoventilation, Oversedation (Opioid) and Laryngospasm.
 * The bag is held to the BVM page: it moves air only through an opened
 * airway (`bagNeedsWayIn`), in the snoring patient and the paralysed one.
 * The numbers below are pacing, not pharmacology: how fast the saturation
 * falls and how long a drug takes are tuned so the run is tense but fair in
 * real time. What counts as *correct* is never decided here. It comes from
 * the protocol text each rubric item points at.
 */

const NALOXONE = calloutAt('oversedation_opioid', 'Naloxone IV');
const FLUMAZENIL = calloutAt('oversedation_benzo', 'Flumazenil IV');

/** The patient responds once the protocol's smallest dose is in. */
const NALOXONE_WAKES_AT_MCG = doseRangeOf(NALOXONE).minMcg;
const FLUMAZENIL_HELPS_AT_MCG = doseRangeOf(FLUMAZENIL).minMcg;
/** Seconds from an IV dose to the patient rousing. */
const IV_ONSET = 28;
const IM_ONSET = 120;
/** A throat suctioned this recently is still clear when the spasm starts. */
const SUCTION_STILL_CLEAR = 10;

const OVERDOSE = epinephrineOverdose(
  'normal',
  (ctx) => (ctx.phase === 'spasm' ? 'shut' : ctx.phase === 'paralyzed' ? 'paralysed' : null),
  bagMovesAir,
);

const SEDATED: Look = { color: 'pale', eyes: 'closed', note: 'slack jaw, snoring softly' };
const DUSKY: Look = { color: 'dusky', eyes: 'closed', note: 'lips turning blue' };

function wakeAt(ctx: Ctx): number | null {
  const doses = ctx.given('naloxone');
  const iv = reachedAt(doses, NALOXONE_WAKES_AT_MCG, (d) => d.route === 'IV');
  const any = reachedAt(doses, NALOXONE_WAKES_AT_MCG);
  if (iv !== null) return iv + IV_ONSET;
  return any === null ? null : any + IM_ONSET;
}

function flumazenilHelping(ctx: Ctx): boolean {
  const at = reachedAt(ctx.given('flumazenil'), FLUMAZENIL_HELPS_AT_MCG);
  return at !== null && ctx.t - at >= 18;
}

/**
 * Set when the throat is suctioned in the spasm, or was suctioned so close
 * before it that it was still clear. A flag and not a time: suction again
 * once the spasm is over must neither earn the step nor take it away.
 */
const SUCTIONED_FOR_SPASM = 'suctioned_for_spasm';

function suctionedForSpasm(ctx: Ctx): boolean {
  return ctx.has(SUCTIONED_FOR_SPASM);
}

/** Only someone holding a bag or a mask can feel air go in, or be coughed against. */
function maskHeld(ctx: Ctx): boolean {
  return ctx.on('bvm') || ctx.on('cpap');
}

/** The bag is what moves his chest in these two phases, so the assistant speaks of it there. */
const BAG_BREATHES_FOR_HIM = ['hypo', 'paralyzed'] as const;

/** Every phase with the BVM page's rule for the bag, and the sedative's effect, laid over its drive. */
function bagAndSedative(phases: Readonly<Record<string, Phase>>): Record<string, Phase> {
  return sedatable(bagNeedsWayIn(phases, BAG_BREATHES_FOR_HIM));
}

/**
 * When the spasm ended: the paralysis that broke it. A run that was already
 * paralysed once before the spasm keeps no time for the second paralysis, so
 * there the bound is his first breath after it. `null` while it has not ended.
 */
function spasmEnded(run: Ctx): number | null {
  const spasm = run.entered('spasm');
  if (spasm === null) return null;
  const paralysed = run.entered('paralyzed');
  return paralysed !== null && paralysed > spasm ? paralysed : run.entered('breathing');
}

/** Done for the spasm: before it was over, however early. Afterwards is too late to count. */
function doneForSpasm(run: Ctx, action: string): boolean | null {
  if (run.entered('spasm') === null) return null;
  const done = run.at(action);
  const ended = spasmEnded(run);
  return done !== null && (ended === null || done < ended);
}

function hypoDrive(ctx: Ctx): Drive {
  const bagging = bagMovesAir(ctx);
  const stimulated = within(ctx, 'stimulate', 6);
  const partly = flumazenilHelping(ctx);
  const airwayHelp = (ctx.on('jaw_thrust') ? 0.7 : 1) * (ctx.on('npa') ? 0.85 : 1);
  const fall = 0.22 * (ctx.on('o2') ? 0.6 : 1) * airwayHelp * (partly ? 0.4 : 1);
  // A stimulated breath slows the fall. It never turns it around: only the bag does.
  const spo2Rate = bagging ? (ctx.on('o2') ? 0.55 : 0.4) : stimulated ? -fall * 0.3 : -fall;
  const low = ctx.vitals.spo2 < 86;
  return {
    spo2Rate,
    hr: hypoxicHeartRate(ctx, low ? 52 : 58),
    sbp: toward(102, 0.05),
    dbp: toward(60, 0.05),
    rr: stimulated ? 8 : partly ? 7 : ctx.phaseT < 10 && ctx.entered('paralyzed') === null ? 6 : 4,
    etco2: bagging ? toward(44, 1.2) : toward(68, 0.15),
    capno: 'normal',
    airway: 'open',
    look: low ? DUSKY : SEDATED,
  };
}

/** `null` until the step's own act was done: not giving a sedative is no credit by itself. */
function stoppedSedatives(run: Ctx): boolean | null {
  if (moreSedative(run)) return false;
  return run.onDuring('o2', 'hypo') ? true : null;
}

/**
 * 911 belongs to the spasm: `null` in a run that never reached it. The page
 * lists the call after the succinylcholine, so it counts through the
 * paralysis, however early it was made. Once he is breathing on his own
 * again it is too late to count.
 */
function called911InSpasm(run: Ctx): boolean | null {
  if (run.entered('spasm') === null) return null;
  const called = run.at('call_911');
  const breathing = run.entered('breathing');
  return called !== null && (breathing === null || called < breathing);
}

/**
 * How long a patient may still need the bag before someone else calls: the
 * BVM page's "still needs the bag after 2 minutes: Call 911", read from the
 * page so the front desk asks when the page says to.
 */
const STILL_ON_THE_BAG_SEC =
  numberInStep('bvm', 'still needs the bag after', /still needs the bag after (\d+) minutes/) * 60;

/**
 * Asked of a team still bagging him with nobody called (owner's wording, Nov
 * 2026). Without it a run that bags and never reverses or calls had no ending.
 */
const FRONT_DESK_ASKS: Prompt = {
  id: 'front_desk_911',
  voice: { who: 'Front desk', line: 'Do you want me to call 911?' },
  options: [
    { id: 'call', label: 'Call 911' },
    { id: 'not_yet', label: 'Not yet' },
  ],
};

/** When she last asked, or was last told "Not yet". The story's own marker, not on the cart. */
const ASKED_TO_CALL = 'asked:front_desk_911';

/** Since when air from the bag has been going in, or `null` while none is. */
function airGoingInSince(ctx: Ctx): number | null {
  const bag = ctx.last('bvm');
  const open = airwayOpenedSince(ctx);
  return bagMovesAir(ctx) && bag !== null && open !== null ? Math.max(bag, open) : null;
}

/** The front desk makes the call: said and logged the same whether it was tapped or answered. */
const CALLED_911: Beat = {
  voice: { who: 'Front desk', line: '911 is on the way. About eight minutes.' },
  log: '911 called',
  tone: 'good',
};

const GIVEN = 'Given: midazolam 4 mg and fentanyl 50 mcg. Last dose six minutes ago.';
/** Red in the log here: both pages this drill opens on say to stop sedatives. */
const SEDATIVE_GIVEN = sedativeGiven(GIVEN, 'bad');

/** How EMS finds him if they are at the door before the story is over. */
const TAKEN: ReadonlyArray<AsFound> = [
  {
    key: 'ems_bagged',
    seen: FOUND.bagged,
    when: (ctx) => (ctx.phase === 'hypo' || ctx.phase === 'paralyzed') && ctx.on('bvm'),
  },
  {
    key: 'ems_poorly',
    seen: `He has not woken and is still ${phraseInStep(
      'hypoventilation',
      'Still breathing poorly',
      'breathing poorly',
    )}.`,
    when: (ctx) => ctx.phase === 'hypo' && !ctx.on('bvm'),
  },
  {
    key: 'ems_paralysed',
    seen: FOUND.paralysed,
    when: (ctx) => ctx.phase === 'paralyzed' && !ctx.on('bvm'),
  },
  { key: 'ems_no_air', seen: FOUND.noAir, when: (ctx) => ctx.phase === 'spasm' },
  {
    key: 'ems_awake',
    seen: FOUND.awake,
    when: (ctx) => ctx.phase === 'waking' || ctx.phase === 'breathing',
  },
];

export const quiet: Scenario = {
  id: 'quiet',
  title: 'Shallow',
  tagline: 'The room is calm. Then the monitor changes.',
  protocols: ['hypoventilation', 'oversedation_opioid', 'laryngospasm'],
  floridaTopics: ['Hyperventilation / hypoventilation', 'Laryngospasm'],
  patient: { name: 'Mr. Daniels', summary: '54-year-old man, 190 lb' },
  setup: [
    'Extraction of #30. The tooth is out and you are placing sutures.',
    'IV: 22 G, right dorsal hand, D5W running.',
    GIVEN,
    'N₂O/O₂ by nasal hood. Edan monitor with capnography.',
  ],
  startsAtMin: 10 * 60 + 42,
  initial: {
    phase: 'hypo',
    // A cold open: the monitor changes before anyone says a word.
    vitals: { hr: 62, spo2: 96, sbp: 104, dbp: 62, etco2: 54, rr: 6 },
    capno: 'normal',
    look: SEDATED,
    scene: 'The tooth is out and you are placing sutures. The room is quiet.',
  },

  always: [
    OVERDOSE.transition,
    {
      when: (ctx) => ctx.vitals.spo2 < 60,
      to: 'end:arrest',
      beat: { log: 'Pulse lost', tone: 'bad' },
    },
    {
      when: (ctx) => {
        const sux = pendingParalysis(ctx);
        return (
          ctx.phase !== 'paralyzed' && ctx.phase !== OVERDOSE.key && sux !== null && ctx.t >= sux.at
        );
      },
      to: 'paralyzed',
      beat: (ctx) => {
        const flags = pendingParalysis(ctx)?.flags ?? [];
        // Air is felt going in only through an airway someone has opened.
        const masked = maskHeld(ctx) && airwayOpened(ctx);
        return ctx.phase === 'spasm'
          ? {
              flags,
              ...(masked ? { counts: AIR_SEEN_GOING_IN } : {}),
              scene: masked
                ? 'A fine flicker runs under the skin of his chest and shoulders. Then the bag gives: the cords have let go. He is not breathing at all now.'
                : 'A fine flicker runs under the skin of his chest and shoulders, and the heaving stops. The cords have let go. He is not breathing at all now.',
              voice: { who: 'DA', line: masked ? 'It’s going in!' : 'He’s gone limp!' },
              log: 'Spasm broken by succinylcholine',
              tone: 'good',
            }
          : {
              flags,
              scene:
                'A fine flicker runs under his skin, then he goes completely still. He is not breathing at all.',
              voice: { who: 'DA', line: 'He’s stopped breathing completely!' },
              log: 'Paralysed by succinylcholine',
              tone: 'bad',
            };
      },
    },
    ...emsArrives(TAKEN.map(takenAsFound), paralysisSkip),
  ],

  phases: bagAndSedative({
    hypo: {
      drive: hypoDrive,
      transitions: [
        {
          when: (ctx) => {
            const at = wakeAt(ctx);
            return at !== null && ctx.t >= at;
          },
          to: 'waking',
          // The mask and the hand on it are in the scene only while one is held on him.
          beat: (ctx) => ({
            scene: `His eyebrows twitch.${
              maskHeld(ctx)
                ? ' He coughs against the mask, swallows hard and turns his head away from your hand.'
                : ''
            }`,
            voice: { who: 'DA', line: 'He’s coming around.' },
            log: 'Rousing after naloxone',
            tone: 'good',
          }),
        },
        {
          // Still on the bag with nobody called: the front desk asks, and asks
          // again the same wait after she last asked or was told "Not yet".
          when: (ctx) => {
            const since = airGoingInSince(ctx);
            if (since === null || ctx.at('call_911') !== null) return false;
            const asked = ctx.last(ASKED_TO_CALL) ?? -Infinity;
            return ctx.t - Math.max(since, asked) >= STILL_ON_THE_BAG_SEC;
          },
          to: 'stay',
          beat: { counts: [ASKED_TO_CALL], prompt: FRONT_DESK_ASKS },
        },
      ],
      nudges: [
        {
          after: 10,
          // Said to a team that has not noticed. One already bagging him has.
          when: (ctx) =>
            ctx.entered('paralyzed') === null &&
            ctx.given('naloxone').length === 0 &&
            !ctx.on('bvm'),
          voice: { who: 'DA', line: 'Doc… he’s not really breathing much.' },
        },
        {
          after: 26,
          // A bag that moves no air is not holding his saturation up either.
          when: (ctx) => !bagMovesAir(ctx) && ctx.vitals.spo2 < 90,
          voice: { who: 'DA', line: 'Sats are dropping. What do you need?' },
        },
        {
          after: 30,
          when: (ctx) => !ctx.on('bvm') && ctx.vitals.spo2 < 86,
          voice: { who: 'DA', line: 'Still dropping. Do you want me to bag him?' },
          coachedOnly: true,
        },
        {
          after: 45,
          when: (ctx) => bagMovesAir(ctx) && ctx.given('naloxone').length === 0,
          voice: { who: 'DA', line: 'I can keep bagging. Are we reversing him?' },
          coachedOnly: true,
        },
      ],
    },

    waking: {
      drive: () => ({
        spo2Rate: 0.5,
        hr: toward(82, 3),
        sbp: toward(118, 1),
        dbp: toward(70, 0.6),
        rr: 12,
        etco2: toward(46, 2),
        capno: 'normal',
        airway: 'open',
        look: { color: 'pink', eyes: 'open', note: 'coughing, moving' },
      }),
      transitions: [
        {
          when: (ctx) => ctx.phaseT >= 9,
          to: 'spasm',
          // The spasm comes either way. The scene does not blame blood that was just
          // suctioned, and names no mask or bag that nobody is holding.
          beat: (ctx) => {
            const clear = within(ctx, 'suction', SUCTION_STILL_CLEAR);
            const masked = maskHeld(ctx);
            const crowing =
              'A high, harsh crowing on the way in, then nothing. His chest heaves but no air is moving.';
            return {
              scene: clear
                ? `${masked ? 'He coughs hard against the mask. ' : ''}${crowing}`
                : `He gags on the blood and saliva pooled at the back of his throat. ${crowing}`,
              voice: {
                who: 'DA',
                line: masked
                  ? 'I can’t get air in! It won’t go!'
                  : 'He’s gone quiet. Nothing’s moving!',
              },
              log: 'Crowing, then no air movement',
              tone: 'bad',
              flags: clear ? [SUCTIONED_FOR_SPASM] : [],
            };
          },
        },
      ],
    },

    spasm: {
      drive: (ctx) => {
        const help =
          (suctionedForSpasm(ctx) ? 0.85 : 1) *
          (ctx.on('jaw_thrust') ? 0.9 : 1) *
          (ctx.on('larson') ? 0.85 : 1) *
          (ctx.on('cpap') ? 0.8 : 1);
        return {
          spo2Rate: -0.5 * help,
          hr: hypoxicHeartRate(ctx, 112),
          sbp: toward(138, 1),
          dbp: toward(84, 0.6),
          rr: 0,
          etco2: null,
          capno: 'flat',
          airway: 'closed',
          look: {
            color: ctx.vitals.spo2 < 85 ? 'dusky' : 'pale',
            eyes: 'open',
            // The words change with the colour: colour is never the only signal.
            note:
              ctx.vitals.spo2 < 85 ? 'chest heaving, lips turning blue' : 'chest heaving, no sound',
          },
        };
      },
      // The way out is succinylcholine, handled for every phase in `always`.
      transitions: [],
      nudges: [
        {
          after: 12,
          when: (ctx) => !suctionedForSpasm(ctx),
          voice: { who: 'DA', line: 'There’s blood back there. Suction?' },
          coachedOnly: true,
        },
        {
          after: 24,
          when: (ctx) => ctx.vitals.spo2 < 86,
          voice: { who: 'DA', line: 'His sats are still dropping… Doc!' },
        },
        {
          after: 40,
          when: (ctx) => ctx.given('succinylcholine').length === 0,
          voice: { who: 'DA', line: 'It’s not breaking. What’s next?' },
        },
      ],
    },

    paralyzed: {
      drive: (ctx) => {
        const bagging = bagMovesAir(ctx);
        return {
          spo2Rate: bagging ? 0.7 : -0.75,
          hr: hypoxicHeartRate(ctx, 92),
          sbp: toward(122, 1),
          dbp: toward(74, 0.6),
          rr: 0,
          etco2: bagging ? toward(40, 3) : null,
          capno: 'normal',
          airway: 'open',
          look: {
            color: ctx.vitals.spo2 < 85 ? 'dusky' : 'pale',
            eyes: 'closed',
            note:
              ctx.vitals.spo2 < 85 ? 'paralysed, lips turning blue' : 'paralysed, not breathing',
          },
        };
      },
      transitions: [
        {
          // Given before any spasm and without reversal, the paralysis wears
          // off onto the same opioid that started this.
          when: (ctx) => baggedThroughParalysis(ctx) && wakeAt(ctx) === null,
          to: 'hypo',
          beat: (ctx) => ({
            flags: succinylcholineSoFar(ctx),
            scene:
              'The succinylcholine has worn off. He takes a slow, shallow breath, then another.',
            log: 'Paralysis worn off, still sedated',
            cut: PARALYSIS_CUT,
          }),
        },
        {
          // The twist cannot be skipped by paralysing him early: he still
          // wakes with a throat full of blood.
          when: (ctx) => baggedThroughParalysis(ctx) && ctx.entered('spasm') === null,
          to: 'waking',
          beat: (ctx) => ({
            flags: succinylcholineSoFar(ctx),
            scene:
              'The succinylcholine has worn off and the naloxone is working. He stirs, coughs and swallows hard.',
            voice: { who: 'DA', line: 'He’s coming around.' },
            log: 'Paralysis worn off, rousing',
            cut: PARALYSIS_CUT,
          }),
        },
        {
          when: baggedThroughParalysis,
          to: 'breathing',
          beat: (ctx) => ({
            flags: succinylcholineSoFar(ctx),
            scene: 'He takes a breath against the bag. Then another, on his own.',
            voice: { who: 'DA', line: 'He’s breathing with me.' },
            log: 'Breathing on his own',
            tone: 'good',
            cut: PARALYSIS_CUT,
          }),
        },
      ],
      nudges: [
        {
          after: 6,
          when: (ctx) => !ctx.on('bvm'),
          voice: { who: 'DA', line: 'He’s not breathing at all!' },
        },
        {
          after: 10,
          when: (ctx) => !ctx.on('bvm'),
          voice: { who: 'DA', line: 'Do I bag him?' },
          coachedOnly: true,
        },
      ],
    },

    breathing: {
      drive: (ctx) => ({
        spo2Rate: ctx.on('o2') || bagMovesAir(ctx) ? 0.6 : 0.25,
        hr: toward(86, 1),
        sbp: toward(124, 0.5),
        dbp: toward(76, 0.4),
        rr: 14,
        etco2: toward(42, 2),
        capno: 'normal',
        airway: 'open',
        look: { color: 'pink', eyes: 'open', note: 'breathing, groggy' },
      }),
      transitions: [
        {
          when: (ctx) => breathingWell(ctx, 8) && ctx.at('call_911') !== null,
          to: 'end:recovered_ems',
        },
        {
          when: (ctx) => breathingWell(ctx, 8),
          to: 'end:recovered',
        },
      ],
    },

    [OVERDOSE.key]: OVERDOSE.phase,
  }),

  reactions: {
    o2: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? { voice: { who: 'DA', line: 'Nitrous off. Oxygen at 100%.' }, log: 'N₂O off, 100% O₂' }
        : undefined,

    stimulate: (ctx) => {
      if (ctx.phase !== 'hypo') return undefined;
      return {
        scene:
          'He frowns, takes one slow breath, then drifts back. His head lolls against your hands.',
        voice: { who: 'You', line: 'Mr. Daniels! Open your eyes!' },
        log: 'Stimulated',
        flags: ['stimulated_while_hypoventilating'],
      };
    },

    bvm: (ctx, e) => {
      if (e.kind !== 'action') return undefined;
      if (!e.on) {
        return ctx.phase === 'paralyzed'
          ? {
              voice: { who: 'DA', line: 'Stopped? He can’t breathe on his own yet!' },
              log: 'BVM stopped',
              tone: 'bad',
            }
          : { log: 'BVM stopped' };
      }
      if (ctx.phase === 'spasm') {
        return {
          voice: { who: 'DA', line: 'It’s like squeezing a rock. Nothing’s going in.' },
          log: 'BVM: no air moving',
        };
      }
      // Where the bag has to raise his chest, it does so only through an opened
      // airway. Anywhere else he is breathing, and the line is as it was.
      const bagRaisesIt = BAG_BREATHES_FOR_HIM.some((phase) => phase === ctx.phase);
      return chestLine(!bagRaisesIt || airwayOpened(ctx));
    },

    cpap: (ctx, e) =>
      e.kind === 'action' && e.on && ctx.phase === 'spasm'
        ? {
            scene: `${MASK_HELD} A thin, high squeak, then silence again.`,
            log: 'Tight seal, steady pressure',
          }
        : undefined,

    suction: (ctx) =>
      ctx.phase === 'spasm'
        ? {
            scene: 'A pool of blood-streaked saliva comes up the suction.',
            log: 'Suctioned',
            tone: 'good',
            flags: [SUCTIONED_FOR_SPASM],
          }
        : undefined,

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

    'give:naloxone': (ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      const total = ctx.given('naloxone').reduce((sum, d) => sum + d.mcg, 0);
      const enough = total >= NALOXONE_WAKES_AT_MCG * 0.99;
      // Green only for the dose and route the protocol writes.
      const asWritten =
        enough && dose.route === NALOXONE.route && !overProtocolDose(NALOXONE, dose.mcg);
      return {
        voice: {
          who: 'DA',
          line: enough ? 'Naloxone’s in.' : 'Naloxone’s in. That didn’t look like much.',
        },
        log: doseLine(dose),
        tone: asWritten ? 'good' : 'neutral',
      };
    },

    'give:flumazenil': (ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      const first = ctx.given('naloxone').length === 0;
      const breathing = ctx.phase === 'waking' || ctx.phase === 'breathing';
      return {
        voice: {
          who: 'DA',
          line: first
            ? 'Flumazenil’s in. He had fentanyl too, Doc.'
            : breathing
              ? 'Flumazenil’s in. He was already breathing, though.'
              : 'Flumazenil’s in.',
        },
        log: doseLine(dose),
      };
    },

    'give:fentanyl': SEDATIVE_GIVEN,
    'give:midazolam': SEDATIVE_GIVEN,

    'give:succinylcholine': (ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      if (ctx.phase !== 'spasm') {
        return {
          voice: { who: 'DA', line: 'Succinylcholine? He isn’t in spasm…' },
          log: doseLine(dose),
          tone: 'bad',
          flags: ['sux_without_spasm'],
        };
      }
      // The same running total that decides whether the spasm breaks.
      const enough = pendingParalysis(ctx) !== null;
      const asWritten =
        enough &&
        dose.route === SUCCINYLCHOLINE.route &&
        !overProtocolDose(SUCCINYLCHOLINE, dose.mcg);
      return {
        voice: {
          who: 'DA',
          line: enough
            ? 'It’s in. Atropine is ready if his rate drops.'
            : 'It’s in. Was that enough?',
        },
        log: doseLine(dose),
        tone: asWritten ? 'good' : 'neutral',
      };
    },
  },

  endings: {
    recovered_ems: {
      outcome: 'recovered',
      title: 'Breathing on his own',
      text: 'He is awake, pink and breathing. EMS is on the way and will take him in for observation.',
    },
    recovered: {
      outcome: 'recovered',
      title: 'Breathing on his own',
      text: 'He is awake, pink and breathing. Nobody has called 911.',
    },
    arrest: {
      outcome: 'arrest',
      title: 'No pulse',
      text: 'His saturation fell too far for too long, and his pulse is gone. The run stops here.',
    },
    [OVERDOSE.key]: OVERDOSE.ending,
    ...endingsAsFound(TAKEN),
  },

  rubric: [
    {
      id: 'o2',
      ref: { protocol: 'hypoventilation', step: 'Turn off N₂O, 100% O₂' },
      tier: 'core',
      parts: [
        { quote: 'Turn off N₂O, 100% O₂', check: (run) => run.onDuring('o2', 'hypo') },
        { quote: 'Stop giving sedatives', check: stoppedSedatives },
      ],
      when: (run) => run.at('o2'),
    },
    {
      id: 'stimulate',
      ref: { protocol: 'hypoventilation', step: 'Stimulate: say their name loudly' },
      tier: 'core',
      check: (run) => run.has('stimulated_while_hypoventilating'),
      when: (run) => run.at('stimulate'),
    },
    {
      id: 'airway',
      ref: { protocol: 'hypoventilation', step: 'Jaw thrust or chin lift' },
      tier: 'core',
      check: (run) => run.onDuring('jaw_thrust', 'hypo') || run.onDuring('npa', 'hypo'),
      when: (run) => run.at('jaw_thrust') ?? run.at('npa'),
    },
    {
      id: 'bvm',
      ref: { protocol: 'hypoventilation', step: 'BVM, 1 breath every 6 seconds' },
      tier: 'core',
      // Squeezed on an unopened airway the whole time, it was not this step: no breath went in.
      check: (run) => ventilatedDuring(run, 'hypo'),
      when: (run) => run.at('bvm'),
    },
    {
      id: 'naloxone',
      ref: { protocol: 'oversedation_opioid', step: 'Naloxone IV' },
      tier: 'core',
      check: (run) => gaveProtocolDose(NALOXONE, run.given('naloxone')),
      when: (run) => run.given('naloxone')[0]?.t ?? null,
    },
    {
      id: 'naloxone_first',
      ref: { protocol: 'oversedation_opioid', step: 'Naloxone first, then flumazenil only if' },
      tier: 'core',
      check: (run) => {
        const naloxone = run.given('naloxone')[0];
        if (!naloxone) return false;
        // "only if still not breathing well": after the naloxone, and never once he is breathing.
        return run
          .given('flumazenil')
          .every((d) => d.t > naloxone.t && d.phase !== 'waking' && d.phase !== 'breathing');
      },
    },
    {
      id: 'naloxone_label',
      ref: { protocol: 'oversedation_opioid', drug: 'Naloxone', note: 'label the syringe' },
      tier: 'core',
      check: (run) => {
        const doses = run.given('naloxone');
        return doses.length === 0 ? null : doses.every((d) => d.labeled);
      },
    },
    // The opioid protocol opens with the same acts in its own words. They are
    // shown there too, and scored once, above.
    {
      id: 'opioid_o2',
      ref: { protocol: 'oversedation_opioid', step: 'Stop sedatives. N₂O off, 100% O₂' },
      tier: 'echo',
      parts: [
        { quote: 'Stop sedatives', check: stoppedSedatives },
        { quote: 'N₂O off, 100% O₂', check: (run) => run.onDuring('o2', 'hypo') },
      ],
      when: (run) => run.at('o2'),
    },
    {
      id: 'opioid_stimulate',
      ref: { protocol: 'oversedation_opioid', step: 'Stimulate: call their name' },
      tier: 'echo',
      check: (run) => run.has('stimulated_while_hypoventilating'),
      when: (run) => run.at('stimulate'),
    },
    {
      id: 'opioid_airway',
      ref: { protocol: 'oversedation_opioid', step: 'BVM if breathing slow or SpO₂ falling' },
      tier: 'echo',
      parts: [
        { quote: 'Jaw thrust', check: (run) => run.onDuring('jaw_thrust', 'hypo') },
        {
          quote: 'BVM if breathing slow or SpO₂ falling',
          check: (run) => ventilatedDuring(run, 'hypo'),
        },
      ],
    },
    {
      id: 'hypo_reverse',
      ref: { protocol: 'hypoventilation', step: 'Reverse: Naloxone for fentanyl' },
      tier: 'echo',
      check: (run) => gaveProtocolDose(NALOXONE, run.given('naloxone')),
      when: (run) => run.given('naloxone')[0]?.t ?? null,
    },
    // The sibling pages word the spasm and its 911 call their own way. Shown
    // there too, and scored once, under Laryngospasm.
    {
      id: 'hypo_no_air',
      ref: { protocol: 'hypoventilation', step: 'BVM not moving the chest' },
      tier: 'echo',
      parts: [
        {
          // His airway shuts at the cords: nothing in this run calls for an airway device.
          quote:
            'BVM not moving the chest: reposition, NPA, oral airway if no gag, then LMA or King',
          check: () => null,
        },
        {
          quote: 'Crowing or no air movement: Laryngospasm',
          check: (run) =>
            run.entered('spasm') === null
              ? null
              : suctionedForSpasm(run) ||
                run.onDuring('larson', 'spasm') ||
                run.onDuring('cpap', 'spasm'),
        },
      ],
    },
    {
      id: 'hypo_911',
      ref: { protocol: 'hypoventilation', step: 'or not waking: Call 911' },
      tier: 'echo',
      check: called911InSpasm,
      when: (run) => run.at('call_911'),
    },
    {
      id: 'opioid_911',
      ref: { protocol: 'oversedation_opioid', step: 'or you cannot ventilate: Call 911' },
      tier: 'echo',
      check: called911InSpasm,
      when: (run) => run.at('call_911'),
    },
    {
      id: 'spasm_suction',
      ref: { protocol: 'laryngospasm', step: 'Remove packs and gauze, suction the throat' },
      tier: 'core',
      parts: [
        { quote: 'Stop the procedure', check: (run) => doneForSpasm(run, 'stop') },
        {
          quote: 'Remove packs and gauze, suction the throat',
          check: (run) => (run.entered('spasm') === null ? null : suctionedForSpasm(run)),
        },
      ],
      when: (run) => run.last('suction'),
    },
    {
      id: 'spasm_larson',
      ref: { protocol: 'laryngospasm', step: 'firm pressure at the laryngospasm notch' },
      tier: 'core',
      parts: [
        {
          quote: 'Jaw thrust',
          check: (run) =>
            run.entered('spasm') === null ? null : run.onDuring('jaw_thrust', 'spasm'),
        },
        {
          quote: 'firm pressure at the laryngospasm notch',
          check: (run) => (run.entered('spasm') === null ? null : run.onDuring('larson', 'spasm')),
        },
      ],
    },
    {
      id: 'spasm_cpap',
      ref: { protocol: 'laryngospasm', step: 'steady gentle pressure (CPAP)' },
      tier: 'core',
      parts: [
        {
          quote: '100% O₂',
          check: (run) => (run.entered('spasm') === null ? null : run.onDuring('o2', 'spasm')),
        },
        {
          quote: 'steady gentle pressure (CPAP)',
          check: (run) => (run.entered('spasm') === null ? null : run.onDuring('cpap', 'spasm')),
        },
      ],
    },
    {
      id: 'sux',
      ref: { protocol: 'laryngospasm', step: 'Succinylcholine IV' },
      tier: 'core',
      parts: [
        {
          quote: 'Succinylcholine IV',
          check: (run) => {
            // "No relief and SpO₂ falling": paralysing him outside the spasm is not this step.
            if (run.has('sux_without_spasm')) return false;
            const spasm = run.entered('spasm');
            if (spasm === null) return null;
            return succinylcholineAsWritten(
              run.given('succinylcholine').filter((d) => d.t >= spasm),
            );
          },
        },
        {
          quote: 'ventilate with the BVM until breathing on their own',
          check: baggedUntilBreathing,
        },
      ],
      when: (run) => run.given('succinylcholine')[0]?.t ?? null,
    },
    {
      id: 'sux_label',
      ref: { protocol: 'laryngospasm', drug: 'Succinylcholine', note: 'label the syringe' },
      tier: 'core',
      check: (run) => {
        const doses = run.given('succinylcholine');
        return doses.length === 0 ? null : doses.every((d) => d.labeled);
      },
    },
    {
      id: 'call_911',
      ref: { protocol: 'laryngospasm', step: 'Call 911' },
      tier: 'core',
      check: called911InSpasm,
      when: (run) => run.at('call_911'),
    },
  ],
};
