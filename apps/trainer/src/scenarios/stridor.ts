import { overProtocolDose } from '@/engine/protocol';
import type { Ctx, Drive, Look, Reaction, Scenario } from '@/engine/types';

import { toward } from './helpers';
import {
  baggedThroughParalysis,
  baggedUntilBreathing,
  breathingWell,
  doseLine,
  doseOf,
  epinephrineOverdose,
  hypoxicHeartRate,
  MASK_HELD,
  PARALYSIS_CUT,
  pendingParalysis,
  SUCCINYLCHOLINE,
  succinylcholineAsWritten,
  succinylcholineSoFar,
} from './shared';

/**
 * "Stridor": the last suture after two extractions, a soaked throat pack and
 * a patient who is getting light. He starts to crow on every breath in.
 *
 * Graded against Laryngospasm alone. It is the counterpart to the second
 * half of "Shallow": there the cords are shut from the first breath and only
 * succinylcholine opens them. Here they are part shut, and the first three
 * steps done promptly break the spasm with no drug. Left too long he goes
 * silent, and from then on only succinylcholine works. The trap is the
 * succinylcholine itself, pushed while he is still moving air. Every rate
 * and delay here is pacing; what is correct comes from the protocol text the
 * rubric points at.
 */

/** The quiet seconds before he starts to crow. */
const CROWS_AFTER = 6;
/** Crowing this long with no relief under way, and the cords shut completely. */
const GOES_SILENT_AFTER = 45;
/** The mask held on a cleared throat breaks the spasm in this long. */
const BREAKS_AFTER = 20;
/** Each of the two hands-on manoeuvres shortens that. */
const MANOEUVRE_SHORTENS = 0.7;
/** How long he breathes quietly before the story closes. */
const SETTLED_FOR = 12;

/** A passing scene from the player's own hands is left this long before the story's standing one. */
const READ_FOR = 5;

const OVERDOSE = epinephrineOverdose('normal', (ctx) =>
  ctx.phase === 'silent' ? 'shut' : ctx.phase === 'paralyzed' ? 'paralysed' : null,
);

const EASING = `${MASK_HELD} Each crow is softer than the last.`;

const STIRRING: Look = { color: 'pink', eyes: 'closed', note: 'stirring, swallowing' };
const QUIET_AGAIN: Look = { color: 'pink', eyes: 'closed', note: 'breathing quietly' };

/**
 * When the mask went onto a throat that had been cleared, or `null` while
 * either is missing. The pack is what keeps the cords shut: the mask alone
 * does not settle them.
 */
function reliefSince(ctx: Ctx): number | null {
  const cleared = ctx.at('suction');
  const sealed = ctx.last('cpap');
  if (!ctx.on('cpap') || cleared === null || sealed === null) return null;
  return Math.max(cleared, sealed, ctx.entered('crowing') ?? ctx.t);
}

/** The relief that ended when the mask came off before the spasm broke: when it had started, or `null`. */
function reliefLost(ctx: Ctx): number | null {
  const cleared = ctx.at('suction');
  const sealed = ctx.last('cpap');
  if (ctx.on('cpap') || cleared === null || sealed === null) return null;
  const since = Math.max(cleared, sealed, ctx.entered('crowing') ?? ctx.t);
  return ctx.has(`easing@${since}`) ? since : null;
}

function spasmBreaks(ctx: Ctx): boolean {
  const since = reliefSince(ctx);
  if (since === null) return false;
  const needed =
    BREAKS_AFTER *
    (ctx.on('jaw_thrust') ? MANOEUVRE_SHORTENS : 1) *
    (ctx.on('larson') ? MANOEUVRE_SHORTENS : 1);
  return ctx.t - since >= needed;
}

function crowing(ctx: Ctx): Drive {
  const fall = 0.1 * (ctx.on('o2') ? 0.6 : 1) * (ctx.on('bvm') ? 0.7 : 1);
  const dusky = ctx.vitals.spo2 < 88;
  return {
    // The mask with oxygen turns the saturation round; either alone only slows the fall.
    spo2Rate: ctx.on('cpap') ? (ctx.on('o2') ? 0.08 : -0.03) : -fall,
    hr: hypoxicHeartRate(ctx, 122),
    sbp: toward(146, 1),
    dbp: toward(88, 0.6),
    rr: 28,
    // Small breaths through part-shut cords: the trace shrinks before it is lost.
    etco2: toward(18, 1.5),
    capno: 'normal',
    airway: 'open',
    look: {
      color: dusky ? 'dusky' : 'flushed',
      eyes: 'open',
      // The words change with the colour: colour is never the only signal.
      note:
        reliefSince(ctx) !== null
          ? 'crowing, softer with each breath'
          : dusky
            ? 'crowing, lips turning blue'
            : 'crowing, chest and belly rocking',
    },
  };
}

/**
 * Held during the spasm, part shut or shut: the two phases the first three
 * steps are for. `null` in a run that ended before he ever crowed.
 */
function during(run: Ctx, toggle: string): boolean | null {
  if (run.entered('crowing') === null) return null;
  return run.onDuring(toggle, 'crowing') || run.onDuring(toggle, 'silent');
}

/** When the spasm ended, by the mask or by the drug. `null` while it has not. */
function spasmEnded(run: Ctx): number | null {
  const ends = [run.entered('settling'), run.entered('paralyzed')].filter(
    (t): t is number => t !== null,
  );
  return ends.length > 0 ? Math.min(...ends) : null;
}

/** Done for the spasm: before it was over, however early. Afterwards is too late to count. */
function doneForSpasm(run: Ctx, action: string): boolean | null {
  if (run.entered('crowing') === null) return null;
  const done = run.at(action);
  const ended = spasmEnded(run);
  return done !== null && (ended === null || done < ended);
}

const sedativeGiven: Reaction = (_ctx, e) => {
  const dose = doseOf(e);
  if (!dose) return undefined;
  return {
    voice: { who: 'DA', line: `More ${dose.drugName.toLowerCase()}’s in.` },
    log: doseLine(dose),
  };
};

const reversalGiven: Reaction = (_ctx, e) => {
  const dose = doseOf(e);
  if (!dose) return undefined;
  return {
    voice: { who: 'DA', line: `${dose.drugName}’s in. He was already coming round, Doc.` },
    log: doseLine(dose),
  };
};

export const stridor: Scenario = {
  id: 'stridor',
  title: 'Stridor',
  tagline: 'Two teeth out, one suture to go.',
  protocols: ['laryngospasm'],
  floridaTopics: ['Laryngospasm'],
  patient: { name: 'Mr. Porter', summary: '32-year-old man, 180 lb' },
  setup: [
    'Extraction of #17 and #32. Both teeth are out and you are closing #32.',
    'A gauze throat pack is in place.',
    'IV: 22 G, left forearm, D5W running.',
    'Given: midazolam 3 mg and fentanyl 25 mcg. Last dose twelve minutes ago.',
    'History: smokes half a pack a day. He had a cold two weeks ago.',
    'N₂O/O₂ by nasal hood. Edan monitor with capnography.',
  ],
  startsAtMin: 9 * 60 + 25,
  initial: {
    phase: 'closing',
    vitals: { hr: 84, spo2: 97, sbp: 126, dbp: 78, etco2: 38, rr: 14 },
    capno: 'normal',
    look: STIRRING,
    scene:
      'You are tying the last suture at #32. The pack at the back of his throat is dark with blood. He swallows, and his eyelids flicker.',
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
        const due = pendingParalysis(ctx);
        return (
          ctx.phase !== 'paralyzed' && ctx.phase !== OVERDOSE.key && due !== null && ctx.t >= due.at
        );
      },
      to: 'paralyzed',
      beat: (ctx) => {
        const flags = pendingParalysis(ctx)?.flags ?? [];
        if (ctx.phase === 'silent') {
          // Only someone holding a bag or a mask can feel air go in.
          const masked = ctx.on('bvm') || ctx.on('cpap');
          return {
            flags,
            scene:
              'A fine flicker runs under the skin of his chest and shoulders, and the heaving stops. The cords have let go. He is not breathing at all now.',
            voice: { who: 'DA', line: masked ? 'It’s going in!' : 'He’s gone limp!' },
            log: 'Spasm broken by succinylcholine',
            tone: 'good',
          };
        }
        if (ctx.phase === 'crowing') {
          return {
            flags,
            scene:
              'A fine flicker runs under his skin and the crowing stops. He is limp, and he is not breathing at all.',
            voice: { who: 'DA', line: 'He’s stopped breathing!' },
            log: 'Paralysed by succinylcholine',
          };
        }
        return {
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
    closing: {
      drive: () => ({
        spo2Rate: 0,
        hr: toward(86, 0.5),
        sbp: toward(126, 0.3),
        dbp: toward(78, 0.2),
        rr: 14,
        etco2: toward(38, 0.2),
        capno: 'normal',
        airway: 'open',
        look: STIRRING,
      }),
      transitions: [
        {
          when: (ctx) => ctx.phaseT >= CROWS_AFTER,
          to: 'crowing',
          // The spasm comes either way. This stays on screen through the crowing, so it
          // says nothing about the pack, which may be out by then.
          beat: {
            scene:
              'He coughs once, hard. Then every breath in is a high, harsh crow, and his chest and belly rock against each other.',
            voice: { who: 'DA', line: 'What is that noise he’s making?' },
            log: 'Crowing on every breath in',
            tone: 'bad',
          },
        },
      ],
    },

    crowing: {
      drive: crowing,
      transitions: [
        {
          when: spasmBreaks,
          to: 'settling',
          beat: {
            scene:
              'The crow thins to a squeak, then stops. He takes a long, quiet breath, and another.',
            voice: { who: 'DA', line: 'That’s air moving.' },
            log: 'Spasm broken: breathing quietly',
            tone: 'good',
          },
        },
        {
          when: (ctx) => ctx.phaseT >= GOES_SILENT_AFTER && reliefSince(ctx) === null,
          to: 'silent',
          beat: {
            scene:
              'The crowing cuts off. His chest and belly are still heaving against each other, but there is no sound now and no air is moving.',
            voice: { who: 'DA', line: 'He’s gone quiet. Nothing’s moving!' },
            log: 'Silent: no air movement',
            tone: 'bad',
          },
        },
        {
          // Relief is the story's standing scene while it lasts, so the screen never
          // falls back to the moment he started crowing.
          when: (ctx) => {
            const since = reliefSince(ctx);
            return since !== null && ctx.t - since >= READ_FOR && !ctx.has(`easing@${since}`);
          },
          to: 'stay',
          beat: (ctx) => ({ scene: EASING, flags: [`easing@${reliefSince(ctx)}`] }),
        },
        {
          // The mask came off before it broke: the screen must not go on saying it is easing.
          when: (ctx) => {
            const lost = reliefLost(ctx);
            return lost !== null && !ctx.has(`lost@${lost}`);
          },
          to: 'stay',
          beat: (ctx) => ({
            scene: 'The mask is off. Every breath in is a high, harsh crow again.',
            flags: [`lost@${reliefLost(ctx)}`],
          }),
        },
      ],
      nudges: [
        {
          after: 10,
          when: (ctx) => ctx.at('suction') === null,
          voice: { who: 'DA', line: 'That pack is soaked. Suction?' },
          coachedOnly: true,
        },
        {
          after: 20,
          // Said only while it is true: the mask with oxygen holds the number up.
          when: (ctx) => ctx.vitals.spo2 < 96 && !(ctx.on('cpap') && ctx.on('o2')),
          voice: { who: 'DA', line: 'His sats are coming down, Doc.' },
        },
        {
          after: 26,
          when: (ctx) => !ctx.on('cpap'),
          voice: { who: 'DA', line: 'Do you want the mask on him?' },
          coachedOnly: true,
        },
      ],
    },

    silent: {
      drive: (ctx) => {
        const help =
          (ctx.at('suction') !== null ? 0.85 : 1) *
          (ctx.on('jaw_thrust') ? 0.9 : 1) *
          (ctx.on('larson') ? 0.85 : 1) *
          (ctx.on('cpap') ? 0.8 : 1);
        const dusky = ctx.vitals.spo2 < 85;
        return {
          spo2Rate: -0.5 * help,
          hr: hypoxicHeartRate(ctx, 126),
          sbp: toward(148, 1),
          dbp: toward(90, 0.6),
          rr: 0,
          etco2: null,
          capno: 'flat',
          airway: 'closed',
          look: {
            color: dusky ? 'dusky' : 'pale',
            eyes: 'open',
            note: dusky ? 'chest heaving, lips turning blue' : 'chest heaving, no sound',
          },
        };
      },
      // The way out is succinylcholine, handled for every phase in `always`.
      transitions: [],
      nudges: [
        {
          after: 8,
          when: (ctx) => ctx.at('call_911') === null,
          voice: { who: 'Front desk', line: 'Do you need me to call anyone?' },
          coachedOnly: true,
        },
        {
          after: 14,
          when: (ctx) => ctx.vitals.spo2 < 86,
          voice: { who: 'DA', line: 'His sats are still dropping… Doc!' },
        },
        {
          after: 18,
          when: (ctx) => ctx.given('succinylcholine').length === 0,
          voice: { who: 'DA', line: 'The succinylcholine is in the fridge. Do you want it?' },
          coachedOnly: true,
        },
        {
          after: 26,
          when: (ctx) => ctx.given('succinylcholine').length === 0,
          voice: { who: 'DA', line: 'It’s not breaking. What’s next?' },
        },
      ],
    },

    paralyzed: {
      drive: (ctx) => {
        const bagging = ctx.on('bvm');
        const dusky = ctx.vitals.spo2 < 85;
        return {
          spo2Rate: bagging ? 0.7 : -0.75,
          hr: hypoxicHeartRate(ctx, 96),
          sbp: toward(124, 1),
          dbp: toward(76, 0.6),
          rr: 0,
          etco2: bagging ? toward(40, 3) : null,
          capno: 'normal',
          airway: 'open',
          look: {
            color: dusky ? 'dusky' : 'pale',
            eyes: 'closed',
            note: dusky ? 'paralysed, lips turning blue' : 'paralysed, not breathing',
          },
        };
      },
      transitions: [
        {
          when: baggedThroughParalysis,
          to: 'breathing',
          // A dose pushed while he was paralysed went with this paralysis.
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

    settling: {
      drive: (ctx) => ({
        spo2Rate: ctx.on('o2') ? 0.5 : 0.2,
        hr: toward(92, 1.5),
        sbp: toward(128, 0.6),
        dbp: toward(78, 0.4),
        rr: 16,
        etco2: toward(39, 2),
        capno: 'normal',
        airway: 'open',
        look: QUIET_AGAIN,
      }),
      transitions: [
        {
          when: (ctx) => breathingWell(ctx, SETTLED_FOR) && ctx.at('call_911') !== null,
          to: 'end:broke_ems',
        },
        { when: (ctx) => breathingWell(ctx, SETTLED_FOR), to: 'end:broke' },
      ],
    },

    breathing: {
      drive: (ctx) => ({
        spo2Rate: ctx.on('o2') || ctx.on('bvm') ? 0.6 : 0.25,
        hr: toward(88, 1),
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
        { when: (ctx) => breathingWell(ctx, 8), to: 'end:recovered' },
      ],
    },

    [OVERDOSE.key]: OVERDOSE.phase,
  },

  reactions: {
    stop: () => ({ log: 'Procedure stopped', voice: { who: 'DA', line: 'Instruments out.' } }),

    o2: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? { voice: { who: 'DA', line: 'Nitrous off. Oxygen at 100%.' }, log: 'N₂O off, 100% O₂' }
        : undefined,

    suction: (ctx) => {
      if (ctx.count('suction') > 1) return { log: 'Suctioned' };
      const easing = ctx.phase === 'crowing' && ctx.on('cpap');
      return {
        scene: `The pack comes out soaked. Blood and saliva come up the suction.${
          easing ? ' With the mask back on, each crow is softer than the last.' : ''
        }`,
        log: 'Packs out, suctioned',
        tone: 'good',
      };
    },

    cpap: (ctx, e) => {
      if (e.kind !== 'action' || !e.on) return undefined;
      if (ctx.phase === 'crowing') {
        return {
          scene:
            ctx.at('suction') !== null
              ? EASING
              : `${MASK_HELD} The pack is still in his throat, and he crows against the mask.`,
          log: 'Tight seal, steady pressure',
        };
      }
      if (ctx.phase === 'silent') {
        return {
          scene: `${MASK_HELD} A thin, high squeak, then silence again.`,
          log: 'Tight seal, steady pressure',
        };
      }
      return undefined;
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
      if (ctx.phase === 'crowing') {
        return {
          scene: 'You squeeze the bag in time with him. A little goes in past the crow.',
          log: 'BVM',
        };
      }
      if (ctx.phase === 'silent') {
        return {
          voice: { who: 'DA', line: 'It’s like squeezing a rock. Nothing’s going in.' },
          log: 'BVM: no air moving',
        };
      }
      if (ctx.phase === 'paralyzed') {
        return {
          voice: { who: 'DA', line: 'Bagging. His chest is rising.' },
          log: 'BVM: chest rising',
          tone: 'good',
        };
      }
      return undefined;
    },

    pos_sit_up: (ctx, e) => {
      if (e.kind !== 'action' || !e.on) return undefined;
      if (ctx.phase === 'crowing') {
        return { scene: 'Back of the chair up. He is still crowing.', log: 'Sitting up' };
      }
      if (ctx.phase === 'silent') {
        return { scene: 'Back of the chair up. Still no air is moving.', log: 'Sitting up' };
      }
      return undefined;
    },

    call_911: (ctx) =>
      ctx.count('call_911') > 1
        ? { voice: { who: 'Front desk', line: 'They’re already on the way.' } }
        : {
            voice: { who: 'Front desk', line: '911 is on the way. About eight minutes.' },
            log: '911 called',
            tone: 'good',
          },

    'give:midazolam': sedativeGiven,
    'give:fentanyl': sedativeGiven,
    'give:naloxone': reversalGiven,
    'give:flumazenil': reversalGiven,

    'give:succinylcholine': (ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      if (ctx.phase === 'crowing') {
        return {
          voice: { who: 'DA', line: 'It’s in. He was still moving some air, Doc.' },
          log: doseLine(dose),
        };
      }
      if (ctx.phase !== 'silent') {
        return {
          voice: { who: 'DA', line: 'Succinylcholine? He isn’t in spasm…' },
          log: doseLine(dose),
          tone: 'bad',
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
    broke: {
      outcome: 'recovered',
      title: 'Breathing quietly',
      text: 'The spasm broke with the mask. He is pink and breathing quietly.',
    },
    broke_ems: {
      outcome: 'recovered',
      title: 'Breathing quietly',
      text: 'The spasm broke with the mask. He is pink and breathing quietly, and EMS is on the way.',
    },
    recovered: {
      outcome: 'recovered',
      title: 'Breathing on his own',
      text: 'The succinylcholine has worn off. He is awake, pink and breathing. Nobody has called 911.',
    },
    recovered_ems: {
      outcome: 'recovered',
      title: 'Breathing on his own',
      text: 'The succinylcholine has worn off. He is awake, pink and breathing. EMS is on the way and will take him in for observation.',
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
      id: 'clear',
      ref: { protocol: 'laryngospasm', step: 'Remove packs and gauze, suction the throat' },
      tier: 'core',
      parts: [
        { quote: 'Stop the procedure', check: (run) => doneForSpasm(run, 'stop') },
        {
          quote: 'Remove packs and gauze, suction the throat',
          check: (run) => doneForSpasm(run, 'suction'),
        },
      ],
      when: (run) => run.at('suction'),
    },
    {
      id: 'notch',
      ref: { protocol: 'laryngospasm', step: 'firm pressure at the laryngospasm notch' },
      tier: 'core',
      parts: [
        { quote: 'Jaw thrust', check: (run) => during(run, 'jaw_thrust') },
        {
          quote: 'firm pressure at the laryngospasm notch',
          check: (run) => during(run, 'larson'),
        },
      ],
      when: (run) => run.at('larson') ?? run.at('jaw_thrust'),
    },
    {
      id: 'mask',
      ref: { protocol: 'laryngospasm', step: 'steady gentle pressure (CPAP)' },
      tier: 'core',
      parts: [
        { quote: '100% O₂', check: (run) => during(run, 'o2') },
        { quote: 'steady gentle pressure (CPAP)', check: (run) => during(run, 'cpap') },
      ],
      when: (run) => run.at('cpap'),
    },
    {
      id: 'sux',
      ref: { protocol: 'laryngospasm', step: 'Succinylcholine IV' },
      tier: 'core',
      parts: [
        {
          // The step's own condition: not while he was still moving air, and not once it was over.
          quote: 'No relief and SpO₂ falling',
          check: (run) => {
            const doses = run.given('succinylcholine');
            if (doses.some((d) => d.phase !== 'silent')) return false;
            return doses.length > 0 ? true : null;
          },
        },
        {
          quote: 'Succinylcholine IV',
          check: (run) => {
            const doses = run.given('succinylcholine');
            // Never needed and never given: the spasm broke before this step.
            if (doses.length === 0) return run.entered('silent') === null ? null : false;
            return succinylcholineAsWritten(doses);
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
      // The page lists the call after the succinylcholine. A spasm that broke
      // before that step leaves this line unmarked unless the call was made.
      check: (run) => {
        const called = run.at('call_911');
        const breathing = run.entered('breathing');
        // Through the paralysis it counts, however early. Once he breathes on his own it is too late.
        if (called !== null && (breathing === null || called < breathing)) return true;
        const reached = run.entered('silent') !== null || run.given('succinylcholine').length > 0;
        return reached ? false : null;
      },
      when: (run) => run.at('call_911'),
    },
  ],
};
