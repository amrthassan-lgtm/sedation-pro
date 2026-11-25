import { describe, expect, it } from 'vitest';
import { findProtocol } from '@sedation-pro/clinical';

import { Simulation } from '@/engine/engine';
import { gradeRun } from '@/engine/grade';
import { minutesInStep } from '@/engine/protocol';

import { advance, drawAndGive, until, untilEnd } from './testing';
import { wheeze } from './wheeze';

function start(): Simulation {
  return new Simulation(wheeze);
}

function firstRound(sim: Simulation): void {
  advance(sim, 14);
  sim.act('stop');
  sim.useDevice('auviq_adult');
  sim.act('call_911');
  sim.act('pos_sit_up');
  sim.act('o2');
  sim.act('saline');
}

function ideal(sim: Simulation): void {
  firstRound(sim);
  expect(until(sim, 'relapse')).toBe(true);
  drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
  expect(until(sim, 'handover')).toBe(true);
  sim.answer('er');
  expect(untilEnd(sim)).toBe(true);
}

function row(sim: Simulation, id: string) {
  const found = gradeRun(wheeze, sim).rows.find((r) => r.id === id);
  if (!found) throw new Error(`No rubric row "${id}"`);
  return found;
}

describe('"Wheeze", played by the protocol', () => {
  it('the ideal run hands a recovering patient to EMS with every core step done', () => {
    const sim = start();
    ideal(sim);
    const debrief = gradeRun(wheeze, sim);
    expect(sim.endingKey).toBe('er');
    expect(debrief.rows.filter((r) => r.tier === 'core' && r.result !== 'done')).toEqual([]);
    expect(debrief.done).toBe(debrief.of);
    expect(debrief.of).toBe(8);
    expect(debrief.outside).toEqual([]);
    expect(debrief.clean).toBe(true);
  });

  it('the card and the line say "five minutes" because the protocol step does', () => {
    const step = findProtocol('anaphylaxis')!.steps.find((s) => s.text.includes('second IM dose'))!;
    expect(minutesInStep('anaphylaxis', 'second IM dose', /(\d+) min, not better/)).toBe(5);
    expect(step.text).toContain('Repeat every 5-15 min');
  });

  it('the pressure on screen is already three minutes old when the scene opens', () => {
    const sim = start();
    expect(sim.monitor.nibp).toEqual({ sbp: 124, dbp: 78, at: -180 });
  });

  it('the monitor shows the shark fin from the start, before anyone speaks', () => {
    const sim = start();
    expect(sim.monitor.capno).toBe('sharkfin');
    expect(sim.voices).toEqual([]);
    advance(sim, 13);
    expect(sim.voices.at(-1)?.line).toContain('look at his neck');
  });

  it('the pressure on screen is stale until the cuff is cycled', () => {
    const sim = start();
    advance(sim, 60);
    expect(sim.monitor.nibp?.sbp).toBe(124);
    sim.cycleCuff();
    expect(sim.monitor.cuffCycling).toBe(true);
    advance(sim, 21);
    expect(sim.monitor.cuffCycling).toBe(false);
    expect(sim.monitor.nibp!.sbp).toBeLessThan(110);
  });

  it('the wait for the second dose is a five-minute cut, never a shortened wait', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'relapse');
    const pen = sim.run.at('auviq_adult')!;
    expect(sim.cuts).toHaveLength(1);
    expect(sim.cuts[0]?.title).toBe('Five minutes after the first dose');
    expect(sim.run.entered('relapse')! - pen).toBeCloseTo(300, 0);
  });

  it('there is one adult pen', () => {
    const sim = start();
    expect(sim.remaining('auviq_adult')).toBe(1);
    expect(sim.useDevice('auviq_adult')).toBe(true);
    expect(sim.remaining('auviq_adult')).toBe(0);
    expect(sim.useDevice('auviq_adult')).toBe(false);
    expect(sim.run.given('epinephrine')).toHaveLength(1);
  });

  it('the pediatric pen alone does not turn it around', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('pen_peds');
    expect(sim.voices.at(-1)?.line).toContain('pediatric pen');
    advance(sim, 30);
    expect(sim.phase).toBe('onset');
    sim.useDevice('auviq_adult');
    advance(sim, 1);
    expect(sim.phase).toBe('responding');
    expect(sim.run.given('epinephrine')[0]?.device).toBe('pen_peds');
  });

  it('the assistant offers the line when the second dose is drawn', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'relapse');
    const id = sim.pickUpSyringe(3);
    sim.drawFromVial(id, 'epinephrine', 0.3);
    expect(sim.voices.at(-1)?.line).toContain('push that in the line');
  });

  it('stock epinephrine into the vein ends the run in harm and fails the NEVER step', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IV' });
    advance(sim, 1);
    expect(sim.phase).toBe('overdose');
    expect(sim.monitor.rhythm).toBe('vtach');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('harm');
    const second = row(sim, 'second_im');
    expect(second.result).toBe('missed');
    expect(second.parts.find((p) => p.quote.startsWith('NEVER'))?.result).toBe('missed');
    // The first dose was the pen and nothing went into the vein before the relapse.
    expect(row(sim, 'pen_first').result).toBe('done');
  });

  it('a second pen dose from the pediatric pen is not the ampule dose', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'relapse');
    sim.useDevice('pen_peds');
    advance(sim, 10);
    expect(sim.phase).toBe('relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    expect(until(sim, 'settling', 5)).toBe(true);
  });

  it('without fluids the pressure will not come up, and EMS does not get a stable patient yet', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    sim.act('o2');
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    advance(sim, 60);
    expect(sim.phase).toBe('settling');
    expect(sim.voices.some((v) => v.line.includes('stuck in the eighties'))).toBe(true);
    sim.act('saline');
    expect(until(sim, 'handover', 120)).toBe(true);
  });

  it('doing nothing ends in arrest', () => {
    const sim = start();
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('arrest');
    expect(sim.t).toBeGreaterThan(180);
    expect(gradeRun(wheeze, sim).done).toBe(0);
    expect(row(sim, 'second_im').result).toBe('na');
  });

  it('fluids and position without epinephrine do not save him', () => {
    const sim = start();
    sim.act('o2');
    sim.act('pos_flat_legs_up');
    sim.act('saline');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('arrest');
  });

  it('never calling 911 gets a late offer; declining it ends without EMS', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('auviq_adult');
    sim.act('o2');
    sim.act('pos_sit_up');
    sim.act('saline');
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    advance(sim, 60);
    expect(sim.prompt?.id).toBe('late_911');
    sim.answer('no');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('no_ems');
    expect(row(sim, 'call_911').result).toBe('missed');
    expect(row(sim, 'er').result).toBe('missed');
  });

  it('taking the late offer still brings EMS', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('auviq_adult');
    sim.act('saline');
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    advance(sim, 60);
    sim.answer('call');
    expect(until(sim, 'handover', 120)).toBe(true);
    sim.answer('home');
    untilEnd(sim);
    expect(sim.endingKey).toBe('kept');
    // Called, but six minutes late and only when asked: not "at the same time".
    expect(row(sim, 'call_911').result).toBe('partial');
    expect(row(sim, 'call_911').parts).toEqual([
      { quote: 'At the same time', result: 'missed' },
      { quote: 'DA calls 911', result: 'done' },
    ]);
    expect(row(sim, 'er').result).toBe('missed');
  });

  it('the add-ons are graded but do not count toward the score', () => {
    const sim = start();
    firstRound(sim);
    sim.useDevice('albuterol', 4);
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    drawAndGive(sim, 'diphenhydramine', 1);
    drawAndGive(sim, 'solumedrol', 2);
    until(sim, 'handover');
    sim.answer('er');
    untilEnd(sim);
    const debrief = gradeRun(wheeze, sim);
    expect(row(sim, 'albuterol').result).toBe('done');
    expect(row(sim, 'diphenhydramine').result).toBe('done');
    expect(row(sim, 'steroid').result).toBe('done');
    expect(debrief.of).toBe(8);
  });

  it('ten times the dose into the thigh is felt, flagged and never a clean run', () => {
    const sim = start();
    firstRound(sim);
    const before = sim.monitor.hr;
    drawAndGive(sim, 'epinephrine', 3, { route: 'IM' });
    expect(sim.voices.at(-1)?.line).toContain('a lot more than the pen');
    expect(sim.log.at(-1)).toMatchObject({ text: 'Epinephrine 3.0 ml IM', tone: 'bad' });
    expect(sim.monitor.hr).toBeGreaterThan(before + 20);
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    until(sim, 'handover');
    sim.answer('er');
    untilEnd(sim);
    const second = row(sim, 'second_im');
    expect(second.parts.find((p) => p.quote === 'second IM dose from the ampule')?.result).toBe(
      'missed',
    );
    expect(second.result).toBe('partial');
    expect(gradeRun(wheeze, sim).clean).toBe(false);
  });

  it('a repeat five minutes after the second dose is what the step says, not an overdose', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    sim.act('pos_sit_up');
    sim.act('o2');
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    advance(sim, 40);
    expect(sim.phase).toBe('settling');
    const second = sim.run.given('epinephrine')[1]!.t;
    // No fluids, so EMS arrives to a patient who is still low; the repeat goes in once five minutes are up.
    expect(until(sim, 'handover')).toBe(true);
    advance(sim, 300 - (sim.t - second) + 1);
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    sim.answer('er');
    untilEnd(sim);
    expect(row(sim, 'second_im').parts).toEqual([
      { quote: '5 min, not better', result: 'done' },
      { quote: 'second IM dose from the ampule', result: 'done' },
      { quote: 'Repeat every 5-15 min', result: 'done' },
      { quote: 'NEVER 1 mg/ml IV in a patient with a pulse', result: 'done' },
    ]);
  });

  it('a repeat sooner than the step allows is marked on the repeat, not on the second dose', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    advance(sim, 90);
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    if (sim.phase !== 'handover') until(sim, 'handover');
    sim.answer('er');
    untilEnd(sim);
    const parts = row(sim, 'second_im').parts;
    expect(parts[1]).toEqual({ quote: 'second IM dose from the ampule', result: 'done' });
    expect(parts[2]).toEqual({ quote: 'Repeat every 5-15 min', result: 'missed' });
  });

  it('a second injection a minute after the first is not "5 min, not better"', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('pen_peds');
    advance(sim, 66);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    sim.act('pos_sit_up');
    sim.act('o2');
    sim.act('saline');
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    until(sim, 'handover');
    sim.answer('er');
    untilEnd(sim);
    expect(row(sim, 'second_im').parts[0]).toEqual({
      quote: '5 min, not better',
      result: 'missed',
    });
  });

  it('with no epinephrine at all the NEVER line earns nothing', () => {
    const none = start();
    untilEnd(none);
    expect(row(none, 'pen_first').result).toBe('missed');

    const penOnly = start();
    advance(penOnly, 14);
    penOnly.useDevice('auviq_adult');
    untilEnd(penOnly);
    expect(penOnly.ending?.outcome).toBe('arrest');
    expect(row(penOnly, 'second_im').result).toBe('missed');
  });

  it('EMS arrives on its own clock even when the pressure never comes up', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    sim.act('pos_sit_up');
    sim.act('o2');
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    expect(until(sim, 'handover', 120)).toBe(true);
    expect(sim.scene).toContain('his pressure has not come up');
    expect(sim.t - sim.run.at('call_911')!).toBeGreaterThanOrEqual(8 * 60);
    sim.answer('er');
    expect(untilEnd(sim)).toBe(true);
    expect(row(sim, 'fluids').result).toBe('missed');
  });

  it('with no ambulance and no fluids the front desk still asks', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('auviq_adult');
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    advance(sim, 70);
    expect(sim.prompt?.id).toBe('late_911');
    expect(sim.prompt?.voice.line).toBe('Do you want an ambulance?');
  });

  it('a position or oxygen counts only while it is left on', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    sim.act('pos_sit_up');
    sim.act('pos_side');
    sim.act('o2');
    sim.act('o2');
    sim.act('saline');
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    until(sim, 'handover');
    sim.answer('er');
    untilEnd(sim);
    expect(row(sim, 'position').result).toBe('missed');
    expect(row(sim, 'o2').result).toBe('missed');
  });

  it('the relapse line only mentions the pen if the pen was used', () => {
    const sim = start();
    advance(sim, 14);
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    until(sim, 'relapse');
    expect(sim.voices.at(-1)?.line).toBe('That’s five minutes since the first dose, Doc.');
    expect(sim.remaining('auviq_adult')).toBe(1);
  });

  it('one puff is one puff', () => {
    const sim = start();
    sim.useDevice('albuterol');
    expect(sim.log.at(-1)?.text).toBe('Albuterol, 1 puff');
  });

  it('succinylcholine paralyses him here too, and the run stops in harm', () => {
    const sim = start();
    firstRound(sim);
    drawAndGive(sim, 'succinylcholine', 2);
    expect(until(sim, 'paralysed', 30)).toBe(true);
    advance(sim, 1);
    expect(sim.monitor.rr).toBe(0);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('harm');
    expect(gradeRun(wheeze, sim).outside.map((d) => d.drugKey)).toEqual(['succinylcholine']);
  });

  it('a thigh-sized dose into the vein is an overdose at any dilution', () => {
    const sim = start();
    firstRound(sim);
    until(sim, 'relapse');
    const id = sim.pickUpSyringe(3);
    sim.drawFromVial(id, 'epinephrine', 0.3);
    sim.drawSaline(id, 0.1);
    sim.labelSyringe(id);
    const dose = sim.give(id, 0.4, 'IV');
    expect(dose?.mcgPerMl).toBeCloseTo(750, 0);
    advance(sim, 1);
    expect(sim.phase).toBe('overdose');
  });

  it('a drug the protocol never mentions is listed, and the run is not clean', () => {
    const sim = start();
    firstRound(sim);
    drawAndGive(sim, 'labetalol', 3);
    drawAndGive(sim, 'midazolam', 1);
    until(sim, 'relapse');
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    until(sim, 'handover');
    sim.answer('er');
    untilEnd(sim);
    const debrief = gradeRun(wheeze, sim);
    expect(debrief.done).toBe(8);
    expect(debrief.outside.map((d) => d.drugKey)).toEqual(['labetalol', 'midazolam']);
    expect(debrief.clean).toBe(false);
  });

  it('the steroid is "after epinephrine", and the written alternative counts in its place', () => {
    const early = start();
    advance(early, 14);
    drawAndGive(early, 'solumedrol', 2);
    advance(early, 2);
    early.useDevice('auviq_adult');
    untilEnd(early);
    // Given before the epinephrine, it is not this step: an add-on given, but not as written.
    expect(row(early, 'steroid').result).toBe('wrong');

    const alt = start();
    firstRound(alt);
    until(alt, 'relapse');
    drawAndGive(alt, 'epinephrine', 0.3, { route: 'IM' });
    drawAndGive(alt, 'dexamethasone', 2);
    until(alt, 'handover');
    alt.answer('er');
    untilEnd(alt);
    expect(row(alt, 'dexamethasone').result).toBe('done');
    expect(row(alt, 'steroid').result).toBe('na');
    expect(gradeRun(wheeze, alt).outside).toEqual([]);
  });

  it('reversal agents do nothing here and the assistant says why', () => {
    const sim = start();
    advance(sim, 14);
    drawAndGive(sim, 'naloxone', 1);
    expect(sim.voices.at(-1)?.line).toContain('breathing fast');
    advance(sim, 40);
    expect(sim.phase).toBe('onset');
  });
});

describe('"Wheeze": a step counts while it applied', () => {
  /** Both doses and the call on time, and nothing else until EMS is at the door. */
  function bareToHandover(sim: Simulation): void {
    advance(sim, 14);
    sim.act('stop');
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    expect(until(sim, 'relapse')).toBe(true);
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    expect(until(sim, 'handover')).toBe(true);
  }

  it('oxygen, a position and fluids started once EMS is at the door are too late', () => {
    const sim = start();
    bareToHandover(sim);
    expect(sim.scene).toContain('his pressure has not come up');
    sim.act('o2');
    sim.act('pos_flat_legs_up');
    sim.act('saline');
    sim.answer('er');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('er');
    expect(row(sim, 'position').result).toBe('missed');
    expect(row(sim, 'o2').result).toBe('missed');
    expect(row(sim, 'fluids').result).toBe('missed');
    const debrief = gradeRun(wheeze, sim);
    expect(debrief.done).toBe(5);
    expect(debrief.of).toBe(8);
    expect(debrief.clean).toBe(false);
  });

  it('the same three started after the second dose, before EMS arrives, still count', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('auviq_adult');
    sim.act('call_911');
    expect(until(sim, 'relapse')).toBe(true);
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    advance(sim, 5);
    expect(sim.phase).toBe('settling');
    sim.act('o2');
    sim.act('pos_flat_legs_up');
    sim.act('saline');
    expect(until(sim, 'handover')).toBe(true);
    sim.answer('er');
    expect(untilEnd(sim)).toBe(true);
    expect(row(sim, 'position').result).toBe('done');
    expect(row(sim, 'o2').result).toBe('done');
    expect(row(sim, 'fluids').result).toBe('done');
  });

  it('"stuck in the eighties" is only said of a pressure in the eighties', () => {
    const sim = start();
    advance(sim, 14);
    sim.useDevice('auviq_adult');
    expect(until(sim, 'relapse')).toBe(true);
    // Called only now, so the ambulance is not at the door before the line can be said.
    sim.act('call_911');
    // Left to fall before the second dose: he settles from the sixties.
    advance(sim, 150);
    drawAndGive(sim, 'epinephrine', 0.3, { route: 'IM' });
    expect(until(sim, 'settling', 5)).toBe(true);
    expect(sim.run.vitals.sbp).toBeLessThan(65);
    const said = (): boolean => sim.voices.some((v) => v.line.includes('stuck in the eighties'));
    let saidAt: number | null = null;
    for (let i = 0; i < 4 * 59 && sim.phase === 'settling'; i += 1) {
      sim.tick(0.25);
      if (saidAt === null && said()) saidAt = sim.run.vitals.sbp;
    }
    expect(saidAt).not.toBeNull();
    expect(Math.round(saidAt!)).toBeGreaterThanOrEqual(80);
    expect(Math.round(saidAt!)).toBeLessThan(90);
  });
});

describe('"Wheeze": an ambulance that was called arrives', () => {
  it('the second dose never given: EMS arrives eight minutes after the call and takes him as he is', () => {
    const sim = start();
    firstRound(sim);
    expect(until(sim, 'relapse')).toBe(true);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('handover');
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_reacting');
    expect(sim.ending).toEqual({
      outcome: 'handover',
      title: 'Handed over to EMS',
      text: 'He leaves with EMS. He is still wheezing, and the hives have not faded.',
    });
    expect(sim.scene).toBe(
      'EMS is at the door with a stretcher. He is still wheezing, and the hives have not faded.',
    );
    expect(sim.log.at(-1)).toMatchObject({ text: 'EMS on scene', tone: 'neutral' });
    // He is taken as he is: nobody is asked where he goes.
    expect(sim.prompt).toBeNull();
    expect(sim.run.answer('disposition')).toBeNull();
    expect(row(sim, 'second_im').result).toBe('missed');
    expect(row(sim, 'er').result).toBe('na');
    expect(gradeRun(wheeze, sim)).toMatchObject({ done: 5, of: 6, clean: false });
  });

  it('due inside the five-minute wait, EMS arrives under its own card to a man the first dose is holding', () => {
    const sim = start();
    advance(sim, 14);
    sim.act('call_911');
    advance(sim, 186);
    sim.useDevice('auviq_adult');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.run.entered('relapse')).toBeNull();
    expect(sim.cuts.map((c) => c.title)).toEqual(['EMS arrives']);
    expect(sim.endingKey).toBe('ems_reacting');
    expect(row(sim, 'second_im').result).toBe('na');
  });

  it('the word for his breathing is the Anaphylaxis page’s own', () => {
    const step = findProtocol('anaphylaxis')!.steps.find((s) => s.text.includes('Albuterol'))!;
    expect(step.text).toContain('wheezing');
  });

  it('settled and steady, he is still handed over with the question, exactly eight minutes after the call', () => {
    const sim = start();
    ideal(sim);
    expect(sim.cuts.at(-1)?.title).toBe('EMS arrives');
    expect(sim.run.entered('handover')! - sim.run.at('call_911')!).toBeCloseTo(480, 0);
  });
});

describe('"Wheeze": a sedative acts on him here too', () => {
  it('more sedative slows his breathing and costs him saturation', () => {
    const plain = start();
    const sim = start();
    advance(plain, 14);
    advance(sim, 14);
    drawAndGive(sim, 'fentanyl', 2);
    drawAndGive(sim, 'midazolam', 1);
    advance(plain, 30);
    advance(sim, 30);
    expect(sim.monitor.rr).toBeLessThan(plain.monitor.rr);
    expect(sim.run.vitals.spo2).toBeLessThan(plain.run.vitals.spo2);
  });

  it('the assistant says so, in the words she uses in every room', () => {
    expect(wheeze.setup.join(' ')).toMatch(/Given: midazolam .* and fentanyl/);
    const sim = start();
    advance(sim, 14);
    drawAndGive(sim, 'fentanyl', 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'That’s more fentanyl going in, Doc.' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'Fentanyl 1.0 ml IV' });
    drawAndGive(sim, 'midazolam', 0.2, { size: 1 });
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'That’s more midazolam going in, Doc.' });
  });

  it('once it has slowed him, a reversal drug is not met with "breathing fast, not slow"', () => {
    const sim = start();
    advance(sim, 14);
    drawAndGive(sim, 'fentanyl', 2);
    drawAndGive(sim, 'naloxone', 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Naloxone’s in.' });
    drawAndGive(sim, 'flumazenil', 2);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Flumazenil’s in.' });
  });
});
