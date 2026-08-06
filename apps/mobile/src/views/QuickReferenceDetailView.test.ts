import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import QuickReferenceDetailView from './QuickReferenceDetailView.vue';
import { parseVolumeMl, syringeConfig } from '@/composables/useSyringeConfig';

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
    expect(atropineTable!.text()).toContain('5.0 ml');
    wrapper.unmount();
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

  it('flumazenil renders the practice 3 cc barrel', () => {
    expect(syringeConfig('Flumazenil')?.capacityMl).toBe(3);
  });
});
