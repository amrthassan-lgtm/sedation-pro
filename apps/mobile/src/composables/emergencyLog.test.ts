import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  EMERGENCY_PROTOCOLS,
  findProtocol,
  type EmergencyDrugCallout,
} from '@sedation-pro/clinical';

import { logPills, RESCUE_EVENTS, stepStamps } from './emergencyLog';
import { useClinicalNote } from './useClinicalNote';
import { useEmergencyLog } from './useEmergencyLog';
import { useEventLogStore } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
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
    expect(logPills(callout('stable_vtach', 'Cardiac Lidocaine'))).toEqual([
      { key: '90 mg', dose: '90 mg', route: 'IV', sub: '150 lb · 4.5 ml' },
      { key: '120 mg', dose: '120 mg', route: 'IV', sub: '200 lb · 6.0 ml' },
      { key: '150 mg', dose: '150 mg', route: 'IV', sub: '250 lb · 7.5 ml' },
    ]);
    expect(doses(callout('last', 'Push-dose Epinephrine'))).toEqual([
      '50 mcg IV',
      '70 mcg IV',
      '100 mcg IV',
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

describe('where the time stamps sit', () => {
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

  it('an ordinary case still reads "without complication" and "None"', () => {
    const note = useClinicalNote();
    expect(note.value.narrative.join(' ')).toContain('Recovery proceeded without complication.');
    expect(complications(note.value)).toBe('None');
  });

  it('with a rescue dose in the record, the note says neither, and writes nothing about it', () => {
    const before = useClinicalNote().value.narrative.join('\n');
    const rescue = useEmergencyLog();
    const epi = callout('anaphylaxis', 'Epinephrine', 0);
    rescue.give(epi, logPills(epi)[0]!);
    const note = useClinicalNote().value;
    const narrative = note.narrative.join('\n');
    expect(narrative).not.toContain('without complication');
    expect(complications(note)).toBe('See chronological record');
    // Nothing added: the narrative is the old one less that one sentence.
    expect(narrative).toBe(before.replace('\nRecovery proceeded without complication.', ''));
    expect(narrative.toLowerCase()).not.toContain('epinephrine');
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
