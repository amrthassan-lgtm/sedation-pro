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

  it('bagging alone holds the saturation but never wakes him', () => {
    const sim = start();
    sim.act('o2');
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
    const sim = start();
    sim.act('bvm');
    expect(sim.log.at(-1)?.text).toBe(`BVM, 1 breath every ${seconds} s`);
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
