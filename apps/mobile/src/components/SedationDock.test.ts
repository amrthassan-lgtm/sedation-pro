import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import SedationDock from './SedationDock.vue';
import { useDockVisibility } from '@/composables/useDockVisibility';
import { useIVStore } from '@/stores/iv';
import { usePatientStore } from '@/stores/patient';

/**
 * The compact dock is the mid-titration cockpit on the practice's portrait
 * tablet, so its footprint is a layout contract: two drug rows, each carrying
 * its own timer and next-dose button, and nothing stacked beneath them.
 */
describe('SedationDock compact layout', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useDockVisibility().expanded.value = false;
  });

  it('renders one row per sedative with an inline timer and a dose button', () => {
    const wrapper = mount(SedationDock);
    const rows = wrapper.findAll('.dock-drug-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.find('.ui-timer-pill.is-inline').exists()).toBe(true);
      expect(row.find('button.dock-dose-btn').exists()).toBe(true);
    }
    expect(wrapper.find('.dock-quick-row').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps the row buttons disabled until the EKG readiness gate clears', () => {
    const wrapper = mount(SedationDock);
    for (const btn of wrapper.findAll('button.dock-dose-btn')) {
      expect(btn.attributes('disabled')).toBeDefined();
    }
    wrapper.unmount();
  });

  it('logs the next dose from the row button', async () => {
    usePatientStore().ekgPlaced = true;
    const iv = useIVStore();
    const wrapper = mount(SedationDock);
    const [versedRow, fentRow] = wrapper.findAll('.dock-drug-row');
    await versedRow!.find('button.dock-dose-btn').trigger('click');
    await fentRow!.find('button.dock-dose-btn').trigger('click');
    expect(iv.doses.map((d) => [d.drug, d.mg ?? d.mcg])).toEqual([
      ['versed', 2],
      ['fentanyl', 25],
    ]);
    wrapper.unmount();
  });

  it('swaps the row buttons for the per-class grid when expanded', async () => {
    const wrapper = mount(SedationDock);
    await wrapper.find('.dock-handle').trigger('click');
    expect(wrapper.findAll('.dock-drug-row')).toHaveLength(2);
    expect(wrapper.find('button.dock-dose-btn').exists()).toBe(false);
    expect(wrapper.find('.dock-expanded').exists()).toBe(true);
    wrapper.unmount();
  });
});
