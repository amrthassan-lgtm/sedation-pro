import { describe, expect, it } from 'vitest';

import { findProtocol } from '@sedation-pro/clinical';

import { BAG_RATE, Simulation } from '@/engine/engine';
import { gradeRun } from '@/engine/grade';

import { quiet } from './quiet';
import { advance, drawAndGive, until, untilEnd } from './testing';

function start(): Simulation {
  return new Simulation(quiet);
}

/** The protocol-perfect run, used as the baseline for the variations below. */
function idealUntilSpasm(sim: Simulation): void {
  sim.act('o2');
  sim.act('stimulate');
  sim.act('jaw_thrust');
  sim.act('bvm');
  advance(sim, 6);
  drawAndGive(sim, 'naloxone', 1);
  expect(until(sim, 'spasm')).toBe(true);
}

function idealSpasm(sim: Simulation): void {
  sim.act('stop');
  sim.act('suction');
  sim.act('larson');
  sim.act('cpap');
  sim.act('call_911');
  advance(sim, 4);
  drawAndGive(sim, 'succinylcholine', 1);
}

function row(sim: Simulation, id: string) {
  const found = gradeRun(quiet, sim).rows.find((r) => r.id === id);
  if (!found) throw new Error(`No rubric row "${id}"`);
  return found;
}

describe('"Shallow", played by the protocols', () => {
  it('the ideal run recovers with every core step done', () => {
    const sim = start();
    idealUntilSpasm(sim);
    idealSpasm(sim);
    expect(untilEnd(sim)).toBe(true);

    const debrief = gradeRun(quiet, sim);
    expect(sim.endingKey).toBe('recovered_ems');
    expect(debrief.rows.filter((r) => r.result !== 'done')).toEqual([]);
    expect(debrief.done).toBe(debrief.of);
    expect(debrief.of).toBe(13);
    expect(debrief.lowestSpo2).toBeGreaterThan(80);
    expect(debrief.takeaways).toEqual([]);
    expect(debrief.outside).toEqual([]);
    expect(debrief.clean).toBe(true);
  });

  it('prints the protocols own words, never a paraphrase', () => {
    const sim = start();
    idealUntilSpasm(sim);
    idealSpasm(sim);
    untilEnd(sim);
    const texts = gradeRun(quiet, sim).rows.map((r) => r.text);
    expect(texts).toContain('Naloxone IV, q3min up to 10mg (or IM if no IV)');
    expect(texts).toContain('Call 911');
    expect(texts).toContain('Naloxone: label the syringe');
  });

  it('doing nothing ends in arrest, and the steps never reached are not counted', () => {
    const sim = start();
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('arrest');
    const debrief = gradeRun(quiet, sim);
    expect(debrief.done).toBe(0);
    expect(row(sim, 'sux').result).toBe('na');
    expect(row(sim, 'call_911').result).toBe('na');
    expect(row(sim, 'bvm').result).toBe('missed');
    expect(debrief.takeaways.length).toBe(3);
  });

  it('bagging through an opened airway holds the saturation but never wakes him', () => {
    const sim = start();
    sim.act('o2');
    sim.act('jaw_thrust');
    sim.act('bvm');
    advance(sim, 120);
    expect(sim.ending).toBeNull();
    expect(sim.phase).toBe('hypo');
    expect(sim.monitor.spo2).toBeGreaterThanOrEqual(97);
    expect(sim.monitor.bagged).toBe(true);
    expect(sim.monitor.rr).toBe(10);
  });

  it('flumazenil first is graded against "Naloxone first"', () => {
    const sim = start();
    sim.act('bvm');
    drawAndGive(sim, 'flumazenil', 2);
    advance(sim, 30);
    expect(sim.phase).toBe('hypo');
    drawAndGive(sim, 'naloxone', 1);
    until(sim, 'spasm');
    idealSpasm(sim);
    untilEnd(sim);
    expect(row(sim, 'naloxone_first').result).toBe('missed');
    expect(row(sim, 'naloxone').result).toBe('done');
  });

  it('half a dose of naloxone does not wake him; the second half does', () => {
    const sim = start();
    sim.act('jaw_thrust');
    sim.act('bvm');
    drawAndGive(sim, 'naloxone', 0.5);
    advance(sim, 60);
    expect(sim.phase).toBe('hypo');
    expect(sim.voices.at(-1)?.line).toContain('didn’t look like much');
    drawAndGive(sim, 'naloxone', 0.5);
    expect(until(sim, 'waking', 60)).toBe(true);
  });

  it('naloxone into the muscle works slowly and misses the protocol route', () => {
    const sim = start();
    sim.act('o2');
    sim.act('bvm');
    drawAndGive(sim, 'naloxone', 1, { route: 'IM' });
    advance(sim, 60);
    expect(sim.phase).toBe('hypo');
    expect(until(sim, 'waking', 120)).toBe(true);
    until(sim, 'spasm');
    idealSpasm(sim);
    untilEnd(sim);
    expect(row(sim, 'naloxone').result).toBe('missed');
  });

  it('an unlabeled syringe is caught', () => {
    const sim = start();
    sim.act('bvm');
    drawAndGive(sim, 'naloxone', 1, { label: false });
    until(sim, 'spasm');
    idealSpasm(sim);
    untilEnd(sim);
    expect(row(sim, 'naloxone_label').result).toBe('missed');
    expect(row(sim, 'sux_label').result).toBe('done');
  });

  it('the spasm does not break without succinylcholine', () => {
    const sim = start();
    idealUntilSpasm(sim);
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('arrest');
    expect(sim.monitor.etco2).toBeNull();
  });

  it('the manoeuvres buy time: the saturation falls slower with them', () => {
    const bare = start();
    idealUntilSpasm(bare);
    const before = bare.monitor.spo2;
    advance(bare, 20);
    const bareDrop = before - bare.monitor.spo2;

    const helped = start();
    idealUntilSpasm(helped);
    helped.act('suction');
    helped.act('larson');
    helped.act('cpap');
    advance(helped, 20);
    expect(before - helped.monitor.spo2).toBeLessThan(bareDrop);
  });

  it('a step with two acts is marked partly done when only one was', () => {
    const sim = start();
    sim.act('o2');
    sim.act('stimulate');
    sim.act('bvm');
    drawAndGive(sim, 'naloxone', 1);
    until(sim, 'spasm');
    sim.act('stop');
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    sim.act('call_911');
    drawAndGive(sim, 'succinylcholine', 1);
    untilEnd(sim);
    const larson = row(sim, 'spasm_larson');
    expect(larson.result).toBe('partial');
    expect(larson.parts).toEqual([
      { quote: 'Jaw thrust', result: 'missed' },
      { quote: 'firm pressure at the laryngospasm notch', result: 'done' },
    ]);
    expect(gradeRun(quiet, sim).takeaways.map((r) => r.id)).toContain('spasm_larson');
  });

  it('stopping the bag after succinylcholine costs the patient', () => {
    const sim = start();
    idealUntilSpasm(sim);
    idealSpasm(sim);
    expect(until(sim, 'paralyzed')).toBe(true);
    sim.act('bvm'); // off
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('arrest');
  });

  it('a succinylcholine dose under the protocol range does not break the spasm', () => {
    const sim = start();
    idealUntilSpasm(sim);
    drawAndGive(sim, 'succinylcholine', 0.5);
    advance(sim, 40);
    expect(sim.phase).toBe('spasm');
  });

  it('succinylcholine before any spasm still paralyses him, and is flagged', () => {
    const sim = start();
    sim.act('o2');
    sim.act('jaw_thrust');
    sim.act('bvm');
    drawAndGive(sim, 'succinylcholine', 1);
    expect(sim.run.has('sux_without_spasm')).toBe(true);
    expect(sim.voices.at(-1)?.line).toContain('isn’t in spasm');
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    expect(sim.monitor.rr).toBe(10); // only because the team is bagging
    sim.act('bvm');
    advance(sim, 2);
    expect(sim.monitor.rr).toBe(0);
    expect(sim.monitor.etco2).toBeNull();
  });

  it('paralysing him early does not skip the spasm', () => {
    const sim = start();
    sim.act('o2');
    sim.act('jaw_thrust');
    sim.act('bvm');
    drawAndGive(sim, 'naloxone', 1);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    expect(until(sim, 'spasm', 120)).toBe(true);
    expect(sim.cuts).toHaveLength(1);
  });

  it('two half doses of succinylcholine add up', () => {
    const sim = start();
    idealUntilSpasm(sim);
    drawAndGive(sim, 'succinylcholine', 0.5);
    advance(sim, 25);
    expect(sim.phase).toBe('spasm');
    drawAndGive(sim, 'succinylcholine', 0.5);
    expect(until(sim, 'paralyzed', 30)).toBe(true);
  });

  it('deep hypoxia slows the heart before the arrest', () => {
    const sim = start();
    for (let i = 0; i < 4 * 600 && sim.monitor.spo2 > 66; i += 1) sim.tick(0.25);
    advance(sim, 8);
    expect(sim.monitor.hr).toBeLessThan(50);
  });

  it('never calling 911 still recovers, and the debrief says so', () => {
    const sim = start();
    idealUntilSpasm(sim);
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    drawAndGive(sim, 'succinylcholine', 1);
    untilEnd(sim);
    expect(sim.endingKey).toBe('recovered');
    expect(row(sim, 'call_911').result).toBe('missed');
  });

  it('more sedative after the scene opens deepens him and costs "Stop giving sedatives"', () => {
    const plain = start();
    advance(plain, 40);

    const sim = start();
    sim.act('o2');
    sim.act('o2'); // off again, so only the sedative separates the two runs
    drawAndGive(sim, 'fentanyl', 2);
    expect(sim.voices.at(-1)?.line).toContain('more fentanyl');
    expect(sim.log.at(-1)).toMatchObject({ text: 'Fentanyl 2.0 ml IV', tone: 'bad' });
    advance(sim, 40);
    expect(sim.monitor.spo2).toBeLessThan(plain.monitor.spo2);

    const full = start();
    idealUntilSpasm(full);
    drawAndGive(full, 'midazolam', 1);
    idealSpasm(full);
    untilEnd(full);
    const o2 = row(full, 'o2');
    expect(o2.result).toBe('partial');
    expect(o2.parts).toEqual([
      { quote: 'Turn off N₂O, 100% O₂', result: 'done' },
      { quote: 'Stop giving sedatives', result: 'missed' },
    ]);
    expect(row(full, 'opioid_o2').result).toBe('partial');
    expect(gradeRun(quiet, full).clean).toBe(false);
  });

  it('not giving a sedative is no credit on its own', () => {
    const sim = start();
    untilEnd(sim);
    expect(row(sim, 'o2').result).toBe('missed');
  });

  it('the opening steps count only while he is hypoventilating', () => {
    const sim = start();
    sim.act('jaw_thrust');
    sim.act('bvm');
    advance(sim, 6);
    drawAndGive(sim, 'naloxone', 1);
    until(sim, 'spasm');
    idealSpasm(sim);
    until(sim, 'paralyzed');
    sim.act('stimulate');
    until(sim, 'breathing');
    sim.act('o2');
    untilEnd(sim);
    expect(row(sim, 'o2').result).toBe('missed');
    expect(row(sim, 'stimulate').result).toBe('missed');
    expect(row(sim, 'opioid_stimulate').result).toBe('missed');
  });

  it('stimulating him slows the fall and never turns it around', () => {
    const sim = start();
    for (let t = 0; t < 180; t += 5) {
      sim.act('stimulate');
      advance(sim, 5);
    }
    expect(sim.monitor.spo2).toBeLessThan(96);
    const bare = start();
    advance(bare, 60);
    const helped = start();
    for (let t = 0; t < 60; t += 5) {
      helped.act('stimulate');
      advance(helped, 5);
    }
    expect(helped.monitor.spo2).toBeGreaterThan(bare.monitor.spo2);
  });

  it('succinylcholine outside the spasm costs the succinylcholine step', () => {
    const sim = start();
    sim.act('o2');
    sim.act('stimulate');
    sim.act('jaw_thrust');
    sim.act('bvm');
    drawAndGive(sim, 'succinylcholine', 1);
    advance(sim, 6);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'spasm')).toBe(true);
    idealSpasm(sim);
    expect(untilEnd(sim)).toBe(true);
    const sux = row(sim, 'sux');
    expect(sux.parts[0]).toEqual({ quote: 'Succinylcholine IV', result: 'missed' });
    expect(sux.result).toBe('partial');
    expect(gradeRun(quiet, sim).clean).toBe(false);
  });

  it('each paralysis needs its own stretch of bagging before the story skips ahead', () => {
    const sim = start();
    sim.act('o2');
    sim.act('jaw_thrust');
    sim.act('bvm');
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    expect(until(sim, 'hypo', 60)).toBe(true);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'spasm')).toBe(true);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    const entered = sim.t;
    expect(until(sim, 'breathing', 60)).toBe(true);
    expect(sim.cuts).toHaveLength(2);
    expect(sim.cuts[1]!.at - entered).toBeGreaterThanOrEqual(14);
  });

  it('succinylcholine pushed once he is breathing still paralyses him before the story closes', () => {
    const sim = start();
    idealUntilSpasm(sim);
    idealSpasm(sim);
    expect(until(sim, 'breathing')).toBe(true);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    expect(sim.ending).toBeNull();
    expect(sim.log.at(-1)).toMatchObject({ text: 'Paralysed by succinylcholine', tone: 'bad' });
    expect(untilEnd(sim)).toBe(true);
    expect(sim.cuts).toHaveLength(2);
  });

  it('two pushes inside the protocol range are one paralysis, not two', () => {
    const sim = start();
    idealUntilSpasm(sim);
    sim.act('stop');
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    sim.act('call_911');
    drawAndGive(sim, 'succinylcholine', 1);
    advance(sim, 10);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'breathing')).toBe(true);
    advance(sim, 3);
    expect(sim.phase).toBe('breathing');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.cuts).toHaveLength(1);
    expect(gradeRun(quiet, sim).clean).toBe(true);
  });

  it('a dose into the muscle does not stop a later dose into the vein from working, and is marked', () => {
    const sim = start();
    idealUntilSpasm(sim);
    sim.act('stop');
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    sim.act('call_911');
    drawAndGive(sim, 'succinylcholine', 1, { route: 'IM' });
    advance(sim, 5);
    drawAndGive(sim, 'succinylcholine', 1);
    const pushed = sim.t;
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    expect(sim.t - pushed).toBeCloseTo(18, 0);
    untilEnd(sim);
    expect(row(sim, 'sux').parts[0]).toEqual({ quote: 'Succinylcholine IV', result: 'missed' });
  });

  it('"It’s going in!" is only said by someone holding a bag or a mask', () => {
    const sim = start();
    sim.act('o2');
    sim.act('bvm');
    advance(sim, 6);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'spasm')).toBe(true);
    sim.act('bvm');
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    expect(sim.voices.at(-1)?.line).toBe('He’s gone limp!');
    expect(sim.scene).not.toContain('the bag gives');
  });

  it('stock epinephrine in the vein during the spasm does not open his airway', () => {
    const sim = start();
    idealUntilSpasm(sim);
    advance(sim, 3);
    drawAndGive(sim, 'epinephrine', 0.3);
    advance(sim, 6);
    expect(sim.phase).toBe('overdose');
    expect(sim.monitor).toMatchObject({ rr: 0, etco2: null, bagged: false, rhythm: 'vtach' });
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('harm');
  });

  it('flumazenil once he is breathing is not "only if still not breathing well"', () => {
    const sim = start();
    sim.act('bvm');
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'waking')).toBe(true);
    drawAndGive(sim, 'flumazenil', 2);
    expect(sim.voices.at(-1)?.line).toContain('already breathing');
    until(sim, 'spasm');
    idealSpasm(sim);
    untilEnd(sim);
    expect(row(sim, 'naloxone_first').result).toBe('missed');
  });

  it('the spasm steps are graded act by act: stop, and oxygen with the pressure', () => {
    const sim = start();
    sim.act('o2');
    sim.act('stimulate');
    sim.act('jaw_thrust');
    sim.act('bvm');
    advance(sim, 6);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'waking')).toBe(true);
    sim.act('o2'); // nitrous back on before the spasm
    expect(until(sim, 'spasm')).toBe(true);
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    sim.act('call_911');
    advance(sim, 4);
    drawAndGive(sim, 'succinylcholine', 1);
    untilEnd(sim);
    expect(row(sim, 'spasm_suction').parts).toEqual([
      { quote: 'Stop the procedure', result: 'missed' },
      { quote: 'Remove packs and gauze, suction the throat', result: 'done' },
    ]);
    expect(row(sim, 'spasm_cpap').parts).toEqual([
      { quote: '100% O₂', result: 'missed' },
      { quote: 'steady gentle pressure (CPAP)', result: 'done' },
    ]);
  });

  it('a throat suctioned just before the spasm is not blamed for it, and counts', () => {
    const sim = start();
    sim.act('o2');
    sim.act('stimulate');
    sim.act('jaw_thrust');
    sim.act('bvm');
    advance(sim, 6);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'waking')).toBe(true);
    advance(sim, 7);
    sim.act('suction');
    expect(until(sim, 'spasm')).toBe(true);
    expect(sim.scene).not.toContain('pooled');
    sim.act('stop');
    sim.act('larson');
    sim.act('cpap');
    sim.act('call_911');
    drawAndGive(sim, 'succinylcholine', 1);
    untilEnd(sim);
    expect(row(sim, 'spasm_suction').result).toBe('done');
  });

  it('the assistant judges the running total of succinylcholine, as the spasm does', () => {
    const sim = start();
    idealUntilSpasm(sim);
    drawAndGive(sim, 'succinylcholine', 0.5);
    expect(sim.voices.at(-1)?.line).toContain('Was that enough');
    advance(sim, 5);
    drawAndGive(sim, 'succinylcholine', 0.5);
    expect(sim.voices.at(-1)?.line).toContain('Atropine is ready');
  });

  it('only a dose given as the protocol writes it is logged green', () => {
    const im = start();
    drawAndGive(im, 'naloxone', 1, { route: 'IM' });
    expect(im.log.at(-1)).toMatchObject({ text: 'Naloxone 1.0 ml IM', tone: 'neutral' });
    const iv = start();
    drawAndGive(iv, 'naloxone', 1);
    expect(iv.log.at(-1)).toMatchObject({ text: 'Naloxone 1.0 ml IV', tone: 'good' });
    const big = start();
    idealUntilSpasm(big);
    drawAndGive(big, 'succinylcholine', 3);
    expect(big.log.at(-1)).toMatchObject({ tone: 'neutral' });
  });

  it('the assistant does not announce slow breathing to a team already bagging him', () => {
    const lines = (bag: boolean) => {
      const sim = start();
      if (bag) sim.act('bvm');
      advance(sim, 14);
      return sim.voices.map((v) => v.line).join(' | ');
    };
    expect(lines(false)).toContain('not really breathing much');
    expect(lines(true)).not.toContain('not really breathing much');
  });

  it('an uncoached run is never told to bag him', () => {
    const lines = (coached: boolean) => {
      const sim = new Simulation(quiet, { coached });
      drawAndGive(sim, 'succinylcholine', 1);
      until(sim, 'paralyzed', 30);
      advance(sim, 12);
      return sim.voices.map((v) => v.line).join(' | ');
    };
    expect(lines(false)).toContain('not breathing at all');
    expect(lines(false)).not.toMatch(/bag/i);
    expect(lines(true)).toContain('Do I bag him?');
  });

  it('the cut card names the bagging and puts no length on the drug', () => {
    const sim = start();
    idealUntilSpasm(sim);
    idealSpasm(sim);
    untilEnd(sim);
    expect(sim.cuts.map((c) => c.title)).toEqual(['Bagging until he breathes on his own']);
  });

  it('epinephrine from the ampule into the vein harms him here too', () => {
    const sim = start();
    sim.act('bvm');
    drawAndGive(sim, 'epinephrine', 1);
    advance(sim, 1);
    expect(sim.monitor.rhythm).toBe('vtach');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('harm');
    const debrief = gradeRun(quiet, sim);
    expect(debrief.outside.map((d) => d.drugKey)).toEqual(['epinephrine']);
    expect(debrief.clean).toBe(false);
  });

  it('a drug these protocols never mention is listed, and the run is not clean', () => {
    const sim = start();
    idealUntilSpasm(sim);
    drawAndGive(sim, 'labetalol', 2);
    idealSpasm(sim);
    untilEnd(sim);
    const debrief = gradeRun(quiet, sim);
    expect(debrief.done).toBe(debrief.of);
    expect(debrief.outside.map((d) => d.drugKey)).toEqual(['labetalol']);
    expect(debrief.clean).toBe(false);
  });

  it('atropine, kept ready by the succinylcholine callout, is not listed as outside', () => {
    const sim = start();
    idealUntilSpasm(sim);
    idealSpasm(sim);
    drawAndGive(sim, 'atropine', 0.5);
    untilEnd(sim);
    expect(gradeRun(quiet, sim).outside).toEqual([]);
  });

  it('the bagging rate in the story is the one the protocol states', () => {
    const step = findProtocol('hypoventilation')!.steps.find((s) =>
      s.text.includes('BVM, 1 breath every'),
    )!;
    const seconds = Number(/1 breath every (\d+) seconds/.exec(step.text)?.[1]);
    expect(60 / seconds).toBe(BAG_RATE);
  });

  it('a tap on the bag is logged as a tap: the log credits no rate the player never set', () => {
    const sim = start();
    sim.act('npa');
    sim.act('bvm');
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest rising', tone: 'good' });
    idealUntilSpasm(sim);
    idealSpasm(sim);
    sim.act('bvm');
    untilEnd(sim);
    const said = [...sim.log.map((l) => l.text), ...sim.voices.map((v) => v.line)];
    for (const line of said) expect(line).not.toMatch(/every (six|\d+)|breaths? (a|per) minute/i);
  });

  it('the sibling pages show the spasm and its 911 call in their own words, unscored', () => {
    const sim = start();
    idealUntilSpasm(sim);
    idealSpasm(sim);
    untilEnd(sim);
    expect(row(sim, 'hypo_911')).toMatchObject({ result: 'done', tier: 'echo' });
    expect(row(sim, 'opioid_911')).toMatchObject({ result: 'done', tier: 'echo' });
    expect(row(sim, 'hypo_no_air').parts).toEqual([
      {
        quote: 'BVM not moving the chest: reposition, NPA, oral airway if no gag, then LMA or King',
        result: 'na',
      },
      { quote: 'Crowing or no air movement: Laryngospasm', result: 'done' },
    ]);
    expect(gradeRun(quiet, sim).of).toBe(13);
  });

  it('is deterministic: the same play gives the same run', () => {
    const play = () => {
      const sim = start();
      idealUntilSpasm(sim);
      idealSpasm(sim);
      untilEnd(sim);
      return { t: sim.t, low: sim.lowestSpo2, log: sim.log.map((l) => `${l.t}:${l.text}`) };
    };
    expect(play()).toEqual(play());
  });
});

describe('"Shallow": a step counts while it applied', () => {
  /** Through the spasm with the hands and the drug, but no stop, no suction and no call. */
  function bareSpasm(sim: Simulation): void {
    idealUntilSpasm(sim);
    sim.act('larson');
    sim.act('cpap');
    advance(sim, 4);
    drawAndGive(sim, 'succinylcholine', 1);
  }

  it('stopping, suction and the 911 call once he is breathing again are too late', () => {
    const sim = start();
    bareSpasm(sim);
    expect(until(sim, 'breathing')).toBe(true);
    sim.act('stop');
    sim.act('suction');
    sim.act('call_911');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('recovered_ems');
    expect(row(sim, 'spasm_suction').parts).toEqual([
      { quote: 'Stop the procedure', result: 'missed' },
      { quote: 'Remove packs and gauze, suction the throat', result: 'missed' },
    ]);
    expect(row(sim, 'call_911').result).toBe('missed');
    expect(row(sim, 'hypo_911').result).toBe('missed');
    expect(row(sim, 'opioid_911').result).toBe('missed');
    const debrief = gradeRun(quiet, sim);
    expect(debrief.done).toBe(11);
    expect(debrief.of).toBe(13);
    expect(debrief.clean).toBe(false);
  });

  it('once the cords have let go, the throat and the procedure are late; the call is not', () => {
    const sim = start();
    bareSpasm(sim);
    expect(until(sim, 'paralyzed')).toBe(true);
    sim.act('stop');
    sim.act('suction');
    sim.act('call_911');
    expect(untilEnd(sim)).toBe(true);
    expect(row(sim, 'spasm_suction').result).toBe('missed');
    expect(row(sim, 'call_911').result).toBe('done');
  });

  it('a throat cleared in the spasm still counts when it is suctioned again afterwards', () => {
    const sim = start();
    sim.act('suction');
    idealUntilSpasm(sim);
    idealSpasm(sim);
    expect(until(sim, 'breathing')).toBe(true);
    sim.act('suction');
    expect(untilEnd(sim)).toBe(true);
    expect(row(sim, 'spasm_suction').result).toBe('done');
    expect(gradeRun(quiet, sim).clean).toBe(true);
  });

  it('a procedure stopped before the spasm is stopped for it', () => {
    const sim = start();
    sim.act('stop');
    idealUntilSpasm(sim);
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    sim.act('call_911');
    advance(sim, 4);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(untilEnd(sim)).toBe(true);
    expect(row(sim, 'spasm_suction').result).toBe('done');
  });
});

describe('"Shallow": nothing is said of a mask nobody is holding', () => {
  it('with nobody bagging, he wakes and shuts without a mask in the scene or an assistant squeezing a bag', () => {
    const sim = start();
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'waking')).toBe(true);
    expect(sim.scene).not.toContain('mask');
    expect(sim.scene).not.toContain('your hand');
    advance(sim, 7);
    sim.act('suction');
    advance(sim, 11);
    expect(sim.phase).toBe('spasm');
    expect(sim.scene).toContain('A high, harsh crowing on the way in, then nothing.');
    expect(sim.scene).not.toContain('mask');
    expect(sim.voices.at(-1)?.line).not.toContain('get air in');
  });

  it('with the bag on, both lines are as they were', () => {
    const sim = start();
    sim.act('bvm');
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'waking')).toBe(true);
    expect(sim.scene).toContain('He coughs against the mask');
    advance(sim, 7);
    sim.act('suction');
    expect(until(sim, 'spasm')).toBe(true);
    expect(sim.scene).toContain('He coughs hard against the mask.');
    expect(sim.voices.at(-1)?.line).toBe('I can’t get air in! It won’t go!');
  });

  it('the briefing has no pack, so suction in the spasm logs none', () => {
    const sim = start();
    idealUntilSpasm(sim);
    sim.act('suction');
    expect(sim.log.at(-1)).toMatchObject({ text: 'Suctioned', tone: 'good' });
    expect(quiet.setup.join(' ')).not.toMatch(/pack|gauze|screen/i);
  });
});

describe('"Shallow": an ambulance that was called arrives', () => {
  /** What the BVM page asks of a team with no reversal in him yet: bag, and have someone call. */
  function bagAndCall(sim: Simulation): void {
    sim.act('o2');
    sim.act('stimulate');
    sim.act('jaw_thrust');
    sim.act('bvm');
    sim.act('call_911');
  }

  it('bagged and never reversed, he is handed over still being bagged, eight minutes after the call', () => {
    const sim = start();
    bagAndCall(sim);
    expect(untilEnd(sim, 900)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_bagged');
    expect(sim.ending).toEqual({
      outcome: 'handover',
      title: 'Handed over to EMS',
      text: 'He leaves with EMS. He is still being bagged.',
    });
    expect(sim.scene).toBe('EMS is at the door with a stretcher. He is still being bagged.');
    expect(sim.voices.at(-1)).toEqual({ who: 'EMS', line: 'What have we got?' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'EMS on scene', tone: 'neutral' });
    // They came in real time: nothing was skipped to bring them.
    expect(sim.cuts).toEqual([]);
    expect(row(sim, 'bvm').result).toBe('done');
    expect(row(sim, 'naloxone').result).toBe('missed');
    expect(gradeRun(quiet, sim)).toMatchObject({ done: 4, of: 6, clean: false });
  });

  it('the same with only flumazenil in him', () => {
    const sim = start();
    bagAndCall(sim);
    drawAndGive(sim, 'flumazenil', 2);
    expect(untilEnd(sim, 900)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_bagged');
    expect(gradeRun(quiet, sim).clean).toBe(false);
  });

  it('with nobody bagging him, the handover says that instead', () => {
    const sim = start();
    sim.act('o2');
    sim.act('jaw_thrust');
    sim.act('npa');
    drawAndGive(sim, 'flumazenil', 2);
    sim.act('call_911');
    expect(untilEnd(sim, 900)).toBe(true);
    expect(sim.ending?.outcome).toBe('handover');
    expect(sim.endingKey).toBe('ems_poorly');
    expect(sim.ending?.text).toBe(
      'He leaves with EMS. He has not woken and is still breathing poorly.',
    );
    expect(sim.isOn('bvm')).toBe(false);
    expect(row(sim, 'bvm').result).toBe('missed');
  });

  it('the words for his breathing are the Hypoventilation step’s own', () => {
    const step = findProtocol('hypoventilation')!.steps.find((s) =>
      s.text.includes('BVM, 1 breath every'),
    )!;
    expect(step.text).toContain('breathing poorly');
    expect(quiet.endings['ems_poorly']?.text).toContain('breathing poorly');
  });

  it('due inside the paralysis, EMS arrives under its own card and takes over the bag', () => {
    const sim = start();
    bagAndCall(sim);
    advance(sim, 250);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'spasm')).toBe(true);
    sim.act('stop');
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    advance(sim, 4);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.phase).toBe('paralyzed');
    expect(sim.endingKey).toBe('ems_bagged');
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.cuts.map((c) => c.title)).toEqual(['EMS arrives']);
    // The team was still bagging when the run stopped: that is not "Not done".
    expect(row(sim, 'sux').parts).toEqual([
      { quote: 'Succinylcholine IV', result: 'done' },
      { quote: 'ventilate with the BVM until breathing on their own', result: 'na' },
    ]);
    // Handed over still paralysed is a clean run only because every core step was done.
    expect(gradeRun(quiet, sim)).toMatchObject({ done: 13, of: 13, clean: true });
  });

  it('a paralysed man nobody is bagging is handed over as that, and the bagging is "Not done"', () => {
    const sim = new Simulation(quiet, { forgiving: true });
    sim.act('call_911');
    advance(sim, 440);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(untilEnd(sim, 120)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_paralysed');
    expect(sim.ending?.text).toBe('He leaves with EMS. He is paralysed and not breathing.');
    expect(row(sim, 'sux').parts[1]).toEqual({
      quote: 'ventilate with the BVM until breathing on their own',
      result: 'missed',
    });
  });

  it('in the spasm, with the mask held and no succinylcholine, EMS finds no air moving', () => {
    const sim = new Simulation(quiet, { forgiving: true });
    idealUntilSpasm(sim);
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    sim.act('call_911');
    expect(untilEnd(sim, 900)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_no_air');
    expect(sim.ending?.text).toBe('He leaves with EMS. His chest is heaving and no air is moving.');
    expect(row(sim, 'sux').result).toBe('missed');
    expect(gradeRun(quiet, sim).clean).toBe(false);
  });

  it('at the door just as he starts to breathe on his own, they take him awake and breathing', () => {
    const sim = start();
    sim.act('o2');
    sim.act('jaw_thrust');
    sim.act('bvm');
    advance(sim, 34);
    sim.act('call_911');
    advance(sim, 166);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'spasm')).toBe(true);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'breathing')).toBe(true);
    // The paralysis ended before they were due, so its own card stands.
    expect(sim.cuts.map((c) => c.title)).toEqual(['Bagging until he breathes on his own']);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_awake');
    expect(sim.ending?.text).toBe('He leaves with EMS. He is awake and breathing.');
  });

  it('nobody called: nobody comes, however long he is bagged', () => {
    const sim = start();
    sim.act('o2');
    sim.act('jaw_thrust');
    sim.act('bvm');
    advance(sim, 900);
    expect(sim.ending).toBeNull();
    expect(sim.log.map((l) => l.text)).not.toContain('EMS on scene');
  });

  it('the ideal run is not interrupted: he recovers before they are due', () => {
    const sim = start();
    idealUntilSpasm(sim);
    idealSpasm(sim);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('recovered_ems');
    expect(sim.t - sim.run.at('call_911')!).toBeLessThan(480);
  });
});

describe('"Shallow": still on the bag, and nobody has called (owner, Nov 2026)', () => {
  const QUESTION = {
    id: 'front_desk_911',
    voice: { who: 'Front desk', line: 'Do you want me to call 911?' },
    options: [
      { id: 'call', label: 'Call 911' },
      { id: 'not_yet', label: 'Not yet' },
    ],
  };
  const ON_THE_WAY = { who: 'Front desk', line: '911 is on the way. About eight minutes.' };

  /** The wait, read here from the BVM page's own step and not from the drill. */
  const STILL_ON_THE_BAG = findProtocol('bvm')!.steps.find((s) =>
    s.text.includes('still needs the bag after'),
  )!.text;
  const WAIT =
    Number(/still needs the bag after (\d+) minutes: Call 911/.exec(STILL_ON_THE_BAG)![1]) * 60;

  /** Bagged through an opened airway from the first second, and never reversed. */
  function bagged(options: ConstructorParameters<typeof Simulation>[1] = {}): Simulation {
    const sim = new Simulation(quiet, options);
    sim.act('jaw_thrust');
    sim.act('bvm');
    return sim;
  }

  const asked = (sim: Simulation): number =>
    sim.voices.filter((v) => v.line === QUESTION.voice.line).length;

  it('the front desk asks once the bag has moved air for as long as the BVM page says', () => {
    expect(WAIT).toBe(120);
    const sim = bagged();
    advance(sim, WAIT - 1);
    expect(sim.prompt).toBeNull();
    advance(sim, 1);
    expect(sim.prompt).toEqual(QUESTION);
    // Said out loud as well, for a team with a drawer open.
    expect(sim.voices.at(-1)).toEqual(QUESTION.voice);
    expect(sim.phase).toBe('hypo');
    expect(sim.ending).toBeNull();
  });

  it('"Call 911" is the call: the same reply, log, ambulance and debrief as the tap', () => {
    const answered = bagged();
    advance(answered, WAIT);
    answered.answer('call');
    const tapped = bagged();
    advance(tapped, WAIT);
    tapped.act('call_911');

    for (const sim of [answered, tapped]) {
      expect(sim.prompt).toBeNull();
      expect(sim.run.at('call_911')).toBe(WAIT);
      expect(sim.voices.at(-1)).toEqual(ON_THE_WAY);
      expect(sim.log.at(-1)).toMatchObject({ t: WAIT, text: '911 called', tone: 'good' });
      expect(untilEnd(sim, 900)).toBe(true);
      expect(sim.t - WAIT).toBeCloseTo(480, 0);
      expect(sim.endingKey).toBe('ems_bagged');
      expect(sim.ending?.text).toBe('He leaves with EMS. He is still being bagged.');
    }
    expect(answered.log).toEqual(tapped.log);
    expect(gradeRun(quiet, answered)).toEqual(gradeRun(quiet, tapped));
  });

  it('"Not yet" changes nothing, and she asks again every two minutes while it goes on', () => {
    const sim = bagged();
    advance(sim, WAIT);
    const before = { log: sim.log.length, said: sim.voiceCount };
    sim.answer('not_yet');
    expect(sim.prompt).toBeNull();
    expect(sim.log.length).toBe(before.log);
    expect(sim.voiceCount).toBe(before.said);
    expect(sim.run.at('call_911')).toBeNull();

    advance(sim, WAIT - 1);
    expect(sim.prompt).toBeNull();
    advance(sim, 1);
    expect(sim.prompt).toEqual(QUESTION);
    sim.answer('not_yet');
    advance(sim, WAIT);
    expect(sim.prompt).toEqual(QUESTION);
    expect(asked(sim)).toBe(3);
    expect(sim.ending).toBeNull();
    expect(sim.log.map((l) => l.text)).not.toContain('911 called');
  });

  it('a question nobody answers stays open, and is asked again two minutes on', () => {
    const sim = bagged();
    advance(sim, WAIT * 2 - 1);
    expect(asked(sim)).toBe(1);
    expect(sim.prompt).toEqual(QUESTION);
    advance(sim, 1);
    expect(asked(sim)).toBe(2);
    expect(sim.prompt).toEqual(QUESTION);
  });

  it('answered "Call 911" the second time round, the ambulance is eight minutes from then', () => {
    const sim = bagged();
    advance(sim, WAIT);
    sim.answer('not_yet');
    advance(sim, WAIT);
    sim.answer('call');
    expect(sim.run.at('call_911')).toBe(WAIT * 2);
    advance(sim, WAIT * 2);
    // Called: she does not ask again.
    expect(sim.prompt).toBeNull();
    expect(asked(sim)).toBe(2);
    expect(untilEnd(sim, 900)).toBe(true);
    expect(sim.t - WAIT * 2).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_bagged');
  });

  it('Call 911 tapped on the cart while she is asking is her answer: the question comes down', () => {
    const sim = bagged();
    advance(sim, WAIT);
    expect(sim.prompt).toEqual(QUESTION);
    sim.act('call_911');
    expect(sim.prompt).toBeNull();
    expect(sim.voices.at(-1)).toEqual(ON_THE_WAY);
    expect(sim.log.filter((l) => l.text === '911 called')).toHaveLength(1);
    advance(sim, WAIT * 2);
    expect(sim.prompt).toBeNull();
    expect(asked(sim)).toBe(1);
  });

  it('a team that has already called is not asked', () => {
    const sim = bagged();
    sim.act('call_911');
    advance(sim, WAIT * 3);
    expect(sim.prompt).toBeNull();
    expect(asked(sim)).toBe(0);
  });

  it('a bag that moves no air is not "still needs the bag": nobody asks', () => {
    const sim = new Simulation(quiet, { forgiving: true });
    sim.act('bvm');
    advance(sim, WAIT * 2);
    expect(sim.monitor.bagged).toBe(false);
    expect(sim.prompt).toBeNull();
    expect(asked(sim)).toBe(0);
  });

  it('the two minutes are of air going in: a bag put down and picked up again starts them over', () => {
    const sim = bagged();
    advance(sim, WAIT - 20);
    sim.act('bvm');
    advance(sim, 5);
    sim.act('bvm');
    advance(sim, WAIT - 1);
    expect(sim.prompt).toBeNull();
    advance(sim, 1);
    expect(sim.prompt).toEqual(QUESTION);
  });

  it('the same with the jaw let go and held again', () => {
    const sim = bagged();
    advance(sim, WAIT - 20);
    sim.act('jaw_thrust');
    advance(sim, 5);
    sim.act('jaw_thrust');
    advance(sim, WAIT - 1);
    expect(sim.prompt).toBeNull();
    advance(sim, 1);
    expect(sim.prompt).toEqual(QUESTION);
  });

  it('she asks only while he is still hypoventilating: reversed in time, the team is never asked', () => {
    const ideal = start();
    idealUntilSpasm(ideal);
    idealSpasm(ideal);
    expect(untilEnd(ideal)).toBe(true);
    expect(asked(ideal)).toBe(0);
    expect(gradeRun(quiet, ideal).clean).toBe(true);

    // Reversed late, without a call: bagged well past two minutes of the spasm and after, and not asked there.
    const late = bagged();
    advance(late, 60);
    drawAndGive(late, 'naloxone', 1);
    expect(until(late, 'spasm')).toBe(true);
    drawAndGive(late, 'succinylcholine', 1);
    expect(untilEnd(late)).toBe(true);
    expect(late.endingKey).toBe('recovered');
    expect(asked(late)).toBe(0);
  });

  it('with the bag in the player’s own hand, she asks when their squeezes have moved air that long', () => {
    const sim = bagged({ pacedBag: true });
    for (let t = 0; t < WAIT + 6 && !sim.prompt; t += 6) {
      sim.squeeze(1);
      advance(sim, 6);
    }
    expect(sim.prompt).toEqual(QUESTION);
    expect(sim.t).toBe(WAIT);

    // In the hand and never squeezed, it has moved no air at all.
    const idle = bagged({ pacedBag: true, forgiving: true });
    advance(idle, WAIT * 2);
    expect(idle.prompt).toBeNull();
  });

  it('answered in the spasm, the call counts for the spasm as the tap would', () => {
    const sim = start();
    sim.act('o2');
    sim.act('stimulate');
    sim.act('jaw_thrust');
    sim.act('bvm');
    advance(sim, WAIT);
    expect(sim.prompt).toEqual(QUESTION);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'spasm')).toBe(true);
    expect(sim.prompt).toEqual(QUESTION);
    sim.act('stop');
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    sim.answer('call');
    advance(sim, 4);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('recovered_ems');
    expect(row(sim, 'call_911').result).toBe('done');
    expect(gradeRun(quiet, sim)).toMatchObject({ done: 13, of: 13, clean: true });
  });
});

describe('"Shallow": the bag moves air only through an opened airway', () => {
  /** The BVM page's own step: the airway is opened before a breath. */
  const BVM_STEPS = findProtocol('bvm')!.steps.map((s) => s.text);

  /** Bagged from the first second with nothing opening his airway. */
  function bagOnly(sim: Simulation): void {
    sim.act('o2');
    sim.act('bvm');
  }

  it('the words for a bag that is not working are the BVM page’s own', () => {
    expect(
      BVM_STEPS.some((text) => text.startsWith('Chest not rising or bag hard to squeeze')),
    ).toBe(true);
    expect(BVM_STEPS.some((text) => text.startsWith('Open the airway: head tilt'))).toBe(true);
    const sim = start();
    bagOnly(sim);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Chest not rising.' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest not rising', tone: 'bad' });
  });

  it('a bag on a snoring patient with nothing opening his airway does nothing for him', () => {
    const bagged = start();
    bagOnly(bagged);
    const left = start();
    left.act('o2');
    advance(bagged, 30);
    advance(left, 30);
    expect(bagged.run.vitals.spo2).toBeCloseTo(left.run.vitals.spo2, 5);
    expect(bagged.run.vitals.etco2).toBeCloseTo(left.run.vitals.etco2!, 5);
    expect(bagged.monitor.spo2).toBeLessThan(96);
    expect(bagged.monitor).toMatchObject({ bagged: false, rr: left.monitor.rr });
    expect(bagged.voices.map((v) => v.line)).not.toContain('Bagging. His chest is rising.');
    expect(untilEnd(bagged)).toBe(true);
    expect(bagged.ending?.outcome).toBe('arrest');
  });

  it.each(['jaw_thrust', 'npa'])(
    'with the bag already going, %s turns him round and is said as it happens',
    (opener) => {
      const sim = start();
      bagOnly(sim);
      advance(sim, 20);
      const low = sim.run.vitals.spo2;
      sim.act(opener);
      advance(sim, 1);
      expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Bagging. His chest is rising.' });
      expect(sim.log.slice(-2)).toMatchObject([
        { tone: 'neutral' },
        { text: 'BVM: chest rising', tone: 'good' },
      ]);
      expect(sim.monitor).toMatchObject({ bagged: true, rr: BAG_RATE });
      advance(sim, 20);
      expect(sim.run.vitals.spo2).toBeGreaterThan(low + 5);
      // Said once: nothing more about the chest while it goes on rising.
      expect(sim.log.filter((l) => l.text === 'BVM: chest rising')).toHaveLength(1);
    },
  );

  it('opened first, the bag is said to be working from its first breath, as before', () => {
    const sim = start();
    sim.act('npa');
    sim.act('bvm');
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest rising', tone: 'good' });
    advance(sim, 30);
    expect(sim.monitor).toMatchObject({ bagged: true, spo2: 100 });
    expect(sim.log.map((l) => l.text)).not.toContain('BVM: chest not rising');
  });

  it('letting the jaw go under a bag that was working is said too, and he falls again', () => {
    const sim = start();
    sim.act('jaw_thrust');
    sim.act('bvm');
    advance(sim, 10);
    sim.act('jaw_thrust');
    advance(sim, 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Chest not rising.' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest not rising', tone: 'bad' });
    const before = sim.run.vitals.spo2;
    advance(sim, 10);
    expect(sim.run.vitals.spo2).toBeLessThan(before);
    expect(sim.monitor.bagged).toBe(false);
  });

  it('with the NPA still in, letting the jaw go changes nothing and nothing is said', () => {
    const sim = start();
    sim.act('jaw_thrust');
    sim.act('npa');
    sim.act('bvm');
    advance(sim, 5);
    const said = sim.voices.length;
    sim.act('jaw_thrust');
    advance(sim, 5);
    expect(sim.voices).toHaveLength(said);
    expect(sim.monitor.bagged).toBe(true);
  });

  it('paralysed, a bag held on an unopened airway feels nothing go in, and no time is skipped', () => {
    const sim = start();
    bagOnly(sim);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'spasm')).toBe(true);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    expect(sim.voices.at(-1)?.line).toBe('He’s gone limp!');
    expect(sim.scene).not.toContain('the bag gives');
    const at = sim.run.vitals.spo2;
    advance(sim, 6);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Chest not rising.' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest not rising', tone: 'bad' });
    expect(sim.monitor).toMatchObject({ bagged: false, rr: 0, etco2: null });
    expect(sim.run.vitals.spo2).toBeLessThan(at - 3);
    advance(sim, 14);
    expect(sim.phase).toBe('paralyzed');
    expect(sim.cuts).toEqual([]);

    sim.act('jaw_thrust');
    advance(sim, 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Bagging. His chest is rising.' });
    expect(sim.monitor).toMatchObject({ bagged: true, rr: BAG_RATE });
    const opened = sim.t;
    expect(until(sim, 'breathing', 60)).toBe(true);
    // The stretch of bagging the story skips from is counted from the first air that went in.
    expect(sim.cuts[0]!.at - opened).toBeGreaterThanOrEqual(14);
  });

  it('with the airway opened, the same moment is "It’s going in!", and the chest is not spoken of twice', () => {
    const sim = start();
    idealUntilSpasm(sim);
    idealSpasm(sim);
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    expect(sim.voices.at(-1)?.line).toBe('It’s going in!');
    expect(sim.scene).toContain('the bag gives');
    advance(sim, 8);
    expect(sim.voices.at(-1)?.line).toBe('It’s going in!');
    expect(sim.monitor.bagged).toBe(true);
  });

  it('squeezed on an unopened airway the whole time, the BVM steps read "Not done"', () => {
    const sim = new Simulation(quiet, { forgiving: true });
    sim.act('o2');
    sim.act('stimulate');
    sim.act('bvm');
    advance(sim, 6);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'spasm')).toBe(true);
    sim.act('stop');
    sim.act('suction');
    sim.act('larson');
    sim.act('cpap');
    sim.act('call_911');
    drawAndGive(sim, 'succinylcholine', 1);
    expect(untilEnd(sim, 900)).toBe(true);
    expect(sim.endingKey).toBe('ems_bagged');
    expect(sim.run.onDuring('bvm', 'hypo')).toBe(true);
    expect(row(sim, 'bvm').result).toBe('missed');
    expect(row(sim, 'opioid_airway').parts).toEqual([
      { quote: 'Jaw thrust', result: 'missed' },
      { quote: 'BVM if breathing slow or SpO₂ falling', result: 'missed' },
    ]);
    expect(row(sim, 'sux').parts[1]).toEqual({
      quote: 'ventilate with the BVM until breathing on their own',
      result: 'missed',
    });
    expect(gradeRun(quiet, sim).clean).toBe(false);
  });

  it('once air has gone in during the phase, the step is done', () => {
    const sim = start();
    sim.act('o2');
    sim.act('stimulate');
    sim.act('bvm');
    advance(sim, 4);
    expect(sim.log.map((l) => l.text)).toContain('BVM: chest not rising');
    sim.act('jaw_thrust');
    advance(sim, 2);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'spasm')).toBe(true);
    idealSpasm(sim);
    expect(untilEnd(sim)).toBe(true);
    expect(row(sim, 'bvm').result).toBe('done');
    expect(gradeRun(quiet, sim)).toMatchObject({ done: 13, of: 13, clean: true });
  });

  it('the jaw held for a moment and the bag squeezed later never moved air together', () => {
    const sim = start();
    sim.act('jaw_thrust');
    advance(sim, 2);
    sim.act('jaw_thrust');
    sim.act('bvm');
    advance(sim, 10);
    drawAndGive(sim, 'naloxone', 1);
    expect(until(sim, 'spasm')).toBe(true);
    idealSpasm(sim);
    untilEnd(sim);
    expect(row(sim, 'airway').result).toBe('done');
    expect(row(sim, 'bvm').result).toBe('missed');
  });

  it('the story skips ahead only after fifteen seconds of air going in', () => {
    const sim = start();
    bagOnly(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    advance(sim, 8);
    sim.act('jaw_thrust');
    const opened = sim.t;
    expect(until(sim, 'hypo', 60)).toBe(true);
    expect(sim.cuts[0]!.at - opened).toBeGreaterThanOrEqual(15);
  });

  it('the player’s own squeezes obey the same rule, breath by breath', () => {
    const sim = new Simulation(quiet, { pacedBag: true });
    sim.act('o2');
    sim.act('bvm');
    expect(sim.squeeze(1)).toBe(true);
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest not rising', tone: 'bad' });
    expect(sim.breathGoesIn).toBe(false);
    for (let i = 0; i < 4; i += 1) {
      advance(sim, 6);
      sim.squeeze(1);
    }
    expect(sim.monitor.bagged).toBe(false);
    expect(sim.monitor.spo2).toBeLessThan(96);
    expect(sim.log.filter((l) => l.text === 'BVM: chest not rising')).toHaveLength(1);

    sim.act('jaw_thrust');
    expect(sim.breathGoesIn).toBe(true);
    advance(sim, 1);
    expect(sim.log.slice(-2).map((l) => l.text)).toEqual(['Jaw thrust', 'BVM: chest rising']);
    expect(sim.monitor.bagged).toBe(true);
    expect(sim.run.onDuring('bvm', 'hypo')).toBe(true);
  });

  it('a bag nobody has squeezed lately says nothing when the airway is opened; the next breath does', () => {
    const sim = new Simulation(quiet, { pacedBag: true });
    sim.act('bvm');
    sim.squeeze(1);
    advance(sim, 12);
    sim.act('jaw_thrust');
    advance(sim, 2);
    expect(sim.log.at(-1)?.text).toBe('Jaw thrust');
    sim.squeeze(1);
    advance(sim, 1);
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest rising', tone: 'good' });
  });

  it('the assistant does not offer to keep bagging while nothing is going in', () => {
    const lines = (open: boolean) => {
      const sim = new Simulation(quiet, { coached: true, forgiving: true });
      if (open) sim.act('jaw_thrust');
      bagOnly(sim);
      advance(sim, 60);
      return sim.voices.map((v) => v.line);
    };
    expect(lines(true)).toContain('I can keep bagging. Are we reversing him?');
    expect(lines(false)).not.toContain('I can keep bagging. Are we reversing him?');
    expect(lines(false)).toContain('Sats are dropping. What do you need?');
  });
});
