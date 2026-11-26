import { describe, expect, it } from 'vitest';

import { Simulation } from '@/engine/engine';
import { gradeRun } from '@/engine/grade';
import type { Scenario } from '@/engine/types';

import { crown } from './crown';
import { quiet } from './quiet';
import { AED_SAYS } from './shared';
import { stridor } from './stridor';
import { advance, drawAndGive, until, untilEnd } from './testing';
import { tight } from './tight';
import { wheeze } from './wheeze';

/**
 * The cart is the same in every room, so the five acts the cardiac arrest
 * drill brought to it are on it in the five rooms where he has a pulse. Each
 * of those rooms has to answer them, and answer them the same way.
 */
const WITH_A_PULSE: ReadonlyArray<readonly [string, Scenario]> = [
  ['Shallow', quiet],
  ['Cough', tight],
  ['Wheeze', wheeze],
  ['Crown', crown],
  ['Stridor', stridor],
];

/** Twenty seconds in: every one of them is under way by then, and none is over. */
function underWay(scenario: Scenario): Simulation {
  const sim = new Simulation(scenario);
  advance(sim, 20);
  expect(sim.ending).toBeNull();
  return sim;
}

describe.each(WITH_A_PULSE)(
  '"%s": the acts of an arrest, on a patient with a pulse',
  (_t, drill) => {
    it('a pulse check finds his pulse', () => {
      const sim = underWay(drill);
      sim.act('pulse_check');
      expect(sim.scene).toBe('You feel a pulse at his neck.');
      expect(sim.log.at(-1)).toMatchObject({ text: 'Pulse check: pulse felt', tone: 'neutral' });
      expect(sim.monitor.perfusion).toBeGreaterThan(0);
    });

    it('CPR is stopped at once: the assistant finds a pulse', () => {
      const sim = underWay(drill);
      sim.act('cpr');
      expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'He has a pulse.' });
      expect(sim.log.at(-1)?.text).toBe('CPR stopped: he has a pulse');
      expect(sim.isOn('cpr')).toBe(false);
      expect(sim.compressions).toBeNull();
      expect(sim.run.onDuring('cpr', sim.phase)).toBe(false);
      expect(sim.run.onFor('cpr')).toBe(0);
    });

    it('the AED advises no shock, and asks nothing', () => {
      const sim = underWay(drill);
      sim.act('aed');
      expect(sim.voices.at(-1)).toEqual({ who: 'AED', line: AED_SAYS.noShock });
      expect(sim.log.at(-1)?.text).toBe('AED: no shock advised');
      expect(sim.prompt).toBeNull();
      expect(sim.isOn('aed')).toBe(true);
      advance(sim, 15);
      expect(sim.prompt).toBeNull();
      expect(sim.voices.filter((v) => v.who === 'AED')).toHaveLength(1);
      sim.act('aed');
      expect(sim.log.at(-1)?.text).toBe('AED off');
    });

    it.each([
      ['lma', 'LMA'],
      ['king', 'King'],
    ] as const)('he still has his reflexes: the %s comes straight out', (id, name) => {
      const sim = underWay(drill);
      sim.act(id);
      expect(sim.scene).toBe(`He gags on the ${name} and it comes straight out.`);
      expect(sim.log.at(-1)?.text).toBe(`${name}: gagged, taken out`);
      expect(sim.isOn(id)).toBe(false);
      expect(sim.run.onDuring(id, sim.phase)).toBe(false);
    });

    it('none of them changes what is happening to him', () => {
      const plain = underWay(drill);
      const sim = underWay(drill);
      for (const id of ['pulse_check', 'cpr', 'aed', 'lma', 'king']) sim.act(id);
      for (let i = 0; i < 4 * 40 && !plain.ending; i += 1) {
        plain.tick(0.25);
        sim.tick(0.25);
        expect(sim.phase).toBe(plain.phase);
      }
      expect(sim.run.vitals).toEqual(plain.run.vitals);
      expect(sim.monitor.rhythm).toBe(plain.monitor.rhythm);
    });

    it('nor is any of them a step of this drill’s pages: an untouched run is graded the same with them', () => {
      const plain = new Simulation(drill);
      const sim = new Simulation(drill);
      advance(sim, 20);
      for (const id of ['pulse_check', 'cpr', 'aed', 'lma', 'king']) sim.act(id);
      untilEnd(plain, 1800);
      untilEnd(sim, 1800);
      const strip = (s: Simulation) =>
        gradeRun(drill, s).rows.map((r) => [r.id, r.result, r.parts.map((p) => p.result)]);
      expect(strip(sim)).toEqual(strip(plain));
      expect(sim.endingKey).toBe(plain.endingKey);
    });

    it('the wide, fast rhythm of epinephrine in the vein is not one the AED is made to speak for', () => {
      const sim = underWay(drill);
      drawAndGive(sim, 'epinephrine', 1);
      expect(until(sim, 'overdose', 5)).toBe(true);
      sim.act('aed');
      expect(sim.log.at(-1)?.text).toBe('AED pads on');
      expect(sim.voices.filter((v) => v.who === 'AED')).toEqual([]);
      sim.act('cpr');
      expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'He has a pulse.' });
    });
  },
);

describe('a tube in a patient who is paralysed', () => {
  /** "Shallow", paralysed before anything else was done: no jaw thrust, no NPA. */
  function shallowParalysed(): Simulation {
    const sim = new Simulation(quiet);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed')).toBe(true);
    return sim;
  }

  it.each([
    ['lma', 'LMA'],
    ['king', 'King'],
  ] as const)('"Shallow": the %s goes in, and is a way in for the bag', (id, name) => {
    const sim = shallowParalysed();
    sim.act('bvm');
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Chest not rising.' });
    advance(sim, 2);
    expect(sim.monitor.bagged).toBe(false);

    sim.act(id);
    expect(sim.scene).toBe(`The ${name} is in.`);
    expect(sim.log.at(-1)?.text).toBe(`${name} in`);
    expect(sim.isOn(id)).toBe(true);
    advance(sim, 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Bagging. His chest is rising.' });
    expect(sim.monitor.bagged).toBe(true);
    const low = sim.run.vitals.spo2;
    advance(sim, 5);
    expect(sim.run.vitals.spo2).toBeGreaterThan(low);
  });

  it('"Shallow": it comes out when the paralysis has worn off', () => {
    const sim = shallowParalysed();
    sim.act('lma');
    sim.act('bvm');
    expect(until(sim, 'hypo')).toBe(true);
    advance(sim, 0.5);
    expect(sim.isOn('lma')).toBe(false);
    expect(sim.log.map((l) => l.text)).toContain('LMA out');
    // And he is as he was before it: a bag with no way in moves no air.
    advance(sim, 5);
    expect(sim.monitor.bagged).toBe(false);
  });

  it('"Shallow": one tube at a time, and taken out by hand it is out', () => {
    const sim = shallowParalysed();
    sim.act('lma');
    sim.act('king');
    expect(sim.isOn('lma')).toBe(false);
    expect(sim.isOn('king')).toBe(true);
    sim.act('king');
    expect(sim.log.at(-1)?.text).toBe('King out');
    expect(sim.isOn('king')).toBe(false);
  });

  it('"Stridor": it goes in past the cords that have let go, but not past a pack still in his throat', () => {
    const sim = new Simulation(stridor);
    expect(until(sim, 'silent')).toBe(true);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed')).toBe(true);
    sim.act('lma');
    expect(sim.isOn('lma')).toBe(true);
    sim.act('bvm');
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Chest not rising.' });
    sim.act('suction');
    advance(sim, 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Bagging. His chest is rising.' });
    expect(sim.monitor.bagged).toBe(true);
  });

  it.each([
    ['Cough', tight],
    ['Wheeze', wheeze],
    ['Crown', crown],
  ] as const)('"%s": paralysed by the wrong drug, he takes one too', (_title, drill) => {
    const sim = new Simulation(drill);
    advance(sim, 5);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralysed')).toBe(true);
    sim.act('king');
    expect(sim.scene).toBe('The King is in.');
    expect(sim.isOn('king')).toBe(true);
  });
});
