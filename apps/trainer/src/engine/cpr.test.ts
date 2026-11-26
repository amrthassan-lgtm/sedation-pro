import { describe, expect, it } from 'vitest';
import { findProtocol } from '@sedation-pro/clinical';

import { advance } from '@/scenarios/testing';

import { BREATH, CPR, CPR_WORDS, HAND_OVER_AFTER, Simulation } from './engine';
import type { Drive, Scenario } from './types';

const DOWN: Drive = {
  spo2Rate: -0.5,
  hr: { to: 180, rate: 60 },
  sbp: { to: 120, rate: 1 },
  dbp: { to: 80, rate: 1 },
  rr: 0,
  etco2: null,
  capno: 'flat',
  airway: 'open',
  rhythm: 'vtach',
  pulse: false,
};

/**
 * A patient with no pulse and no clinical content: he exists to exercise the
 * engine's own rules. "Stimulate" brings his pulse back, "Suction" has the
 * story take the assistant's hands off his chest, a jaw thrust shuts his
 * airway, and a call skips two minutes.
 */
function scenario(): Scenario {
  return {
    id: 'cpr-bench-test',
    title: 'Test',
    tagline: 'Engine test',
    protocols: ['vfib_vtach'],
    floridaTopics: [],
    patient: { name: 'Nobody', summary: 'invented' },
    setup: [],
    startsAtMin: 600,
    initial: {
      phase: 'down',
      vitals: { hr: 80, spo2: 97, sbp: 120, dbp: 80, etco2: 38, rr: 12 },
      capno: 'normal',
      look: { color: 'grey', eyes: 'closed' },
      scene: 'Start',
    },
    phases: {
      down: {
        drive: (ctx) => ({
          ...DOWN,
          airway: ctx.on('jaw_thrust') ? 'closed' : 'open',
          // Compressions with breaths going in bring a trace back; either alone brings none.
          etco2: ctx.on('cpr') && ctx.on('bvm') ? { to: 13, rate: 20 } : null,
          ...(ctx.has('back') ? { pulse: true, rhythm: 'sinus' as const, spo2Rate: 0 } : {}),
        }),
        transitions: [
          {
            when: (ctx) => ctx.at('call_911') !== null && !ctx.has('skipped'),
            to: 'stay',
            beat: { flags: ['skipped'], cut: { seconds: 120, title: 'Two minutes later' } },
          },
        ],
      },
    },
    reactions: {
      stimulate: () => ({ flags: ['back'] }),
      suction: () => ({ off: ['cpr'] }),
    },
    endings: { over: { outcome: 'recovered', title: 'Over', text: '' } },
    rubric: [
      {
        id: 'cpr',
        ref: { protocol: 'vfib_vtach', step: 'CPR on the CPR board' },
        tier: 'core',
        check: (run) => run.at('cpr') !== null,
      },
    ],
  };
}

const STEP = findProtocol('vfib_vtach')!.steps.find((s) =>
  s.text.startsWith('CPR on the CPR board'),
)!.text;
/** One set of compressions at the page's rate, in seconds. */
const SET = (CPR.compressions * 60) / CPR.perMin;

/** CPR going and the bag in the player's hand: the page's cycle. */
function coding(): Simulation {
  const sim = new Simulation(scenario(), { pacedBag: true });
  sim.act('cpr');
  sim.act('bvm');
  return sim;
}

/** On to the first tick of the pause that follows the set now being counted. */
function toPause(sim: Simulation): void {
  for (let i = 0; i < 200 && sim.compressions?.compressing; i += 1) sim.tick(0.25);
}

/** Both breaths of a pause, each held as the page writes. */
function twoBreaths(sim: Simulation): void {
  advance(sim, 1);
  sim.squeeze(BREATH.overSec);
  advance(sim, 1.5);
  sim.squeeze(BREATH.overSec);
}

describe('CPR is the arrest page’s own', () => {
  it('reads the rate, the thirty and the two from the page’s line', () => {
    expect(STEP).toContain('100-120/min');
    expect(CPR.perMin).toBe(110);
    expect(STEP).toContain(`${CPR.compressions}:${CPR.breaths} until`);
    expect(CPR).toMatchObject({ compressions: 30, breaths: 2 });
  });

  it('borrows the page’s words for the cycle, to print beside a pause that missed it', () => {
    expect(CPR_WORDS.ratio).toBe('30:2');
    expect(CPR_WORDS.until).toBe('30:2 until an LMA/King/ET tube is placed');
    for (const words of Object.values(CPR_WORDS)) expect(STEP).toContain(words);
  });

  it('both arrest pages write the same line, and with a tube in its breath is the BVM page’s', () => {
    const other = findProtocol('pea_asystole')!.steps.find((s) =>
      s.text.startsWith('CPR on the CPR board'),
    )!.text;
    expect(other).toBe(STEP);
    const withTube = /then 1 breath every (\d+) seconds with continuous compressions/.exec(STEP);
    expect(Number(withTube?.[1])).toBe(BREATH.everySec);
  });
});

describe('the assistant on the chest', () => {
  it('is nowhere until CPR is on, and with no bag in a hand she does not pause', () => {
    const sim = new Simulation(scenario(), { pacedBag: true });
    expect(sim.compressions).toBeNull();
    sim.act('cpr');
    expect(sim.compressions).toEqual({
      mode: 'continuous',
      compressing: true,
      elapsed: 0,
      breaths: 0,
    });
    advance(sim, 90);
    expect(sim.compressions).toMatchObject({ mode: 'continuous', compressing: true });
    expect(sim.pauses).toEqual([]);
  });

  it('with the bag in a hand she counts the page’s thirty at the page’s rate, then takes her hands off', () => {
    const sim = coding();
    expect(sim.compressions).toMatchObject({ mode: 'cycle', compressing: true });
    advance(sim, 16);
    expect(sim.compressions).toMatchObject({ compressing: true, elapsed: 16 });
    advance(sim, 0.5);
    expect(sim.compressions).toMatchObject({ mode: 'cycle', compressing: false, breaths: 0 });
    expect(sim.pauses).toHaveLength(1);
    // The pause began when the thirtieth was counted, not at the tick that noticed it.
    expect(sim.pauses[0]?.t).toBeCloseTo(SET, 6);
    expect(sim.pauses[0]).toMatchObject({ ended: null, breaths: 0, wentIn: 0 });
  });

  it('goes back on the chest the moment the second breath is let go', () => {
    const sim = coding();
    toPause(sim);
    advance(sim, 1);
    sim.squeeze(BREATH.overSec);
    expect(sim.compressions).toMatchObject({ compressing: false, breaths: 1 });
    advance(sim, 1.5);
    sim.squeeze(BREATH.overSec);
    expect(sim.compressions).toMatchObject({ compressing: true, elapsed: 0, breaths: 0 });
    expect(sim.pauses[0]).toMatchObject({ ended: sim.t, breaths: 2, wentIn: 2 });
    // And counts the next thirty from there.
    const resumed = sim.t;
    toPause(sim);
    expect(sim.pauses[1]?.t).toBeCloseTo(resumed + SET, 6);
  });

  it('with no breath coming she waits the page’s gap, then goes back on the chest', () => {
    const sim = coding();
    toPause(sim);
    const began = sim.pauses[0]!.t;
    advance(sim, BREATH.everySec - 0.5);
    expect(sim.compressions?.compressing).toBe(false);
    advance(sim, 0.5);
    expect(sim.compressions?.compressing).toBe(true);
    expect(sim.pauses[0]).toMatchObject({ breaths: 0, wentIn: 0 });
    expect(sim.pauses[0]!.ended! - began).toBeCloseTo(BREATH.everySec, 0);
  });

  it('after one breath she waits the same again for the second', () => {
    const sim = coding();
    toPause(sim);
    advance(sim, 1);
    sim.squeeze(BREATH.overSec);
    const first = sim.t;
    advance(sim, BREATH.everySec - 0.25);
    expect(sim.compressions?.compressing).toBe(false);
    advance(sim, 0.25);
    expect(sim.compressions?.compressing).toBe(true);
    expect(sim.pauses[0]).toMatchObject({ breaths: 1, ended: first + BREATH.everySec });
  });

  it('a squeeze begun in the pause and let go just after she went back is still that pause’s', () => {
    const sim = coding();
    toPause(sim);
    advance(sim, BREATH.everySec);
    expect(sim.compressions?.compressing).toBe(true);
    advance(sim, 0.5);
    sim.squeeze(BREATH.overSec);
    expect(sim.breaths.at(-1)).toMatchObject({ cycle: 'pause', onPace: true });
    expect(sim.pauses[0]).toMatchObject({ breaths: 1 });
    // She is not called off the chest again for it.
    expect(sim.compressions?.compressing).toBe(true);
  });

  it('a breath squeezed while she is compressing belongs to no pause', () => {
    const sim = coding();
    advance(sim, 5);
    sim.squeeze(BREATH.overSec);
    expect(sim.breaths.at(-1)).toMatchObject({ cycle: 'compressions', onPace: false });
    expect(sim.pauses).toEqual([]);
    expect(sim.compressions?.compressing).toBe(true);
  });

  it('a pause’s breaths are judged on their length alone: they come one after the other', () => {
    const sim = coding();
    toPause(sim);
    twoBreaths(sim);
    expect(sim.breaths.map((b) => [b.cycle, b.onPace])).toEqual([
      ['pause', true],
      ['pause', true],
    ]);

    const tapped = coding();
    toPause(tapped);
    advance(tapped, 1);
    tapped.squeeze(BREATH.overSec * 0.2);
    expect(tapped.breaths.at(-1)).toMatchObject({ cycle: 'pause', onPace: false });
    // Off the page's length, and still one of the pause's two.
    expect(tapped.pauses[0]?.breaths).toBe(1);
  });

  it('a breath that does not go in is counted as squeezed, and not as air', () => {
    const sim = coding();
    sim.act('jaw_thrust'); // this test patient's airway shuts on a jaw thrust
    toPause(sim);
    twoBreaths(sim);
    expect(sim.pauses[0]).toMatchObject({ breaths: 2, wentIn: 0 });
    expect(sim.compressions?.compressing).toBe(true);
  });

  it('with a tube in she does not stop: the breaths are the six-second ones again', () => {
    const sim = coding();
    sim.act('lma');
    expect(sim.compressions).toMatchObject({ mode: 'continuous', compressing: true });
    for (let i = 0; i < 6; i += 1) {
      sim.squeeze(BREATH.overSec);
      advance(sim, BREATH.everySec);
    }
    expect(sim.pauses).toEqual([]);
    expect(sim.breaths.every((b) => b.onPace && b.cycle === undefined)).toBe(true);
    expect(sim.breaths.map((b) => b.gap)).toEqual([null, 6, 6, 6, 6, 6]);

    const king = coding();
    king.act('king');
    advance(king, 40);
    expect(king.pauses).toEqual([]);
  });

  it('a tube placed in a pause, or the bag put down in one, puts her straight back on the chest', () => {
    const tube = coding();
    toPause(tube);
    tube.act('king');
    advance(tube, 0.25);
    expect(tube.compressions).toMatchObject({ mode: 'continuous', compressing: true });
    expect(tube.pauses[0]?.ended).toBe(tube.t);

    const down = coding();
    toPause(down);
    down.act('bvm');
    advance(down, 0.25);
    expect(down.compressions).toMatchObject({ mode: 'continuous', compressing: true });
  });

  it('CPR stopped, by a tap or by the story, ends it and closes a pause that was open', () => {
    const tapped = coding();
    toPause(tapped);
    tapped.act('cpr');
    expect(tapped.compressions).toBeNull();
    expect(tapped.pauses[0]?.ended).toBe(tapped.t);
    expect(tapped.log.at(-1)?.text).toBe('CPR: stopped');

    const story = coding();
    advance(story, 5);
    story.act('suction'); // this test scenario takes her hands off on suction
    expect(story.isOn('cpr')).toBe(false);
    expect(story.compressions).toBeNull();
    // Switched on again, she starts a fresh thirty.
    story.act('cpr');
    expect(story.compressions).toMatchObject({ compressing: true, elapsed: 0 });
  });

  it('a time cut is not part of a set: the story resumes with a fresh thirty', () => {
    const sim = coding();
    advance(sim, 10);
    sim.act('call_911');
    sim.tick(0.25);
    expect(sim.cuts).toHaveLength(1);
    expect(sim.compressions).toMatchObject({ compressing: true, elapsed: 0 });
    advance(sim, 16);
    expect(sim.compressions?.compressing).toBe(true);
    advance(sim, 0.5);
    expect(sim.compressions?.compressing).toBe(false);
  });

  it('in a story test the bag gives each pause the page’s two breaths by itself', () => {
    const sim = new Simulation(scenario());
    sim.act('cpr');
    sim.act('bvm');
    advance(sim, 60);
    const ended = sim.pauses.filter((p) => p.ended !== null);
    expect(ended.length).toBeGreaterThanOrEqual(2);
    for (const pause of ended) {
      expect(pause).toMatchObject({ breaths: CPR.breaths, wentIn: CPR.breaths });
      expect(pause.ended! - pause.t).toBeCloseTo(CPR.breaths * BREATH.overSec * 2, 0);
    }

    const noBag = new Simulation(scenario());
    noBag.act('cpr');
    advance(noBag, 60);
    expect(noBag.pauses).toEqual([]);
  });
});

describe('the bag while CPR is on', () => {
  /** Three breaths on the page's pace, which earns the hand-over. */
  function earn(sim: Simulation): void {
    for (let i = 0; i < HAND_OVER_AFTER; i += 1) {
      sim.squeeze(BREATH.overSec);
      advance(sim, BREATH.everySec);
    }
  }

  /** The same test patient with his pulse back, so that the bag can be earned and handed over. */
  function withPulse(): Simulation {
    const sim = new Simulation(scenario(), { pacedBag: true });
    sim.act('stimulate');
    advance(sim, 1);
    return sim;
  }

  it('is the player’s for the whole of an arrest: with no pulse she will not take it, CPR or no CPR', () => {
    const sim = new Simulation(scenario(), { pacedBag: true });
    sim.act('bvm');
    earn(sim);
    // On the page's pace, and counted toward nothing: there is nobody to hand it to.
    expect(sim.breaths.every((b) => b.onPace && b.towardHandOver === null)).toBe(true);
    expect(sim.handOverEarned).toBe(false);
    expect(sim.handBag('da')).toBe(false);
    sim.act('cpr');
    expect(sim.handBag('da')).toBe(false);
    expect(sim.bagHeldBy).toBe('player');
    expect(sim.log.map((l) => l.text)).not.toContain('DA takes the bag');
  });

  it('with a pulse she will not take it while her hands are on his chest, and will once they are off', () => {
    const sim = withPulse();
    sim.act('bvm');
    earn(sim);
    expect(sim.handOverEarned).toBe(true);
    sim.act('cpr');
    expect(sim.handBag('da')).toBe(false);
    expect(sim.bagHeldBy).toBe('player');
    sim.act('cpr');
    expect(sim.handBag('da')).toBe(true);
  });

  it('a bag she was squeezing comes back to the player when she goes on the chest', () => {
    const sim = withPulse();
    sim.act('bvm');
    earn(sim);
    sim.handBag('da');
    expect(sim.bagHeldBy).toBe('da');
    sim.act('cpr');
    expect(sim.bagHeldBy).toBe('player');
    expect(sim.log.map((l) => l.text)).toContain('Bag taken back');
    expect(sim.assistantBagging.at(-1)?.to).toBe(sim.t);
    expect(sim.compressions?.mode).toBe('cycle');
  });

  it('picked up with CPR already going, it is in the player’s hand even if she had it before', () => {
    const sim = withPulse();
    sim.act('bvm');
    earn(sim);
    sim.handBag('da');
    sim.act('bvm');
    sim.act('cpr');
    sim.act('bvm');
    expect(sim.bagHeldBy).toBe('player');
    expect(sim.squeeze(BREATH.overSec)).toBe(true);
  });

  it('breaths given during CPR count toward no hand-over', () => {
    const sim = withPulse();
    sim.act('cpr');
    sim.act('bvm');
    sim.act('lma');
    earn(sim);
    expect(sim.breaths.every((b) => b.onPace && b.towardHandOver === null)).toBe(true);
    expect(sim.handOverEarned).toBe(false);
  });

  it('a bag squeezed with no pulse and nobody on his chest brings no CO₂ back to count a rate from', () => {
    const sim = new Simulation(scenario(), { pacedBag: true });
    sim.act('bvm');
    earn(sim);
    expect(sim.monitor).toMatchObject({ bagged: true, etco2: null, rr: 0 });
  });

  it('the monitor counts the cycle’s breaths over the minute, not from the second between a pause’s two', () => {
    const sim = coding();
    toPause(sim);
    twoBreaths(sim);
    advance(sim, 1);
    expect(sim.monitor).toMatchObject({ bagged: true, rr: 2 });
    toPause(sim);
    twoBreaths(sim);
    toPause(sim);
    twoBreaths(sim);
    advance(sim, 1);
    expect(sim.monitor).toMatchObject({ bagged: true, rr: 6 });

    // A bag the story squeezes gives the page's own: two breaths to every thirty compressions.
    const story = new Simulation(scenario());
    story.act('cpr');
    story.act('bvm');
    advance(story, 5);
    expect(story.monitor).toMatchObject({ bagged: true, rr: 6 });
  });

  it('to a story, breaths in the pauses are bagging for a round and a half of the cycle', () => {
    const sim = coding();
    toPause(sim);
    twoBreaths(sim);
    // Through the next set and into its pause, he is still being bagged.
    toPause(sim);
    expect(sim.run.on('bvm')).toBe(true);
    // That pause goes by with no breath, and so does most of the set after it.
    advance(sim, BREATH.everySec + SET - 4);
    expect(sim.run.on('bvm')).toBe(false);
    expect(sim.isOn('bvm')).toBe(true);
  });
});

describe('bagging the story skipped over', () => {
  it('was still bagging when the story resumes: a time cut does not age the last breath', () => {
    const sim = coding();
    toPause(sim);
    twoBreaths(sim);
    advance(sim, 2);
    expect(sim.run.on('bvm')).toBe(true);
    expect(sim.monitor).toMatchObject({ bagged: true, etco2: 13, rr: 2 });
    sim.act('call_911'); // this test scenario skips two minutes on a call
    sim.tick(0.25);
    expect(sim.cuts).toHaveLength(1);
    expect(sim.run.on('bvm')).toBe(true);
    expect(sim.monitor).toMatchObject({ bagged: true, etco2: 13, rr: 2 });
    // The breaths themselves are recorded when they were given.
    expect(sim.breaths.every((b) => b.t < 30)).toBe(true);
    // It carries no further than it would have: a round and a half from that breath, as played.
    toPause(sim);
    expect(sim.run.on('bvm')).toBe(true);
    advance(sim, BREATH.everySec + SET - 4);
    expect(sim.run.on('bvm')).toBe(false);
  });

  it('a bag nobody was squeezing before the cut is not being squeezed after it', () => {
    const sim = coding();
    toPause(sim);
    twoBreaths(sim);
    toPause(sim);
    advance(sim, BREATH.everySec + SET);
    expect(sim.run.on('bvm')).toBe(false);
    sim.act('call_911');
    sim.tick(0.25);
    expect(sim.cuts).toHaveLength(1);
    expect(sim.run.on('bvm')).toBe(false);
  });
});

describe('how long a toggle has been on', () => {
  it('adds up every stretch, from the start or from a given moment', () => {
    const sim = new Simulation(scenario());
    expect(sim.run.onFor('cpr')).toBe(0);
    expect(sim.run.lastOff('cpr')).toBeNull();
    advance(sim, 4);
    sim.act('cpr');
    advance(sim, 10);
    sim.act('cpr');
    expect(sim.run.onFor('cpr')).toBe(10);
    expect(sim.run.lastOff('cpr')).toBe(14);
    advance(sim, 5);
    sim.act('cpr');
    advance(sim, 3);
    expect(sim.run.onFor('cpr')).toBe(13);
    expect(sim.run.onFor('cpr', 10)).toBe(7);
    expect(sim.run.onFor('cpr', 19)).toBe(3);
    // Still the last time it went off, while it is on again.
    expect(sim.run.lastOff('cpr')).toBe(14);
  });

  it('a toggle the story switched off stopped counting then', () => {
    const sim = new Simulation(scenario());
    sim.act('cpr');
    advance(sim, 6);
    sim.act('suction');
    advance(sim, 6);
    expect(sim.run.onFor('cpr')).toBe(6);
    expect(sim.run.lastOff('cpr')).toBe(6);
  });

  it('time a cut skipped with it on is time it was on', () => {
    const sim = new Simulation(scenario());
    sim.act('cpr');
    advance(sim, 10);
    sim.act('call_911');
    sim.tick(0.25);
    expect(sim.t).toBeCloseTo(130.25, 5);
    expect(sim.run.onFor('cpr')).toBeCloseTo(130.25, 5);
  });

  it('a position that gives way to another went off when the other went on', () => {
    const sim = new Simulation(scenario());
    sim.act('pos_sit_up');
    advance(sim, 5);
    sim.act('pos_side');
    advance(sim, 2);
    expect(sim.run.onFor('pos_sit_up')).toBe(5);
    expect(sim.run.lastOff('pos_sit_up')).toBe(5);
    expect(sim.run.onFor('pos_side')).toBe(2);
  });
});

describe('a patient with no pulse, on the monitor', () => {
  it('has no pulse wave and no saturation to breach a limit, whatever the number behind it', () => {
    const sim = new Simulation(scenario());
    advance(sim, 30);
    expect(sim.monitor.perfusion).toBe(0);
    expect(sim.run.vitals.spo2).toBeLessThan(90);
    expect(Number.isFinite(sim.monitor.spo2)).toBe(true);
    expect(sim.monitor.alarms).toEqual(['apnea']);
    expect(sim.monitor.alarmLevel).toBe('urgent');
    expect(sim.monitor.rhythm).toBe('vtach');
  });

  it('the cuff finds nothing to read on him, and reads again once the pulse is back', () => {
    const sim = new Simulation(scenario());
    expect(sim.monitor.nibp).toMatchObject({ sbp: 120, dbp: 80 });
    sim.cycleCuff();
    advance(sim, 21);
    expect(sim.monitor.nibp).toBeNull();
    sim.act('stimulate'); // this test patient's pulse comes back on a stimulus
    sim.cycleCuff();
    advance(sim, 21);
    expect(sim.monitor.nibp).toMatchObject({ sbp: 120, dbp: 80 });
    expect(sim.monitor.perfusion).toBeGreaterThan(0);
    expect(sim.monitor.alarms).toContain('spo2_low');
  });

  it('a time cut takes no pressure from him either', () => {
    const sim = new Simulation(scenario());
    advance(sim, 2);
    sim.act('call_911');
    sim.tick(0.25);
    expect(sim.cuts).toHaveLength(1);
    expect(sim.monitor.nibp).toBeNull();
  });

  it('the recorder marks the stretch with no reading, from the moment it began to the moment it ended', () => {
    const sim = new Simulation(scenario());
    advance(sim, 9);
    sim.act('stimulate');
    advance(sim, 5);
    const history = sim.history;
    expect(history[0]).toMatchObject({ pulseless: true });
    const back = history.findIndex((s) => s.pulseless !== true);
    expect(back).toBeGreaterThan(0);
    expect(history[back]?.t).toBeCloseTo(9.25, 5);
    expect(history.slice(back).every((s) => s.pulseless === undefined)).toBe(true);
    expect(history.slice(0, back).every((s) => s.pulseless === true)).toBe(true);
  });

  it('the lowest saturation is the lowest that was read: none was while he had no pulse', () => {
    const sim = new Simulation(scenario());
    advance(sim, 40);
    expect(sim.run.vitals.spo2).toBeLessThan(80);
    expect(sim.lowestSpo2).toBe(97);
    sim.act('stimulate');
    advance(sim, 1);
    expect(sim.lowestSpo2).toBeLessThan(80);
  });
});

describe('the bench, as a story sees it', () => {
  it('knows when a syringe was last handled, and nothing before one is', () => {
    const sim = new Simulation(scenario());
    expect(sim.run.benchAt).toBeNull();
    advance(sim, 3);
    const id = sim.pickUpSyringe(3);
    expect(sim.run.benchAt).toBe(3);
    advance(sim, 2);
    sim.drawFromVial(id, 'epinephrine', 1);
    expect(sim.run.benchAt).toBe(5);
    advance(sim, 2);
    sim.labelSyringe(id);
    expect(sim.run.benchAt).toBe(7);
    advance(sim, 4);
    sim.give(id, 1, 'IV');
    // The push is a dose, with its own time: the bench was last touched at the label.
    expect(sim.run.benchAt).toBe(7);
    expect(sim.run.last('give:epinephrine')).toBe(11);
  });
});
