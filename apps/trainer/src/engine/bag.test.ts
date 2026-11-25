import { describe, expect, it } from 'vitest';
import { findProtocol } from '@sedation-pro/clinical';

import { quiet } from '@/scenarios/quiet';
import { advance } from '@/scenarios/testing';

import {
  BAG_RATE,
  BREATH,
  BREATH_WORDS,
  gapOnPace,
  HAND_OVER_AFTER,
  holdOnPace,
  Simulation,
} from './engine';

/** The bag is the player's to squeeze, on an airway already opened so that a breath goes in. */
const paced = () => {
  const sim = new Simulation(quiet, { pacedBag: true });
  sim.act('jaw_thrust');
  return sim;
};

/** Squeeze every `gap` seconds, `times` over, each held for `held`. */
function squeezeEvery(sim: Simulation, gap: number, times: number, held = BREATH.overSec): void {
  for (let i = 0; i < times; i += 1) {
    sim.squeeze(held);
    advance(sim, gap);
  }
}

/** The breaths that earn the hand-over: the page's own, as many in a row as it takes. */
function earnHandOver(sim: Simulation): void {
  squeezeEvery(sim, BREATH.everySec, HAND_OVER_AFTER);
}

describe('the breath is the BVM page’s own', () => {
  it('reads the gap and the length from the page’s line', () => {
    const line = findProtocol('bvm')!.steps.find((s) =>
      s.text.includes('just enough to see the chest rise'),
    )!.text;
    expect(line).toContain(`1 breath every ${BREATH.everySec} seconds`);
    expect(line).toContain(`each over ${BREATH.overSec} second`);
    expect(BAG_RATE).toBe(60 / BREATH.everySec);
  });

  it('borrows that line’s words for each number, to print beside a breath that missed it', () => {
    const line = findProtocol('bvm')!.steps.find((s) =>
      s.text.includes('just enough to see the chest rise'),
    )!.text;
    expect(BREATH_WORDS.every).toBe('1 breath every 6 seconds');
    expect(BREATH_WORDS.over).toBe('each over 1 second');
    expect(BREATH_WORDS.both).toBe('1 breath every 6 seconds, each over 1 second');
    for (const words of Object.values(BREATH_WORDS)) expect(line).toContain(words);
  });
});

describe('a bag the player has to squeeze', () => {
  it('moves no air until it is squeezed, and the story says nothing about it before then', () => {
    const sim = paced();
    sim.act('bvm');
    expect(sim.isOn('bvm')).toBe(true);
    expect(sim.run.on('bvm')).toBe(false);
    expect(sim.monitor.bagged).toBe(false);
    expect(sim.log.at(-1)?.text).toBe('BVM');
    expect(sim.sinceBreath).toBeNull();

    expect(sim.squeeze(1)).toBe(true);
    expect(sim.run.on('bvm')).toBe(true);
    expect(sim.monitor.bagged).toBe(true);
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest rising', tone: 'good' });
    expect(sim.run.onDuring('bvm', 'hypo')).toBe(true);
  });

  it('stops counting as bagging once nobody has squeezed for a breath and a half', () => {
    const sim = paced();
    sim.act('bvm');
    sim.squeeze(1);
    advance(sim, BREATH.everySec);
    expect(sim.run.on('bvm')).toBe(true);
    advance(sim, BREATH.everySec);
    expect(sim.run.on('bvm')).toBe(false);
    expect(sim.monitor.bagged).toBe(false);
    expect(sim.isOn('bvm')).toBe(true);
  });

  it('a bag left unsqueezed lets him go on desaturating', () => {
    const squeezed = paced();
    squeezed.act('bvm');
    squeezeEvery(squeezed, BREATH.everySec, 10);
    const forgotten = paced();
    forgotten.act('bvm');
    advance(forgotten, BREATH.everySec * 10);
    expect(squeezed.monitor.spo2).toBeGreaterThan(forgotten.monitor.spo2);
  });

  it('the monitor counts the breaths as they were given, not as the page writes them', () => {
    const sim = paced();
    sim.act('bvm');
    squeezeEvery(sim, 3, 6);
    sim.squeeze(1);
    expect(sim.monitor.rr).toBe(20);
  });

  it('does nothing with the bag off, or once the assistant has it', () => {
    const sim = paced();
    expect(sim.squeeze(1)).toBe(false);
    sim.act('bvm');
    earnHandOver(sim);
    sim.handBag('da');
    expect(sim.squeeze(1)).toBe(false);
    expect(sim.breaths).toHaveLength(HAND_OVER_AFTER);
  });
});

describe('a breath on the page’s pace', () => {
  it('is one held about as long as the page writes, about as long after the one before', () => {
    expect(holdOnPace(BREATH.overSec)).toBe(true);
    expect(holdOnPace(BREATH.overSec * 0.5)).toBe(true);
    expect(holdOnPace(BREATH.overSec * 1.5)).toBe(true);
    expect(holdOnPace(BREATH.overSec * 0.4)).toBe(false);
    expect(holdOnPace(BREATH.overSec * 1.6)).toBe(false);

    expect(gapOnPace(BREATH.everySec)).toBe(true);
    expect(gapOnPace(BREATH.everySec * 0.75)).toBe(true);
    expect(gapOnPace(BREATH.everySec * 1.25)).toBe(true);
    expect(gapOnPace(BREATH.everySec * 0.7)).toBe(false);
    expect(gapOnPace(BREATH.everySec * 1.3)).toBe(false);
    // The first breath has none before it to be measured from.
    expect(gapOnPace(null)).toBe(true);
  });

  it('records the gap from the breath before, start to start, and whether it was on pace', () => {
    const sim = paced();
    sim.act('bvm');
    squeezeEvery(sim, BREATH.everySec, 3);
    expect(sim.breaths.map((b) => b.gap)).toEqual([null, BREATH.everySec, BREATH.everySec]);
    expect(sim.breaths.every((b) => b.onPace)).toBe(true);

    const early = paced();
    early.act('bvm');
    squeezeEvery(early, BREATH.everySec / 2, 2);
    expect(early.breaths[1]).toMatchObject({ gap: BREATH.everySec / 2, onPace: false });

    const late = paced();
    late.act('bvm');
    squeezeEvery(late, BREATH.everySec * 2, 2);
    expect(late.breaths[1]).toMatchObject({ gap: BREATH.everySec * 2, onPace: false });
  });

  it('measures the gap from where each squeeze began, so a long hold is not also a late one', () => {
    const sim = paced();
    sim.act('bvm');
    sim.squeeze(BREATH.overSec);
    // Pressed a gap after the first was, and held three times as long before letting go.
    advance(sim, BREATH.everySec + BREATH.overSec * 2);
    sim.squeeze(BREATH.overSec * 3);
    expect(sim.breaths[1]).toMatchObject({ gap: BREATH.everySec, onPace: false });
    expect(gapOnPace(sim.breaths[1]!.gap)).toBe(true);
    expect(holdOnPace(sim.breaths[1]!.held)).toBe(false);
  });

  it('keeps the gap to the millisecond, so three seconds is three and not a hair under', () => {
    const sim = paced();
    sim.act('bvm');
    sim.squeeze(0.3);
    // Thirty tenths of a second do not add up to three in floating point.
    for (let i = 0; i < 30; i += 1) sim.tick(0.1);
    expect(sim.t).not.toBe(3);
    sim.squeeze(0.3);
    expect(sim.breaths[1]?.gap).toBe(3);
    expect(sim.sinceBreath).toBe(0.3);
  });

  it('a short tap or a long hold is off pace however well it was timed', () => {
    const sim = paced();
    sim.act('bvm');
    sim.squeeze(BREATH.overSec * 0.3);
    expect(sim.breaths[0]).toMatchObject({ gap: null, onPace: false });
    advance(sim, BREATH.everySec);
    sim.squeeze(BREATH.overSec * 0.3);
    expect(sim.breaths[1]?.gap).toBeCloseTo(BREATH.everySec);
    expect(sim.breaths[1]?.onPace).toBe(false);

    const long = paced();
    long.act('bvm');
    squeezeEvery(long, BREATH.everySec, 2, BREATH.overSec * 3);
    expect(long.breaths[1]).toMatchObject({ gap: BREATH.everySec, onPace: false });
  });

  it('counts the seconds from where the last squeeze began, and starts again when the bag is picked up', () => {
    const sim = paced();
    sim.act('bvm');
    expect(sim.sinceBreath).toBeNull();
    expect(sim.lastBreath).toBeNull();
    sim.squeeze(1);
    expect(sim.sinceBreath).toBe(1);
    advance(sim, 4);
    expect(sim.sinceBreath).toBe(5);
    expect(sim.lastBreath).toBe(sim.breaths[0]);

    sim.act('bvm');
    sim.act('bvm');
    expect(sim.sinceBreath).toBeNull();
    expect(sim.lastBreath).toBeNull();
    sim.squeeze(1);
    // Nothing of this stretch to measure from: the first breath back is judged on its hold alone.
    expect(sim.breaths.at(-1)).toMatchObject({ gap: null, onPace: true });
  });
});

describe('earning the hand-over', () => {
  it('the assistant does not take the bag until the player has given three breaths in a row on pace', () => {
    expect(HAND_OVER_AFTER).toBe(3);
    const sim = paced();
    sim.act('bvm');
    expect(sim.handOverEarned).toBe(false);
    expect(sim.handBag('da')).toBe(false);
    expect(sim.bagHeldBy).toBe('player');
    expect(sim.log.map((l) => l.text)).not.toContain('DA takes the bag');

    squeezeEvery(sim, BREATH.everySec, 2);
    expect(sim.paceRun).toBe(2);
    expect(sim.handBag('da')).toBe(false);
    expect(sim.bagHeldBy).toBe('player');

    sim.squeeze(BREATH.overSec);
    expect(sim.paceRun).toBe(3);
    expect(sim.handOverEarned).toBe(true);
    expect(sim.breaths.map((b) => b.towardHandOver)).toEqual([1, 2, 3]);
    expect(sim.handBag('da')).toBe(true);
    expect(sim.bagHeldBy).toBe('da');
  });

  it('a breath off pace starts the count again', () => {
    const sim = paced();
    sim.act('bvm');
    squeezeEvery(sim, BREATH.everySec, 2);
    expect(sim.paceRun).toBe(2);
    // The third comes when it was due and is let go at once.
    sim.squeeze(BREATH.overSec * 0.2);
    expect(sim.paceRun).toBe(0);
    expect(sim.handOverEarned).toBe(false);
    expect(sim.breaths.at(-1)).toMatchObject({ onPace: false, towardHandOver: null });

    advance(sim, BREATH.everySec);
    squeezeEvery(sim, BREATH.everySec, 2);
    expect(sim.paceRun).toBe(2);
    expect(sim.handBag('da')).toBe(false);
    sim.squeeze(BREATH.overSec);
    expect(sim.breaths.at(-1)?.towardHandOver).toBe(HAND_OVER_AFTER);
    expect(sim.handBag('da')).toBe(true);
  });

  it('fast breaths, however many, never earn it', () => {
    const sim = paced();
    sim.act('bvm');
    squeezeEvery(sim, BREATH.everySec / 3, 12);
    expect(sim.handOverEarned).toBe(false);
    expect(sim.handBag('da')).toBe(false);
  });

  it('once earned it stays earned: taking the bag back and handing it over again needs no second proof', () => {
    const sim = paced();
    sim.act('bvm');
    earnHandOver(sim);
    expect(sim.handBag('da')).toBe(true);
    expect(sim.handBag('player')).toBe(true);
    expect(sim.handOverEarned).toBe(true);
    // Off pace from here on, and the count toward it is over.
    squeezeEvery(sim, 1, 2);
    expect(sim.breaths.at(-1)).toMatchObject({ onPace: false, towardHandOver: null });
    expect(sim.handBag('da')).toBe(true);

    sim.handBag('player');
    squeezeEvery(sim, BREATH.everySec, 2);
    expect(sim.breaths.at(-1)).toMatchObject({ onPace: true, towardHandOver: null });
  });

  it('the bag put down and picked up again starts the count, but not what was earned', () => {
    const sim = paced();
    sim.act('bvm');
    squeezeEvery(sim, BREATH.everySec, 2);
    sim.act('bvm');
    sim.act('bvm');
    expect(sim.paceRun).toBe(0);
    squeezeEvery(sim, BREATH.everySec, 2);
    expect(sim.handOverEarned).toBe(false);
    sim.squeeze(BREATH.overSec);
    expect(sim.handOverEarned).toBe(true);

    sim.act('bvm');
    sim.act('bvm');
    expect(sim.handOverEarned).toBe(true);
    expect(sim.handBag('da')).toBe(true);
  });

  it('a story test asks for no proof', () => {
    const sim = new Simulation(quiet);
    expect(sim.handOverEarned).toBe(true);
  });
});

describe('handing the bag over', () => {
  it('the assistant bags as the page writes for as long as she has it', () => {
    const sim = paced();
    sim.act('bvm');
    earnHandOver(sim);
    const handed = sim.t;
    sim.handBag('da');
    expect(sim.bagHeldBy).toBe('da');
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'I have the bag.' });
    advance(sim, 60);
    expect(sim.run.on('bvm')).toBe(true);
    expect(sim.monitor).toMatchObject({ bagged: true, rr: BAG_RATE });
    expect(sim.log.map((l) => l.text)).toContain('DA takes the bag');
    expect(sim.log.map((l) => l.text)).toContain('BVM: chest rising');

    sim.handBag('player');
    expect(sim.assistantBagging).toEqual([{ from: handed, to: handed + 60 }]);
    expect(sim.log.at(-1)?.text).toBe('Bag taken back');
    // Hers were not the player's breaths: the count starts again from the bag coming back.
    expect(sim.sinceBreath).toBeNull();
    advance(sim, BREATH.everySec * 2);
    expect(sim.run.on('bvm')).toBe(false);
  });

  it('picked up again and handed straight over, the first air to go in is hers', () => {
    const sim = paced();
    sim.act('bvm');
    earnHandOver(sim);
    sim.act('bvm');
    sim.act('bvm');
    const said = sim.voiceCount;
    sim.handBag('da');
    // The story's own line about the bag, said once, and not "I have the bag" on top of it.
    expect(sim.voiceCount).toBe(said + 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Bagging. His chest is rising.' });
  });

  it('a story test, with no pacing asked for, has the assistant on the bag from the start', () => {
    const sim = new Simulation(quiet);
    sim.act('jaw_thrust');
    sim.act('bvm');
    expect(sim.bagHeldBy).toBe('da');
    expect(sim.run.on('bvm')).toBe(true);
    expect(sim.log.at(-1)?.text).toBe('BVM: chest rising');
    advance(sim, 30);
    expect(sim.monitor.rr).toBe(BAG_RATE);
  });
});

describe('breaths too close together or held too long', () => {
  it('a run of them and the belly is seen to rise, in the page’s words', () => {
    const sim = paced();
    sim.act('bvm');
    squeezeEvery(sim, 1, 3);
    expect(sim.belly).toBe(false);
    squeezeEvery(sim, 1, 3);
    expect(sim.belly).toBe(true);
    const entry = sim.log.find((l) => l.text === 'Belly rising');
    expect(entry?.tone).toBe('bad');
    expect(findProtocol('bvm')!.steps.some((s) => s.text.startsWith('Belly rising'))).toBe(true);
  });

  it('long squeezes do it as surely as fast ones', () => {
    const sim = paced();
    sim.act('bvm');
    squeezeEvery(sim, BREATH.everySec, 5, BREATH.overSec * 3);
    expect(sim.belly).toBe(true);
  });

  it('breaths as the page writes them never raise it, and settle it once it is up', () => {
    const steady = paced();
    steady.act('bvm');
    squeezeEvery(steady, BREATH.everySec, 20);
    expect(steady.belly).toBe(false);

    const sim = paced();
    sim.act('bvm');
    squeezeEvery(sim, 1, 6);
    expect(sim.belly).toBe(true);
    squeezeEvery(sim, BREATH.everySec, 8);
    expect(sim.belly).toBe(false);
  });

  it('the assistant’s breaths settle it too', () => {
    const sim = paced();
    sim.act('bvm');
    earnHandOver(sim);
    squeezeEvery(sim, 1, 6);
    expect(sim.belly).toBe(true);
    sim.handBag('da');
    advance(sim, BREATH.everySec * 8);
    expect(sim.belly).toBe(false);
  });
});
