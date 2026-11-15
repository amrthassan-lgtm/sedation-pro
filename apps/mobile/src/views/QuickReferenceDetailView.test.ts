import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import QuickReferenceDetailView from './QuickReferenceDetailView.vue';
import { emergencySyringe, parseVolumeMl, syringeConfig } from '@/composables/useSyringeConfig';
import { EMERGENCY_PROTOCOLS, emergencySyringeTint, findProtocol } from '@sedation-pro/clinical';

function mountDetail(id: string) {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  });
  return mount(QuickReferenceDetailView, {
    props: { id },
    global: { plugins: [router] },
  });
}

describe('QuickReferenceDetailView draw rendering', () => {
  it('promotes the volume to the Draw line and removes it from the route line', () => {
    const wrapper = mountDetail('oversedation_benzo'); // Flumazenil 0.2 mg / 2.0 ml
    const draw = wrapper.find('.drug-draw-vol');
    expect(draw.exists()).toBe(true);
    expect(draw.text()).toBe('2.0 ml');
    const route = wrapper.find('.drug-route');
    expect(route.text()).not.toContain('2.0 ml');
    expect(route.text()).toContain('0.1 mg/ml');
    wrapper.unmount();
  });

  it('emphasises the waste-down step inside a two-step MIX FIRST recipe', () => {
    const wrapper = mountDetail('hypotension'); // Phenylephrine
    const keys = wrapper.findAll('.drug-mix-key');
    expect(keys.length).toBe(1);
    expect(keys[0]!.text()).toBe('WASTE DOWN TO 1 ml');
    wrapper.unmount();
  });

  it('renders the MIX FIRST band above the draw line for dilution callouts', () => {
    const wrapper = mountDetail('bradycardia'); // Push-dose Epinephrine
    const mix = wrapper.find('.drug-mix');
    expect(mix.exists()).toBe(true);
    expect(mix.text()).toContain('MIX FIRST');
    // DOM order: the mix band precedes the draw line within its callout.
    const callout = mix.element.parentElement;
    const children = [...(callout?.children ?? [])].map((el) => el.className);
    expect(children.indexOf('drug-mix')).toBeLessThan(
      children.findIndex((c) => c.includes('drug-draw')),
    );
    wrapper.unmount();
  });

  it('renders one dt/dd pair per drawTable row', () => {
    const wrapper = mountDetail('hypotension'); // Atropine dual presentation
    const tables = wrapper.findAll('.drug-draw-table');
    expect(tables.length).toBeGreaterThan(0);
    const atropineTable = tables.find((t) => t.text().includes('1 mg/ml vial'));
    expect(atropineTable).toBeDefined();
    expect(atropineTable!.findAll('dt').length).toBe(2);
    expect(atropineTable!.findAll('dd').length).toBe(2);
    expect(atropineTable!.text()).toContain('10.0 ml'); // AHA 2025: 1 mg = whole prefilled syringe
    wrapper.unmount();
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

  it('a prefilled syringe is given, not drawn', () => {
    const w = mountDetail('hypoglycemia');
    const dextrose = w.findAll('.drug-callout').find((c) => c.text().includes('D50W'));
    expect(dextrose?.find('.drug-draw-label').text()).toBe('Give');
    w.unmount();
    const drawn = mountDetail('oversedation_opioid');
    expect(drawn.find('.drug-draw-label').text()).toBe('Draw');
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

  it('offers to log the reversal only on the oversedation protocols, and only with a case open', () => {
    const w = mountDetail('oversedation_benzo');
    expect(w.find('.give-card').exists()).toBe(true);
    // No Phase 1 on a fresh store: the hint shows instead of the dose buttons.
    expect(w.find('.give-hint').exists()).toBe(true);
    expect(w.findAll('.ui-drug-btn').length).toBe(0);
    w.unmount();
    const other = mountDetail('anaphylaxis');
    expect(other.find('.give-card').exists()).toBe(false);
    other.unmount();
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
  it('shows no pill and no time stamp until a case is open: the page reads as it always did', () => {
    for (const id of ['anaphylaxis', 'vfib_vtach', 'seizure']) {
      const w = mountDetail(id);
      expect(w.find('.log-pills').exists(), id).toBe(false);
      expect(w.find('.log-stamps').exists(), id).toBe(false);
      w.unmount();
    }
  });
});
