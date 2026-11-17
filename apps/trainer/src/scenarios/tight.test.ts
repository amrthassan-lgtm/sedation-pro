import { describe, expect, it } from 'vitest';
import { findProtocol } from '@sedation-pro/clinical';

import { Simulation } from '@/engine/engine';
import { gradeRun } from '@/engine/grade';

import { advance, drawAndGive, until, untilEnd } from './testing';
import { tight } from './tight';

function start(): Simulation {
  return new Simulation(tight);
}

/** Everything the protocol asks for before epinephrine. */
function firstRound(sim: Simulation, puffs = 4): void {
  advance(sim, 12);
  sim.act('stop');
  sim.act('pos_sit_up');
  sim.act('suction');
  sim.act('o2');
  sim.useDevice('albuterol', puffs);
}

function ideal(sim: Simulation): void {
  firstRound(sim);
  expect(until(sim, 'severe')).toBe(true);
  advance(sim, 1);
  sim.useDevice('auviq_adult');
  sim.act('call_911');
  expect(untilEnd(sim)).toBe(true);
}

function row(sim: Simulation, id: string) {
  const found = gradeRun(tight, sim).rows.find((r) => r.id === id);
  if (!found) throw new Error(`No rubric row "${id}"`);
  return found;
}

function part(sim: Simulation, id: string, quote: string) {
  const found = row(sim, id).parts.find((p) => p.quote.includes(quote));
  if (!found) throw new Error(`Row "${id}" has no part "${quote}"`);
  return found.result;
}

/** Ends the run without an ambulance, so a debrief can be read. */
function endWithoutEms(sim: Simulation): void {
  expect(until(sim, 'better')).toBe(true);
  advance(sim, 31);
  sim.answer('no');
  expect(untilEnd(sim)).toBe(true);
}

describe('"Tight", played by the protocol', () => {
  it('the ideal run hands him to EMS with every core step done', () => {
    const sim = start();
    ideal(sim);
    const debrief = gradeRun(tight, sim);
    expect(sim.endingKey).toBe('handover');
    expect(debrief.rows.filter((r) => r.tier === 'core' && r.result === 'missed')).toEqual([]);
    expect(debrief.rows.filter((r) => r.tier === 'core' && r.result === 'partial')).toEqual([]);
    expect(debrief.done).toBe(debrief.of);
    expect(debrief.of).toBe(5);
    expect(debrief.outside).toEqual([]);
    expect(debrief.clean).toBe(true);
  });

  it('the second dose is not part of an ideal run: he is better at five minutes', () => {
    const sim = start();
    ideal(sim);
    expect(row(sim, 'second_im').result).toBe('na');
    expect(row(sim, 'epi_label').result).toBe('na');
  });

  it('opens on a shark-fin trace before anyone speaks, then he says what he feels', () => {
    const sim = start();
    expect(sim.monitor.capno).toBe('sharkfin');
    expect(sim.voices).toEqual([]);
    advance(sim, 11);
    expect(sim.voices.at(-1)).toEqual({ who: 'Patient', line: 'My chest… feels tight.' });
  });

  it('the inhaler is given its time in a cut, and the look five minutes on is exact', () => {
    const sim = start();
    firstRound(sim);
    const inhaler = sim.run.at('albuterol')!;
    expect(until(sim, 'severe')).toBe(true);
    expect(sim.cuts.map((c) => c.title)).toEqual(['Five minutes after the inhaler']);
    expect(sim.run.entered('severe')! - inhaler).toBeCloseTo(300, 0);
  });

  it('the look after the pen lands on the five minutes the protocol step states', () => {
    const step = findProtocol('bronchospasm')!.steps.find((s) =>
      s.text.includes('second IM dose'),
    )!;
    expect(step.text).toContain('5 min, not better');
    const sim = start();
    firstRound(sim);
    until(sim, 'severe');
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    const pen = sim.run.at('auviq_adult')!;
    expect(until(sim, 'better')).toBe(true);
    expect(sim.cuts.at(-1)?.title).toBe('Five minutes after the first dose');
    expect(sim.run.entered('better')! - pen).toBeCloseTo(300, 0);
    expect(sim.voices.at(-1)?.line).toContain('five minutes since the pen');
  });

  it('EMS arrives eight minutes after the call', () => {
    const sim = start();
    ideal(sim);
    const called = sim.run.at('call_911')!;
    expect(sim.cuts.at(-1)?.title).toBe('EMS arrives');
    expect(sim.t - called).toBeCloseTo(480, 0);
  });
});

describe('"Tight": the inhaler comes first', () => {
  it('fewer puffs than a round do not ease him', () => {
    const sim = start();
    advance(sim, 12);
    sim.useDevice('albuterol', 3);
    advance(sim, 5);
    expect(sim.phase).toBe('tight');
  });

  it('puffs taken back to back are one round', () => {
    const sim = start();
    advance(sim, 12);
    sim.useDevice('albuterol', 2);
    advance(sim, 10);
    sim.useDevice('albuterol', 2);
    advance(sim, 1);
    expect(sim.phase).toBe('eased');
    sim.act('stop');
    sim.act('pos_sit_up');
    sim.act('o2');
    until(sim, 'severe');
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    endWithoutEms(sim);
    expect(part(sim, 'albuterol', 'Albuterol inhaler')).toBe('done');
    expect(part(sim, 'albuterol', 'repeat every 20 min')).toBe('na');
  });

  it('a round over the protocol range moves the story on and is marked', () => {
    const sim = start();
    advance(sim, 12);
    sim.useDevice('albuterol', 8);
    advance(sim, 5);
    sim.useDevice('albuterol', 4);
    advance(sim, 1);
    expect(sim.phase).toBe('eased');
    until(sim, 'severe');
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    endWithoutEms(sim);
    expect(part(sim, 'albuterol', 'Albuterol inhaler')).toBe('missed');
  });

  it('a second round before the protocol interval is marked, and does not help once he is severe', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'severe');
    advance(sim, 1);
    const before = sim.monitor.spo2;
    sim.useDevice('albuterol', 4);
    advance(sim, 30);
    expect(sim.phase).toBe('severe');
    expect(sim.monitor.spo2).toBeLessThan(before);
    sim.useDevice('auviq_adult');
    endWithoutEms(sim);
    expect(part(sim, 'albuterol', 'Albuterol inhaler')).toBe('done');
    expect(part(sim, 'albuterol', 'repeat every 20 min')).toBe('missed');
  });

  it('the pen before the signs opens him up, and the step is marked', () => {
    const sim = start();
    advance(sim, 12);
    sim.useDevice('auviq_adult');
    advance(sim, 1);
    expect(sim.phase).toBe('opening');
    expect(sim.run.entered('severe')).toBeNull();
    endWithoutEms(sim);
    expect(part(sim, 'pen_when_severe', 'Severe (cannot speak')).toBe('missed');
    expect(part(sim, 'pen_when_severe', 'Auvi-Q 0.3 first')).toBe('done');
    expect(row(sim, 'pen_when_severe').result).toBe('partial');
    expect(row(sim, 'albuterol').result).toBe('missed');
    expect(gradeRun(tight, sim).clean).toBe(false);
  });

  it('the pen after the inhaler but before the signs is still early', () => {
    const sim = start();
    firstRound(sim);
    advance(sim, 2);
    expect(sim.phase).toBe('eased');
    sim.useDevice('auviq_adult');
    endWithoutEms(sim);
    expect(part(sim, 'pen_when_severe', 'Severe (cannot speak')).toBe('missed');
    expect(row(sim, 'albuterol').result).toBe('done');
  });
});

describe('"Tight": the signs that call for the pen', () => {
  it('reads the saturation line from the protocol step', () => {
    const step = findProtocol('bronchospasm')!.steps.find((s) =>
      s.text.includes('Auvi-Q 0.3 first'),
    )!;
    expect(step.text).toContain('SpO₂ under 92%');
  });

  it('without oxygen or the inhaler the saturation reaches the line, and that is the sign', () => {
    const sim = start();
    expect(until(sim, 'severe', 400)).toBe(true);
    expect(sim.cuts).toEqual([]);
    expect(sim.log.at(-1)?.text).toContain('two words at a time');
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    expect(untilEnd(sim)).toBe(true);
    expect(part(sim, 'pen_when_severe', 'Severe (cannot speak')).toBe('done');
    expect(row(sim, 'albuterol').result).toBe('missed');
  });

  it('once severe he keeps falling until epinephrine is in, with or without oxygen', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'severe');
    const at = sim.monitor.spo2;
    advance(sim, 60);
    expect(sim.monitor.spo2).toBeLessThan(at);
    sim.useDevice('auviq_adult');
    advance(sim, 20);
    expect(sim.phase).toBe('opening');
    expect(sim.monitor.spo2).toBeGreaterThan(at - 3);
  });

  it('the pediatric pen alone is not the protocol dose and does not open him up', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'severe');
    sim.useDevice('pen_peds');
    advance(sim, 20);
    expect(sim.phase).toBe('severe');
    expect(sim.voices.at(-1)?.line).toContain('pediatric pen');
  });

  it('an ampule dose first also works, and "Auvi-Q 0.3 first" is marked', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'severe');
    advance(sim, 1);
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    sim.act('call_911');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('handover');
    expect(part(sim, 'pen_when_severe', 'Auvi-Q 0.3 first')).toBe('missed');
    expect(row(sim, 'epi_label').result).toBe('done');
  });

  it('lying him flat makes the breathing worse', () => {
    const upright = start();
    const flat = start();
    flat.act('pos_flat_legs_up');
    advance(upright, 40);
    advance(flat, 40);
    expect(flat.monitor.spo2).toBeLessThanOrEqual(upright.monitor.spo2);
    expect(flat.run.vitals.spo2).toBeLessThan(upright.run.vitals.spo2);
  });

  it('he pushes the bag away: it does not stay on, and the monitor keeps his own rate', () => {
    const sim = start();
    advance(sim, 12);
    const own = sim.monitor.rr;
    sim.act('bvm');
    advance(sim, 2);
    expect(sim.scene).toContain('pushes the mask away');
    expect(sim.isOn('bvm')).toBe(false);
    expect(sim.monitor).toMatchObject({ bagged: false, rr: own });
  });
});

describe('"Tight": after the pen', () => {
  function toBetter(sim: Simulation): void {
    firstRound(sim);
    until(sim, 'severe');
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    expect(until(sim, 'better')).toBe(true);
  }

  it('a second dose when he is better is marked, and his heart rate shows it', () => {
    const sim = start();
    toBetter(sim);
    const hr = sim.run.vitals.hr;
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    expect(sim.run.vitals.hr).toBeGreaterThan(hr + 20);
    expect(sim.log.at(-1)?.tone).toBe('bad');
    expect(untilEnd(sim)).toBe(true);
    expect(part(sim, 'second_im', '5 min, not better')).toBe('missed');
    expect(part(sim, 'second_im', 'second IM dose from the ampule')).toBe('done');
    expect(row(sim, 'second_im').result).toBe('partial');
    expect(gradeRun(tight, sim).clean).toBe(false);
  });

  it('an unlabeled ampule syringe is marked on the label line', () => {
    const sim = start();
    toBetter(sim);
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM', label: false });
    untilEnd(sim);
    expect(row(sim, 'epi_label').result).toBe('missed');
  });

  it('epinephrine into the vein is the harm ending, as in every room', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'severe');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IV' });
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('harm');
    expect(part(sim, 'pen_when_severe', 'NEVER')).toBe('missed');
  });

  it('paralysed by succinylcholine he takes the bag: nobody pushes a mask away then', () => {
    const sim = start();
    advance(sim, 12);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralysed', 30)).toBe(true);
    sim.act('bvm');
    advance(sim, 3);
    expect(sim.isOn('bvm')).toBe(true);
    expect(sim.monitor).toMatchObject({ bagged: true, rr: 10 });
    expect(sim.scene).not.toContain('pushes the mask away');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('paralysed');
  });

  it('succinylcholine stops a patient who was breathing', () => {
    const sim = start();
    advance(sim, 12);
    drawAndGive(sim, 'succinylcholine', 2, { route: 'IV' });
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('paralysed');
  });

  it('with no call the front desk asks, and "no" ends the run with nobody coming', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'severe');
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    until(sim, 'better');
    advance(sim, 31);
    expect(sim.prompt?.id).toBe('late_911');
    sim.answer('no');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('no_ems');
    expect(row(sim, 'call_911').result).toBe('missed');
    expect(row(sim, 'albuterol_911').result).toBe('missed');
  });

  it('a late call still brings EMS, and "At the same time" is marked', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'severe');
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    until(sim, 'better');
    advance(sim, 31);
    sim.answer('call');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('handover');
    expect(part(sim, 'call_911', 'At the same time')).toBe('missed');
    expect(part(sim, 'call_911', 'DA calls 911')).toBe('done');
    expect(row(sim, 'albuterol_911').result).toBe('done');
  });

  it('the steroid is an add-on: graded by its dose, never part of the score', () => {
    const sim = start();
    toBetter(sim);
    drawAndGive(sim, 'solumedrol', 2);
    untilEnd(sim);
    const debrief = gradeRun(tight, sim);
    expect(row(sim, 'steroid').result).toBe('done');
    expect(row(sim, 'dexamethasone').result).toBe('na');
    expect(debrief.of).toBe(5);
    expect(debrief.outside).toEqual([]);
  });

  it('dexamethasone in its place makes the Solu-Medrol line not apply', () => {
    const sim = start();
    toBetter(sim);
    drawAndGive(sim, 'dexamethasone', 2);
    untilEnd(sim);
    expect(row(sim, 'dexamethasone').result).toBe('done');
    expect(row(sim, 'steroid').result).toBe('na');
  });

  it('a drug these steps never mention is listed and withholds the clean run', () => {
    const sim = start();
    toBetter(sim);
    drawAndGive(sim, 'naloxone', 1);
    untilEnd(sim);
    const debrief = gradeRun(tight, sim);
    expect(debrief.outside.map((d) => d.drugKey)).toEqual(['naloxone']);
    expect(debrief.clean).toBe(false);
  });
});
