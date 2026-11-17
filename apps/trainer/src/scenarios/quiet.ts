import { calloutAt, doseRangeOf, gaveProtocolDose, overProtocolDose } from '@/engine/protocol';
import type { Ctx, Drive, Look, Reaction, Scenario } from '@/engine/types';

import { reachedAt, toward, within } from './helpers';
import {
  baggedThroughParalysis,
  baggedUntilBreathing,
  breathingWell,
  doseLine,
  doseOf,
  epinephrineOverdose,
  hypoxicHeartRate,
  PARALYSIS_CUT,
  pendingParalysis,
  SUCCINYLCHOLINE,
  succinylcholineAsWritten,
  succinylcholineSoFar,
} from './shared';

/**
 * "Shallow": a sedated patient stops breathing well, is bagged and reversed,
 * wakes, then goes into laryngospasm. Its first name was "Quiet", which is
 * still its id: run records are kept under the id.
 *
 * Graded against Hypoventilation, Oversedation (Opioid) and Laryngospasm.
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

const OVERDOSE = epinephrineOverdose('normal', (ctx) =>
  ctx.phase === 'spasm' ? 'shut' : ctx.phase === 'paralyzed' ? 'paralysed' : null,
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

/** More of what put him here, given after the scene opens. */
function moreSedative(ctx: Ctx): boolean {
  return ctx.given('fentanyl').length + ctx.given('midazolam').length > 0;
}

/** Suction counts for the spasm if it was done in it, or so close before it that the throat was still clear. */
function suctionedForSpasm(ctx: Ctx): boolean {
  const spasm = ctx.entered('spasm');
  const last = ctx.last('suction');
  return spasm !== null && last !== null && last >= spasm - SUCTION_STILL_CLEAR;
}

function hypoDrive(ctx: Ctx): Drive {
  const bagging = ctx.on('bvm');
  const stimulated = within(ctx, 'stimulate', 6);
  const partly = flumazenilHelping(ctx);
  const deeper = moreSedative(ctx);
  const airwayHelp = (ctx.on('jaw_thrust') ? 0.7 : 1) * (ctx.on('oral_airway') ? 0.85 : 1);
  const fall =
    0.22 * (ctx.on('o2') ? 0.6 : 1) * airwayHelp * (partly ? 0.4 : 1) * (deeper ? 1.6 : 1);
  // A stimulated breath slows the fall. It never turns it around: only the bag does.
  const spo2Rate = bagging ? (ctx.on('o2') ? 0.55 : 0.4) : stimulated ? -fall * 0.3 : -fall;
  const low = ctx.vitals.spo2 < 86;
  return {
    spo2Rate,
    hr: hypoxicHeartRate(ctx, low ? 52 : 58),
    sbp: toward(102, 0.05),
    dbp: toward(60, 0.05),
    rr: stimulated
      ? 8
      : deeper
        ? 2
        : partly
          ? 7
          : ctx.phaseT < 10 && ctx.entered('paralyzed') === null
            ? 6
            : 4,
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

/** 911 belongs to the spasm: `null` in a run that never reached it. */
function called911InSpasm(run: Ctx): boolean | null {
  return run.entered('spasm') === null ? null : run.at('call_911') !== null;
}

const sedativeGiven: Reaction = (_ctx, e) => {
  const dose = doseOf(e);
  if (!dose) return undefined;
  return {
    voice: { who: 'DA', line: `That’s more ${dose.drugName.toLowerCase()} going in, Doc.` },
    log: doseLine(dose),
    tone: 'bad',
  };
};

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
    'Given: midazolam 4 mg and fentanyl 50 mcg. Last dose six minutes ago.',
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
        // Only someone holding a bag or a mask can feel it give.
        const masked = ctx.on('bvm') || ctx.on('cpap');
        return ctx.phase === 'spasm'
          ? {
              flags,
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
  ],

  phases: {
    hypo: {
      drive: hypoDrive,
      transitions: [
        {
          when: (ctx) => {
            const at = wakeAt(ctx);
            return at !== null && ctx.t >= at;
          },
          to: 'waking',
          beat: {
            scene:
              'His eyebrows twitch. He coughs against the mask, swallows hard and turns his head away from your hand.',
            voice: { who: 'DA', line: 'He’s coming around.' },
            log: 'Rousing after naloxone',
            tone: 'good',
          },
        },
      ],
      nudges: [
        {
          after: 10,
          when: (ctx) => ctx.entered('paralyzed') === null && ctx.given('naloxone').length === 0,
          voice: { who: 'DA', line: 'Doc… he’s not really breathing much.' },
        },
        {
          after: 26,
          when: (ctx) => !ctx.on('bvm') && ctx.vitals.spo2 < 90,
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
          when: (ctx) => ctx.on('bvm') && ctx.given('naloxone').length === 0,
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
          // The spasm comes either way. The scene does not blame blood that was just suctioned.
          beat: (ctx) => ({
            scene: within(ctx, 'suction', SUCTION_STILL_CLEAR)
              ? 'He coughs hard against the mask. A high, harsh crowing on the way in, then nothing. His chest heaves but no air is moving.'
              : 'He gags on the blood and saliva pooled at the back of his throat. A high, harsh crowing on the way in, then nothing. His chest heaves but no air is moving.',
            voice: { who: 'DA', line: 'I can’t get air in! It won’t go!' },
            log: 'Crowing, then no air movement',
            tone: 'bad',
          }),
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
        const bagging = ctx.on('bvm');
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
        spo2Rate: ctx.on('o2') || ctx.on('bvm') ? 0.6 : 0.25,
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
  },

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
      if (ctx.phase === 'paralyzed') {
        return {
          voice: { who: 'DA', line: 'Bagging. One breath every six.' },
          log: 'BVM, 1 breath every 6 s',
          tone: 'good',
        };
      }
      return {
        voice: { who: 'DA', line: 'One… two… three… chest is rising.' },
        log: 'BVM, 1 breath every 6 s',
        tone: 'good',
      };
    },

    cpap: (ctx, e) =>
      e.kind === 'action' && e.on && ctx.phase === 'spasm'
        ? {
            scene:
              'Both hands on the mask, steady pressure on the bag. A thin, high squeak, then silence again.',
            log: 'Tight seal, steady pressure',
          }
        : undefined,

    suction: (ctx) =>
      ctx.phase === 'spasm'
        ? {
            scene: 'A pool of blood-streaked saliva comes up the suction.',
            log: 'Suction, packs out',
            tone: 'good',
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

    'give:fentanyl': sedativeGiven,
    'give:midazolam': sedativeGiven,

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
      check: (run) => run.onDuring('jaw_thrust', 'hypo') || run.onDuring('oral_airway', 'hypo'),
      when: (run) => run.at('jaw_thrust') ?? run.at('oral_airway'),
    },
    {
      id: 'bvm',
      ref: { protocol: 'hypoventilation', step: 'BVM, 1 breath every 6 seconds' },
      tier: 'core',
      check: (run) => run.onDuring('bvm', 'hypo'),
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
          check: (run) => run.onDuring('bvm', 'hypo'),
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
          quote: 'BVM not moving the chest: reposition, NPA, then LMA or King',
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
        {
          quote: 'Stop the procedure',
          check: (run) => (run.entered('spasm') === null ? null : run.at('stop') !== null),
        },
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
