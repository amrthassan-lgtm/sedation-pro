import { describe, expect, it } from 'vitest';

import { wheeze } from '@/scenarios/wheeze';
import { advance, drawAndGive, until, untilEnd } from '@/scenarios/testing';

import { Simulation } from './engine';
import { gradeRun } from './grade';

/** "Wheeze" played by its page, with room for an add-on once he has had his epinephrine. */
function ideal(extra: (sim: Simulation) => void = () => undefined): Simulation {
  const sim = new Simulation(wheeze);
  advance(sim, 14);
  sim.act('stop');
  sim.useDevice('auviq_adult');
  sim.act('call_911');
  sim.act('pos_sit_up');
  sim.act('o2');
  sim.act('saline');
  extra(sim);
  expect(until(sim, 'relapse')).toBe(true);
  drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
  expect(until(sim, 'handover')).toBe(true);
  sim.answer('er');
  expect(untilEnd(sim)).toBe(true);
  return sim;
}

function addOn(sim: Simulation, id: string) {
  const row = gradeRun(wheeze, sim).rows.find((r) => r.id === id);
  if (!row) throw new Error(`No rubric row "${id}"`);
  return row;
}

describe('an add-on drug is graded three ways', () => {
  it('left out, it is an add-on not done, and the run is still clean', () => {
    const sim = ideal();
    expect(addOn(sim, 'diphenhydramine')).toMatchObject({ result: 'missed', tier: 'extra' });
    expect(gradeRun(wheeze, sim).clean).toBe(true);
  });

  it('given as the page writes it, it is done, and the run is still clean', () => {
    const sim = ideal((s) => drawAndGive(s, 'diphenhydramine', 1));
    expect(addOn(sim, 'diphenhydramine').result).toBe('done');
    expect(gradeRun(wheeze, sim).clean).toBe(true);
  });

  it('given, but not as the page writes it, it says so and the run is not clean', () => {
    const sim = ideal((s) => drawAndGive(s, 'diphenhydramine', 3));
    const debrief = gradeRun(wheeze, sim);
    expect(addOn(sim, 'diphenhydramine').result).toBe('wrong');
    expect(debrief.done).toBe(debrief.of);
    expect(debrief.outside).toEqual([]);
    expect(debrief.clean).toBe(false);
  });

  it('two full rounds of the inhaler back to back are given, not as written', () => {
    const sim = ideal((s) => {
      s.useDevice('albuterol', 8);
      s.useDevice('albuterol', 8);
    });
    expect(addOn(sim, 'albuterol').result).toBe('wrong');
    expect(gradeRun(wheeze, sim).clean).toBe(false);
  });
});
