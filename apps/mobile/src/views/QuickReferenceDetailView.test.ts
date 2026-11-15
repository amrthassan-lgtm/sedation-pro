import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import QuickReferenceDetailView from './QuickReferenceDetailView.vue';
import { useInventoryStatus } from '@/composables/useInventoryStatus';
import { protocolTitleHidden } from '@/composables/protocolTitle';
import { emergencySyringe, parseVolumeMl, syringeConfig } from '@/composables/useSyringeConfig';
import { EMERGENCY_PROTOCOLS, emergencySyringeTint, findProtocol } from '@sedation-pro/clinical';

function mountDetail(id: string) {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  const wrapper = mount(QuickReferenceDetailView, {
    props: { id },
    global: { plugins: [router] },
  });
  return Object.assign(wrapper, { router });
}

/** The inventory reads the clock once, when the page is built. */
function mountOn(day: string, id: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(`${day}T12:00:00Z`));
  const w = mountDetail(id);
  vi.useRealTimers();
  return w;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('QuickReferenceDetailView drug boxes', () => {
  it('puts route and strength under the name, and the dose with its volume on the right', () => {
    const wrapper = mountDetail('oversedation_benzo'); // Flumazenil 0.2 mg / 2.0 ml
    const box = wrapper
      .findAll('.drug-callout')
      .find((c) => c.find('.drug-name-text').text() === 'Flumazenil');
    expect(box?.find('.drug-dose').text()).toBe('0.2 mg');
    expect(box?.find('.drug-volume').text()).toBe('Draw 2.0 ml');
    expect(box?.find('.drug-sub').text()).toContain('0.1 mg/ml');
    expect(box?.find('.drug-sub').text()).not.toContain('2.0 ml');
    // The single dose has no row of its own: it would repeat the header.
    expect(box?.findAll('.drug-row').length).toBe(0);
    wrapper.unmount();
  });

  it('a volume with words in it keeps its row, and a prefilled syringe is given', () => {
    const w = mountDetail('hypoglycemia');
    const d50 = w.findAll('.drug-callout').find((c) => c.text().includes('D50W'))!;
    expect(d50.find('.drug-volume').exists()).toBe(false);
    expect(d50.find('.drug-row-value').text()).toBe('50 ml (whole syringe)');
    w.unmount();
  });

  it('emphasises the waste-down step inside a two-step MIX FIRST recipe', () => {
    const wrapper = mountDetail('hypotension'); // Phenylephrine
    const keys = wrapper.findAll('.drug-mix-key');
    expect(keys.length).toBe(1);
    expect(keys[0]!.text()).toBe('WASTE DOWN TO 1 ml');
    wrapper.unmount();
  });

  it('prints the MIX FIRST header as written, above what to draw', () => {
    const wrapper = mountDetail('bradycardia'); // Push-dose Epinephrine
    const mix = wrapper.find('.drug-mix');
    expect(mix.text()).toContain('MIX FIRST');
    const box = mix.element.parentElement;
    const children = [...(box?.children ?? [])].map((el) => el.className);
    expect(children.findIndex((c) => c.includes('drug-mix'))).toBeLessThan(
      children.findIndex((c) => c.includes('drug-body')),
    );
    wrapper.unmount();
  });

  it('lists one row per drawTable row', () => {
    const wrapper = mountDetail('hypotension'); // Atropine dual presentation
    const atropine = wrapper
      .findAll('.drug-callout')
      .find((t) => t.text().includes('1 mg/ml vial'));
    expect(atropine).toBeDefined();
    expect(atropine!.findAll('.drug-row').length).toBe(2);
    expect(atropine!.text()).toContain('10.0 ml'); // AHA 2025: 1 mg = whole prefilled syringe
    wrapper.unmount();
  });

  it('never says In stock: stock is shown only when it is a problem', () => {
    for (const id of ['anaphylaxis', 'vfib_vtach', 'hypotension']) {
      const w = mountDetail(id);
      expect(w.text(), id).not.toContain('In stock');
      w.unmount();
    }
  });
});

describe('QuickReferenceDetailView emergency actions', () => {
  it('shows a tel:911 banner only on protocols whose steps call 911', () => {
    const w = mountDetail('anaphylaxis');
    const link = w.find('a.call-911');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('tel:911');
    w.unmount();
    const quiet = mountDetail('phlebitis');
    expect(quiet.find('a.call-911').exists()).toBe(false);
    quiet.unmount();
  });

  it('two links in one step never read the same', () => {
    // Hypoventilation's Reverse step links both oversedation pages: the
    // short name alone would make two identical buttons.
    const w = mountDetail('hypoventilation');
    const labels = w.findAll('.step-link').map((l) => l.text());
    expect(labels).toContain('Go to Oversedation (Opioid) ›');
    expect(labels).toContain('Go to Oversedation (Benzodiazepine) ›');
    expect(labels).toContain('Go to Laryngospasm ›');
    expect(new Set(labels).size).toBe(labels.length);
    w.unmount();
  });

  it('a prefilled syringe says so, and a drawn one names its syringe', () => {
    const w = mountDetail('hypoglycemia');
    const dextrose = w
      .findAll('.drug-callout')
      .find((c) => c.find('.drug-name').text().startsWith('D50W'));
    expect(dextrose?.find('.drug-sub').text()).toContain('prefilled syringe');
    w.unmount();
    const drawn = mountDetail('oversedation_opioid');
    expect(drawn.find('.drug-sub').text()).not.toContain('prefilled');
    expect(drawn.find('.drug-sub').text()).toMatch(/\d+ ml syringe/);
    drawn.unmount();
  });

  it('the three during-sedation breathing pages carry the banner (review, Nov 2026)', () => {
    // Each now has a step that calls 911 when reversal has not ended the need for the BVM.
    for (const id of ['hypoventilation', 'oversedation_opioid', 'oversedation_benzo']) {
      const w = mountDetail(id);
      expect(w.find('a.call-911').exists(), id).toBe(true);
      w.unmount();
    }
  });

  it('puts Back to case in the toolbar on every protocol', () => {
    const w = mountDetail('seizure');
    expect(w.find('.toolbar-case').text()).toContain('Back to case');
    w.unmount();
  });
});

describe('useSyringeConfig', () => {
  it('rejects range volumes so the illustration never shows an arbitrary endpoint', () => {
    expect(parseVolumeMl('0.5-1.0 ml')).toBeNull();
  });

  it('parses annotated single volumes', () => {
    expect(parseVolumeMl('1.0 ml (0.4 mg)')).toBe(1.0);
    expect(parseVolumeMl('2.0 ml')).toBe(2.0);
  });

  it('reads the practice barrels from the formulary', () => {
    expect(syringeConfig('Flumazenil')?.capacityMl).toBe(3);
    expect(syringeConfig('Midazolam')?.capacityMl).toBe(1);
    expect(syringeConfig('Push-dose Epinephrine')).toBeNull();
    expect(syringeConfig('Naloxone')?.color).toBe('var(--color-danger)');
  });
});

describe('epinephrine syringe drawings', () => {
  const steps = findProtocol('anaphylaxis')?.steps ?? [];
  const epi = steps.filter((s) => s.drug?.name === 'Epinephrine').map((s) => s.drug!);
  const push = steps.find((s) => s.drug?.name === 'Push-dose Epinephrine')?.drug;

  it('draws none for the auto-injector, since nothing is drawn', () => {
    expect(epi[0]?.device).toBe('auto-injector');
    expect(emergencySyringe(epi[0]!)).toBeNull();
  });

  it('draws the ampule dose at its starting volume and names the top of the range', () => {
    const d = emergencySyringe(epi[1]!);
    expect(d).toMatchObject({ capacityMl: 3, drawnMl: 0.3, concentration: '1 mg/ml' });
    expect(d?.caption).toBe('Draw 0.3 ml (up to 0.5 ml)');
  });

  it('draws the push-dose mix filling its 10 ml syringe, with the push volume', () => {
    const d = emergencySyringe(push!);
    expect(d).toMatchObject({ capacityMl: 10, drawnMl: 10 });
    expect(d?.caption).toBe('Mixed 10.0 ml · push 1.0-2.0 ml');
  });

  it('the ampule is solid purple and the diluted mix is pale', () => {
    expect(emergencySyringe(epi[1]!)?.color).toBe('var(--color-purple)');
    expect(emergencySyringe(push!)?.color).toBe('var(--color-purple-pale)');
  });

  it('renders both drawings on the anaphylaxis card, and the tray drugs keep theirs', () => {
    const w = mountDetail('anaphylaxis');
    const captions = w.findAll('figure.syringe').map((n) => n.text());
    expect(captions.some((t) => t.includes('Draw 0.3 ml (up to 0.5 ml)'))).toBe(true);
    expect(captions.some((t) => t.includes('Mixed 10.0 ml'))).toBe(true);
    w.unmount();
  });
});

describe('syringe drawings for the other emergency drugs', () => {
  const callouts = EMERGENCY_PROTOCOLS.flatMap((p) =>
    p.steps.flatMap((s) => (s.drug === undefined ? [] : [{ protocol: p.id, drug: s.drug }])),
  );
  const drawingOf = (protocol: string, name: string) => {
    const hit = callouts.find((c) => c.protocol === protocol && c.drug.name === name);
    if (hit === undefined) throw new Error(`${protocol} has no ${name} callout`);
    return emergencySyringe(hit.drug);
  };

  it('every drug drawn into a syringe has a colour, from the tray or from its family', () => {
    for (const { protocol, drug } of callouts) {
      if (drug.syringeMl === undefined || drug.device !== undefined) continue;
      const colour =
        syringeConfig(drug.name)?.color ??
        emergencySyringeTint(drug.name, drug.mixFirst !== undefined);
      expect(colour, `${protocol}: ${drug.name}`).toBeDefined();
    }
  });

  it('no drawing shows more than its syringe holds', () => {
    for (const { protocol, drug } of callouts) {
      const d = emergencySyringe(drug);
      if (d === null) continue;
      expect(d.drawnMl, `${protocol}: ${drug.name}`).toBeGreaterThan(0);
      expect(d.drawnMl, `${protocol}: ${drug.name}`).toBeLessThanOrEqual(d.capacityMl);
    }
  });

  it('the two hypotension mixes fill their 10 ml syringe in pale purple', () => {
    for (const name of ['Ephedrine', 'Phenylephrine']) {
      const d = drawingOf('hypotension', name);
      expect(d, name).toMatchObject({
        capacityMl: 10,
        drawnMl: 10,
        color: 'var(--color-purple-pale)',
      });
    }
    expect(drawingOf('hypotension', 'Ephedrine')?.caption).toBe('Mixed 10.0 ml · push 0.5-1.0 ml');
    expect(drawingOf('hypotension', 'Phenylephrine')?.caption).toBe('Mixed 10.0 ml · push 1.0 ml');
  });

  it('succinylcholine is red at its starting volume, atropine is green', () => {
    expect(drawingOf('laryngospasm', 'Succinylcholine')).toMatchObject({
      capacityMl: 3,
      drawnMl: 1,
      color: 'var(--color-red)',
      caption: 'Draw 1.0 ml (up to 2.0 ml)',
    });
    expect(drawingOf('bradycardia', 'Atropine')).toMatchObject({
      capacityMl: 3,
      drawnMl: 1,
      color: 'var(--color-green)',
      caption: 'Draw 1.0 ml (vial)',
    });
  });

  it('the arrest dose of amiodarone is drawn at twice the 150 mg dose', () => {
    expect(drawingOf('afib', 'Amiodarone')).toMatchObject({ drawnMl: 3, caption: 'Draw 3.0 ml' });
    expect(drawingOf('vfib_vtach', 'Amiodarone')).toMatchObject({
      drawnMl: 6,
      caption: 'Draw 6.0 ml',
    });
  });

  it('dexamethasone is drawn for the stocked strength, never from the other strength in its table', () => {
    expect(drawingOf('anaphylaxis', 'Dexamethasone')).toMatchObject({
      drawnMl: 2,
      caption: 'Draw 2.0 ml (up to 3.0 ml)',
    });
  });

  it('a dose by weight has no drawing: no single volume is right for every patient', () => {
    expect(drawingOf('stable_vtach', 'Cardiac Lidocaine')).toBeNull();
    expect(drawingOf('vfib_vtach', 'Cardiac Lidocaine')).toBeNull();
    expect(drawingOf('intraarterial', 'Cardiac Lidocaine')?.caption).toBe(
      'Draw 1.0 ml (up to 5.0 ml)',
    );
  });

  it('the prefilled dextrose has none: nothing is drawn', () => {
    expect(drawingOf('hypoglycemia', 'D50W')).toBeNull();
  });
});

describe('step drawings', () => {
  it("draws Larson's point under its step on the laryngospasm page, once", () => {
    const w = mountDetail('laryngospasm');
    const figures = w.findAll('svg.figure');
    expect(figures.length).toBe(1);
    expect(figures[0]!.text()).toContain('Laryngospasm');
    const step = figures[0]!.element.closest('.step');
    expect(step?.querySelector('.step-text')?.textContent).toContain("Larson's");
    w.unmount();
  });

  it('draws the auto-injector inside its callout on both pages that use it', () => {
    for (const id of ['anaphylaxis', 'bronchospasm']) {
      const w = mountDetail(id);
      const figures = w.findAll('svg.figure');
      expect(figures.length, id).toBe(1);
      expect(figures[0]!.text(), id).toContain('Red guard off');
      const callout = figures[0]!.element.closest('.drug-callout');
      expect(callout?.textContent, id).toContain('pull off the red guard');
      expect(callout?.textContent, id).toContain('hold 2 seconds');
      w.unmount();
    }
  });

  it('a page with neither has no drawing', () => {
    const w = mountDetail('seizure');
    expect(w.find('svg.figure').exists()).toBe(false);
    w.unmount();
  });
});

describe('logging from the page', () => {
  it('locked: no pill and no stamp, and one row that says why with an Unlock pill', () => {
    for (const id of ['anaphylaxis', 'vfib_vtach', 'seizure', 'oversedation_opioid']) {
      const w = mountDetail(id);
      expect(w.find('.log-pills').exists(), id).toBe(false);
      expect(w.find('.log-stamps').exists(), id).toBe(false);
      expect(w.find('.log-gate').text(), id).toContain('No case is open');
      expect(w.find('.log-unlock').text(), id).toBe('Unlock');
      w.unmount();
    }
  });

  it('the old "Give and log" card is gone from the top of every page', () => {
    for (const id of ['oversedation_benzo', 'oversedation_opioid', 'hypoventilation']) {
      const w = mountDetail(id);
      expect(w.find('.give-card').exists(), id).toBe(false);
      w.unmount();
    }
  });

  it('Unlock shows the pills, says whose case they log to, and stays unlocked on the next page', async () => {
    const w = mountDetail('anaphylaxis');
    await w.find('.log-unlock').trigger('click');
    expect(w.find('.log-gate').exists()).toBe(false);
    expect(w.find('.log-status').text()).toBe('Logging to a new case on this tablet');
    expect(w.findAll('.log-pills .ui-drug-btn').length).toBeGreaterThan(5);
    expect(w.findAll('.log-stamps .ui-drug-btn').length).toBeGreaterThan(0);
    await w.setProps({ id: 'vfib_vtach' });
    expect(w.find('.log-gate').exists()).toBe(false);
    expect(w.findAll('.log-pills .ui-drug-btn').length).toBeGreaterThan(0);
    w.unmount();
    // A page opened afresh (Emergency, then the list, then another protocol)
    // is a new component on the same store: still unlocked.
    const next = mount(QuickReferenceDetailView, {
      props: { id: 'bradycardia' },
      global: { plugins: [w.router] },
    });
    expect(next.find('.log-gate').exists()).toBe(false);
    expect(next.findAll('.log-pills .ui-drug-btn').length).toBeGreaterThan(0);
    next.unmount();
  });

  it('911 called and EMS arrived sit under the Call 911 card; CPR and shocks stay in their steps', async () => {
    const w = mountDetail('vfib_vtach');
    await w.find('.log-unlock').trigger('click');
    const help = w
      .find('.help .log-stamps')
      .findAll('.ui-drug-btn-dose')
      .map((d) => d.text());
    expect(help).toEqual(['911 called', 'EMS arrived']);
    const inSteps = w.findAll('.steps-card .log-stamps .ui-drug-btn-dose').map((d) => d.text());
    expect(inSteps).toContain('CPR started');
    expect(inSteps).toContain('Shock given');
    expect(inSteps).not.toContain('911 called');
    expect(inSteps).not.toContain('EMS arrived');
    w.unmount();
  });

  it('a page with something to log but no call to 911 has no 911 stamps', async () => {
    for (const id of ['hypertension', 'hyperventilation']) {
      expect(
        findProtocol(id)!.steps.some((s) => /911/.test(s.text)),
        id,
      ).toBe(false);
      const w = mountDetail(id);
      await w.find('.log-unlock').trigger('click');
      expect(w.find('.log-status').exists(), id).toBe(true);
      expect(w.find('section.help').exists(), id).toBe(false);
      expect(w.text(), id).not.toContain('911 called');
      expect(w.text(), id).not.toContain('EMS arrived');
      w.unmount();
    }
  });

  it('on every page that calls 911, the steps never repeat the two stamps of the Call 911 card', async () => {
    for (const p of EMERGENCY_PROTOCOLS.filter((p) => p.steps.some((s) => /911/.test(s.text)))) {
      const w = mountDetail(p.id);
      await w.find('.log-unlock').trigger('click');
      const help = w.findAll('.help .ui-drug-btn-dose').map((d) => d.text());
      const inSteps = w.findAll('.steps-card .ui-drug-btn-dose').map((d) => d.text());
      expect(help, p.id).toEqual(['911 called', 'EMS arrived']);
      expect(inSteps, p.id).not.toContain('911 called');
      expect(inSteps, p.id).not.toContain('EMS arrived');
      w.unmount();
    }
  });

  it('each route has a row of its own, so an IM dose never sits among IV ones', async () => {
    for (const [id, name] of [
      ['oversedation_opioid', 'Naloxone'],
      ['anaphylaxis', 'Diphenhydramine'],
    ] as const) {
      const w = mountDetail(id);
      await w.find('.log-unlock').trigger('click');
      const box = w
        .findAll('.drug-callout')
        .find((c) => c.find('.drug-name-text').text() === name)!;
      const rows = box
        .findAll('.log-groups > .log-pills')
        .map((r) => r.findAll('.ui-drug-btn-dose').map((d) => d.text().split(' ').pop()));
      expect(rows.length, id).toBe(2);
      expect(
        rows.map((r) => [...new Set(r)]),
        id,
      ).toEqual([['IV'], ['IM']]);
      w.unmount();
    }
  });

  it('once unlocked, the pills replace dose rows they repeat, and only those', async () => {
    const rowsOf = (w: ReturnType<typeof mountDetail>, name: string) =>
      w
        .findAll('.drug-callout')
        .filter((c) => c.find('.drug-name-text').text() === name)
        .map((c) => c.findAll('.drug-row').length);
    // Amiodarone in arrest: 300 mg 6.0 ml and 150 mg 3.0 ml, each a pill.
    const arrest = mountDetail('vfib_vtach');
    expect(rowsOf(arrest, 'Amiodarone')).toEqual([2]);
    await arrest.find('.log-unlock').trigger('click');
    expect(rowsOf(arrest, 'Amiodarone')).toEqual([0]);
    const subs = arrest
      .findAll('.drug-callout')
      .find((c) => c.find('.drug-name-text').text() === 'Amiodarone')!
      .findAll('.ui-drug-btn-sub')
      .map((d) => d.text());
    expect(subs).toEqual(['6.0 ml · 1st dose', '3.0 ml · 2nd dose']);
    arrest.unmount();
    // Atropine on hypotension lists one dose at two strengths: one pill, both rows stay.
    const two = mountDetail('hypotension');
    await two.find('.log-unlock').trigger('click');
    const atropine = two.findAll('.drug-callout').find((t) => t.text().includes('1 mg/ml vial'))!;
    expect(atropine.findAll('.drug-row').length).toBe(2);
    two.unmount();
  });

  it('a page with nothing to log has no gate row', () => {
    const w = mountDetail('npa');
    expect(w.find('.log-gate').exists()).toBe(false);
    w.unmount();
  });

  it('naloxone and flumazenil sit in their own steps, and both in the Reverse step', async () => {
    const pills = async (id: string) => {
      const w = mountDetail(id);
      await w.find('.log-unlock').trigger('click');
      const found = w.findAll('ol.steps > .step').map((st) => ({
        text: st.find('.step-text').text(),
        pills: st.findAll('.log-pills .ui-drug-btn-dose').map((d) => d.text()),
        names: st.findAll('.log-pills .ui-drug-btn-name').map((d) => d.text()),
      }));
      w.unmount();
      return found.filter((f) => f.names.some((n) => /Naloxone|Flumazenil/.test(n)));
    };
    expect(await pills('oversedation_opioid')).toEqual([
      {
        text: expect.stringMatching(/^Naloxone IV/),
        pills: ['0.4 mg IV', '2 mg IV', '0.4 mg IM', '2 mg IM'],
        names: ['Naloxone', 'Naloxone', 'Naloxone', 'Naloxone'],
      },
    ]);
    expect(await pills('oversedation_benzo')).toEqual([
      {
        text: expect.stringMatching(/^Flumazenil IV/),
        pills: ['0.2 mg IV'],
        names: ['Flumazenil'],
      },
    ]);
    expect(await pills('hypoventilation')).toEqual([
      {
        text: expect.stringMatching(/^Reverse:/),
        pills: ['0.4 mg IV', '0.2 mg IV'],
        names: ['Naloxone', 'Flumazenil'],
      },
    ]);
  });
});

describe('equipment', () => {
  // The states of the Equipment card are tested on a made-up cart in
  // QuickReferenceDetailView.kit.test.ts, so stock edits never break them.
  it('a page with no linked equipment has no equipment card', () => {
    const w = mountDetail('seizure');
    expect(w.find('.kit-card').exists()).toBe(false);
    w.unmount();
  });
});

describe('stock, shown by exception', () => {
  it('a drug past its date says so beside its name', () => {
    const w = mountOn('2040-01-01', 'anaphylaxis');
    const epi = w.findAll('.drug-callout').find((c) => c.text().includes('Epinephrine'))!;
    expect(epi.find('.drug-name .ui-status-pill').text()).toBe('Expired');
    w.unmount();
  });

  it('a drug in date says nothing about its date', () => {
    const w = mountOn('2020-01-01', 'anaphylaxis');
    const pills = w.findAll('.drug-name .ui-status-pill').map((p) => p.text());
    expect(pills.filter((t) => /Expir/.test(t))).toEqual([]);
    w.unmount();
  });

  it('a course the stock cannot finish says Short, outranking its date, with the Inventory line', () => {
    // Long after every lot has expired, no course can be finished.
    const day = '2040-01-01';
    const courses = useInventoryStatus(Date.parse(`${day}T12:00:00Z`)).courses.map((c) => c.drug);
    expect(courses.length).toBeGreaterThan(0);
    let seen = 0;
    for (const p of EMERGENCY_PROTOCOLS) {
      const w = mountOn(day, p.id);
      for (const box of w.findAll('.drug-callout')) {
        if (!courses.includes(box.find('.drug-name-text').text())) continue;
        seen += 1;
        expect(box.find('.drug-name .ui-status-pill').text(), p.id).toBe('Short');
        expect(box.find('.drug-short').text(), p.id).toMatch(/^Have 0 mg · need \d+(\.\d+)? mg/);
      }
      w.unmount();
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('the page around the steps', () => {
  it('the Call 911 card is only where a step calls 911, and the red link comes first', () => {
    const quiet = mountDetail('phlebitis');
    expect(quiet.find('section.help').exists()).toBe(false);
    quiet.unmount();
    const w = mountDetail('anaphylaxis');
    expect(w.find('section.help').element.firstElementChild?.matches('a.call-911')).toBe(true);
    w.unmount();
  });

  it('a critical step is marked by its node', () => {
    const steps = findProtocol('anaphylaxis')!.steps;
    const w = mountDetail('anaphylaxis');
    const critical = w.findAll('ol.steps > .step--critical');
    expect(critical.length).toBe(steps.filter((s) => s.severity === 'critical').length);
    expect(critical.every((c) => c.find('.step-node').exists())).toBe(true);
    w.unmount();
  });

  it('the drawing in a drug box has no frame and no name of its own', () => {
    const w = mountDetail('anaphylaxis');
    const drawings = w.findAll('.drug-callout figure.syringe');
    expect(drawings.length).toBeGreaterThan(0);
    for (const d of drawings) {
      expect(d.classes()).toContain('is-bare');
      expect(d.find('.syringe-label').exists()).toBe(false);
    }
    w.unmount();
  });

  it('related protocols are one grouped list, each row a button that opens it', async () => {
    const ids = findProtocol('anaphylaxis')!.relatedProtocols ?? [];
    const w = mountDetail('anaphylaxis');
    const rows = w.findAll('.related-card .ui-list-row');
    expect(rows.length).toBe(ids.length);
    expect(rows.every((r) => r.element.tagName === 'BUTTON')).toBe(true);
    expect(rows.every((r) => r.find('.ui-list-row-chevron').exists())).toBe(true);
    await rows[0]!.trigger('click');
    await flushPromises();
    expect(w.router.currentRoute.value.path).toBe(`/quick-reference/${ids[0]}`);
    w.unmount();
  });
});

describe('the top bar names the protocol once the title has gone under it', () => {
  it('follows the title across the foot of the bar, either way, and clears on leaving', () => {
    let fire: (entry: object) => void = () => {};
    let margin: string | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
          margin = opts?.rootMargin;
          fire = (entry) =>
            cb([entry as IntersectionObserverEntry], this as unknown as IntersectionObserver);
        }
        observe() {}
        disconnect() {}
      },
    );
    const w = mountDetail('anaphylaxis');
    const at = (top: number, isIntersecting: boolean) =>
      fire({ isIntersecting, boundingClientRect: { top }, rootBounds: { top: 64 } });
    // The line is the foot of the bar, not the top of the screen.
    expect(margin).toBe('-64px 0px 0px 0px');
    // An ordinary scroll: the title's foot crosses the line while its top is still on screen.
    at(48, false);
    expect(protocolTitleHidden.value).toBe(true);
    at(70, true);
    expect(protocolTitleHidden.value).toBe(false);
    // Below the screen is not under the bar.
    at(2000, false);
    expect(protocolTitleHidden.value).toBe(false);
    at(48, false);
    w.unmount();
    // Leaving the page never leaves a protocol name in the bar of another screen.
    expect(protocolTitleHidden.value).toBe(false);
  });
});
