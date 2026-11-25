import { describe, expect, it } from 'vitest';

import { findProtocol } from '@sedation-pro/clinical';

import { Simulation } from '@/engine/engine';
import { gradeRun } from '@/engine/grade';

import { stridor } from './stridor';
import { advance, drawAndGive, until, untilEnd } from './testing';

function start(options: { coached?: boolean } = {}): Simulation {
  return new Simulation(stridor, options);
}

function toCrowing(sim: Simulation): void {
  expect(until(sim, 'crowing')).toBe(true);
}

function toSilent(sim: Simulation): void {
  toCrowing(sim);
  expect(until(sim, 'silent')).toBe(true);
}

/** Steps 1 to 3, as the page writes them. */
function firstThree(sim: Simulation): void {
  sim.act('stop');
  sim.act('suction');
  sim.act('jaw_thrust');
  sim.act('larson');
  sim.act('o2');
  sim.act('cpap');
}

/** Left until he is silent, then the whole page. */
function lateIdeal(sim: Simulation): void {
  toSilent(sim);
  firstThree(sim);
  sim.act('call_911');
  drawAndGive(sim, 'succinylcholine', 1);
  expect(until(sim, 'paralyzed')).toBe(true);
  sim.act('bvm');
  expect(untilEnd(sim)).toBe(true);
}

/** What the BVM page asks before a breath: everything out of the mouth and the airway opened. */
function bagHim(sim: Simulation): void {
  if (sim.run.at('suction') === null) sim.act('suction');
  if (!sim.isOn('jaw_thrust')) sim.act('jaw_thrust');
  sim.act('bvm');
}

function row(sim: Simulation, id: string) {
  const found = gradeRun(stridor, sim).rows.find((r) => r.id === id);
  if (!found) throw new Error(`No rubric row "${id}"`);
  return found;
}

function part(sim: Simulation, id: string, quote: string) {
  const found = row(sim, id).parts.find((p) => p.quote.includes(quote));
  if (!found) throw new Error(`Row "${id}" has no part "${quote}"`);
  return found.result;
}

function crowedFor(sim: Simulation): number {
  return sim.t - (sim.run.entered('crowing') ?? 0);
}

describe('"Stridor", played by the protocol', () => {
  it('done promptly, the spasm breaks with no drug and every step that applied is done', () => {
    const sim = start();
    toCrowing(sim);
    firstThree(sim);
    expect(untilEnd(sim)).toBe(true);
    const debrief = gradeRun(stridor, sim);
    expect(sim.endingKey).toBe('broke');
    expect(sim.log.map((l) => l.text)).toContain('Spasm broken: breathing quietly');
    expect(debrief.rows.filter((r) => r.tier === 'core' && r.result === 'done')).toHaveLength(3);
    expect(row(sim, 'sux').result).toBe('na');
    expect(row(sim, 'sux_label').result).toBe('na');
    expect(row(sim, 'call_911').result).toBe('na');
    expect(debrief).toMatchObject({ of: 3, done: 3, outside: [], clean: true });
    expect(sim.doses).toEqual([]);
    expect(debrief.lowestSpo2).toBeGreaterThanOrEqual(95);
  });

  it('the same run with the call made counts the call, and EMS is on the way', () => {
    const sim = start();
    toCrowing(sim);
    firstThree(sim);
    sim.act('call_911');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('broke_ems');
    expect(row(sim, 'call_911').result).toBe('done');
    expect(gradeRun(stridor, sim)).toMatchObject({ of: 4, done: 4, clean: true });
  });

  it('left until he is silent, the whole page applies and every step can be done', () => {
    const sim = start();
    lateIdeal(sim);
    const debrief = gradeRun(stridor, sim);
    expect(sim.endingKey).toBe('recovered_ems');
    expect(debrief.rows.filter((r) => r.tier === 'core' && r.result !== 'done')).toEqual([]);
    expect(debrief).toMatchObject({ of: 6, done: 6, outside: [], clean: true });
    expect(sim.log.map((l) => l.text)).toEqual(
      expect.arrayContaining(['Silent: no air movement', 'Spasm broken by succinylcholine']),
    );
  });

  it('prints the protocol’s own words, never a paraphrase', () => {
    const sim = start();
    lateIdeal(sim);
    const steps = findProtocol('laryngospasm')!.steps.map((s) => s.text);
    for (const r of gradeRun(stridor, sim).rows) {
      if (r.kind === 'step') expect(steps).toContain(r.text);
    }
    expect(row(sim, 'sux_label').text).toBe('Succinylcholine: label the syringe');
  });

  it('he crows on small breaths with a shrinking CO₂ trace; silent, the trace is lost', () => {
    const sim = start();
    expect(sim.monitor).toMatchObject({ rr: 14, etco2: 38, capno: 'normal' });
    toCrowing(sim);
    expect(sim.t).toBeCloseTo(6, 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'What is that noise he’s making?' });
    advance(sim, 12);
    expect(sim.monitor.rr).toBe(28);
    expect(sim.monitor.etco2).toBeLessThan(25);
    expect(sim.monitor.capno).toBe('normal');
    expect(sim.look.note).toBe('crowing, chest and belly rocking');
    expect(until(sim, 'silent')).toBe(true);
    expect(crowedFor(sim)).toBeCloseTo(45, 0);
    advance(sim, 21);
    expect(sim.monitor).toMatchObject({ rr: 0, etco2: null, capno: 'flat' });
    expect(sim.monitor.alarms).toContain('apnea');
  });

  it('hands off, the heart slows with the hypoxia before the pulse is lost', () => {
    const sim = start();
    toSilent(sim);
    advance(sim, 10);
    const racing = sim.monitor.hr;
    let slowest = Infinity;
    while (!sim.ending) {
      sim.tick(0.5);
      slowest = Math.min(slowest, sim.monitor.hr);
    }
    expect(sim.endingKey).toBe('arrest');
    expect(racing).toBeGreaterThan(115);
    expect(slowest).toBeLessThan(racing - 30);
  });
});

describe('"Stridor": breaking it without a drug', () => {
  it('the mask does not settle him while the pack is still in his throat', () => {
    const sim = start();
    toCrowing(sim);
    sim.act('jaw_thrust');
    sim.act('larson');
    sim.act('o2');
    sim.act('cpap');
    expect(sim.scene).toContain('The pack is still in his throat');
    advance(sim, 30);
    expect(sim.phase).toBe('crowing');
    expect(until(sim, 'silent')).toBe(true);
    expect(crowedFor(sim)).toBeCloseTo(45, 0);
  });

  it('a cleared throat and both manoeuvres do not break it without the mask', () => {
    const sim = start();
    toCrowing(sim);
    sim.act('stop');
    sim.act('suction');
    sim.act('jaw_thrust');
    sim.act('larson');
    sim.act('o2');
    expect(until(sim, 'silent')).toBe(true);
    expect(sim.run.entered('settling')).toBeNull();
  });

  it('the mask on a cleared throat breaks it, and the two manoeuvres only make it quicker', () => {
    const bare = start();
    toCrowing(bare);
    bare.act('suction');
    bare.act('cpap');
    expect(bare.scene).toContain('softer than the last');
    expect(until(bare, 'settling')).toBe(true);
    expect(crowedFor(bare)).toBeCloseTo(20, 0);

    const full = start();
    toCrowing(full);
    firstThree(full);
    expect(until(full, 'settling')).toBe(true);
    expect(crowedFor(full)).toBeCloseTo(10, 0);

    untilEnd(bare);
    expect(bare.endingKey).toBe('broke');
    expect(row(bare, 'notch').result).toBe('missed');
    expect(part(bare, 'clear', 'Stop the procedure')).toBe('missed');
    expect(part(bare, 'mask', '100% O₂')).toBe('missed');
    expect(part(bare, 'mask', 'steady gentle pressure')).toBe('done');
    expect(gradeRun(stridor, bare)).toMatchObject({ of: 3, done: 0, clean: false });
  });

  it('relief that is under way when he would have gone silent is given its time', () => {
    const sim = start();
    toCrowing(sim);
    advance(sim, 44);
    sim.act('suction');
    sim.act('cpap');
    advance(sim, 4);
    expect(sim.phase).toBe('crowing');
    expect(sim.look.note).toBe('crowing, softer with each breath');
    expect(until(sim, 'settling')).toBe(true);
    expect(crowedFor(sim)).toBeCloseTo(64, 0);
  });

  it('taking the mask off again before it breaks lets him go silent', () => {
    const sim = start();
    toCrowing(sim);
    advance(sim, 40);
    sim.act('suction');
    sim.act('cpap');
    advance(sim, 8);
    expect(sim.phase).toBe('crowing');
    sim.act('cpap');
    advance(sim, 1);
    expect(sim.phase).toBe('silent');
  });

  it('with oxygen the mask turns the saturation round; without it the fall only slows', () => {
    const play = (oxygen: boolean) => {
      const sim = start();
      toCrowing(sim);
      advance(sim, 10);
      const before = sim.run.vitals.spo2;
      sim.act('cpap');
      if (oxygen) sim.act('o2');
      advance(sim, 10);
      return sim.run.vitals.spo2 - before;
    };
    const untouched = (() => {
      const sim = start();
      toCrowing(sim);
      advance(sim, 10);
      const before = sim.run.vitals.spo2;
      advance(sim, 10);
      return sim.run.vitals.spo2 - before;
    })();
    expect(play(true)).toBeGreaterThan(0);
    expect(play(false)).toBeLessThan(0);
    expect(play(false)).toBeGreaterThan(untouched);
  });

  it('a pack taken out before he crows still counts, and the scene does not blame it', () => {
    const sim = start();
    advance(sim, 2);
    sim.act('suction');
    expect(sim.log.at(-1)).toMatchObject({ text: 'Packs out, suctioned', tone: 'good' });
    toCrowing(sim);
    expect(sim.scene).toContain('He coughs once, hard.');
    expect(sim.scene).not.toContain('pack');
    sim.act('cpap');
    expect(until(sim, 'settling')).toBe(true);
    untilEnd(sim);
    expect(part(sim, 'clear', 'Remove packs and gauze')).toBe('done');
  });

  it('the pack and the stop count only before the spasm is over', () => {
    const late = start();
    toSilent(late);
    late.act('jaw_thrust');
    late.act('larson');
    late.act('o2');
    late.act('cpap');
    late.act('call_911');
    drawAndGive(late, 'succinylcholine', 1);
    until(late, 'paralyzed');
    // The pack has to come out for the bag to work, but the spasm is already over.
    late.act('suction');
    late.act('bvm');
    expect(until(late, 'breathing')).toBe(true);
    late.act('stop');
    untilEnd(late);
    expect(row(late, 'clear').result).toBe('missed');
    expect(gradeRun(stridor, late)).toMatchObject({ of: 6, done: 5, clean: false });

    const prompt = start();
    toCrowing(prompt);
    prompt.act('suction');
    prompt.act('jaw_thrust');
    prompt.act('larson');
    prompt.act('o2');
    prompt.act('cpap');
    expect(until(prompt, 'settling')).toBe(true);
    prompt.act('stop');
    untilEnd(prompt);
    expect(part(prompt, 'clear', 'Stop the procedure')).toBe('missed');
    expect(part(prompt, 'clear', 'Remove packs and gauze')).toBe('done');
    expect(row(prompt, 'clear').result).toBe('partial');
  });

  it('the manoeuvres count only if they were held during the spasm', () => {
    const sim = start();
    toCrowing(sim);
    sim.act('suction');
    sim.act('cpap');
    expect(until(sim, 'settling')).toBe(true);
    sim.act('jaw_thrust');
    sim.act('larson');
    sim.act('o2');
    untilEnd(sim);
    expect(row(sim, 'notch').result).toBe('missed');
    expect(part(sim, 'mask', '100% O₂')).toBe('missed');
  });

  it('bagging him while he crows does not take over his breathing on the monitor', () => {
    const sim = start();
    toCrowing(sim);
    advance(sim, 2);
    bagHim(sim);
    expect(sim.scene).toContain('A little goes in past the crow');
    advance(sim, 2);
    expect(sim.monitor).toMatchObject({ bagged: true, rr: 28 });
    expect(until(sim, 'silent')).toBe(true);
    advance(sim, 1);
    expect(sim.monitor.bagged).toBe(false);
  });
});

describe('"Stridor": succinylcholine', () => {
  it('pushed while he is still crowing it paralyses him, and the step’s own condition is marked', () => {
    const sim = start();
    toCrowing(sim);
    advance(sim, 3);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(sim.voices.at(-1)?.line).toBe('It’s in. He was still moving some air, Doc.');
    expect(until(sim, 'paralyzed')).toBe(true);
    expect(sim.log.at(-1)).toMatchObject({ text: 'Paralysed by succinylcholine', tone: 'neutral' });
    bagHim(sim);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('recovered');
    expect(part(sim, 'sux', 'No relief and SpO₂ falling')).toBe('missed');
    expect(part(sim, 'sux', 'Succinylcholine IV')).toBe('done');
    expect(part(sim, 'sux', 'ventilate with the BVM')).toBe('done');
    expect(row(sim, 'sux').result).toBe('partial');
    expect(row(sim, 'call_911').result).toBe('missed');
    expect(gradeRun(stridor, sim)).toMatchObject({ of: 6, done: 1, clean: false });
  });

  it('once he is silent the first three steps only buy time', () => {
    const helped = start();
    const bare = start();
    toSilent(helped);
    toSilent(bare);
    firstThree(helped);
    expect(helped.scene).toContain('then silence again');
    advance(helped, 30);
    advance(bare, 30);
    expect(helped.phase).toBe('silent');
    expect(helped.run.vitals.spo2).toBeGreaterThan(bare.run.vitals.spo2 + 5);
  });

  it('a dose under the protocol range does not break it; the second half does', () => {
    const sim = start();
    toSilent(sim);
    drawAndGive(sim, 'succinylcholine', 0.5);
    expect(sim.voices.at(-1)?.line).toBe('It’s in. Was that enough?');
    advance(sim, 25);
    expect(sim.phase).toBe('silent');
    drawAndGive(sim, 'succinylcholine', 0.5);
    expect(sim.voices.at(-1)?.line).toBe('It’s in. Atropine is ready if his rate drops.');
    expect(until(sim, 'paralyzed', 20)).toBe(true);
    sim.act('bvm');
    untilEnd(sim);
    expect(part(sim, 'sux', 'Succinylcholine IV')).toBe('done');
  });

  it('into the muscle it comes too late, and the route is marked', () => {
    const sim = start();
    toSilent(sim);
    firstThree(sim);
    drawAndGive(sim, 'succinylcholine', 1, { route: 'IM' });
    expect(sim.log.at(-1)).toMatchObject({ tone: 'neutral' });
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('arrest');
    expect(sim.run.entered('paralyzed')).toBeNull();
    expect(part(sim, 'sux', 'Succinylcholine IV')).toBe('missed');
    expect(part(sim, 'sux', 'No relief and SpO₂ falling')).toBe('done');
  });

  it('only a dose given as the protocol writes it is logged green', () => {
    const sim = start();
    toSilent(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(sim.log.at(-1)).toMatchObject({ text: 'Succinylcholine 1.0 ml IV', tone: 'good' });
    const over = start();
    toSilent(over);
    drawAndGive(over, 'succinylcholine', 3);
    expect(over.log.at(-1)).toMatchObject({ tone: 'neutral' });
    over.act('bvm');
    untilEnd(over);
    expect(part(over, 'sux', 'Succinylcholine IV')).toBe('missed');
  });

  it('stopping the bag after succinylcholine costs the patient', () => {
    const sim = start();
    toSilent(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed')).toBe(true);
    bagHim(sim);
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest rising', tone: 'good' });
    advance(sim, 3);
    sim.act('bvm');
    expect(sim.voices.at(-1)?.line).toBe('Stopped? He can’t breathe on his own yet!');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('arrest');
    expect(part(sim, 'sux', 'ventilate with the BVM')).toBe('missed');
  });

  it('nobody bagging a paralysed patient is said out loud, uncoached', () => {
    const sim = start();
    toSilent(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed')).toBe(true);
    advance(sim, 7);
    expect(sim.voices.at(-1)?.line).toBe('He’s not breathing at all!');
    expect(sim.voices.map((v) => v.line)).not.toContain('Do I bag him?');
  });

  it('an unlabeled syringe is caught on the label line', () => {
    const sim = start();
    toSilent(sim);
    sim.act('call_911');
    drawAndGive(sim, 'succinylcholine', 1, { label: false });
    until(sim, 'paralyzed');
    bagHim(sim);
    untilEnd(sim);
    expect(row(sim, 'sux_label').result).toBe('missed');
    expect(row(sim, 'sux').result).toBe('done');
  });

  it('never calling 911 after succinylcholine is marked, and the ending says so', () => {
    const sim = start();
    toSilent(sim);
    firstThree(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    until(sim, 'paralyzed');
    sim.act('bvm');
    untilEnd(sim);
    expect(sim.endingKey).toBe('recovered');
    expect(sim.ending?.text).toContain('Nobody has called 911');
    expect(row(sim, 'call_911').result).toBe('missed');
    expect(gradeRun(stridor, sim)).toMatchObject({ of: 6, done: 5, clean: false });
  });

  it('given once he is breathing quietly again, it is not this step, and the story waits for it', () => {
    const sim = start();
    toCrowing(sim);
    firstThree(sim);
    expect(until(sim, 'settling')).toBe(true);
    advance(sim, 2);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(sim.voices.at(-1)?.line).toBe('Succinylcholine? He isn’t in spasm…');
    expect(sim.log.at(-1)).toMatchObject({ tone: 'bad' });
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    expect(sim.log.at(-1)).toMatchObject({ text: 'Paralysed by succinylcholine', tone: 'bad' });
    sim.act('bvm');
    untilEnd(sim);
    expect(sim.endingKey).toBe('recovered');
    expect(part(sim, 'sux', 'No relief and SpO₂ falling')).toBe('missed');
  });

  it('the cut card names the bagging and puts no length on the drug', () => {
    const sim = start();
    lateIdeal(sim);
    expect(sim.cuts).toHaveLength(1);
    expect(sim.cuts[0]).toMatchObject({
      seconds: 240,
      title: 'Bagging until he breathes on his own',
    });
  });

  it('a second paralysis needs its own stretch of bagging', () => {
    const sim = start();
    toSilent(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    until(sim, 'paralyzed');
    bagHim(sim);
    expect(until(sim, 'breathing')).toBe(true);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    advance(sim, 10);
    expect(sim.phase).toBe('paralyzed');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.cuts).toHaveLength(2);
  });
});

describe('"Stridor": one drug, one patient', () => {
  it('two pushes inside the protocol range are one paralysis, not two', () => {
    const sim = start();
    toSilent(sim);
    firstThree(sim);
    sim.act('call_911');
    drawAndGive(sim, 'succinylcholine', 1);
    advance(sim, 10);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed', 20)).toBe(true);
    sim.act('bvm');
    expect(until(sim, 'breathing')).toBe(true);
    advance(sim, 3);
    expect(sim.phase).toBe('breathing');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('recovered_ems');
    expect(sim.cuts).toHaveLength(1);
    expect(gradeRun(stridor, sim)).toMatchObject({ of: 6, done: 6, clean: true });
  });

  it('a dose pushed while he is paralysed goes with that paralysis, and is marked', () => {
    const sim = start();
    toSilent(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed')).toBe(true);
    bagHim(sim);
    advance(sim, 3);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.cuts).toHaveLength(1);
    expect(part(sim, 'sux', 'No relief and SpO₂ falling')).toBe('missed');
  });

  it('a dose into the muscle does not stop a later dose into the vein from working', () => {
    const sim = start();
    toSilent(sim);
    firstThree(sim);
    sim.act('call_911');
    drawAndGive(sim, 'succinylcholine', 1, { route: 'IM' });
    advance(sim, 5);
    drawAndGive(sim, 'succinylcholine', 1);
    const pushed = sim.t;
    expect(until(sim, 'paralyzed', 30)).toBe(true);
    expect(sim.t - pushed).toBeCloseTo(18, 0);
    sim.act('bvm');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('recovered_ems');
    // The push into the muscle is not "Succinylcholine IV", whatever else went into the vein.
    expect(part(sim, 'sux', 'Succinylcholine IV')).toBe('missed');
    expect(gradeRun(stridor, sim).clean).toBe(false);
  });

  it('a full dose by each route is twice the dose, and is marked', () => {
    const sim = start();
    toSilent(sim);
    firstThree(sim);
    sim.act('call_911');
    drawAndGive(sim, 'succinylcholine', 2);
    drawAndGive(sim, 'succinylcholine', 2, { route: 'IM' });
    until(sim, 'paralyzed');
    sim.act('bvm');
    untilEnd(sim);
    expect(sim.cuts).toHaveLength(1);
    expect(part(sim, 'sux', 'Succinylcholine IV')).toBe('missed');
    expect(gradeRun(stridor, sim).clean).toBe(false);
  });

  it('a second paralysis left unbagged is not "until breathing on their own"', () => {
    const sim = start();
    toSilent(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    until(sim, 'paralyzed');
    bagHim(sim);
    expect(until(sim, 'breathing')).toBe(true);
    sim.act('bvm');
    drawAndGive(sim, 'succinylcholine', 1);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('arrest');
    expect(part(sim, 'sux', 'ventilate with the BVM')).toBe('missed');
  });

  it('stock epinephrine in the vein does not open shut cords or start a paralysed man breathing', () => {
    const shut = start();
    toSilent(shut);
    advance(shut, 5);
    drawAndGive(shut, 'epinephrine', 0.3);
    advance(shut, 6);
    expect(shut.phase).toBe('overdose');
    expect(shut.monitor).toMatchObject({ rr: 0, etco2: null, rhythm: 'vtach' });
    expect(shut.scene).not.toContain('clutching');
    expect(shut.look.note).toBe('chest heaving, no sound');

    const bagged = start();
    toSilent(bagged);
    drawAndGive(bagged, 'succinylcholine', 1);
    until(bagged, 'paralyzed');
    bagHim(bagged);
    advance(bagged, 4);
    drawAndGive(bagged, 'epinephrine', 0.3);
    advance(bagged, 6);
    expect(bagged.monitor).toMatchObject({ bagged: true, rr: 10, rhythm: 'vtach' });
    expect(bagged.look.note).toBe('paralysed, not breathing');
    expect(untilEnd(bagged)).toBe(true);
    expect(bagged.ending?.outcome).toBe('harm');
    expect(bagged.ending?.text).not.toContain('chest pain');
    // The bag never came off: the run was cut short by something else.
    expect(part(bagged, 'sux', 'ventilate with the BVM')).toBe('na');
  });

  it('a run that ends before he ever crows marks nothing as not done', () => {
    const sim = start();
    advance(sim, 1);
    drawAndGive(sim, 'epinephrine', 0.3);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.run.entered('crowing')).toBeNull();
    const debrief = gradeRun(stridor, sim);
    expect(debrief.rows.every((r) => r.result === 'na')).toBe(true);
    expect(debrief).toMatchObject({ of: 0, done: 0, clean: false });
  });
});

describe('"Stridor": what the screen says is true when it says it', () => {
  it('"It’s going in!" is only said by someone holding a bag or a mask', () => {
    const bare = start();
    toSilent(bare);
    drawAndGive(bare, 'succinylcholine', 1);
    until(bare, 'paralyzed');
    expect(bare.voices.at(-1)?.line).toBe('He’s gone limp!');

    const masked = start();
    toSilent(masked);
    masked.act('suction');
    masked.act('jaw_thrust');
    masked.act('cpap');
    drawAndGive(masked, 'succinylcholine', 1);
    until(masked, 'paralyzed');
    expect(masked.voices.at(-1)?.line).toBe('It’s going in!');
  });

  it('relief stays on screen until the spasm breaks, and never falls back to the onset', () => {
    const sim = start();
    toCrowing(sim);
    advance(sim, 4);
    sim.act('suction');
    sim.act('cpap');
    for (let i = 0; i < 19 && sim.phase === 'crowing'; i += 1) {
      advance(sim, 1);
      if (sim.phase === 'crowing') {
        expect(sim.scene, `second ${i + 1}`).toContain('Each crow is softer than the last');
      }
    }
    expect(until(sim, 'settling', 5)).toBe(true);
  });

  it('a 911 call made once he is breathing on his own again is too late to count', () => {
    const sim = start();
    toSilent(sim);
    firstThree(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed')).toBe(true);
    sim.act('bvm');
    expect(until(sim, 'breathing')).toBe(true);
    sim.act('call_911');
    expect(untilEnd(sim)).toBe(true);
    expect(row(sim, 'call_911').result).toBe('missed');
    expect(gradeRun(stridor, sim).clean).toBe(false);
  });

  it('the same call made while he is paralysed counts', () => {
    const sim = start();
    toSilent(sim);
    firstThree(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed')).toBe(true);
    sim.act('bvm');
    sim.act('call_911');
    expect(untilEnd(sim)).toBe(true);
    expect(row(sim, 'call_911').result).toBe('done');
  });

  it('the pack coming out with the mask already on is read before the standing scene returns', () => {
    const sim = start();
    toCrowing(sim);
    sim.act('cpap');
    advance(sim, 3);
    sim.act('suction');
    advance(sim, 3);
    expect(sim.scene).toContain('The pack comes out soaked');
    advance(sim, 4);
    expect(sim.scene).toBe(
      'Tight mask seal, steady gentle pressure on the bag. Each crow is softer than the last.',
    );
  });

  it('once the pack is out the standing scene never mentions it again', () => {
    const sim = start();
    toCrowing(sim);
    advance(sim, 4);
    sim.act('suction');
    advance(sim, 12);
    expect(sim.phase).toBe('crowing');
    expect(sim.scene).not.toContain('pack');
    expect(sim.scene).toContain('high, harsh crow');
  });

  it('taking the mask off stops the screen saying it is easing, and putting it back starts again', () => {
    const sim = start();
    toCrowing(sim);
    sim.act('suction');
    sim.act('cpap');
    advance(sim, 8);
    sim.act('cpap');
    advance(sim, 1);
    expect(sim.scene).toBe('The mask is off. Every breath in is a high, harsh crow again.');
    expect(sim.look.note).toBe('crowing, chest and belly rocking');
    advance(sim, 12);
    expect(sim.scene).toBe('The mask is off. Every breath in is a high, harsh crow again.');
    sim.act('cpap');
    advance(sim, 12);
    expect(sim.scene).toContain('Each crow is softer than the last');
    expect(until(sim, 'settling', 10)).toBe(true);
  });

  it('the ending does not say "without a drug" when one was given', () => {
    const sim = start();
    toCrowing(sim);
    drawAndGive(sim, 'succinylcholine', 0.5);
    firstThree(sim);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('broke');
    expect(sim.ending?.text).toBe(
      'The spasm broke with the mask. He is pink and breathing quietly.',
    );
    expect(part(sim, 'sux', 'No relief and SpO₂ falling')).toBe('missed');
  });
});

describe('"Stridor": what the page does not ask for', () => {
  it('more sedative is listed as outside the protocol and withholds the clean run', () => {
    const sim = start();
    toCrowing(sim);
    drawAndGive(sim, 'midazolam', 0.2, { size: 1 });
    expect(sim.voices.at(-1)?.line).toBe('More midazolam’s in.');
    firstThree(sim);
    untilEnd(sim);
    const debrief = gradeRun(stridor, sim);
    expect(debrief.outside.map((d) => d.drugKey)).toEqual(['midazolam']);
    expect(debrief).toMatchObject({ of: 3, done: 3, clean: false });
  });

  it('a reversal drug is listed too, and the assistant says only what was seen', () => {
    const sim = start();
    toCrowing(sim);
    drawAndGive(sim, 'naloxone', 1);
    expect(sim.voices.at(-1)?.line).toBe('Naloxone’s in. He was already coming round, Doc.');
    firstThree(sim);
    untilEnd(sim);
    expect(gradeRun(stridor, sim).outside.map((d) => d.drugKey)).toEqual(['naloxone']);
  });

  it('the assistant does not say the sats are coming down while the mask and oxygen hold them up', () => {
    const sim = start();
    toCrowing(sim);
    sim.act('o2');
    sim.act('cpap');
    expect(until(sim, 'silent')).toBe(true);
    expect(sim.voices.map((v) => v.line)).not.toContain('His sats are coming down, Doc.');
    expect(sim.run.vitals.spo2).toBeGreaterThanOrEqual(97);
  });

  it('sitting him up changes nothing: he goes silent on time', () => {
    const sim = start();
    toCrowing(sim);
    sim.act('pos_sit_up');
    expect(sim.scene).toBe('Back of the chair up. He is still crowing.');
    expect(until(sim, 'silent')).toBe(true);
    expect(crowedFor(sim)).toBeCloseTo(45, 0);
  });

  it('atropine, kept ready by the succinylcholine callout, is not listed as outside', () => {
    const sim = start();
    lateIdeal(sim);
    const again = start();
    toSilent(again);
    firstThree(again);
    again.act('call_911');
    drawAndGive(again, 'succinylcholine', 1);
    drawAndGive(again, 'atropine', 0.5);
    until(again, 'paralyzed');
    again.act('bvm');
    untilEnd(again);
    expect(gradeRun(stridor, again).outside).toEqual([]);
  });

  it('epinephrine from the ampule into the vein harms him here too', () => {
    const sim = start();
    toCrowing(sim);
    drawAndGive(sim, 'epinephrine', 0.3);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.ending?.outcome).toBe('harm');
  });

  it('an uncoached run is never told a step; a coached one is asked', () => {
    const steps = [
      'That pack is soaked. Suction?',
      'Do you want the mask on him?',
      'Do you need me to call anyone?',
      'The succinylcholine is in the fridge. Do you want it?',
    ];
    const plain = start();
    untilEnd(plain);
    const said = plain.voices.map((v) => v.line);
    for (const line of steps) expect(said).not.toContain(line);
    expect(said).toEqual([
      'What is that noise he’s making?',
      'His sats are coming down, Doc.',
      'He’s gone quiet. Nothing’s moving!',
      'His sats are still dropping… Doc!',
      'It’s not breaking. What’s next?',
    ]);
    const coached = start({ coached: true });
    untilEnd(coached);
    expect(coached.voices.map((v) => v.line)).toEqual(expect.arrayContaining(steps));
  });

  it('is deterministic: the same play gives the same run', () => {
    const play = () => {
      const sim = start();
      lateIdeal(sim);
      return { t: sim.t, low: sim.lowestSpo2, log: sim.log.map((l) => `${l.t}:${l.text}`) };
    };
    expect(play()).toEqual(play());
  });
});

describe('"Stridor": an ambulance that was called arrives', () => {
  it('in take-your-time mode, a silent patient is handed over when they arrive, not left waiting', () => {
    const sim = new Simulation(stridor, { forgiving: true });
    toSilent(sim);
    sim.act('call_911');
    expect(untilEnd(sim, 600)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_no_air');
    expect(sim.ending).toEqual({
      outcome: 'handover',
      title: 'Handed over to EMS',
      text: 'He leaves with EMS. His chest is heaving and no air is moving.',
    });
    expect(sim.log.at(-1)).toMatchObject({ text: 'EMS on scene', tone: 'neutral' });
    expect(row(sim, 'call_911').result).toBe('done');
    expect(row(sim, 'sux').result).toBe('missed');
    expect(gradeRun(stridor, sim).clean).toBe(false);
  });

  it('due inside the paralysis, they arrive under their own card and take over the bag', () => {
    const sim = new Simulation(stridor, { forgiving: true });
    toSilent(sim);
    sim.act('call_911');
    advance(sim, 250);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed')).toBe(true);
    bagHim(sim);
    expect(untilEnd(sim)).toBe(true);
    expect(sim.phase).toBe('paralyzed');
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.cuts.map((c) => c.title)).toEqual(['EMS arrives']);
    expect(sim.endingKey).toBe('ems_bagged');
    expect(sim.ending?.text).toBe('He leaves with EMS. He is still being bagged.');
    // The team was still bagging when the run stopped: that is not "Not done".
    expect(part(sim, 'sux', 'ventilate with the BVM')).toBe('na');
  });

  it('the prompt run is untouched: the spasm breaks long before they are due', () => {
    const sim = start();
    toCrowing(sim);
    firstThree(sim);
    sim.act('call_911');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('broke_ems');
    expect(sim.log.map((l) => l.text)).not.toContain('EMS on scene');
  });
});

describe('"Stridor": the hints follow the page', () => {
  it('a coached run is offered the succinylcholine before the call, as the Laryngospasm page lists them', () => {
    const steps = findProtocol('laryngospasm')!.steps.map((s) => s.text);
    expect(steps.findIndex((text) => text.includes('Succinylcholine IV'))).toBeLessThan(
      steps.indexOf('Call 911'),
    );
    const sim = start({ coached: true });
    untilEnd(sim);
    const said = sim.voices.map((v) => v.line);
    const drug = said.indexOf('The succinylcholine is in the fridge. Do you want it?');
    const call = said.indexOf('Do you need me to call anyone?');
    expect(drug).toBeGreaterThanOrEqual(0);
    expect(call).toBeGreaterThan(drug);
  });
});

describe('"Stridor": a sedative acts on him here too', () => {
  it('more sedative slows his breathing and costs him saturation while he is moving air', () => {
    const plain = start();
    const sim = start();
    toCrowing(plain);
    toCrowing(sim);
    drawAndGive(sim, 'fentanyl', 2);
    drawAndGive(sim, 'midazolam', 1);
    advance(plain, 15);
    advance(sim, 15);
    expect(sim.phase).toBe('crowing');
    expect(sim.monitor.rr).toBeLessThan(plain.monitor.rr);
    expect(sim.run.vitals.spo2).toBeLessThan(plain.run.vitals.spo2);
  });
});

describe('"Stridor": the bag moves air only with the pack out and the airway opened', () => {
  function paralysed(sim: Simulation, before: (sim: Simulation) => void = () => undefined): void {
    toSilent(sim);
    before(sim);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed')).toBe(true);
  }

  it('the BVM page empties the mouth before it opens the airway', () => {
    const steps = findProtocol('bvm')!.steps.map((s) => s.text);
    const mouth = steps.findIndex((text) => text.startsWith('Everything out of the mouth'));
    const open = steps.findIndex((text) => text.startsWith('Open the airway'));
    expect(mouth).toBeGreaterThanOrEqual(0);
    expect(open).toBeGreaterThan(mouth);
    expect(stridor.setup.join(' ')).toContain('throat pack');
  });

  it('paralysed with the pack still in, the bag does nothing for him, and the pack coming out turns it', () => {
    const sim = start();
    paralysed(sim, (s) => s.act('jaw_thrust'));
    const bare = start();
    paralysed(bare, (s) => s.act('jaw_thrust'));

    sim.act('bvm');
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Chest not rising.' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest not rising', tone: 'bad' });
    advance(sim, 10);
    advance(bare, 10);
    expect(sim.run.vitals.spo2).toBeCloseTo(bare.run.vitals.spo2, 5);
    expect(sim.monitor).toMatchObject({ bagged: false, rr: 0, etco2: null });
    expect(sim.voices.map((v) => v.line)).not.toContain('Bagging. His chest is rising.');

    sim.act('suction');
    advance(sim, 1);
    expect(sim.voices.at(-1)).toEqual({ who: 'DA', line: 'Bagging. His chest is rising.' });
    expect(sim.log.slice(-2)).toMatchObject([
      { text: 'Packs out, suctioned' },
      { text: 'BVM: chest rising', tone: 'good' },
    ]);
    expect(sim.monitor).toMatchObject({ bagged: true, rr: 10 });
    const opened = sim.t;
    expect(until(sim, 'breathing')).toBe(true);
    expect(sim.cuts[0]!.at - opened).toBeGreaterThanOrEqual(14);
  });

  it('with the pack out but nothing opening his airway, the same', () => {
    const sim = start();
    paralysed(sim, (s) => s.act('suction'));
    sim.act('bvm');
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest not rising', tone: 'bad' });
    advance(sim, 6);
    expect(sim.monitor.bagged).toBe(false);
    expect(sim.phase).toBe('paralyzed');
    sim.act('npa');
    advance(sim, 1);
    expect(sim.log.at(-1)).toMatchObject({ text: 'BVM: chest rising', tone: 'good' });
    expect(sim.monitor.bagged).toBe(true);
  });

  it('left on a pack and an unopened airway, the bag does not save him, and the step reads "Not done"', () => {
    const sim = start();
    paralysed(sim);
    sim.act('bvm');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('arrest');
    expect(sim.cuts).toEqual([]);
    expect(sim.run.onDuring('bvm', 'paralyzed')).toBe(true);
    expect(part(sim, 'sux', 'ventilate with the BVM')).toBe('missed');
  });

  it('EMS taking over a bag that never moved air is not "cut short"', () => {
    const sim = new Simulation(stridor, { forgiving: true });
    toSilent(sim);
    sim.act('call_911');
    advance(sim, 250);
    drawAndGive(sim, 'succinylcholine', 1);
    expect(until(sim, 'paralyzed')).toBe(true);
    sim.act('bvm');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('ems_bagged');
    expect(sim.cuts).toEqual([]);
    expect(part(sim, 'sux', 'ventilate with the BVM')).toBe('missed');
  });

  it('"It’s going in!" is not said over a mask held on a pack or an unopened airway', () => {
    const packed = start();
    paralysed(packed, (s) => {
      s.act('jaw_thrust');
      s.act('cpap');
    });
    expect(packed.voices.at(-1)?.line).toBe('He’s gone limp!');

    const shut = start();
    paralysed(shut, (s) => {
      s.act('suction');
      s.act('bvm');
    });
    expect(shut.voices.at(-1)?.line).toBe('He’s gone limp!');
    advance(shut, 5);
    expect(shut.voices.at(-1)).toEqual({ who: 'DA', line: 'Chest not rising.' });

    const open = start();
    paralysed(open, (s) => {
      s.act('suction');
      s.act('jaw_thrust');
      s.act('bvm');
    });
    expect(open.voices.at(-1)?.line).toBe('It’s going in!');
    advance(open, 5);
    expect(open.voices.at(-1)?.line).toBe('It’s going in!');
    expect(open.monitor.bagged).toBe(true);
  });

  it('the bag while he crows teaches no rhythm, and only reaches him past a clear mouth and an opened airway', () => {
    const open = start();
    toCrowing(open);
    open.act('suction');
    open.act('jaw_thrust');
    advance(open, 2);
    open.act('bvm');
    expect(open.scene).toBe('A little goes in past the crow.');
    expect(open.log.at(-1)).toMatchObject({ text: 'BVM', tone: 'neutral' });

    const packed = start();
    const untouched = start();
    toCrowing(packed);
    toCrowing(untouched);
    advance(packed, 2);
    advance(untouched, 2);
    packed.act('bvm');
    expect(packed.scene).not.toContain('goes in');
    expect(packed.voices.at(-1)).toEqual({ who: 'DA', line: 'Chest not rising.' });
    expect(packed.log.at(-1)).toMatchObject({ text: 'BVM: chest not rising', tone: 'bad' });
    advance(packed, 20);
    advance(untouched, 20);
    expect(packed.run.vitals.spo2).toBeCloseTo(untouched.run.vitals.spo2, 5);
    expect(packed.monitor.bagged).toBe(false);

    for (const sim of [open, packed]) {
      const said = [sim.scene, ...sim.log.map((l) => l.text), ...sim.voices.map((v) => v.line)];
      for (const line of said) expect(line).not.toMatch(/in time with|rhythm/i);
    }
  });

  it('the ideal late run never hears of a chest that is not rising', () => {
    const sim = start();
    lateIdeal(sim);
    expect(sim.log.map((l) => l.text)).toContain('BVM: chest rising');
    expect(sim.log.map((l) => l.text)).not.toContain('BVM: chest not rising');
    expect(gradeRun(stridor, sim).clean).toBe(true);
  });
});
