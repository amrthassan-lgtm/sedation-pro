import { calloutAt, gaveProtocolDose } from '@/engine/protocol';
import type { Ctx, Scenario } from '@/engine/types';

import { toward } from './helpers';
import { doseLine, doseOf, epinephrineOverdose, wrongParalytic } from './shared';

/**
 * "Crown": a crown slips at the try-in and goes over the back of the tongue
 * of a lightly sedated patient. He coughs, then goes silent; once it is out,
 * he vomits.
 *
 * Graded against Choking and Emesis / Aspiration. The first trap is doing
 * too much while he can still cough, above all the finger sweep, which
 * pushes the crown down. The second is stopping once the crown is out. The
 * number of rounds it takes to shift the crown and every rate here are
 * pacing; what is correct comes from the protocol text the rubric points at.
 */

const ONDANSETRON = calloutAt('emesis_aspiration', 'Ondansetron IV');

/** How long he coughs before it stops working. */
const COUGHS_FOR = 28;
/** Blows and thrusts, counted in sets, before the crown shifts: two full rounds. */
const SETS_TO_SHIFT = 4;
/** After it has been pushed back down, one more round. */
const SETS_TO_SHIFT_AGAIN = 2;
/** Two rounds take this long however fast the buttons are tapped. */
const ROUNDS_TAKE = 20;
const ONE_ROUND_TAKES = 6;
/** The front desk's estimate when the call is made. */
const EMS_ARRIVES_AFTER = 8 * 60;

const HANDS_ON = ['back_blows', 'abdominal_thrusts', 'magill', 'finger_sweep'] as const;

const OVERDOSE = epinephrineOverdose('normal');
const PARALYSED = wrongParalytic('normal');

/**
 * Left as flags by the beat that takes him silent: how many sets had been
 * done by then, so the sets that count are the ones done since.
 */
function goneSilent(ctx: Ctx): string[] {
  return [
    `back_blows@${ctx.count('back_blows')}`,
    `abdominal_thrusts@${ctx.count('abdominal_thrusts')}`,
  ];
}

function setsSinceSilent(ctx: Ctx, action: 'back_blows' | 'abdominal_thrusts'): number {
  const total = ctx.count(action);
  for (let before = total; before >= 0; before -= 1) {
    if (ctx.has(`${action}@${before}`)) return total - before;
  }
  return total;
}

function setsDone(ctx: Ctx): number {
  return setsSinceSilent(ctx, 'back_blows') + setsSinceSilent(ctx, 'abdominal_thrusts');
}

/** Was the action done since the current phase began? */
function thisPhase(ctx: Ctx, action: string): boolean {
  const last = ctx.last(action);
  return last !== null && last >= ctx.t - ctx.phaseT;
}

function crownShifts(ctx: Ctx): boolean {
  const again = ctx.has('pushed_back');
  return (
    setsSinceSilent(ctx, 'abdominal_thrusts') >= 1 &&
    setsDone(ctx) >= (again ? SETS_TO_SHIFT_AGAIN : SETS_TO_SHIFT) &&
    ctx.phaseT >= (again ? ONE_ROUND_TAKES : ROUNDS_TAKE)
  );
}

function sedativeAfter(run: Ctx, t: number): boolean {
  return [...run.given('fentanyl'), ...run.given('midazolam')].some((d) => d.t >= t);
}

export const crown: Scenario = {
  id: 'crown',
  title: 'Crown',
  tagline: 'The last step of a long appointment.',
  protocols: ['choking', 'emesis_aspiration'],
  floridaTopics: ['Foreign body in the airway', 'Emesis and aspiration'],
  patient: { name: 'Mr. Whitfield', summary: '61-year-old man, 210 lb' },
  setup: [
    'Try-in of the crown for #19 at the end of a two-hour appointment.',
    'IV: 22 G, right forearm, D5W running.',
    'Given: midazolam 3 mg. He is drowsy and answers when spoken to.',
    'He is reclined. No throat screen is in place for the try-in.',
    'N₂O/O₂ by nasal hood. Edan monitor with capnography.',
  ],
  startsAtMin: 15 * 60 + 50,
  initial: {
    phase: 'coughing',
    vitals: { hr: 78, spo2: 98, sbp: 126, dbp: 80, etco2: 37, rr: 14 },
    capno: 'normal',
    look: { color: 'pink', eyes: 'closed', note: 'drowsy' },
    scene:
      'You are seating the crown on #19 to check the contacts. It slips off your fingertip and is gone over the back of his tongue.',
  },

  always: [
    OVERDOSE.transition,
    PARALYSED.transition,
    {
      when: (ctx) => ctx.vitals.spo2 < 60,
      to: 'end:arrest',
      beat: { log: 'Pulse lost', tone: 'bad' },
    },
  ],

  phases: {
    coughing: {
      drive: () => ({
        spo2Rate: -0.01,
        hr: toward(104, 0.5),
        sbp: toward(140, 0.3),
        dbp: toward(86, 0.2),
        rr: 26,
        etco2: toward(38, 0.05),
        capno: 'normal',
        airway: 'open',
        look: { color: 'flushed', eyes: 'open', note: 'coughing hard' },
      }),
      transitions: [
        {
          when: (ctx) => ctx.phaseT >= 4 && !ctx.has('dropped'),
          to: 'stay',
          beat: {
            scene: 'He jerks upright, eyes wide, coughing hard.',
            voice: { who: 'Patient', line: 'Something… went down.' },
            log: 'Crown dropped: coughing, can speak',
            flags: ['dropped'],
          },
        },
        {
          when: (ctx) => ctx.count('finger_sweep') > 0,
          to: 'obstructed',
          beat: (ctx) => ({
            scene:
              'Your fingertip touches the crown and it slides out of reach. The coughing stops dead.',
            voice: { who: 'DA', line: 'He’s not making a sound.' },
            log: 'Finger sweep: crown pushed deeper',
            tone: 'bad',
            flags: goneSilent(ctx),
          }),
        },
        {
          when: (ctx) => ctx.phaseT >= COUGHS_FOR,
          to: 'obstructed',
          beat: (ctx) => ({
            scene:
              'The coughing stops mid-breath. His mouth is open, his hands go to his throat, and no sound comes out.',
            voice: { who: 'DA', line: 'He’s not making a sound.' },
            log: 'Silent: no air moving',
            tone: 'bad',
            flags: goneSilent(ctx),
          }),
        },
      ],
      nudges: [
        {
          after: 12,
          when: (ctx) => ctx.at('encourage_cough') === null,
          voice: { who: 'DA', line: 'He’s still coughing and talking, Doc.' },
          coachedOnly: true,
        },
      ],
    },

    obstructed: {
      drive: () => ({
        spo2Rate: -0.35,
        hr: toward(128, 0.6),
        sbp: toward(152, 0.3),
        dbp: toward(92, 0.2),
        rr: 0,
        etco2: null,
        capno: 'flat',
        airway: 'closed',
        look: { color: 'dusky', eyes: 'open', note: 'hands at his throat, silent' },
      }),
      transitions: [
        {
          when: crownShifts,
          to: 'visible',
          beat: {
            scene:
              'On the last thrust something shifts. He drags in a thin, crowing breath. With his mouth open you can see the edge of the crown at the back of his throat.',
            voice: { who: 'DA', line: 'I can see it!' },
            log: 'Crown shifted: in view, some air moving',
            tone: 'good',
          },
        },
        {
          when: (ctx) => setsDone(ctx) >= 2 && !ctx.has('nothing_yet') && !ctx.has('pushed_back'),
          to: 'stay',
          beat: { voice: { who: 'DA', line: 'Nothing’s come up.' }, flags: ['nothing_yet'] },
        },
      ],
      nudges: [
        {
          after: 10,
          when: (ctx) => setsDone(ctx) === 0,
          voice: { who: 'DA', line: 'He’s going blue, Doc.' },
        },
        {
          after: 20,
          when: (ctx) => setsDone(ctx) === 0,
          voice: { who: 'DA', line: 'Back blows?' },
          coachedOnly: true,
        },
      ],
    },

    visible: {
      drive: (ctx) => ({
        spo2Rate: ctx.on('o2') ? -0.04 : -0.08,
        hr: toward(124, 0.4),
        sbp: toward(148, 0.3),
        dbp: toward(90, 0.2),
        rr: 24,
        etco2: toward(46, 2),
        capno: 'sharkfin',
        airway: 'open',
        look: { color: 'dusky', eyes: 'open', note: 'crowing, crown in view' },
      }),
      transitions: [
        {
          when: (ctx) => thisPhase(ctx, 'finger_sweep'),
          to: 'obstructed',
          beat: (ctx) => ({
            scene: 'Your finger knocks the crown back down. He goes silent again.',
            voice: { who: 'DA', line: 'It’s gone back down!' },
            log: 'Finger sweep: crown pushed back down',
            tone: 'bad',
            flags: ['pushed_back', ...goneSilent(ctx)],
          }),
        },
        {
          when: (ctx) => thisPhase(ctx, 'magill'),
          to: 'clear',
          beat: {
            scene:
              'Blade in, the crown is in plain view. The forceps close on it and it comes out. He hauls in a full breath and coughs.',
            voice: { who: 'DA', line: 'Got it. Crown’s out.' },
            log: 'Crown removed with Magill forceps',
            tone: 'good',
          },
        },
      ],
      nudges: [
        {
          after: 20,
          when: () => true,
          voice: { who: 'DA', line: 'The Magill forceps are with the laryngoscope.' },
          coachedOnly: true,
        },
      ],
    },

    clear: {
      drive: (ctx) => ({
        spo2Rate: ctx.on('o2') ? 0.4 : 0.25,
        hr: toward(112, 0.5),
        sbp: toward(140, 0.3),
        dbp: toward(86, 0.2),
        rr: 22,
        etco2: toward(40, 0.5),
        capno: 'normal',
        airway: 'open',
        look: { color: 'pink', eyes: 'open', note: 'coughing, breathing' },
      }),
      transitions: [
        {
          when: (ctx) => ctx.phaseT >= 14,
          to: 'vomiting',
          beat: {
            scene:
              'He gags, heaves, and vomits. He is still half reclined, and it is pooling at the back of his mouth.',
            voice: { who: 'DA', line: 'He’s being sick!' },
            log: 'Vomiting',
            tone: 'bad',
          },
        },
      ],
    },

    vomiting: {
      drive: (ctx) => ({
        spo2Rate: ctx.on('pos_side') ? -0.03 : -0.12,
        hr: toward(118, 0.4),
        sbp: toward(134, 0.3),
        dbp: toward(84, 0.2),
        rr: 20,
        etco2: toward(43, 0.2),
        capno: 'sharkfin',
        airway: 'open',
        look: { color: 'pale', eyes: 'open', note: 'vomiting' },
      }),
      transitions: [
        {
          when: (ctx) => ctx.on('pos_side') && thisPhase(ctx, 'suction'),
          to: 'settled',
          beat: {
            scene:
              'On his side with his head down, mouth and throat suctioned clear. He is breathing easily and his colour is back. Nobody can say how much went down before you turned him.',
            log: 'Airway clear',
            tone: 'good',
          },
        },
      ],
      nudges: [
        {
          after: 10,
          when: () => true,
          voice: { who: 'DA', line: 'It’s pooling at the back of his throat.' },
        },
        {
          after: 22,
          when: (ctx) => !ctx.on('pos_side'),
          voice: { who: 'DA', line: 'Do you want him on his side?' },
          coachedOnly: true,
        },
      ],
    },

    settled: {
      drive: (ctx) => ({
        spo2Rate: ctx.on('o2') ? 0.15 : 0.06,
        hr: toward(100, 0.3),
        sbp: toward(132, 0.2),
        dbp: toward(82, 0.2),
        rr: 18,
        etco2: toward(38, 0.2),
        capno: 'normal',
        airway: 'open',
        look: { color: 'pink', eyes: 'open', note: 'breathing easily' },
      }),
      transitions: [
        {
          when: (ctx) => ctx.at('call_911') !== null && ctx.phaseT >= 20,
          to: 'handover',
          beat: (ctx) => ({
            scene:
              'EMS is at the door with a stretcher. He is awake, pink and breathing easily, and he says he feels fine now.',
            voice: { who: 'EMS', line: 'What have we got?' },
            log: 'EMS on scene',
            tone: 'good',
            cut: {
              seconds: Math.max(30, EMS_ARRIVES_AFTER - (ctx.t - (ctx.at('call_911') ?? ctx.t))),
              title: 'EMS arrives',
            },
            prompt: {
              id: 'disposition',
              voice: { who: 'EMS', line: 'He looks fine to me. Where is he going?' },
              options: [
                { id: 'er', label: 'To the ER with you' },
                { id: 'observe', label: 'We will watch him here' },
                { id: 'home', label: 'Home with his escort' },
                { id: 'finish', label: 'We will finish the crown' },
              ],
            },
          }),
        },
        {
          when: (ctx) =>
            ctx.at('call_911') === null && ctx.phaseT >= 30 && !ctx.has('asked_late_911'),
          to: 'stay',
          beat: {
            flags: ['asked_late_911'],
            prompt: {
              id: 'late_911',
              voice: { who: 'Front desk', line: 'He looks fine now. Do you want an ambulance?' },
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

    handover: {
      drive: () => ({
        spo2Rate: 0.05,
        hr: toward(96, 0.3),
        sbp: toward(130, 0.2),
        dbp: toward(80, 0.2),
        rr: 16,
        etco2: toward(38, 0.2),
        capno: 'normal',
        airway: 'open',
        look: { color: 'pink', eyes: 'open', note: 'breathing easily' },
      }),
      transitions: [
        { when: (ctx) => ctx.answer('disposition') === 'er', to: 'end:er' },
        { when: (ctx) => ctx.answer('disposition') !== null, to: 'end:kept' },
      ],
    },

    [OVERDOSE.key]: OVERDOSE.phase,
    [PARALYSED.key]: PARALYSED.phase,
  },

  reactions: {
    stop: () => ({ log: 'Procedure stopped', voice: { who: 'DA', line: 'Instruments out.' } }),

    o2: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? { voice: { who: 'DA', line: 'Nitrous off. Oxygen at 100%.' }, log: 'N₂O off, 100% O₂' }
        : undefined,

    encourage_cough: (ctx) =>
      ctx.phase === 'coughing'
        ? { voice: { who: 'You', line: 'Keep coughing. Big coughs.' }, log: 'Encouraged to cough' }
        : ctx.phase === 'obstructed'
          ? { scene: 'He cannot cough. No air is moving.', log: 'Encouraged to cough' }
          : { log: 'Encouraged to cough' },

    back_blows: (ctx) => ({
      scene:
        ctx.phase === 'coughing'
          ? 'You lean him forward and strike between his shoulder blades. He was coughing well on his own.'
          : ctx.phase === 'obstructed'
            ? 'Leaning him forward: five hard blows between the shoulder blades.'
            : ctx.phase === 'visible'
              ? 'Five more blows. The crown does not move.'
              : 'Five blows between the shoulder blades.',
      log: 'Back blows',
    }),

    abdominal_thrusts: (ctx) => ({
      scene:
        ctx.phase === 'coughing'
          ? 'Arms round him from behind, five thrusts. He was coughing well on his own.'
          : ctx.phase === 'obstructed'
            ? 'Arms round him from behind: five thrusts, in and up.'
            : ctx.phase === 'visible'
              ? 'Five more thrusts. The crown does not move.'
              : 'Five thrusts, in and up.',
      log: 'Abdominal thrusts',
    }),

    magill: (ctx) =>
      ctx.phase === 'coughing'
        ? {
            scene: 'He is coughing and fighting the blade. You cannot get a view.',
            log: 'Laryngoscope and Magill forceps',
          }
        : ctx.phase === 'obstructed'
          ? {
              scene: 'Blade in. Nothing to see: it is below your view.',
              log: 'Laryngoscope and Magill forceps',
            }
          : { log: 'Laryngoscope and Magill forceps' },

    finger_sweep: (ctx) =>
      ctx.phase === 'obstructed'
        ? { scene: 'Your finger finds nothing to hook.', log: 'Finger sweep' }
        : { log: 'Finger sweep' },

    suction: (ctx) => ({
      ...(ctx.phase === 'vomiting'
        ? { scene: 'Yankauer to the back of his throat. It comes away full.' }
        : {}),
      log: 'Suctioned',
    }),

    pos_side: (_ctx, e) =>
      e.kind === 'action' && e.on
        ? {
            scene: 'Chair tipped, and you roll him onto his side with his head down.',
            log: 'On his side, head down',
          }
        : undefined,

    bvm: (ctx, e) =>
      e.kind === 'action' && e.on && ctx.phase === 'obstructed'
        ? { scene: 'You squeeze the bag. Nothing goes in.', log: 'BVM' }
        : undefined,

    call_911: (ctx) =>
      ctx.count('call_911') > 1
        ? { voice: { who: 'Front desk', line: 'They’re already on the way.' } }
        : {
            voice: { who: 'Front desk', line: '911 is on the way. About eight minutes.' },
            log: '911 called',
            tone: 'good',
          },

    'give:ondansetron': (_ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      return { voice: { who: 'DA', line: 'Ondansetron’s in.' }, log: doseLine(dose) };
    },

    'give:midazolam': (_ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      return { voice: { who: 'DA', line: 'More midazolam’s in.' }, log: doseLine(dose) };
    },

    'give:fentanyl': (_ctx, e) => {
      const dose = doseOf(e);
      if (!dose) return undefined;
      return { voice: { who: 'DA', line: 'Fentanyl’s in.' }, log: doseLine(dose) };
    },

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
      text: 'He leaves on the stretcher, awake and breathing easily, for a chest X-ray in the ER.',
    },
    kept: {
      outcome: 'recovered',
      title: 'Breathing easily, and not in the ER',
      text: 'He is breathing easily and EMS has left without him. Nobody has looked at his chest.',
    },
    no_ems: {
      outcome: 'recovered',
      title: 'Breathing easily, and nobody is coming',
      text: 'He is breathing easily. No ambulance was called, and nobody has looked at his chest.',
    },
    [OVERDOSE.key]: OVERDOSE.ending,
    [PARALYSED.key]: PARALYSED.ending,
    arrest: {
      outcome: 'arrest',
      title: 'No pulse',
      text: 'His airway was not clear for too long, and his pulse is gone. The run stops here.',
    },
  },

  rubric: [
    {
      id: 'mild',
      ref: { protocol: 'choking', step: 'Mild (can cough or speak)' },
      tier: 'core',
      parts: [
        {
          quote: 'encourage coughing',
          check: (run) => {
            const said = run.at('encourage_cough');
            const silent = run.entered('obstructed');
            return said !== null && (silent === null || said < silent);
          },
        },
        {
          quote: 'do not interfere',
          check: (run) => {
            const silent = run.entered('obstructed') ?? Infinity;
            return HANDS_ON.every((id) => {
              const first = run.at(id);
              return first === null || first >= silent;
            });
          },
        },
      ],
      when: (run) => run.at('encourage_cough'),
    },
    {
      id: 'severe',
      ref: { protocol: 'choking', step: 'Severe (cannot speak or cough)' },
      tier: 'core',
      parts: [
        {
          // While it mattered: before the crown was out.
          quote: 'Call 911',
          check: (run) => {
            const called = run.at('call_911');
            const out = run.entered('clear');
            return called !== null && (out === null || called < out);
          },
        },
        {
          quote: '5 back blows',
          check: (run) => {
            const silent = run.entered('obstructed');
            if (silent === null) return null;
            return (run.last('back_blows') ?? -1) >= silent;
          },
        },
        {
          quote: 'then 5 abdominal thrusts',
          check: (run) => {
            const silent = run.entered('obstructed');
            if (silent === null) return null;
            const blows = run.at('back_blows');
            const thrusts = run.at('abdominal_thrusts');
            return (
              blows !== null &&
              thrusts !== null &&
              blows <= thrusts &&
              (run.last('abdominal_thrusts') ?? -1) >= silent
            );
          },
        },
        {
          quote: 'repeat',
          check: (run) => {
            if (run.entered('obstructed') === null) return null;
            return run.count('back_blows') >= 2 && run.count('abdominal_thrusts') >= 2;
          },
        },
      ],
      when: (run) => run.entered('visible'),
    },
    {
      id: 'object_visible',
      ref: { protocol: 'choking', step: 'Object visible (dropped crown, gauze)' },
      tier: 'core',
      parts: [
        {
          quote: 'remove with Magill forceps',
          check: (run) => (run.entered('visible') === null ? null : run.entered('clear') !== null),
        },
        {
          quote: 'No blind finger sweeps',
          check: (run) => {
            if (run.count('finger_sweep') > 0) return false;
            return run.entered('obstructed') === null ? null : true;
          },
        },
      ],
      when: (run) => run.entered('clear'),
    },
    {
      id: 'side_suction',
      ref: { protocol: 'emesis_aspiration', step: 'Turn to the side, head down' },
      tier: 'core',
      parts: [
        {
          quote: 'Stop',
          check: (run) => (run.entered('vomiting') === null ? null : run.at('stop') !== null),
        },
        {
          quote: 'Turn to the side, head down',
          check: (run) =>
            run.entered('vomiting') === null ? null : run.onDuring('pos_side', 'vomiting'),
        },
        {
          quote: 'suction mouth and throat immediately',
          check: (run) => {
            const sick = run.entered('vomiting');
            if (sick === null) return null;
            return (run.last('suction') ?? -1) >= sick;
          },
        },
      ],
      when: (run) => run.entered('settled'),
    },
    {
      id: 'o2_no_sedatives',
      ref: { protocol: 'emesis_aspiration', step: 'Turn off N₂O, 100% O₂, stop sedatives' },
      tier: 'core',
      parts: [
        {
          quote: 'Turn off N₂O, 100% O₂',
          check: (run) => (run.entered('vomiting') === null ? null : run.on('o2')),
        },
        {
          // No credit for an omission: it counts once the oxygen part was done.
          quote: 'stop sedatives',
          check: (run) => {
            const sick = run.entered('vomiting');
            if (sick === null) return null;
            if (sedativeAfter(run, sick)) return false;
            return run.on('o2') ? true : null;
          },
        },
      ],
      when: (run) => run.last('o2'),
    },
    {
      id: 'ondansetron',
      ref: { protocol: 'emesis_aspiration', step: 'Ondansetron IV over 2-5 minutes' },
      tier: 'extra',
      parts: [
        {
          quote: 'Nausea or vomiting with a clear airway',
          check: (run) => {
            const given = run.given('ondansetron');
            if (given.length === 0) return null;
            const clear = run.entered('settled');
            return clear !== null && given.every((d) => d.t >= clear);
          },
        },
        {
          quote: 'Ondansetron IV',
          check: (run) => gaveProtocolDose(ONDANSETRON, run.given('ondansetron')),
        },
      ],
      when: (run) => run.given('ondansetron')[0]?.t ?? null,
    },
    {
      id: 'er',
      ref: { protocol: 'emesis_aspiration', step: 'Suspected aspiration but stable' },
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
