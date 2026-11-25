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

describe('"Cough", played by the protocol', () => {
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

  it('the inhaler is given its time in one cut, never a shortened wait', () => {
    const sim = start();
    firstRound(sim);
    const inhaler = sim.run.at('albuterol')!;
    expect(until(sim, 'severe')).toBe(true);
    expect(sim.cuts.map((c) => c.title)).toEqual(['After the first albuterol round']);
    // Pacing, not a protocol time: the story looks again this long after the round.
    expect(sim.run.entered('severe')! - inhaler).toBeCloseTo(300, 0);
  });

  it('no Bronchospasm step puts a time on looking again after the inhaler, so the card and the log state none', () => {
    const steps = findProtocol('bronchospasm')!.steps.map((s) => s.text);
    // The only time the page gives the inhaler is its repeat.
    expect(steps.filter((text) => /albuterol/i.test(text) && /\d+ ?min/.test(text))).toEqual([
      'Albuterol inhaler (spacer if available), repeat every 20 min',
    ]);
    expect(steps.some((text) => text.includes('after the first albuterol round'))).toBe(true);
    const sim = start();
    firstRound(sim);
    expect(until(sim, 'severe')).toBe(true);
    const card = sim.cuts[0]!.title;
    const logged = sim.log.at(-1)!.text;
    expect(card).toBe('After the first albuterol round');
    expect(logged).toBe('After the first albuterol round: worse, chest quiet');
    for (const said of [card, logged]) expect(said).not.toMatch(/\d|minute|five/i);
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

describe('"Cough": the inhaler comes first', () => {
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

describe('"Cough": the signs that call for the pen', () => {
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

describe('"Cough": after the pen', () => {
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

describe('"Cough": a step counts while it applied', () => {
  /** The inhaler, the pen and the call on time, and nothing else until he is better. */
  function bareToBetter(sim: Simulation): void {
    advance(sim, 12);
    sim.useDevice('albuterol', 4);
    expect(until(sim, 'severe')).toBe(true);
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    expect(until(sim, 'better')).toBe(true);
  }

  it('stopping, sitting him up, clearing his mouth and oxygen once he is better are too late', () => {
    const sim = start();
    bareToBetter(sim);
    advance(sim, 15);
    sim.act('stop');
    sim.act('pos_sit_up');
    sim.act('suction');
    sim.act('o2');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('handover');
    expect(row(sim, 'stop').parts).toEqual([
      { quote: 'Stop the procedure', result: 'missed' },
      { quote: 'Sit upright', result: 'missed' },
      { quote: 'remove packs', result: 'missed' },
    ]);
    expect(row(sim, 'o2').result).toBe('missed');
    const debrief = gradeRun(tight, sim);
    expect(debrief.done).toBe(3);
    expect(debrief.of).toBe(5);
    expect(debrief.clean).toBe(false);
  });

  it('the same acts in the minute the pen takes still count: he is wheezing until the look', () => {
    const sim = start();
    advance(sim, 12);
    sim.useDevice('albuterol', 4);
    expect(until(sim, 'severe')).toBe(true);
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    advance(sim, 3);
    expect(sim.phase).toBe('opening');
    sim.act('stop');
    sim.act('pos_sit_up');
    sim.act('suction');
    sim.act('o2');
    expect(untilEnd(sim)).toBe(true);
    expect(row(sim, 'stop').result).toBe('done');
    expect(row(sim, 'o2').result).toBe('done');
  });

  it('oxygen is a target: on while he was severe and off once he is better is the step done', () => {
    const sim = start();
    firstRound(sim);
    expect(until(sim, 'severe')).toBe(true);
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    expect(until(sim, 'better')).toBe(true);
    advance(sim, 10);
    sim.act('o2');
    expect(sim.isOn('o2')).toBe(false);
    expect(untilEnd(sim)).toBe(true);
    expect(row(sim, 'o2').result).toBe('done');
    const debrief = gradeRun(tight, sim);
    expect(debrief.done).toBe(5);
    expect(debrief.clean).toBe(true);
  });

  it('oxygen taken off before he was severe is not the step, and with no severe signs it was never reached', () => {
    const off = start();
    firstRound(off);
    advance(off, 2);
    off.act('o2');
    expect(until(off, 'severe')).toBe(true);
    advance(off, 1);
    off.useDevice('auviq_adult');
    off.act('call_911');
    expect(until(off, 'better')).toBe(true);
    off.act('o2');
    expect(untilEnd(off)).toBe(true);
    expect(row(off, 'o2').result).toBe('missed');

    const early = start();
    advance(early, 12);
    early.act('o2');
    early.useDevice('auviq_adult');
    endWithoutEms(early);
    expect(early.run.entered('severe')).toBeNull();
    expect(row(early, 'o2').result).toBe('na');
  });

  it('the throat screen comes out once: a second suction is only a suction', () => {
    const sim = start();
    advance(sim, 12);
    sim.act('suction');
    expect(sim.scene).toContain('The throat screen comes out');
    expect(sim.log.at(-1)?.text).toBe('Packs out, suctioned');
    advance(sim, 11);
    sim.act('suction');
    expect(sim.scene).not.toContain('The throat screen comes out');
    expect(sim.log.at(-1)?.text).toBe('Suctioned');
  });
});

describe('"Cough": an ambulance that was called arrives', () => {
  it('called early in an otherwise ideal run, EMS still arrives eight minutes after the call', () => {
    const sim = start();
    firstRound(sim);
    sim.act('call_911');
    expect(until(sim, 'severe')).toBe(true);
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    // The wait after the pen would have run past their arrival: it stops at the door instead.
    expect(sim.cuts.map((c) => c.title)).toEqual([
      'After the first albuterol round',
      'EMS arrives',
    ]);
    expect(sim.run.entered('better')).toBeNull();
    expect(sim.endingKey).toBe('ems_wheezing');
    expect(sim.ending).toEqual({
      outcome: 'handover',
      title: 'Handed over to EMS',
      text: 'He leaves with EMS. He is still wheezing.',
    });
    expect(sim.scene).toBe('EMS is at the door with a stretcher. He is still wheezing.');
    expect(sim.voices.at(-1)).toEqual({ who: 'EMS', line: 'What have we got?' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'EMS on scene' });
    expect(gradeRun(tight, sim)).toMatchObject({ done: 5, of: 5, clean: true });
  });

  it('everything but epinephrine: EMS takes over a man who cannot speak in sentences, and the pen reads "Not done"', () => {
    const sim = start();
    firstRound(sim);
    sim.act('call_911');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_severe');
    expect(sim.ending).toEqual({
      outcome: 'handover',
      title: 'Handed over to EMS',
      text: 'He leaves with EMS. He cannot speak in sentences.',
    });
    expect(sim.cuts.map((c) => c.title)).toEqual(['After the first albuterol round']);
    expect(row(sim, 'pen_when_severe').result).toBe('missed');
    expect(gradeRun(tight, sim)).toMatchObject({ done: 4, of: 5, clean: false });
  });

  it('what EMS finds in a severe attack is the Bronchospasm step’s own sign', () => {
    const step = findProtocol('bronchospasm')!.steps.find((s) =>
      s.text.includes('Auvi-Q 0.3 first'),
    )!;
    expect(step.text).toContain('cannot speak in sentences');
  });

  it('due just after the look that finds him better, they walk in on time with no card of their own', () => {
    const sim = start();
    sim.act('call_911');
    advance(sim, 170);
    expect(sim.phase).toBe('severe');
    sim.useDevice('auviq_adult');
    expect(until(sim, 'better')).toBe(true);
    expect(sim.t).toBeCloseTo(470, 0);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('handover');
    expect(sim.cuts.map((c) => c.title)).toEqual(['Five minutes after the first dose']);
  });
});

describe('"Cough": the story borrows the page’s words and adds no technique', () => {
  it('the inhaler is taken through the step’s own spacer, with no word on how to breathe it in', () => {
    const step = findProtocol('bronchospasm')!.steps.find((s) =>
      s.text.includes('Albuterol inhaler'),
    )!;
    expect(step.text).toContain('spacer');
    const sim = start();
    advance(sim, 12);
    sim.useDevice('albuterol', 4);
    expect(sim.scene).toBe('He breathes each puff in through the spacer.');
    advance(sim, 1);
    expect(sim.phase).toBe('eased');
    expect(sim.scene).toBe('The whistle loosens a little.');
  });
});

describe('"Cough": a sedative acts on him here too', () => {
  it('more sedative slows his breathing and costs him saturation', () => {
    const plain = start();
    const sim = start();
    advance(plain, 12);
    advance(sim, 12);
    drawAndGive(sim, 'fentanyl', 2);
    drawAndGive(sim, 'midazolam', 1);
    advance(plain, 40);
    advance(sim, 40);
    expect(plain.phase).toBe('tight');
    expect(sim.phase).toBe('tight');
    expect(sim.monitor.rr).toBeLessThan(plain.monitor.rr);
    expect(sim.run.vitals.spo2).toBeLessThan(plain.run.vitals.spo2);
  });

  it('the assistant says so, and says "more" only of a drug he has had', () => {
    expect(tight.setup.join(' ')).toMatch(/Given: midazolam/);
    expect(tight.setup.join(' ')).not.toMatch(/fentanyl/i);
    const sim = start();
    advance(sim, 12);
    drawAndGive(sim, 'midazolam', 0.2, { size: 1 });
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'That’s more midazolam going in, Doc.' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'Midazolam 0.2 ml IV' });
    drawAndGive(sim, 'fentanyl', 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Fentanyl’s in.' });
    drawAndGive(sim, 'fentanyl', 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'That’s more fentanyl going in, Doc.' });
  });

  it('the debrief lists it as outside the protocol and withholds the clean run', () => {
    const sim = start();
    firstRound(sim);
    drawAndGive(sim, 'fentanyl', 1);
    expect(until(sim, 'severe')).toBe(true);
    advance(sim, 1);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    expect(untilEnd(sim)).toBe(true);
    const debrief = gradeRun(tight, sim);
    expect(debrief.outside.map((d) => d.drugKey)).toEqual(['fentanyl']);
    expect(debrief).toMatchObject({ done: 5, of: 5, clean: false });
  });
});
