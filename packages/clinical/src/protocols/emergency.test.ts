import { describe, expect, it } from 'vitest';

import {
  CRITICAL_PROTOCOL_IDS,
  DURING_SEDATION_PROTOCOL_IDS,
  EMERGENCY_PROTOCOLS,
  findProtocol,
  protocolsByCategory,
  type EmergencyDrugCallout,
} from './emergency';

function allCallouts(): ReadonlyArray<EmergencyDrugCallout> {
  return EMERGENCY_PROTOCOLS.flatMap((p) => p.steps)
    .map((s) => s.drug)
    .filter((d): d is EmergencyDrugCallout => d !== undefined);
}

const INJECTABLE_ROUTES = new Set(['IV', 'IM', 'IA', 'SubQ']);

function injectables(): ReadonlyArray<EmergencyDrugCallout> {
  // A prefilled device is given, not drawn: no syringe to choose, nothing to label.
  return allCallouts().filter((d) => INJECTABLE_ROUTES.has(d.route) && d.device === undefined);
}

describe('emergency protocols', () => {
  it('the during-sedation shortcuts are a subset of the critical list', () => {
    for (const id of DURING_SEDATION_PROTOCOL_IDS) {
      expect(CRITICAL_PROTOCOL_IDS, id).toContain(id);
    }
  });

  it('every CRITICAL_PROTOCOL_IDS entry resolves to a protocol flagged critical', () => {
    for (const id of CRITICAL_PROTOCOL_IDS) {
      const proto = findProtocol(id);
      expect(proto, `missing protocol ${id}`).toBeDefined();
      expect(proto?.critical).toBe(true);
    }
  });

  it('findProtocol returns undefined for unknown ids', () => {
    expect(findProtocol('does-not-exist')).toBeUndefined();
  });

  it('protocolsByCategory partitions the library without dropping any protocol', () => {
    const categories = [
      'airway',
      'cardiac-ischemia',
      'cardiac-arrhythmia',
      'cardiac-arrest',
      'allergic',
      'neurological',
      'other',
    ] as const;
    const total = categories.reduce((acc, c) => acc + protocolsByCategory(c).length, 0);
    expect(total).toBe(EMERGENCY_PROTOCOLS.length);
  });

  it('every protocol has at least one step and a non-empty summary', () => {
    for (const proto of EMERGENCY_PROTOCOLS) {
      expect(proto.steps.length).toBeGreaterThan(0);
      expect(proto.summary.length).toBeGreaterThan(0);
    }
  });

  it('step goTo links resolve, never point at their own protocol, and back every "go to" in the text', () => {
    const ids = new Set(EMERGENCY_PROTOCOLS.map((p) => p.id));
    for (const proto of EMERGENCY_PROTOCOLS) {
      for (const step of proto.steps) {
        for (const id of step.goTo ?? []) {
          expect(ids.has(id), `${proto.id} step links unknown '${id}'`).toBe(true);
          expect(id, `${proto.id} links to itself`).not.toBe(proto.id);
        }
        if (/\bgo to\b|No pulse/i.test(step.text)) {
          expect(step.goTo?.length ?? 0, `${proto.id}: "${step.text}" has no link`).toBeGreaterThan(
            0,
          );
        }
      }
    }
  });

  it('every protocol offers at least one related protocol', () => {
    for (const proto of EMERGENCY_PROTOCOLS) {
      expect(
        proto.relatedProtocols?.length ?? 0,
        `${proto.id} has no related protocols`,
      ).toBeGreaterThan(0);
    }
  });

  it('relatedProtocols ids all resolve', () => {
    for (const proto of EMERGENCY_PROTOCOLS) {
      for (const relId of proto.relatedProtocols ?? []) {
        expect(findProtocol(relId), `${proto.id} → ${relId}`).toBeDefined();
      }
    }
  });

  it('hypertensive crisis carries labetalol then hydralazine as second-line', () => {
    const proto = findProtocol('hypertensive_crisis');
    const names = proto?.steps.map((s) => s.drug?.name).filter(Boolean);
    expect(names).toEqual(['Labetalol', 'Hydralazine']);
    const hydralazine = proto?.steps.find((s) => s.drug?.name === 'Hydralazine');
    expect(hydralazine?.drug?.concentration).toBe('20 mg/ml');
    expect(proto?.steps.some((s) => s.text.includes('no more than 25%'))).toBe(true);
  });

  it('asymptomatic hypertension gives no IV BP drug (2025 AHA/ACC)', () => {
    // Severe BP without target-organ symptoms is not lowered acutely; the
    // symptom check routes to the crisis protocol instead.
    const proto = findProtocol('hypertension');
    const names = proto?.steps.map((s) => s.drug?.name).filter(Boolean);
    expect(names).toEqual(['Midazolam']);
    expect(proto?.steps.some((s) => s.text.includes('go to Hypertensive Crisis'))).toBe(true);
  });

  it('nitroglycerin protocols carry the PDE5 windows and the 5-minute 911 rule', () => {
    for (const id of ['angina', 'mi']) {
      const c = findProtocol(id)?.contraindications?.join(' ') ?? '';
      expect(c, id).toContain('in last 24 hr');
      expect(c, id).toContain('Tadalafil (Cialis) in last 48 hr');
    }
    expect(
      findProtocol('angina')?.steps.some((s) =>
        s.text.startsWith('Pain not gone 5 min after 1st nitro'),
      ),
    ).toBe(true);
  });

  it('hypotension never suggests vagal maneuvers and covers HR 50-100 with ephedrine', () => {
    const proto = findProtocol('hypotension');
    expect(proto?.steps.some((s) => /vagal maneuver/i.test(s.text))).toBe(false);
    const eph = proto?.steps.find((s) => s.drug?.name === 'Ephedrine');
    expect(eph?.text).toContain('HR 50-100');
  });

  it('every injectable callout tells the team to label the syringe', () => {
    // Two clear syringes on a crash tray look identical; an unlabelled one is
    // how a 1 mg/ml vial gets pushed instead of a 10 mcg/ml mix.
    for (const drug of injectables()) {
      expect(`${drug.notes ?? ''} ${drug.mixFirst ?? ''}`, drug.name).toMatch(
        /label the syringe|Label it /,
      );
    }
  });

  it('every injectable callout names its syringe (1, 3 or 10 ml)', () => {
    // Owner's kit plan (2026-11): 1 ml for midazolam, 3 ml for most draws,
    // 10 ml for anything over 3 ml and every mix. D50W is prefilled, so it is
    // not among the drawn callouts at all.
    for (const drug of injectables()) {
      expect([1, 3, 10], drug.name).toContain(drug.syringeMl);
      if (drug.mixFirst) expect(drug.syringeMl, drug.name).toBe(10);
      // The 10 mg IM seizure dose is 2.0 ml: it does not fit the 1 ml midazolam syringe.
      if (drug.name === 'Midazolam') expect(drug.syringeMl).toBe(drug.route === 'IM' ? 3 : 1);
    }
  });

  it('every summary reads "signs · first action" so the list and the Critical chips scan the same way', () => {
    for (const p of EMERGENCY_PROTOCOLS) {
      const [signs, ...rest] = p.summary.split(' · ');
      expect(rest.length, `${p.id} summary has no " · "`).toBeGreaterThan(0);
      expect(signs?.trim().length ?? 0, `${p.id} summary has no signs part`).toBeGreaterThan(0);
      // The signs part names what you see, never the first drug or step.
      expect(signs, p.id).not.toMatch(/^(CPR|Call 911|MONA|Give|Stop)/);
      expect(p.summary, p.id).not.toContain('→');
    }
  });

  it('every injectable callout carries a draw volume or a draw table', () => {
    // The callouts exist so the clinician never does mg→ml math in a
    // crisis. Non-injectable routes (inhaled/PO/SL) are exempt.
    for (const drug of injectables()) {
      expect(
        drug.volume !== undefined || drug.drawTable !== undefined,
        `${drug.name} (${drug.dose}) has no volume and no drawTable`,
      ).toBe(true);
    }
  });

  it('volume and drawTable strings follow the canonical "N.N ml" grammar', () => {
    // "2 × 3.0 ml": the same draw in two syringes (arrest amiodarone).
    const VOLUME = /^(\d × )?\d+(\.\d{1,2})?(-\d+(\.\d{1,2})?)? ml( \([^)]+\))?$/;
    const ROW_ML = /^(\d × )?\d+(\.\d{1,2})? ml( \([^)]+\))?$/;
    for (const drug of allCallouts()) {
      if (drug.volume !== undefined) {
        expect(drug.volume, `${drug.name} volume '${drug.volume}'`).toMatch(VOLUME);
      }
      for (const row of drug.drawTable ?? []) {
        expect(row.ml, `${drug.name} drawTable '${row.label}'`).toMatch(ROW_ML);
      }
    }
  });

  it('never writes an unspaced volume unit anywhere', () => {
    const check = (s: string | undefined, where: string) => {
      if (s === undefined) return;
      expect(s, where).not.toMatch(/\dm[lL]\b/);
      expect(s, where).not.toMatch(/\dcc\b/);
    };
    for (const p of EMERGENCY_PROTOCOLS) {
      check(p.summary, `${p.id} summary`);
      for (const step of p.steps) {
        check(step.text, `${p.id} step text`);
        check(step.drug?.volume, `${p.id} ${step.drug?.name} volume`);
        check(step.drug?.concentration, `${p.id} ${step.drug?.name} concentration`);
        check(step.drug?.notes, `${p.id} ${step.drug?.name} notes`);
        check(step.drug?.mixFirst, `${p.id} ${step.drug?.name} mixFirst`);
      }
    }
  });

  it('reserves the arrow glyph for mixFirst dilution results', () => {
    for (const p of EMERGENCY_PROTOCOLS) {
      for (const step of p.steps) {
        expect(step.text, `${p.id} step text`).not.toContain('→');
        expect(step.drug?.notes ?? '', `${p.id} ${step.drug?.name} notes`).not.toContain('→');
      }
    }
  });

  it('both atropine callouts map both stocked presentations', () => {
    const atropines = allCallouts().filter((d) => d.name === 'Atropine');
    expect(atropines.length).toBe(2);
    for (const drug of atropines) {
      const labels = (drug.drawTable ?? []).map((r) => r.label).join(' | ');
      expect(labels).toContain('1 mg/ml vial');
      expect(labels).toContain('prefilled');
    }
  });

  it('dilution-required callouts carry MIX FIRST recipes with guard phrases', () => {
    const byName = (name: string) => allCallouts().find((d) => d.name === name);
    for (const name of ['Phenylephrine', 'Push-dose Epinephrine', 'Ephedrine']) {
      const drug = byName(name);
      expect(drug?.mixFirst, `${name} mixFirst`).toMatch(/^MIX FIRST:/);
    }
    for (const name of ['Phenylephrine', 'Push-dose Epinephrine', 'Ephedrine']) {
      expect(byName(name)?.concentration, name).toContain('after dilution');
    }
    // The practice stocks 500 ml bags only, so every two-step recipe works in
    // one 10 ml syringe and names the waste-down step the screen emphasises.
    for (const name of ['Phenylephrine', 'Push-dose Epinephrine', 'Ephedrine']) {
      expect(byName(name)?.mixFirst, `${name} guard`).toContain('Never inject from the stock vial');
    }
    for (const name of ['Phenylephrine', 'Push-dose Epinephrine']) {
      const mix = byName(name)?.mixFirst ?? '';
      expect(mix, `${name} mixFirst`).toContain('one 10 ml syringe');
      expect(mix, `${name} mixFirst`).toContain('WASTE DOWN TO 1 ml');
      expect(mix, `${name} mixFirst`).not.toContain('100 ml NS');
    }
  });

  it('every MIX FIRST recipe reads as numbered steps ending with a label and the stock-vial guard', () => {
    for (const drug of allCallouts().filter((d) => d.mixFirst)) {
      const parts = drug.mixFirst!.split('; ');
      expect(parts[0], drug.name).toBe(
        'MIX FIRST: one 10 ml syringe, saline or D5W from the IV bag port',
      );
      expect(parts[1], drug.name).toMatch(/^Draw 1 ml .* \+ 9 ml saline or D5W = /);
      expect(parts.at(-2), drug.name).toMatch(/^Label it /);
      expect(parts.at(-1), drug.name).toBe('Never inject from the stock vial');
    }
  });

  it('every mix can be made from either bag, since the bag running may be the D5W (owner, Nov 2026)', () => {
    // The ephedrine, phenylephrine and epinephrine labels all allow saline or
    // D5W, and the epinephrine label prefers dextrose. Each step that names
    // the fluid names both, so no step reads as saline only.
    for (const drug of allCallouts().filter((d) => d.mixFirst)) {
      expect(drug.mixFirst, drug.name).not.toMatch(/saline(?! or D5W)/);
    }
  });

  it('anaphylaxis gives epinephrine IM, and IV only in an arrest (owner, Nov 2026)', () => {
    const steps = findProtocol('anaphylaxis')?.steps ?? [];
    const im = steps.find((s) => s.drug?.name === 'Epinephrine');
    expect(im?.drug?.route).toBe('IM');
    expect(im?.text).toContain('NEVER 1 mg/ml IV');
    // Shock that outlasts two IM doses and fluids needs an infusion in
    // experienced hands, which EMS brings; the office repeats IM until then.
    expect(steps.some((s) => s.drug?.route === 'IV' && /epinephrine/i.test(s.drug.name))).toBe(
      false,
    );
    expect(steps.find((s) => s.text.startsWith('No pulse'))?.text).toContain('Epinephrine 1 mg IV');
    // Epinephrine first, 911 in parallel, and every case leaves for the ER.
    expect(steps[0]?.drug?.name).toBe('Epinephrine');
    expect(steps[0]?.drug?.device).toBe('auto-injector');
    expect(steps[1]?.text).toContain('calls 911');
    expect(steps.at(-1)?.text).toContain('goes to the ER');
  });

  it('anaphylaxis: the pen first, then the ampule (one pen on the cart)', () => {
    const steps = findProtocol('anaphylaxis')?.steps ?? [];
    const epiIdx = steps
      .map((s, i) => (s.drug?.name === 'Epinephrine' ? i : -1))
      .filter((i) => i >= 0);
    expect(epiIdx).toHaveLength(2);
    const [pen, ampule] = epiIdx.map((i) => steps[i]!);
    expect(pen?.text).toContain('Auvi-Q');
    expect(ampule?.text).toContain('from the ampule');
    expect(ampule?.text).toContain('NEVER 1 mg/ml IV');
    expect(ampule?.drug?.route).toBe('IM');
    expect(ampule?.drug?.syringeMl).toBe(3);
    expect(ampule?.drug?.concentration).toBe('1 mg/ml');
    expect(ampule?.drug?.drawTable?.[0]).toEqual({ label: '0.3 mg', ml: '0.3 ml' });
  });

  it('every IM epinephrine protocol gives the pen first, then the ampule', () => {
    for (const id of ['anaphylaxis', 'bronchospasm']) {
      const im = (findProtocol(id)?.steps ?? []).filter(
        (s) => s.drug?.name === 'Epinephrine' && s.drug.route === 'IM',
      );
      expect(im, id).toHaveLength(2);
      expect(im[0]?.drug?.device, id).toBe('auto-injector');
      expect(im[1]?.text, id).toContain('from the ampule');
      for (const step of im)
        expect(step.text, id).toContain('NEVER 1 mg/ml IV in a patient with a pulse');
    }
  });

  it('auto-injector callouts are IM epinephrine only and carry no draw instructions', () => {
    for (const drug of allCallouts().filter((d) => d.device === 'auto-injector')) {
      expect(drug.name).toBe('Epinephrine');
      expect(drug.route).toBe('IM');
      expect(drug.volume).toBeUndefined();
      expect(drug.syringeMl).toBeUndefined();
      expect(drug.drawTable).toBeUndefined();
    }
  });

  it('the Auvi-Q box says the pen talks the team through it (owner, Nov 2026)', () => {
    // The adult pen speaks its steps from the moment it leaves its case; the
    // AED step already says to follow its prompts.
    for (const drug of allCallouts().filter((d) => d.device === 'auto-injector')) {
      expect(drug.notes).toBe(
        'Auvi-Q talks you through it: pull off the red guard, press firmly into the outer thigh, hold 2 seconds; through clothing is fine',
      );
    }
  });

  it('the hyperventilation check links to the three pages it names (owner, Nov 2026)', () => {
    const step = findProtocol('hyperventilation')?.steps.find((s) =>
      s.text.includes('it is not anxiety'),
    );
    expect(step?.text).toContain('(see Hypoventilation, Bronchospasm, Angina)');
    expect(step?.goTo).toEqual(['hypoventilation', 'bronchospasm', 'angina']);
  });

  it('laryngospasm links to what can follow its succinylcholine (owner, Nov 2026)', () => {
    // Malignant hyperthermia can follow succinylcholine, and the atropine for
    // a slow heart rate after it is drawn on the bradycardia page.
    expect(findProtocol('laryngospasm')?.relatedProtocols).toEqual([
      'hypoventilation',
      'npa',
      'lma',
      'malignant_hyperthermia',
      'bradycardia',
    ]);
  });

  it('phenylephrine says when it may be repeated, like the other pressors (owner, Nov 2026)', () => {
    const phenylephrine = findProtocol('hypotension')?.steps.find(
      (s) => s.drug?.name === 'Phenylephrine',
    );
    expect(phenylephrine?.drug?.notes).toBe(
      'repeat q2-3 min if SBP still under 90; expect the heart rate to slow',
    );
  });

  it('every step that leaves its guideline says so, and is approved here by name (owner, Nov 2026)', () => {
    // A step that departs from its governing guideline says "office" in its
    // text, and is added below only once the owner has approved it with the
    // evidence in front of him. A new one fails here until then, and the
    // yearly evidence review (CLAUDE.md) re-checks every one listed.
    const departures = EMERGENCY_PROTOCOLS.flatMap((p) =>
      p.steps.filter((s) => /\boffice\b/i.test(s.text)).map((s) => `${p.id}: ${s.text}`),
    );
    expect(departures).toEqual([
      'hyperventilation: Not settling after 10 min: Midazolam IV slowly (office protocol)',
      'bradycardia: Atropine not working: Push-dose Epinephrine (office bridge to EMS; AHA uses pacing or an infusion)',
    ]);
  });

  it('reversal agents state the stocked concentration', () => {
    const flumazenil = allCallouts().find((d) => d.name === 'Flumazenil');
    expect(flumazenil?.concentration).toContain('0.1 mg/ml');
    const naloxone = allCallouts().find((d) => d.name === 'Naloxone');
    expect(naloxone?.concentration).toBe('0.4 mg/ml');
    // Owner's ACLS-trained protocol: 0.4 mg per vial, up to 2 mg drawn.
    const twoMg = naloxone?.drawTable?.find((r) => r.label.startsWith('2 mg'));
    expect(twoMg?.ml).toBe('5.0 ml');
    expect(flumazenil?.notes).toContain('repeat 0.2 mg every 1 min');
    expect(flumazenil?.notes).toContain('max 1.0 mg');
  });

  it('both oversedation protocols open with the airway and give naloxone first when both drugs were used', () => {
    for (const id of ['oversedation_benzo', 'oversedation_opioid']) {
      const steps = findProtocol(id)?.steps ?? [];
      expect(steps[0]?.text, id).toBe('Stop sedatives. N₂O off, 100% O₂');
      expect(
        steps.some((s) => s.text.includes('Naloxone first')),
        id,
      ).toBe(true);
      expect(steps.at(-1)?.text, id).toContain('watch');
    }
  });

  it('both rhythm cardiac lidocaine callouts carry the identical weight table', () => {
    // The intra-arterial callout uses a fixed 20-100 mg range, not the weight table.
    const lidos = allCallouts().filter((d) => d.name === 'Cardiac Lidocaine' && d.route === 'IV');
    expect(lidos.length).toBe(2);
    const tables = lidos.map((d) => JSON.stringify(d.drawTable));
    expect(tables[0]).toBeDefined();
    expect(new Set(tables).size).toBe(1);
    expect(tables[0]).toContain('150 lb');
  });

  it('adenosine maps the 12 mg escalation dose to its volume', () => {
    const adenosine = allCallouts().find((d) => d.name === 'Adenosine');
    const row = adenosine?.drawTable?.find((r) => r.label.includes('12 mg'));
    expect(row?.ml).toBe('4.0 ml');
  });

  it('seizure carries no IV-diazepam callout but keeps the knowledge in step text', () => {
    // Owner confirmation 2026-08: no IV diazepam is stocked — midazolam is
    // the office agent. A structured callout with draw volumes would point
    // at a drug that isn't in the building.
    const proto = findProtocol('seizure');
    expect(proto?.steps.some((s) => s.drug?.name === 'Diazepam')).toBe(false);
    expect(proto?.steps.some((s) => s.text.includes('diazepam'))).toBe(true);
    expect(proto?.steps.some((s) => s.drug?.name === 'Midazolam')).toBe(true);
  });

  it('intra-arterial follows the DOCS manual: needle stays in, plain lidocaine into the artery, hospital', () => {
    const steps = findProtocol('intraarterial')?.steps ?? [];
    const drug = steps.find((s) => s.drug)?.drug;
    expect(drug?.name).toBe('Cardiac Lidocaine');
    expect(drug?.dose).toBe('20-100 mg');
    expect(drug?.route).toBe('IA');
    expect(drug?.notes).toContain('never with epinephrine');
    expect(steps.some((s) => s.text.startsWith('Drug given: LEAVE NEEDLE IN PLACE'))).toBe(true);
    expect(steps.some((s) => /ice/i.test(s.text))).toBe(false);
    expect(steps.at(-1)?.text).toContain('Accompany the patient');
  });

  it('MH and LAST name the unstocked rescue drugs in text only (owner decision 2026-11)', () => {
    // Dantrolene and 20% lipid are not stocked; a callout would point the
    // team at a drug the cart does not carry, so EMS is named instead.
    const mh = findProtocol('malignant_hyperthermia');
    expect(mh?.steps.some((s) => s.drug?.name === 'Dantrolene')).toBe(false);
    expect(mh?.steps.some((s) => s.text.includes('Dantrolene not stocked'))).toBe(true);
    expect(mh?.steps.some((s) => s.text.includes('MALIGNANT HYPERTHERMIA'))).toBe(true);
    const last = findProtocol('last');
    expect(last?.steps.some((s) => /lipid/i.test(s.drug?.name ?? ''))).toBe(false);
    expect(last?.steps.some((s) => s.text.includes('Lipid emulsion 20% not stocked'))).toBe(true);
    // Lidocaine is the toxin: it must never be the antiarrhythmic here.
    expect(last?.steps.some((s) => s.text.includes('NO lidocaine'))).toBe(true);
    expect(last?.steps.find((s) => s.drug)?.drug?.name).toBe('Midazolam');
  });

  it('hypoglycemia carries no glucagon callout but keeps the knowledge in step text', () => {
    // Owner decision 2026-08: glucagon is deliberately not stocked (IV
    // office — immediate access + D50W is the no-IV branch). A structured
    // callout would point the clinician at a drug the cart doesn't carry.
    const proto = findProtocol('hypoglycemia');
    expect(proto?.steps.some((s) => s.drug?.name === 'Glucagon')).toBe(false);
    expect(proto?.steps.some((s) => s.text.includes('Glucagon'))).toBe(true);
  });

  it('dexamethasone callouts quote both concentrations with in-office stock first', () => {
    const dexCallouts = allCallouts().filter((d) => d.name === 'Dexamethasone');
    expect(dexCallouts.length).toBeGreaterThan(0);
    for (const callout of dexCallouts) {
      const conc = callout.concentration ?? '';
      expect(conc).toContain('4 mg/ml');
      expect(conc).toContain('10 mg/ml');
      expect(conc.indexOf('4 mg/ml')).toBeLessThan(conc.indexOf('10 mg/ml'));
    }
  });

  describe('2025 AHA adult ALS alignment', () => {
    const textOf = (id: string) => (findProtocol(id)?.steps ?? []).map((st) => st.text).join(' | ');

    it('every tachycardia protocol escalates an unstable patient to 911 first', () => {
      // The office AED cannot deliver synchronized cardioversion.
      for (const id of ['junctional_tach', 'svt', 'afib', 'stable_vtach', 'wide_complex']) {
        const first = findProtocol(id)?.steps[0];
        expect(first?.text, id).toMatch(/^Unstable .*Call 911/);
        expect(first?.severity, id).toBe('critical');
      }
    });

    it('lidocaine is the alternative to amiodarone, never an add-on', () => {
      for (const p of EMERGENCY_PROTOCOLS) {
        for (const st of p.steps) {
          if (st.drug?.name !== 'Cardiac Lidocaine' || p.id === 'intraarterial') continue;
          expect(st.text, p.id).toMatch(/^If amiodarone unavailable/);
        }
      }
    });

    it("arrest protocols put Hypoxia and sedative Toxins in the H's and T's", () => {
      for (const id of ['vfib_vtach', 'pea_asystole']) {
        expect(textOf(id), id).toContain('Hypoxia');
        expect(textOf(id), id).toMatch(/Toxins|Toxins first/);
      }
    });

    it('atropine is 1 mg wherever it appears (AHA 2025)', () => {
      const atropines = allCallouts().filter((d) => d.name === 'Atropine');
      expect(atropines.length).toBeGreaterThan(0);
      for (const d of atropines) expect(d.dose).toBe('1 mg');
    });

    it('lidocaine second dose is half the first in arrest and stable VT', () => {
      for (const id of ['vfib_vtach', 'stable_vtach']) {
        const lido = findProtocol(id)?.steps.find((st) => st.drug?.name === 'Cardiac Lidocaine');
        expect(lido?.drug?.notes, id).toContain('second dose 0.3 mg/lb');
      }
    });

    it('SVT uses the modified Valsalva and 6 mg then 12 mg adenosine', () => {
      const svt = textOf('svt');
      expect(svt).toContain('Modified Valsalva');
      expect(svt).not.toMatch(/Carotid Massage/);
      expect(svt).toContain('6 mg, then 12 mg after 1-2 minutes');
    });
  });

  // Owner-approved after the Nov 2026 protocol review: each of these closed a
  // path where a team reading top to bottom reached a dead end, or reached a
  // drug before the step that should have sent them elsewhere.
  describe('exits and escalation (review, Nov 2026)', () => {
    const stepsOf = (id: string) => findProtocol(id)?.steps ?? [];
    const indexOf = (id: string, includes: string) =>
      stepsOf(id).findIndex((s) => s.text.includes(includes));
    const ARREST_PAGES = ['vfib_vtach', 'pea_asystole'];

    it('hypoventilation calls 911 when reversal has not ended the need for the BVM', () => {
      const at = indexOf('hypoventilation', 'Still needs the BVM after reversal');
      const step = stepsOf('hypoventilation')[at];
      expect(step?.text).toBe('Still needs the BVM after reversal, or not waking: Call 911');
      expect(step?.severity).toBe('critical');
      expect(at).toBeGreaterThan(indexOf('hypoventilation', 'Reverse:'));
      expect(at).toBeLessThan(indexOf('hypoventilation', 'No pulse'));
    });

    it('both oversedation protocols call 911 and check the pulse before the watch step', () => {
      for (const [id, reversal] of [
        ['oversedation_opioid', 'Naloxone'],
        ['oversedation_benzo', 'Flumazenil'],
      ] as const) {
        const steps = stepsOf(id);
        const call = indexOf(id, 'Still needs the BVM after reversal');
        expect(steps[call]?.text, id).toBe(
          'Still needs the BVM after reversal, or you cannot ventilate: Call 911',
        );
        expect(steps[call]?.severity, id).toBe('critical');
        expect(call, id).toBeGreaterThan(steps.findIndex((s) => s.drug?.name === reversal));
        const pulse = steps[call + 1];
        expect(pulse?.text, id).toBe('No pulse: start CPR (Cardiac Arrest protocol)');
        expect(pulse?.goTo, id).toEqual(ARREST_PAGES);
        expect(call + 1, id).toBeLessThan(steps.length - 1);
      }
    });

    it('severe bronchospasm calls 911 with the pen and sends hives to anaphylaxis', () => {
      const steps = stepsOf('bronchospasm');
      const pen = steps.findIndex((s) => s.drug?.device === 'auto-injector');
      const call = steps[pen + 1];
      expect(call?.text).toBe(
        'At the same time: DA calls 911. Hives or swelling: go to Anaphylaxis',
      );
      expect(call?.goTo).toEqual(['anaphylaxis']);
      expect(call?.severity).toBe('critical');
      // The milder patient still has the later, conditional call.
      expect(indexOf('bronchospasm', 'Not clearly better after the first albuterol round')).toBe(
        steps.findIndex((s, i) => i > pen + 1 && /911/.test(s.text)),
      );
    });

    it('the shockable arrest page has a way out when the AED advises no shock', () => {
      const steps = stepsOf('vfib_vtach');
      const shock = indexOf('vfib_vtach', 'AED: shock when advised');
      const none = steps[shock + 1];
      expect(none?.text).toBe(
        'AED says no shock: CPR for 2 minutes, Epinephrine now, go to PEA / Asystole',
      );
      expect(none?.goTo).toEqual(['pea_asystole']);
      expect(none?.severity).toBe('critical');
      expect(shock + 1).toBeLessThan(indexOf('vfib_vtach', 'After 2nd shock'));
    });

    it('hypertensive crisis sends stroke signs to Stroke before any BP drug', () => {
      const steps = stepsOf('hypertensive_crisis');
      const stroke = steps.findIndex((s) => s.goTo?.includes('stroke'));
      const firstDrug = steps.findIndex((s) => s.drug !== undefined);
      expect(steps[stroke]?.text).toBe(
        'One-sided weakness, face droop or slurred speech: go to Stroke, no BP drug',
      );
      expect(steps[stroke]?.severity).toBe('critical');
      expect(stroke).toBeGreaterThan(indexOf('hypertensive_crisis', 'Call 911'));
      expect(stroke).toBeLessThan(firstDrug);
      // One stroke exit, read before the drug; the chest-pain exit stays where it was.
      expect(steps.filter((s) => s.goTo?.includes('stroke'))).toHaveLength(1);
      const mi = steps.findIndex((s) => s.goTo?.includes('mi'));
      expect(steps[mi]?.text).toBe('Chest pain: go to MI');
      expect(mi).toBeGreaterThan(firstDrug);
    });

    it('the ventricular tachycardia pages check the pulse and lead to CPR and the AED', () => {
      for (const id of ['stable_vtach', 'wide_complex']) {
        const steps = stepsOf(id);
        const pulse = steps.findIndex((s) => s.text === 'No pulse: CPR + AED');
        expect(pulse, id).toBe(1);
        expect(steps[pulse]?.goTo, id).toEqual(ARREST_PAGES);
        expect(steps[pulse]?.severity, id).toBe('critical');
      }
    });

    it('junctional tachycardia turns sinus tachycardia away and is treated as SVT, as ACLS does (owner, Nov 2026)', () => {
      const proto = findProtocol('junctional_tach');
      expect(proto?.summary).toBe(
        'Regular narrow tachycardia with no P wave before the QRS (or an upside-down P), HR 100-180 · Treat as SVT; 911',
      );
      expect(proto?.signs).toContain('no P waves or inverted P waves');
      const steps = proto?.steps ?? [];
      const sinus = steps.findIndex((s) => s.goTo?.includes('sinus_tach'));
      expect(steps[sinus]?.text).toBe(
        'Normal P wave before every QRS: this is sinus tachycardia, go to Sinus Tachycardia',
      );
      const svt = steps.findIndex((s) => s.goTo?.includes('svt'));
      expect(steps[svt]?.text).toBe(
        'Regular and narrow: treat as SVT (vagal maneuvers, then adenosine)',
      );
      expect(sinus).toBeGreaterThan(0);
      expect(sinus).toBeLessThan(svt);
      // ACLS treats a regular narrow tachycardia with vagal maneuvers and
      // adenosine; amiodarone is not its step.
      expect(steps.some((s) => s.drug !== undefined)).toBe(false);
    });

    it('an unconscious hypoglycemic patient gets 911 with the dextrose, not after it', () => {
      const dextrose = stepsOf('hypoglycemia').find((s) => s.drug?.name === 'D50W');
      expect(dextrose?.text).toBe('Not awake: Call 911. Nothing by mouth. D50W IV');
      expect(dextrose?.severity).toBe('critical');
    });

    it('the dextrose is the prefilled syringe: nothing to draw, and a slow push', () => {
      // Owner, Nov 2026: the vial is gone from the plan, and with it the 60 ml
      // syringe that is also the King LT cuff syringe.
      const d50 = allCallouts().find((d) => d.name === 'D50W');
      expect(d50?.device).toBe('prefilled-syringe');
      expect(d50?.volume).toBe('50 ml (whole syringe)');
      expect(d50?.syringeMl).toBeUndefined();
      expect(d50?.notes).toContain('prefilled syringe');
      expect(d50?.notes).toContain('push slowly');
      expect(d50?.notes).not.toMatch(/vial|60/);
    });
  });

  // Owner-approved, Nov 2026. Same aim as the block above: nothing here
  // changes a drug choice. The rows that name vial counts are held to the
  // inventory by a tripwire in the app's own tests.
  describe('Priority B (review, Nov 2026)', () => {
    const stepsOf = (id: string) => findProtocol(id)?.steps ?? [];
    const indexOf = (id: string, includes: string) =>
      stepsOf(id).findIndex((s) => s.text.includes(includes));
    const drugAt = (id: string, name: string) => stepsOf(id).find((s) => s.drug?.name === name);
    const ARREST_PAGES = ['vfib_vtach', 'pea_asystole'];
    // The pulse pages that give amiodarone, as ACLS does for a stable wide
    // tachycardia. AF and junctional left it in Nov 2026 (owner).
    const STABLE_RHYTHM_PAGES = ['stable_vtach', 'wide_complex'];

    it('naloxone: the 2 mg row says what it takes, and which syringe', () => {
      const naloxone = drugAt('oversedation_opioid', 'Naloxone')?.drug;
      expect(naloxone?.drawTable?.[1]?.label).toMatch(/^2 mg \(five 1 ml vials, \d+ stocked\)$/);
      expect(naloxone?.notes).toContain('10 ml syringe for the 2 mg dose');
    });

    it('hypoventilation has a branch for a bag that moves no air, and links to both reversal pages', () => {
      const steps = stepsOf('hypoventilation');
      const bag = indexOf('hypoventilation', 'BVM, 1 breath every 6 seconds');
      expect(steps[bag + 1]?.text).toBe(
        'BVM not moving the chest: reposition, NPA, then LMA or King. Crowing or no air movement: Laryngospasm',
      );
      expect(steps[bag + 1]?.goTo).toEqual(['npa', 'lma', 'king_lt', 'laryngospasm']);
      // Opioid first, as the pages themselves give naloxone first.
      expect(steps[indexOf('hypoventilation', 'Reverse:')]?.goTo).toEqual([
        'oversedation_opioid',
        'oversedation_benzo',
      ]);
    });

    it('the LMA and King pages call 911 first', () => {
      for (const id of ['lma', 'king_lt']) {
        expect(stepsOf(id)[0]?.text, id).toBe('DA calls 911 if not already called');
        expect(stepsOf(id)[0]?.severity, id).toBe('critical');
      }
    });

    it('sinus tachycardia starts at 100 and sends a sudden or very fast rhythm to SVT', () => {
      const proto = findProtocol('sinus_tach');
      expect(proto?.name).toBe('Sinus Tachycardia (HR over 100)');
      expect(proto?.summary).toBe(
        'HR over 100 with a normal P wave before every QRS, usually a response to pain, anxiety or low fluids · Treat the cause',
      );
      expect(proto?.signs).toContain('HR >100');
      expect(proto?.signs).not.toContain('HR >150');
      const svt = proto?.steps.find((s) => s.goTo?.includes('svt'));
      expect(svt?.text).toBe('Sudden onset or HR over 150: go to SVT');
    });

    it('the stable rhythm pages call 911 before the drug, not after it', () => {
      for (const id of STABLE_RHYTHM_PAGES) {
        const steps = stepsOf(id);
        const call = steps.findIndex((s) => s.text === 'Call 911');
        const drug = steps.findIndex((s) => s.drug?.name === 'Amiodarone');
        expect(call, id).toBeGreaterThan(0);
        expect(call, id).toBe(drug - 1);
        expect(
          steps.filter((s) => s.text === 'Call 911'),
          id,
        ).toHaveLength(1);
      }
    });

    it('atrial fibrillation gives no drug in the office: monitor and 911 (owner, Nov 2026)', () => {
      // ACLS and the 2023 ACC/AHA AF guideline start with rate control, which
      // is not stocked; amiodarone can convert AF of unknown age and release a
      // clot. An unstable patient needs a synchronized shock, which is EMS's.
      const proto = findProtocol('afib');
      expect(proto?.summary).toBe(
        'Irregular HR, palpitations, hypotension · Stable: monitor, 911. Unstable: 911 for a synchronized shock',
      );
      expect(proto?.steps.some((s) => s.drug !== undefined)).toBe(false);
      expect(proto?.contraindications ?? []).toEqual([]);
      expect(proto?.steps.map((s) => s.text)).toContain('Call 911');
    });

    it('amiodarone over ten minutes says how: a third of a millilitre a minute', () => {
      for (const id of STABLE_RHYTHM_PAGES) {
        expect(drugAt(id, 'Amiodarone')?.drug?.notes, id).toContain(
          'give over 10 minutes: 0.3 ml every minute into the running D5W; keep the D5W running freely; check BP each minute and stop if SBP falls',
        );
      }
      // The arrest dose is still a push.
      expect(drugAt('vfib_vtach', 'Amiodarone')?.drug?.notes).toContain('IV PUSH');
    });

    it('amiodarone with a pulse goes into a D5W kept running freely (owner, Nov 2026)', () => {
      // Undiluted amiodarone irritates a hand vein; an open drip carries
      // each 0.3 ml in diluted. Its label mixes it only in D5W.
      for (const id of STABLE_RHYTHM_PAGES) {
        expect(drugAt(id, 'Amiodarone')?.drug?.notes, id).toContain('keep the D5W running freely');
      }
    });

    it('amiodarone is drawn in the 3 ml syringe, whose 0.1 ml marks every 0.3 ml push lands on (owner, Nov 2026)', () => {
      for (const id of [...STABLE_RHYTHM_PAGES, 'vfib_vtach']) {
        expect(drugAt(id, 'Amiodarone')?.drug?.syringeMl, id).toBe(3);
      }
    });

    it('adenosine: the flush is drawn before the push', () => {
      const notes = drugAt('svt', 'Adenosine')?.drug?.notes ?? '';
      expect(notes).toContain('draw the 20 ml NS flush BEFORE the push');
      expect(notes).toContain('then the flush right away and raise the arm');
    });

    it('adenosine goes in at the port nearest the patient, with the line pinched above it', () => {
      // ACLS technique: a push into a port far up the line, or one that can
      // run back up the tubing, loses a drug that lasts under 10 seconds.
      expect(drugAt('svt', 'Adenosine')?.drug?.notes).toContain(
        'use the port nearest the patient; pinch the tubing above it, push in 1-2 seconds',
      );
    });

    it('diphenhydramine IV and Solu-Medrol say how fast to push them (their labels)', () => {
      // Diphenhydramine: no faster than 25 mg a minute. Solu-Medrol: IV over
      // several minutes; fast large doses have caused arrhythmias.
      expect(drugAt('anaphylaxis', 'Diphenhydramine')?.drug?.notes).toBe(
        'IV: push over 2 minutes; label the syringe',
      );
      for (const id of ['anaphylaxis', 'bronchospasm']) {
        expect(drugAt(id, 'Methylprednisolone (Solu-Medrol)')?.drug?.notes, id).toContain(
          'push over several minutes',
        );
      }
    });

    it('dexamethasone warns an awake patient about the brief groin burning a fast push can cause (owner, Nov 2026)', () => {
      // On the label, and harmless, but frightening when it comes unannounced.
      for (const id of ['anaphylaxis', 'bronchospasm']) {
        expect(drugAt(id, 'Dexamethasone')?.drug?.notes, id).toBe(
          'warn an awake patient that a fast push can briefly burn or tingle in the groin; label the syringe',
        );
      }
    });

    it('lidocaine with a pulse goes in over minutes; in an arrest it stays a push', () => {
      const stable = drugAt('stable_vtach', 'Cardiac Lidocaine');
      expect(stable?.text).toBe(
        'If amiodarone unavailable: Cardiac Lidocaine IV over 2-3 minutes; second dose is half',
      );
      expect(stable?.drug?.notes).toMatch(/^no faster than 50 mg \(2\.5 ml\) per minute;/);
      expect(drugAt('vfib_vtach', 'Cardiac Lidocaine')?.text).toContain('IV push');
    });

    it('arrest epinephrine is flushed in', () => {
      for (const id of ARREST_PAGES) {
        expect(drugAt(id, 'Epinephrine')?.drug?.notes, id).toBe(
          'draw the entire 1 ml ampule; push, then a 20 ml saline flush and raise the arm for 10-20 seconds; repeat q3-5 min; label the syringe',
        );
      }
    });

    it('every arrest push is followed by 20 ml and a raised arm, as ACLS teaches', () => {
      // The flush is a volume, not a time: ten to twenty seconds wide open
      // through the practice's 22 gauge (35 ml/min) gives only 6 to 12 ml.
      const FLUSH = 'then a 20 ml saline flush and raise the arm for 10-20 seconds';
      for (const id of ARREST_PAGES) {
        expect(drugAt(id, 'Epinephrine')?.drug?.notes, id).toContain(FLUSH);
      }
      for (const name of ['Amiodarone', 'Cardiac Lidocaine']) {
        expect(drugAt('vfib_vtach', name)?.drug?.notes, name).toContain(FLUSH);
      }
      // LAST changes the drugs and doses, not how a drug reaches the heart
      // during CPR, so its small epinephrine doses are flushed in the same way.
      expect(drugAt('last', 'Push-dose Epinephrine')?.drug?.notes).toBe(
        'push, then a 20 ml saline flush and raise the arm for 10-20 seconds; never the 1 mg ampule undiluted',
      );
      expect(drugAt('vfib_vtach', 'Amiodarone')?.drug?.notes).toMatch(/^IV PUSH, then a 20 ml/);
      expect(JSON.stringify(EMERGENCY_PROTOCOLS)).not.toContain('wide open for 10-20 seconds');
    });

    it('first-ever chest pain is 911 before the nitroglycerin trial', () => {
      const steps = stepsOf('angina');
      const first = indexOf('angina', 'No history of angina');
      expect(steps[first]?.text).toBe(
        'No history of angina, or sweating, nausea or short of breath: Call 911 now, go to MI',
      );
      expect(steps[first]?.goTo).toEqual(['mi']);
      expect(steps[first]?.severity).toBe('critical');
      expect(first).toBe(steps.findIndex((s) => s.drug?.name === 'Nitroglycerin') - 1);
    });

    it('hypertensive crisis says who must not get labetalol, before the step that gives it', () => {
      expect(findProtocol('hypertensive_crisis')?.contraindications).toEqual([
        'Labetalol: asthma or COPD, HR under 60, heart block, heart failure. Use hydralazine instead',
      ]);
    });

    it('bradycardia checks the pulse after ventilating', () => {
      const steps = stepsOf('bradycardia');
      const pulse = steps[indexOf('bradycardia', 'Ventilate first') + 1];
      expect(pulse?.text).toBe('Check the pulse. No pulse: CPR + AED');
      expect(pulse?.goTo).toEqual(['pea_asystole', 'vfib_vtach']);
      expect(pulse?.severity).toBe('critical');
    });

    it('LAST gives "small" a number and a syringe', () => {
      const step = stepsOf('last').find((s) => s.text.startsWith('Arrhythmia or arrest'));
      expect(step?.text).toBe(
        'Arrhythmia or arrest: CPR, AED, small epinephrine doses (1 mcg/kg or less, not the 1 mg ampule). NO lidocaine as the antiarrhythmic',
      );
      expect(step?.goTo).toEqual(ARREST_PAGES);
      expect(step?.drug?.name).toBe('Push-dose Epinephrine');
      expect(step?.drug?.concentration).toBe('10 mcg/ml (after dilution)');
      // The same recipe the bradycardia page mixes, so the team learns one.
      expect(step?.drug?.mixFirst).toBe(
        drugAt('bradycardia', 'Push-dose Epinephrine')?.drug?.mixFirst,
      );
      expect(step?.drug?.drawTable).toEqual([
        { label: '110 lb (50 mcg)', ml: '5.0 ml' },
        { label: '155 lb (70 mcg)', ml: '7.0 ml' },
        { label: '220 lb (100 mcg)', ml: '10.0 ml' },
      ]);
    });

    it('LAST: the lipid line says who has it', () => {
      expect(indexOf('last', 'Lipid emulsion 20% not stocked')).toBeGreaterThan(-1);
      expect(
        stepsOf('last').some(
          (s) =>
            s.text ===
            'Lipid emulsion 20% not stocked: EMS or the hospital gives it. Tell 911 and the crew LAST so it is ready',
        ),
      ).toBe(true);
    });

    it('dexamethasone rows say how many vials the draw takes', () => {
      const callouts = allCallouts().filter((d) => d.name === 'Dexamethasone');
      expect(callouts).toHaveLength(2);
      for (const callout of callouts) {
        expect(callout.drawTable?.slice(0, 2)).toEqual([
          { label: '4 mg/ml: 8 mg (two 1 ml vials)', ml: '2.0 ml' },
          { label: '4 mg/ml: 12 mg (three 1 ml vials)', ml: '3.0 ml' },
        ]);
      }
    });

    it('hypoglycemia: a repeat needs a second dose on hand', () => {
      expect(
        stepsOf('hypoglycemia').some(
          (s) =>
            s.text ===
            'Recheck glucose in 15 min. Still under 70: repeat if a second dose is on hand, otherwise Call 911',
        ),
      ).toBe(true);
    });

    it('seizure: glucose before the drug, and a route when there is no IV', () => {
      const steps = stepsOf('seizure');
      const iv = steps.findIndex((s) => s.drug?.name === 'Midazolam' && s.drug.route === 'IV');
      expect(steps[iv - 1]?.text).toBe(
        'Check glucose as soon as it is safe. Under 70: go to Hypoglycemia',
      );
      expect(steps[iv - 1]?.goTo).toEqual(['hypoglycemia']);
      const im = steps[iv + 1];
      expect(im?.text).toBe(
        'No IV (not started, or pulled out): Midazolam 10 mg IM into the outer thigh, once',
      );
      // AES 2016 / RAMPART: 10 mg IM for anyone over 40 kg, a single dose.
      expect(im?.drug).toMatchObject({
        name: 'Midazolam',
        dose: '10 mg',
        route: 'IM',
        syringeMl: 3,
        volume: '2.0 ml',
        concentration: '5 mg/ml',
      });
      expect(im?.drug?.notes).toContain('one dose only');
    });

    it('stroke with a low glucose gets dextrose, not the gel', () => {
      const step = stepsOf('stroke').find((s) => s.text.startsWith('Check glucose'));
      expect(step?.text).toBe(
        'Check glucose. Under 70: D50W IV, not the gel (it can look like a stroke)',
      );
      expect(step?.goTo).toEqual(['hypoglycemia']);
    });

    it('anaphylaxis names the two ways it kills: the airway and the arrest', () => {
      const steps = stepsOf('anaphylaxis');
      const monitor = indexOf('anaphylaxis', 'Monitor vitals continuously');
      expect(steps[monitor - 2]?.text).toBe(
        'Throat or tongue swelling, cannot ventilate: BVM 100% O₂, then LMA or King, then cricothyrotomy',
      );
      expect(steps[monitor - 2]?.goTo).toEqual(['lma', 'king_lt']);
      expect(steps[monitor - 1]?.text).toBe('No pulse: CPR + AED, Epinephrine 1 mg IV');
      expect(steps[monitor - 1]?.goTo).toEqual(ARREST_PAGES);
      const related = findProtocol('anaphylaxis')?.relatedProtocols ?? [];
      expect(related).toContain('lma');
      expect(related).toContain('pea_asystole');
    });
  });
});

describe('step drawings', () => {
  it("Larson's point is drawn on the one step that names the landmark", () => {
    const drawn = EMERGENCY_PROTOCOLS.flatMap((p) =>
      p.steps.filter((s) => s.figure !== undefined).map((s) => ({ protocol: p.id, step: s })),
    );
    expect(drawn.map((d) => d.protocol)).toEqual(['laryngospasm']);
    // The drawing's labels are these words, so the step has to keep them.
    for (const word of ['laryngospasm notch', "Larson's", 'earlobe', 'jaw', 'mastoid']) {
      expect(drawn[0]?.step.text, word).toContain(word);
    }
  });

  it('no other step mentions the landmark without the drawing', () => {
    for (const p of EMERGENCY_PROTOCOLS) {
      for (const s of p.steps) {
        if (/Larson/.test(s.text)) expect(s.figure, p.id).toBe('larsons-point');
      }
    }
  });
});

describe('second doses have rows of their own (owner, Nov 2026)', () => {
  // A logged dose comes from a table row, so a second dose that differs from
  // the first needs its own row, or the record shows the first dose twice.
  const drugAt = (id: string, name: string) =>
    findProtocol(id)?.steps.find((s) => s.drug?.name === name)?.drug;

  it('arrest amiodarone: 300 mg first, 150 mg second, each with its volume', () => {
    expect(drugAt('vfib_vtach', 'Amiodarone')?.drawTable).toEqual([
      { label: '300 mg (1st dose)', ml: '2 × 3.0 ml' },
      { label: '150 mg (2nd dose)', ml: '3.0 ml' },
    ]);
    // The step and the note already said so; the rows are the same numbers.
    expect(drugAt('vfib_vtach', 'Amiodarone')?.notes).toContain('second dose 150 mg (3.0 ml)');
  });

  it('arrest amiodarone says which syringes, and where the second dose comes from (owner, Nov 2026)', () => {
    const notes = drugAt('vfib_vtach', 'Amiodarone')?.notes ?? '';
    expect(notes).toContain('300 mg = two 3 ml syringes, one per vial, pushed one after the other');
    // Both 150 mg vials go into the first dose: the second comes from the large vial.
    expect(notes).toContain('a third 3 ml syringe drawn from the 900 mg/18 ml vial');
  });

  it('labetalol: the 40 mg repeat has its own row', () => {
    expect(drugAt('hypertensive_crisis', 'Labetalol')?.drawTable).toEqual([
      { label: '20 mg', ml: '4.0 ml' },
      { label: '40 mg (repeat)', ml: '8.0 ml' },
    ]);
  });
});
