import { describe, expect, it } from 'vitest';
import { findProtocol } from '@sedation-pro/clinical';

import { quiet } from '@/scenarios/quiet';
import { advance } from '@/scenarios/testing';

import { BAG_RATE, BREATH, Simulation } from './engine';

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

describe('the breath is the BVM page’s own', () => {
  it('reads the gap and the length from the page’s line', () => {
    const line = findProtocol('bvm')!.steps.find((s) =>
      s.text.includes('just enough to see the chest rise'),
    )!.text;
    expect(line).toContain(`1 breath every ${BREATH.everySec} seconds`);
    expect(line).toContain(`each over ${BREATH.overSec} second`);
    expect(BAG_RATE).toBe(60 / BREATH.everySec);
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
    sim.handBag('da');
    expect(sim.squeeze(1)).toBe(false);
    expect(sim.breaths).toHaveLength(0);
  });
});

describe('handing the bag over', () => {
  it('the assistant bags as the page writes for as long as she has it', () => {
    const sim = paced();
    sim.act('bvm');
    sim.handBag('da');
    expect(sim.bagHeldBy).toBe('da');
    // The first air to go in is hers: the story's own line, said once.
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Bagging. His chest is rising.' });
    advance(sim, 60);
    expect(sim.run.on('bvm')).toBe(true);
    expect(sim.monitor).toMatchObject({ bagged: true, rr: BAG_RATE });
    expect(sim.log.map((l) => l.text)).toContain('DA takes the bag');
    expect(sim.log.map((l) => l.text)).toContain('BVM: chest rising');

    sim.handBag('player');
    expect(sim.assistantBagging).toEqual([{ from: 0, to: 60 }]);
    expect(sim.log.at(-1)?.text).toBe('Bag taken back');
    advance(sim, BREATH.everySec * 2);
    expect(sim.run.on('bvm')).toBe(false);
  });

  it('handed over after the player’s own breaths, she says she has it', () => {
    const sim = paced();
    sim.act('bvm');
    sim.squeeze(1);
    sim.handBag('da');
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'I have the bag.' });
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
    squeezeEvery(sim, 1, 6);
    sim.handBag('da');
    advance(sim, BREATH.everySec * 8);
    expect(sim.belly).toBe(false);
  });
});
