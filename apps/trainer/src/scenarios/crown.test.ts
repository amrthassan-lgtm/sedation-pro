import { describe, expect, it } from 'vitest';

import { findProtocol } from '@sedation-pro/clinical';

import { Simulation } from '@/engine/engine';
import { gradeRun } from '@/engine/grade';

import { crown } from './crown';
import { advance, drawAndGive, until, untilEnd } from './testing';

function start(): Simulation {
  return new Simulation(crown);
}

function toSilent(sim: Simulation): void {
  advance(sim, 6);
  sim.act('encourage_cough');
  expect(until(sim, 'obstructed')).toBe(true);
}

function twoRounds(sim: Simulation): void {
  for (let round = 0; round < 2; round += 1) {
    sim.act('back_blows');
    advance(sim, 4);
    sim.act('abdominal_thrusts');
    advance(sim, 4);
  }
}

function toVisible(sim: Simulation): void {
  toSilent(sim);
  sim.act('call_911');
  sim.act('stop');
  twoRounds(sim);
  expect(until(sim, 'visible')).toBe(true);
}

function toVomiting(sim: Simulation): void {
  toVisible(sim);
  sim.act('magill');
  expect(until(sim, 'vomiting')).toBe(true);
}

function clearTheVomit(sim: Simulation): void {
  sim.act('pos_side');
  sim.act('suction');
  sim.act('o2');
  advance(sim, 1);
}

function ideal(sim: Simulation): void {
  toVomiting(sim);
  clearTheVomit(sim);
  expect(until(sim, 'handover')).toBe(true);
  sim.answer('er');
  expect(untilEnd(sim)).toBe(true);
}

function row(sim: Simulation, id: string) {
  const found = gradeRun(crown, sim).rows.find((r) => r.id === id);
  if (!found) throw new Error(`No rubric row "${id}"`);
  return found;
}

function part(sim: Simulation, id: string, quote: string) {
  const found = row(sim, id).parts.find((p) => p.quote.includes(quote));
  if (!found) throw new Error(`Row "${id}" has no part "${quote}"`);
  return found.result;
}

/** From a cleared airway to the end with EMS, so a debrief can be read. */
function finish(sim: Simulation, answer = 'er'): void {
  expect(until(sim, 'handover')).toBe(true);
  sim.answer(answer);
  expect(untilEnd(sim)).toBe(true);
}

describe('"Crown", played by the protocol', () => {
  it('the ideal run sends him to the ER with every core step done', () => {
    const sim = start();
    ideal(sim);
    const debrief = gradeRun(crown, sim);
    expect(sim.endingKey).toBe('er');
    expect(debrief.rows.filter((r) => r.tier === 'core' && r.result !== 'done')).toEqual([]);
    expect(debrief.of).toBe(6);
    expect(debrief.done).toBe(6);
    expect(debrief.outside).toEqual([]);
    expect(debrief.clean).toBe(true);
  });

  it('he coughs and can speak first, then goes silent and the CO₂ trace is lost', () => {
    const sim = start();
    advance(sim, 5);
    expect(sim.voices.at(-1)).toEqual({ who: 'Patient', line: 'Something… went down.' });
    expect(sim.monitor.capno).toBe('normal');
    expect(until(sim, 'obstructed')).toBe(true);
    expect(sim.t).toBeGreaterThanOrEqual(28);
    advance(sim, 2);
    expect(sim.monitor.etco2).toBeNull();
    expect(sim.monitor.capno).toBe('flat');
  });

  it('bagging a blocked airway moves no air', () => {
    const sim = start();
    toSilent(sim);
    sim.act('bvm');
    advance(sim, 10);
    expect(sim.monitor.bagged).toBe(false);
    expect(sim.monitor.etco2).toBeNull();
  });
});

describe('"Crown": while he can still cough', () => {
  it('a finger sweep pushes the crown down at once, and both lines are marked', () => {
    const sim = start();
    advance(sim, 6);
    sim.act('finger_sweep');
    advance(sim, 1);
    expect(sim.phase).toBe('obstructed');
    expect(sim.log.at(-1)).toMatchObject({
      text: 'Finger sweep: crown pushed deeper',
      tone: 'bad',
    });
    sim.act('call_911');
    twoRounds(sim);
    until(sim, 'visible');
    sim.act('magill');
    until(sim, 'vomiting');
    clearTheVomit(sim);
    finish(sim);
    expect(part(sim, 'mild', 'do not interfere')).toBe('missed');
    expect(part(sim, 'object_visible', 'No blind finger sweeps')).toBe('missed');
    expect(gradeRun(crown, sim).clean).toBe(false);
  });

  it('back blows while he is coughing are marked and do not count toward shifting it', () => {
    const sim = start();
    advance(sim, 6);
    sim.act('back_blows');
    sim.act('abdominal_thrusts');
    sim.act('back_blows');
    sim.act('abdominal_thrusts');
    expect(until(sim, 'obstructed')).toBe(true);
    advance(sim, 25);
    expect(sim.phase).toBe('obstructed');
    twoRounds(sim);
    until(sim, 'visible');
    sim.act('magill');
    until(sim, 'vomiting');
    clearTheVomit(sim);
    sim.act('call_911');
    finish(sim);
    expect(part(sim, 'mild', 'do not interfere')).toBe('missed');
    expect(part(sim, 'mild', 'encourage coughing')).toBe('missed');
  });

  it('the laryngoscope on a coughing patient gets no view', () => {
    const sim = start();
    advance(sim, 6);
    sim.act('magill');
    advance(sim, 2);
    expect(sim.phase).toBe('coughing');
  });
});

describe('"Crown": silent', () => {
  it('two rounds shift it, and tapping fast does not make two rounds shorter', () => {
    const sim = start();
    toSilent(sim);
    for (const id of ['back_blows', 'abdominal_thrusts', 'back_blows', 'abdominal_thrusts']) {
      sim.act(id);
    }
    advance(sim, 10);
    expect(sim.phase).toBe('obstructed');
    expect(until(sim, 'visible', 15)).toBe(true);
  });

  it('one round is not enough', () => {
    const sim = start();
    toSilent(sim);
    sim.act('back_blows');
    sim.act('abdominal_thrusts');
    advance(sim, 30);
    expect(sim.phase).toBe('obstructed');
    expect(sim.voices.some((v) => v.line === 'Nothing’s come up.')).toBe(true);
  });

  it('back blows alone never shift it', () => {
    const sim = start();
    toSilent(sim);
    for (let i = 0; i < 6; i += 1) sim.act('back_blows');
    advance(sim, 30);
    expect(sim.phase).toBe('obstructed');
  });

  it('thrusts before blows still shift it, and the order is marked', () => {
    const sim = start();
    toSilent(sim);
    sim.act('call_911');
    for (const id of ['abdominal_thrusts', 'back_blows', 'abdominal_thrusts', 'back_blows']) {
      sim.act(id);
      advance(sim, 5);
    }
    expect(until(sim, 'visible')).toBe(true);
    sim.act('magill');
    until(sim, 'vomiting');
    clearTheVomit(sim);
    finish(sim);
    expect(part(sim, 'severe', 'then 5 abdominal thrusts')).toBe('missed');
    expect(part(sim, 'severe', '5 back blows')).toBe('done');
    expect(part(sim, 'severe', 'repeat')).toBe('done');
    expect(row(sim, 'severe').result).toBe('partial');
  });

  it('the forceps find nothing while it is out of view', () => {
    const sim = start();
    toSilent(sim);
    sim.act('magill');
    advance(sim, 3);
    expect(sim.phase).toBe('obstructed');
  });

  it('hands off, the saturation is gone in about two minutes', () => {
    const sim = start();
    expect(untilEnd(sim, 400)).toBe(true);
    expect(sim.ending?.outcome).toBe('arrest');
    expect(sim.t).toBeGreaterThan(100);
    expect(sim.t).toBeLessThan(180);
  });
});

describe('"Crown": in view', () => {
  it('a finger sweep knocks it back down, and one more round brings it up again', () => {
    const sim = start();
    toVisible(sim);
    sim.act('finger_sweep');
    advance(sim, 1);
    expect(sim.phase).toBe('obstructed');
    expect(sim.log.at(-1)?.text).toBe('Finger sweep: crown pushed back down');
    sim.act('back_blows');
    advance(sim, 3);
    expect(sim.phase).toBe('obstructed');
    sim.act('abdominal_thrusts');
    expect(until(sim, 'visible', 10)).toBe(true);
    sim.act('magill');
    until(sim, 'vomiting');
    clearTheVomit(sim);
    finish(sim);
    expect(part(sim, 'object_visible', 'No blind finger sweeps')).toBe('missed');
    expect(part(sim, 'object_visible', 'remove with Magill forceps')).toBe('done');
    expect(part(sim, 'mild', 'do not interfere')).toBe('done');
  });

  it('more blows and thrusts do not move it once it is in view', () => {
    const sim = start();
    toVisible(sim);
    sim.act('back_blows');
    sim.act('abdominal_thrusts');
    advance(sim, 10);
    expect(sim.phase).toBe('visible');
  });

  it('he is moving some air, so the trace is back, but he keeps falling until it is out', () => {
    const sim = start();
    toVisible(sim);
    advance(sim, 3);
    expect(sim.monitor.capno).toBe('sharkfin');
    const at = sim.run.vitals.spo2;
    advance(sim, 20);
    expect(sim.run.vitals.spo2).toBeLessThan(at);
    sim.act('magill');
    advance(sim, 10);
    expect(sim.phase).toBe('clear');
    expect(sim.run.vitals.spo2).toBeGreaterThan(at - 2);
  });
});

describe('"Crown": after it is out', () => {
  it('he vomits, and falls faster on his back than on his side', () => {
    const back = start();
    const side = start();
    toVomiting(back);
    toVomiting(side);
    side.act('pos_side');
    advance(back, 30);
    advance(side, 30);
    expect(back.phase).toBe('vomiting');
    expect(side.phase).toBe('vomiting');
    expect(side.run.vitals.spo2).toBeGreaterThan(back.run.vitals.spo2);
  });

  it('suction from before he vomited does not clear it', () => {
    const sim = start();
    toVisible(sim);
    sim.act('suction');
    sim.act('magill');
    until(sim, 'vomiting');
    sim.act('pos_side');
    advance(sim, 10);
    expect(sim.phase).toBe('vomiting');
    sim.act('suction');
    advance(sim, 1);
    expect(sim.phase).toBe('settled');
  });

  it('left on his back with vomit in his throat, he is lost', () => {
    const sim = start();
    toVomiting(sim);
    expect(untilEnd(sim, 900)).toBe(true);
    expect(sim.ending?.outcome).toBe('arrest');
    // The procedure was stopped earlier, so only the turn and the suction are missing.
    expect(part(sim, 'side_suction', 'Turn to the side, head down')).toBe('missed');
    expect(part(sim, 'side_suction', 'suction mouth and throat immediately')).toBe('missed');
  });

  it('a sedative after he vomits is marked on "stop sedatives"', () => {
    const sim = start();
    toVomiting(sim);
    clearTheVomit(sim);
    drawAndGive(sim, 'midazolam', 0.2, { size: 1 });
    finish(sim);
    expect(part(sim, 'o2_no_sedatives', 'stop sedatives')).toBe('missed');
    expect(part(sim, 'o2_no_sedatives', 'Turn off N₂O, 100% O₂')).toBe('done');
  });

  it('without the oxygen, not giving a sedative earns nothing', () => {
    const sim = start();
    toVomiting(sim);
    sim.act('pos_side');
    sim.act('suction');
    finish(sim);
    expect(part(sim, 'o2_no_sedatives', 'Turn off N₂O, 100% O₂')).toBe('missed');
    expect(part(sim, 'o2_no_sedatives', 'stop sedatives')).toBe('na');
  });

  it('ondansetron is an add-on, and only with a clear airway', () => {
    const clear = start();
    toVomiting(clear);
    clearTheVomit(clear);
    drawAndGive(clear, 'ondansetron', 2);
    finish(clear);
    expect(row(clear, 'ondansetron').result).toBe('done');
    expect(gradeRun(crown, clear).of).toBe(6);

    const early = start();
    toVomiting(early);
    drawAndGive(early, 'ondansetron', 2);
    clearTheVomit(early);
    finish(early);
    expect(part(early, 'ondansetron', 'with a clear airway')).toBe('missed');
    expect(part(early, 'ondansetron', 'Ondansetron IV')).toBe('done');
  });

  it('EMS arrives eight minutes after the call and asks where he is going', () => {
    const sim = start();
    toVomiting(sim);
    clearTheVomit(sim);
    expect(until(sim, 'handover')).toBe(true);
    expect(sim.cuts.at(-1)?.title).toBe('EMS arrives');
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.prompt?.id).toBe('disposition');
  });

  it('sending him home is marked: he looks fine and nobody has looked at his chest', () => {
    const sim = start();
    toVomiting(sim);
    clearTheVomit(sim);
    finish(sim, 'home');
    expect(sim.endingKey).toBe('kept');
    expect(row(sim, 'er').result).toBe('missed');
  });

  it('with no call the front desk asks, and "no" ends it with nobody coming', () => {
    const sim = start();
    toSilent(sim);
    twoRounds(sim);
    until(sim, 'visible');
    sim.act('magill');
    until(sim, 'vomiting');
    clearTheVomit(sim);
    advance(sim, 31);
    expect(sim.prompt?.id).toBe('late_911');
    sim.answer('no');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.endingKey).toBe('no_ems');
    expect(part(sim, 'severe', 'Call 911')).toBe('missed');
    expect(row(sim, 'er').result).toBe('missed');
  });

  it('a call made only after the crown is out is late for the choking step', () => {
    const sim = start();
    toSilent(sim);
    twoRounds(sim);
    until(sim, 'visible');
    sim.act('magill');
    until(sim, 'vomiting');
    clearTheVomit(sim);
    advance(sim, 31);
    sim.answer('call');
    finish(sim);
    expect(sim.endingKey).toBe('er');
    expect(part(sim, 'severe', 'Call 911')).toBe('missed');
    expect(row(sim, 'er').result).toBe('done');
  });

  it('a drug neither protocol mentions is listed and withholds the clean run', () => {
    const sim = start();
    toVomiting(sim);
    clearTheVomit(sim);
    drawAndGive(sim, 'naloxone', 1);
    finish(sim);
    const debrief = gradeRun(crown, sim);
    expect(debrief.outside.map((d) => d.drugKey)).toEqual(['naloxone']);
    expect(debrief.clean).toBe(false);
  });
});

describe('"Crown": only what the pages ask for', () => {
  it('played word for word with no tap on Stop, the run is clean: nothing is in progress when he vomits', () => {
    const sim = start();
    toSilent(sim);
    sim.act('call_911');
    twoRounds(sim);
    expect(until(sim, 'visible')).toBe(true);
    sim.act('magill');
    expect(until(sim, 'vomiting')).toBe(true);
    clearTheVomit(sim);
    finish(sim);
    expect(sim.run.at('stop')).toBeNull();
    expect(part(sim, 'side_suction', 'Stop')).toBe('na');
    expect(row(sim, 'side_suction').result).toBe('done');
    const debrief = gradeRun(crown, sim);
    expect(debrief.done).toBe(6);
    expect(debrief.of).toBe(6);
    expect(debrief.clean).toBe(true);
  });

  it('oxygen switched on only once EMS is at the door is too late to count', () => {
    const sim = start();
    toVomiting(sim);
    sim.act('pos_side');
    sim.act('suction');
    expect(until(sim, 'handover')).toBe(true);
    sim.act('o2');
    sim.answer('er');
    expect(untilEnd(sim)).toBe(true);
    expect(part(sim, 'o2_no_sedatives', 'Turn off N₂O, 100% O₂')).toBe('missed');
    expect(gradeRun(crown, sim).clean).toBe(false);
  });

  it('a Stop tapped before his airway is clear is still shown as done', () => {
    const sim = start();
    ideal(sim);
    expect(part(sim, 'side_suction', 'Stop')).toBe('done');
  });

  it('"On the last thrust" is only said when the last set was thrusts', () => {
    const thrusts = start();
    toVisible(thrusts);
    expect(thrusts.scene).toContain('On the last thrust something shifts.');

    const blows = start();
    toSilent(blows);
    for (const id of ['abdominal_thrusts', 'back_blows', 'abdominal_thrusts', 'back_blows']) {
      blows.act(id);
      advance(blows, 5);
    }
    expect(until(blows, 'visible')).toBe(true);
    expect(blows.scene).not.toContain('thrust');
    expect(blows.scene).toContain('He drags in a thin, crowing breath.');
  });
});

describe('"Crown": an ambulance that was called arrives', () => {
  it('on his side with oxygen and never suctioned: EMS arrives eight minutes after the call and takes him as he is', () => {
    const sim = start();
    toVomiting(sim);
    sim.act('pos_side');
    sim.act('o2');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_not_clear');
    expect(sim.ending).toEqual({
      outcome: 'handover',
      title: 'Handed over to EMS',
      text: 'He leaves with EMS. His airway is still not clear.',
    });
    expect(sim.scene).toBe('EMS is at the door with a stretcher. His airway is still not clear.');
    expect(sim.voices.at(-1)).toEqual({ who: 'EMS', line: 'What have we got?' });
    expect(sim.log.at(-1)).toMatchObject({ text: 'EMS on scene', tone: 'neutral' });
    // He is taken as he is: nobody is asked where he goes.
    expect(sim.prompt).toBeNull();
    expect(part(sim, 'side_suction', 'Turn to the side, head down')).toBe('done');
    expect(part(sim, 'side_suction', 'suction mouth and throat immediately')).toBe('missed');
    expect(row(sim, 'er').result).toBe('na');
    expect(gradeRun(crown, sim).clean).toBe(false);
  });

  it('in view and never taken out: the same handover, and the forceps read "Not done"', () => {
    const sim = start();
    toVisible(sim);
    sim.act('o2');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t - sim.run.at('call_911')!).toBeCloseTo(480, 0);
    expect(sim.endingKey).toBe('ems_not_clear');
    expect(part(sim, 'object_visible', 'remove with Magill forceps')).toBe('missed');
    expect(gradeRun(crown, sim).clean).toBe(false);
  });

  it('the crown just out when they walk in: he is taken coughing and breathing', () => {
    const sim = start();
    toVisible(sim);
    sim.act('o2');
    const due = sim.run.at('call_911')! + 480;
    advance(sim, due - 6 - sim.t);
    sim.act('magill');
    expect(untilEnd(sim)).toBe(true);
    expect(sim.t).toBeCloseTo(due, 0);
    expect(sim.endingKey).toBe('ems_crown_out');
    expect(sim.ending?.text).toBe(
      'He leaves with EMS. The crown is out, and he is coughing and breathing.',
    );
    expect(sim.run.entered('vomiting')).toBeNull();
    expect(row(sim, 'side_suction').result).toBe('na');
    expect(sim.cuts).toEqual([]);
  });

  it('due while his airway is clear and before the story skips ahead, they walk in on time and ask', () => {
    const sim = start();
    toVisible(sim);
    sim.act('o2');
    const due = sim.run.at('call_911')! + 480;
    advance(sim, due - 30 - sim.t);
    sim.act('magill');
    expect(until(sim, 'vomiting')).toBe(true);
    sim.act('pos_side');
    sim.act('suction');
    advance(sim, 1);
    expect(sim.phase).toBe('settled');
    expect(until(sim, 'handover')).toBe(true);
    expect(sim.t).toBeCloseTo(due, 0);
    expect(sim.cuts).toEqual([]);
    expect(sim.prompt?.id).toBe('disposition');
  });
});

describe('"Crown": the story borrows the Choking step’s words and adds no technique', () => {
  const HOW_TO = /lean|shoulder blades|arms round|from behind|in and up|hard blows|strike/i;

  it('blows and thrusts are named as the step names them, in every phase', () => {
    const silent = start();
    toSilent(silent);
    silent.act('back_blows');
    expect(silent.scene).toBe('5 back blows.');
    silent.act('abdominal_thrusts');
    expect(silent.scene).toBe('5 abdominal thrusts.');

    const coughing = start();
    advance(coughing, 6);
    coughing.act('back_blows');
    expect(coughing.scene).toBe('5 back blows. He was coughing well on his own.');
    coughing.act('abdominal_thrusts');
    expect(coughing.scene).toBe('5 abdominal thrusts. He was coughing well on his own.');

    const inView = start();
    toVisible(inView);
    inView.act('back_blows');
    expect(inView.scene).toBe('Five more blows. The crown does not move.');
    inView.act('abdominal_thrusts');
    expect(inView.scene).toBe('Five more thrusts. The crown does not move.');

    const out = start();
    toVomiting(out);
    out.act('back_blows');
    expect(out.scene).toBe('5 back blows.');
    out.act('abdominal_thrusts');
    expect(out.scene).toBe('5 abdominal thrusts.');

    for (const sim of [silent, coughing, inView, out]) expect(sim.scene).not.toMatch(HOW_TO);
  });

  it('the words are the Choking step’s, which says nothing of how', () => {
    const step = findProtocol('choking')!.steps.find((s) => s.text.includes('Severe'))!;
    expect(step.text).toContain('5 back blows, then 5 abdominal thrusts');
    expect(step.text).not.toMatch(HOW_TO);
  });
});

describe('"Crown": a sedative acts on him here too', () => {
  it('more sedative slows his breathing and costs him saturation', () => {
    const plain = start();
    const sim = start();
    advance(plain, 6);
    advance(sim, 6);
    drawAndGive(sim, 'fentanyl', 2);
    drawAndGive(sim, 'midazolam', 1);
    advance(plain, 15);
    advance(sim, 15);
    expect(plain.phase).toBe('coughing');
    expect(sim.phase).toBe('coughing');
    expect(sim.monitor.rr).toBeLessThan(plain.monitor.rr);
    expect(sim.run.vitals.spo2).toBeLessThan(plain.run.vitals.spo2);
  });

  it('it changes nothing while no air is moving at all', () => {
    const plain = start();
    const sim = start();
    toSilent(plain);
    toSilent(sim);
    drawAndGive(sim, 'midazolam', 1);
    advance(plain, 20);
    advance(sim, 20);
    expect(sim.monitor.rr).toBe(0);
    expect(sim.run.vitals.spo2).toBeCloseTo(plain.run.vitals.spo2, 5);
  });

  it('the debrief lists it as outside the protocols', () => {
    const sim = start();
    advance(sim, 6);
    drawAndGive(sim, 'fentanyl', 1);
    expect(untilEnd(sim)).toBe(true);
    expect(gradeRun(crown, sim).outside.map((d) => d.drugKey)).toEqual(['fentanyl']);
  });
});
