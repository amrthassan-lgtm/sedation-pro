import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  EMERGENCY_PROTOCOLS,
  findProtocol,
  type EmergencyDrugCallout,
  type ProtocolStep,
} from '@sedation-pro/clinical';

import {
  doseRows,
  HELP_STAMPS,
  logPills,
  MEDICATION_GIVEN,
  pillsCoverTable,
  RESCUE_EVENTS,
  REVERSAL_DOSES,
  reversalsFor,
  stepStamps,
  type TimeStamp,
} from './emergencyLog';
import { useClinicalNote } from './useClinicalNote';
import { useEmergencyLog, useLoggingGate } from './useEmergencyLog';
import { useIvDosing } from './useIvDosing';
import { useEventLogStore } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';
import { useUndoStore } from '@/stores/undo';

const callouts = EMERGENCY_PROTOCOLS.flatMap((p) =>
  p.steps.flatMap((s) => (s.drug ? [{ protocol: p, drug: s.drug }] : [])),
);

function callout(protocol: string, name: string, nth = 0): EmergencyDrugCallout {
  const found = (findProtocol(protocol)?.steps ?? []).filter((s) => s.drug?.name === name)[nth];
  if (!found?.drug) throw new Error(`${protocol} has no ${name} callout #${nth}`);
  return found.drug;
}

const doses = (drug: EmergencyDrugCallout) => logPills(drug).map((p) => `${p.dose} ${p.route}`);

describe('the pills a drug box offers', () => {
  it('every pill is one dose that can stand in a record, never a range or a rate', () => {
    for (const { protocol, drug } of callouts) {
      for (const pill of logPills(drug)) {
        // Albuterol is logged as the page words it (owner, Nov 2026).
        if (drug.name === 'Albuterol') continue;
        expect(pill.dose, `${protocol.id}: ${drug.name}`).toMatch(/^[\d.]+ (mg|mcg|g)$/);
      }
    }
  });

  it('every drug box has a pill, except the two reversals logged from the top card', () => {
    for (const { protocol, drug } of callouts) {
      const expected = drug.name === 'Naloxone' || drug.name === 'Flumazenil' ? 0 : 1;
      expect(logPills(drug).length >= expected, `${protocol.id}: ${drug.name}`).toBe(true);
      if (expected === 0) expect(logPills(drug)).toEqual([]);
    }
  });

  it('a range becomes one pill per dose in its table', () => {
    expect(doses(callout('anaphylaxis', 'Epinephrine', 1))).toEqual(['0.3 mg IM', '0.5 mg IM']);
    expect(doses(callout('svt', 'Adenosine'))).toEqual(['6 mg IV', '12 mg IV']);
    expect(doses(callout('laryngospasm', 'Succinylcholine'))).toEqual(['20 mg IV', '40 mg IV']);
  });

  it('a dose by weight becomes one pill per weight row, with the dose first', () => {
    const lidocaine = [
      { key: '90 mg', dose: '90 mg', route: 'IV', sub: '150 lb · 4.5 ml' },
      { key: '120 mg', dose: '120 mg', route: 'IV', sub: '200 lb · 6.0 ml' },
      { key: '150 mg', dose: '150 mg', route: 'IV', sub: '250 lb · 7.5 ml' },
    ];
    expect(logPills(callout('stable_vtach', 'Cardiac Lidocaine'))).toEqual(lidocaine);
    expect(logPills(callout('vfib_vtach', 'Cardiac Lidocaine'))).toEqual(lidocaine);
    expect(doses(callout('last', 'Push-dose Epinephrine'))).toEqual([
      '50 mcg IV',
      '70 mcg IV',
      '100 mcg IV',
    ]);
  });

  it('a second dose that differs from the first has its own pill, saying which it is', () => {
    expect(logPills(callout('vfib_vtach', 'Amiodarone'))).toEqual([
      { key: '300 mg', dose: '300 mg', route: 'IV', sub: '6.0 ml · 1st dose' },
      { key: '150 mg', dose: '150 mg', route: 'IV', sub: '3.0 ml · 2nd dose' },
    ]);
    expect(logPills(callout('hypertensive_crisis', 'Labetalol'))).toEqual([
      { key: '20 mg', dose: '20 mg', route: 'IV', sub: '4.0 ml' },
      { key: '40 mg', dose: '40 mg', route: 'IV', sub: '8.0 ml · repeat' },
    ]);
    expect(logPills(callout('svt', 'Adenosine')).map((p) => p.sub)).toEqual([
      '2.0 ml · 1st dose',
      '4.0 ml · 2nd dose',
    ]);
  });

  it('dexamethasone is logged by dose, whichever strength was drawn', () => {
    expect(logPills(callout('anaphylaxis', 'Dexamethasone'))).toEqual([
      { key: '8 mg', dose: '8 mg', route: 'IV', sub: '' },
      { key: '12 mg', dose: '12 mg', route: 'IV', sub: '' },
    ]);
  });

  it('a table of presentations is not a table of doses', () => {
    expect(doses(callout('bradycardia', 'Atropine'))).toEqual(['1 mg IV']);
  });

  it('a step that allows two routes offers each dose by each, so the record names the right one', () => {
    const step = findProtocol('anaphylaxis')!.steps.find(
      (s) => s.drug?.name === 'Diphenhydramine',
    )!;
    expect(step.text).toContain('Diphenhydramine IV or IM');
    expect(logPills(step.drug!, step.text).map((p) => `${p.dose} ${p.route}`)).toEqual([
      '25 mg IV',
      '50 mg IV',
      '25 mg IM',
      '50 mg IM',
    ]);
    // No other step words a second route this way.
    for (const { protocol, drug } of callouts) {
      if (drug.name === 'Diphenhydramine') continue;
      const text = protocol.steps.find((s) => s.drug === drug)!.text;
      expect(logPills(drug, text), `${protocol.id}: ${drug.name}`).toEqual(logPills(drug));
    }
  });

  it('the pen is one pill that says it was the auto-injector', () => {
    expect(logPills(callout('anaphylaxis', 'Epinephrine', 0))).toEqual([
      { key: '0.3 mg', dose: '0.3 mg', route: 'IM', sub: 'auto-injector', notes: 'auto-injector' },
    ]);
  });
});

function stepOf(protocol: string, name: string): ProtocolStep {
  const found = (findProtocol(protocol)?.steps ?? []).find((s) => s.drug?.name === name);
  if (!found) throw new Error(`${protocol} has no ${name} step`);
  return found;
}

describe('when the pills stand in for the dose rows', () => {
  const steps = EMERGENCY_PROTOCOLS.flatMap((p) =>
    p.steps.filter((s) => s.drug !== undefined).map((step) => ({ protocol: p.id, step })),
  );

  it('only when each row has its dose and its volume on the pill in the same place', () => {
    for (const { protocol, step } of steps) {
      if (!pillsCoverTable(step)) continue;
      const rows = doseRows(step.drug!);
      const pills = logPills(step.drug!, step.text);
      const label = `${protocol}: ${step.drug!.name}`;
      expect(pills.length, label).toBe(rows.length);
      rows.forEach((row, i) => {
        expect(row.label, label).toContain(pills[i]!.dose);
        expect(pills[i]!.sub, label).toContain(/^[\d.]+ ml/.exec(row.value)![0]);
      });
    }
  });

  it('a second dose and a mixed push are covered by their pills', () => {
    expect(pillsCoverTable(stepOf('vfib_vtach', 'Amiodarone'))).toBe(true);
    expect(pillsCoverTable(stepOf('bradycardia', 'Push-dose Epinephrine'))).toBe(true);
  });

  it('a table by weight keeps its rows: the weight is what the eye looks up', () => {
    expect(pillsCoverTable(stepOf('stable_vtach', 'Cardiac Lidocaine'))).toBe(false);
    expect(pillsCoverTable(stepOf('vfib_vtach', 'Cardiac Lidocaine'))).toBe(false);
    expect(pillsCoverTable(stepOf('last', 'Push-dose Epinephrine'))).toBe(false);
  });

  it('a table that says more than its pills keeps its rows', () => {
    // One dose listed at two strengths, and one dose at two presentations.
    expect(pillsCoverTable(stepOf('anaphylaxis', 'Dexamethasone'))).toBe(false);
    expect(pillsCoverTable(stepOf('hypotension', 'Atropine'))).toBe(false);
  });

  it('a dose that may go IV or IM keeps its rows: the pills are twice as many', () => {
    const step = stepOf('anaphylaxis', 'Diphenhydramine');
    expect(step.text).toMatch(/Diphenhydramine IV or IM/);
    expect(pillsCoverTable(step)).toBe(false);
  });

  it('a reversal always keeps its rows', () => {
    for (const { protocol, step } of steps) {
      if (reversalsFor(step).length === 0) continue;
      expect(pillsCoverTable(step), `${protocol}: ${step.drug!.name}`).toBe(false);
    }
  });
});

describe('where the time stamps sit', () => {
  it('every time stamp has one home: the Call 911 card, or a step', () => {
    const offered = new Set<TimeStamp>();
    for (const p of EMERGENCY_PROTOCOLS) {
      const calls = p.steps.some((s) => /911/.test(s.text));
      const inSteps = [...stepStamps(p.steps).values()]
        .flat()
        .filter((s) => !HELP_STAMPS.includes(s));
      if (calls) HELP_STAMPS.forEach((s) => offered.add(s));
      inSteps.forEach((s) => offered.add(s));
      // No stamp is offered both on the card and in a step of the same page.
      expect(
        inSteps.filter((s) => calls && HELP_STAMPS.includes(s)),
        p.id,
      ).toEqual([]);
    }
    const stamps = [...RESCUE_EVENTS].filter((e) => e !== MEDICATION_GIVEN);
    expect([...offered].sort()).toEqual(stamps.sort());
  });

  it('each stamp appears once on a page, on the first step that names it', () => {
    const arrest = stepStamps(findProtocol('vfib_vtach')!.steps);
    expect([...arrest]).toEqual([
      [0, ['911 called']],
      [1, ['CPR started']],
      [2, ['Shock given']],
    ]);
    // Bronchospasm says "911" in two steps.
    const wheeze = [...stepStamps(findProtocol('bronchospasm')!.steps).values()].flat();
    expect(wheeze).toEqual(['911 called']);
  });

  it('"AED says no shock" does not carry the shock stamp', () => {
    const steps = findProtocol('vfib_vtach')!.steps;
    const at = [...stepStamps(steps)].find(([, s]) => s.includes('Shock given'))?.[0];
    expect(steps[at!]?.text).toMatch(/^AED: shock when advised/);
  });
});

describe('what goes into the record', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('a dose is recorded as drug, dose and route, and nothing else', () => {
    const rescue = useEmergencyLog();
    const pen = callout('anaphylaxis', 'Epinephrine', 0);
    rescue.give(pen, logPills(pen)[0]!);
    const ampule = callout('anaphylaxis', 'Epinephrine', 1);
    rescue.give(ampule, logPills(ampule)[1]!);
    const events = useEventLogStore().events;
    expect(events.map((e) => [e.event, e.details])).toEqual([
      [
        'Medication given',
        { Drug: 'Epinephrine', Dose: '0.3 mg', Route: 'IM', Notes: 'auto-injector' },
      ],
      ['Medication given', { Drug: 'Epinephrine', Dose: '0.5 mg', Route: 'IM' }],
    ]);
  });

  it('never records the page it was tapped on, a diagnosis, or the word "emergency"', () => {
    const rescue = useEmergencyLog();
    for (const { drug } of callouts) for (const pill of logPills(drug)) rescue.give(drug, pill);
    for (const stamp of ['911 called', 'CPR started', 'Shock given', 'EMS arrived'] as const) {
      rescue.stamp(stamp);
    }
    const written = useEventLogStore()
      .events.map((e) => `${e.event} ${Object.entries(e.details).flat().join(' ')}`)
      .join('\n')
      .toLowerCase();
    expect(written).not.toContain('emergency');
    expect(written).not.toContain('protocol');
    for (const p of EMERGENCY_PROTOCOLS) {
      if (p.id.length > 6) expect(written, p.id).not.toContain(p.id.toLowerCase());
      // A page's own name, or any word of it that is not also a drug or a plain word.
      expect(written, p.name).not.toContain(p.name.toLowerCase());
      for (const word of p.name.toLowerCase().split(/[^a-z]+/)) {
        if (word.length < 7 || callouts.some((c) => c.drug.name.toLowerCase().includes(word))) {
          continue;
        }
        expect(written, `${p.id}: "${word}"`).not.toContain(word);
      }
    }
  });

  it('the same dose reads the same whichever page it was tapped on', () => {
    const rescue = useEmergencyLog();
    for (const page of ['afib', 'stable_vtach', 'wide_complex', 'junctional_tach']) {
      const drug = callout(page, 'Amiodarone');
      rescue.give(drug, logPills(drug)[0]!);
    }
    const lines = useEventLogStore().events.map((e) => JSON.stringify([e.event, e.details]));
    expect(new Set(lines).size).toBe(1);
  });

  it('a tray drug is logged as the sedation screen logs it and counts toward its totals', () => {
    const rescue = useEmergencyLog();
    const iv = useIVStore();
    const midazolam = callout('seizure', 'Midazolam', 0);
    rescue.give(midazolam, logPills(midazolam)[0]!);
    const fentanyl = callout('mi', 'Fentanyl');
    rescue.give(fentanyl, logPills(fentanyl)[0]!);
    expect(iv.versedTotalMg).toBe(5);
    expect(iv.fentanylTotalMcg).toBe(25);
    expect(useEventLogStore().events.map((e) => [e.event, e.details])).toEqual([
      ['IV Dose', { Drug: 'Midazolam (Versed)', Dose: '5 mg', Route: 'IV' }],
      ['IV Dose', { Drug: 'Fentanyl', Dose: '25 mcg', Route: 'IV' }],
    ]);
  });

  it('midazolam into the muscle counts too, and is not called an IV dose', () => {
    const rescue = useEmergencyLog();
    const im = callout('seizure', 'Midazolam', 1);
    rescue.give(im, logPills(im)[0]!);
    expect(useIVStore().versedTotalMg).toBe(10);
    expect(useEventLogStore().events[0]).toMatchObject({
      event: 'Medication given',
      details: { Drug: 'Midazolam (Versed)', Dose: '10 mg', Route: 'IM' },
    });
  });

  it('undo takes the line out of the record and the dose out of the totals', () => {
    const rescue = useEmergencyLog();
    const midazolam = callout('seizure', 'Midazolam', 0);
    rescue.give(midazolam, logPills(midazolam)[0]!);
    expect(useUndoStore().undo()).toBe(true);
    expect(useEventLogStore().events).toEqual([]);
    expect(useIVStore().versedTotalMg).toBe(0);
  });

  it('a repeat is a new line each time, and the pill counts them', () => {
    const rescue = useEmergencyLog();
    const epi = callout('vfib_vtach', 'Epinephrine');
    const pill = logPills(epi)[0]!;
    expect(rescue.lastGiven(epi, pill)).toBeUndefined();
    rescue.give(epi, pill);
    expect(rescue.lastGiven(epi, pill)).toMatch(/^✓ \d/);
    expect(rescue.lastGiven(epi, pill)).not.toContain('×');
    rescue.give(epi, pill);
    rescue.give(epi, pill);
    expect(useEventLogStore().events).toHaveLength(3);
    expect(rescue.lastGiven(epi, pill)).toContain('×3');
  });

  it('911, CPR and EMS are stamped once; a shock can be stamped again', () => {
    const rescue = useEmergencyLog();
    rescue.stamp('911 called');
    rescue.stamp('911 called');
    rescue.stamp('Shock given');
    rescue.stamp('Shock given');
    const events = useEventLogStore().events.map((e) => e.event);
    expect(events).toEqual(['911 called', 'Shock given', 'Shock given']);
    expect(rescue.stamped('Shock given')).toContain('×2');
    expect(rescue.stamped('EMS arrived')).toBeUndefined();
    for (const e of useEventLogStore().events) expect(e.details).toEqual({});
  });

  it('every line these pills write is one the note knows to look for', () => {
    const rescue = useEmergencyLog();
    const epi = callout('vfib_vtach', 'Epinephrine');
    rescue.give(epi, logPills(epi)[0]!);
    rescue.stamp('EMS arrived');
    for (const e of useEventLogStore().events) expect(RESCUE_EVENTS.has(e.event)).toBe(true);
  });
});

describe('the note never contradicts the record', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  const complications = (note: ReturnType<typeof useClinicalNote>['value']) =>
    note.sections.flatMap((s) => s.rows).find(([label]) => label === 'Sedation complications')?.[1];

  it('an ordinary case prints "None" for a blank complications box', () => {
    expect(complications(useClinicalNote().value)).toBe('None');
  });

  it('with a rescue dose in the record, the box reads "See chronological record" and the narrative is unchanged', () => {
    const before = useClinicalNote().value.narrative.join('\n');
    const rescue = useEmergencyLog();
    const epi = callout('anaphylaxis', 'Epinephrine', 0);
    rescue.give(epi, logPills(epi)[0]!);
    const note = useClinicalNote().value;
    expect(complications(note)).toBe('See chronological record');
    expect(note.narrative.join('\n')).toBe(before);
    expect(note.chronology.at(-1)).toMatchObject({
      event: 'Medication given',
      detail: 'Drug: Epinephrine · Dose: 0.3 mg · Route: IM · Notes: auto-injector',
    });
  });

  it('a time stamp alone is enough, and what the doctor wrote is printed as written', () => {
    useEmergencyLog().stamp('911 called');
    expect(complications(useClinicalNote().value)).toBe('See chronological record');
  });
});

describe('the note states what was recorded, never a conclusion (owner, Nov 2026)', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  const narrative = () => useClinicalNote().value.narrative.join('\n');
  const total = (label: string) =>
    useClinicalNote()
      .value.sections.flatMap((s) => s.rows)
      .find(([l]) => l === label)?.[1];

  it('lists the medications as totals, with no "sedation achieved" or "titrated to effect"', () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    iv.logDose({ drug: 'fentanyl', mcg: 50 });
    iv.logDose({ drug: 'zofran', mg: 4 });
    const text = narrative();
    expect(text).toContain(
      'Medications given: midazolam 2.0 mg IV, fentanyl 50 mcg IV, ondansetron 4 mg IV.',
    );
    expect(text).not.toMatch(/sedation achieved|titrated|doses? total/i);
  });

  it('a dose into the muscle is never printed as IV, in the sentence or the totals', () => {
    const iv = useIVStore();
    iv.logDose({ drug: 'versed', mg: 2 });
    const im = callout('seizure', 'Midazolam', 1);
    useEmergencyLog().give(im, logPills(im)[0]!);
    expect(iv.versedTotalMg).toBe(12);
    expect(narrative()).toContain('Medications given: midazolam 2.0 mg IV and 10.0 mg IM.');
    expect(total('Midazolam (Versed)')).toBe('2.0 mg IV and 10.0 mg IM');
  });

  it('never writes "Recovery proceeded without complication."', () => {
    const recovery = useRecoveryStore();
    recovery.ambulatory = true;
    expect(narrative()).not.toContain('without complication');
  });

  it('writes the instructions sentence only from the boxes that were ticked', () => {
    const recovery = useRecoveryStore();
    recovery.companionName = 'Pat';
    recovery.companionRelation = 'Spouse';
    const line = () =>
      narrative()
        .split(/(?<=\.) /)
        .find((s) => s.includes('instructions'));
    expect(narrative()).toContain('Patient was discharged accompanied by Pat (Spouse).');
    expect(line()).toBeUndefined();
    recovery.setDischarge('verbalInstructionsGiven', true);
    expect(line()).toBe('Verbal post-op instructions were given to the companion.');
    recovery.setDischarge('writtenInstructionsGiven', true);
    expect(line()).toBe('Verbal and written post-op instructions were given to the companion.');
    recovery.setDischarge('verbalInstructionsGiven', false);
    expect(line()).toBe('Written post-op instructions were given to the companion.');
  });
});

describe('naloxone and flumazenil in their steps', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  const pill = (protocol: string, drug: string, route: 'IV' | 'IM', dose?: string) => {
    const step = findProtocol(protocol)!.steps.find((s) => reversalsFor(s).length > 0)!;
    const found = reversalsFor(step).find(
      (p) => p.drug === drug && p.route === route && (dose === undefined || p.dose === dose),
    );
    if (!found) throw new Error(`${protocol} has no ${drug} ${dose ?? ''} ${route} pill`);
    return found;
  };

  it('only three steps carry a reversal pill, and they are the ones that give it', () => {
    const carrying = EMERGENCY_PROTOCOLS.flatMap((p) =>
      p.steps
        .filter((s) => reversalsFor(s).length > 0)
        .map(
          (s) =>
            `${p.id}: ${reversalsFor(s)
              .map((r) => r.key)
              .join(' + ')}`,
        ),
    );
    expect(carrying).toEqual([
      'hypoventilation: naloxone 0.4 mg IV + flumazenil 0.2 mg IV',
      'oversedation_benzo: flumazenil 0.2 mg IV',
      'oversedation_opioid: naloxone 0.4 mg IV + naloxone 2 mg IV + naloxone 0.4 mg IM + naloxone 2 mg IM',
    ]);
  });

  it('the naloxone step allows the muscle when there is no IV, so it has an IM pill', () => {
    const step = findProtocol('oversedation_opioid')!.steps.find(
      (s) => s.drug?.name === 'Naloxone',
    )!;
    expect(step.text).toContain('or IM if no IV');
  });

  it('every reversal pill is a dose its callout draws, at the same volume', () => {
    const naloxone = callout('oversedation_opioid', 'Naloxone');
    for (const d of REVERSAL_DOSES.naloxone.doses) {
      const row = naloxone.drawTable?.find((r) => r.label.startsWith(`${d.dose}`));
      expect(row?.ml, d.dose).toBe(d.sub);
    }
    const [flumazenil] = REVERSAL_DOSES.flumazenil.doses;
    expect(callout('oversedation_benzo', 'Flumazenil').volume).toBe(flumazenil?.sub);
    expect(callout('oversedation_benzo', 'Flumazenil').dose).toBe(flumazenil?.dose);
  });

  it('the 2 mg naloxone dose is recorded as 2 mg, and counts in the totals', () => {
    const rescue = useEmergencyLog();
    rescue.reverse(pill('oversedation_opioid', 'naloxone', 'IV', '2 mg'));
    expect(useEventLogStore().events.at(-1)?.details).toEqual({
      Drug: 'Naloxone',
      Dose: '2 mg',
      Route: 'IV',
      Notes: 'opioid reversal',
    });
    expect(useIVStore().doses.map((d) => [d.drug, d.mg])).toEqual([['naloxone', 2]]);
    const row = useClinicalNote()
      .value.sections.flatMap((s) => s.rows)
      .find(([l]) => l === 'Naloxone (reversal)');
    expect(row?.[1]).toBe('2.0 mg IV');
  });

  it('the Hypoventilation step offers only the first doses: the full ones are on the pages it links to', () => {
    const step = findProtocol('hypoventilation')!.steps.find((s) => s.text.startsWith('Reverse:'))!;
    expect(reversalsFor(step).map((p) => `${p.name} ${p.dose} ${p.route}`)).toEqual([
      'Naloxone 0.4 mg IV',
      'Flumazenil 0.2 mg IV',
    ]);
    expect(step.goTo).toEqual(['oversedation_opioid', 'oversedation_benzo']);
  });

  it('a tap logs through the sedation screen, so the dose and the discharge hold follow', () => {
    const rescue = useEmergencyLog();
    rescue.reverse(pill('oversedation_opioid', 'naloxone', 'IV'));
    rescue.reverse(pill('oversedation_benzo', 'flumazenil', 'IV'));
    const iv = useIVStore();
    expect(iv.doses.map((d) => [d.drug, d.mg])).toEqual([
      ['naloxone', 0.4],
      ['flumazenil', 0.2],
    ]);
    expect(useEventLogStore().events.map((e) => e.event)).toEqual([
      'Reversal Agent',
      'Reversal Agent',
    ]);
    expect(iv.lastFlumazenilAt).not.toBeNull();
  });

  it('naloxone into the muscle is recorded as IM, in the line, the totals and the sentence', () => {
    const rescue = useEmergencyLog();
    rescue.reverse(pill('oversedation_opioid', 'naloxone', 'IV', '0.4 mg'));
    rescue.reverse(pill('oversedation_opioid', 'naloxone', 'IM', '0.4 mg'));
    expect(useEventLogStore().events.map((e) => e.details.Route)).toEqual(['IV', 'IM']);
    // The discharge hold follows either route.
    expect(useIVStore().lastNaloxoneAt).not.toBeNull();
    const note = useClinicalNote().value;
    const row = note.sections.flatMap((s) => s.rows).find(([l]) => l === 'Naloxone (reversal)');
    expect(row?.[1]).toBe('0.4 mg IV and 0.4 mg IM');
    expect(note.narrative.join(' ')).toContain('Naloxone 0.4 mg IV and 0.4 mg IM given');
  });

  it('each pill counts its own route, and none locks', () => {
    const rescue = useEmergencyLog();
    const iv_ = pill('oversedation_opioid', 'naloxone', 'IV', '0.4 mg');
    const im = pill('oversedation_opioid', 'naloxone', 'IM', '0.4 mg');
    const big = pill('oversedation_opioid', 'naloxone', 'IV', '2 mg');
    expect(rescue.lastReversal(iv_)).toBeUndefined();
    rescue.reverse(iv_);
    rescue.reverse(iv_);
    rescue.reverse(im);
    expect(rescue.lastReversal(iv_)).toContain('×2');
    expect(rescue.lastReversal(im)).not.toContain('×');
    // Each dose counts only its own taps.
    expect(rescue.lastReversal(big)).toBeUndefined();
  });

  it('the sedation screen still logs naloxone IV, as before', () => {
    useIvDosing().logIvNaloxone();
    expect(useEventLogStore().events[0]?.details).toEqual({
      Drug: 'Naloxone',
      Dose: '0.4 mg',
      Route: 'IV',
      Notes: 'opioid reversal',
    });
    expect(useIVStore().doses[0]?.route).toBeUndefined();
  });
});

describe('the logging gate', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('is locked with no case, and Unlock opens it', () => {
    const gate = useLoggingGate();
    expect(gate.state.value).toBe('locked');
    expect(gate.owner.value).toBeNull();
    gate.unlock();
    expect(gate.state.value).toBe('on');
  });

  it('names the patient the taps will be recorded under', () => {
    usePatientStore().name = 'Test Patient';
    expect(useLoggingGate().owner.value).toBe('Test Patient');
  });

  it('a released case stays closed, even after Unlock: another emergency must not go into it', () => {
    const gate = useLoggingGate();
    gate.unlock();
    useRecoveryStore().stampReleased();
    expect(gate.state.value).toBe('finished');
  });
});
