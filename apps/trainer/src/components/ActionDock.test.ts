import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import type { Run } from '@/composables/useRun';

import ActionDock from './ActionDock.vue';

/** Just the parts of a run the dock reads. */
function dock(state: { on?: string[]; spent?: string[] } = {}) {
  const act = vi.fn();
  const run = {
    isOn: (id: string) => (state.on ?? []).includes(id),
    done: () => false,
    remaining: (id: string) => ((state.spent ?? []).includes(id) ? 0 : 1),
    tray: ref([]),
    act,
  } as unknown as Run;
  const wrapper = mount(ActionDock, { props: { run } });
  return { wrapper, act };
}

async function callOut(wrapper: ReturnType<typeof dock>['wrapper'], text: string) {
  await wrapper.find('#callout').setValue(text);
  return wrapper.findAll('.hits .pill');
}

describe('calling out something already under way', () => {
  it('offers an act that is off as it is, and picks it', async () => {
    const { wrapper } = dock();
    const [pill] = await callOut(wrapper, 'bvm');
    expect(pill?.text()).toBe('BVM');
    await pill?.trigger('click');
    expect(wrapper.emitted('pick')?.[0]?.[0]).toMatchObject({ kind: 'action', id: 'bvm' });
  });

  it('marks an act that is on, and calling it again opens its drawer instead of stopping it', async () => {
    const { wrapper } = dock({ on: ['bvm'] });
    const [pill] = await callOut(wrapper, 'bvm');
    expect(pill?.text()).toBe('BVM · on');
    await pill?.trigger('click');
    expect(wrapper.emitted('pick')).toBeUndefined();
    expect(wrapper.emitted('drawer')?.[0]).toEqual(['breathing']);
  });

  it('Enter on an act that is on does not switch it off either', async () => {
    const { wrapper } = dock({ on: ['o2'] });
    await callOut(wrapper, 'oxygen');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('pick')).toBeUndefined();
    expect(wrapper.emitted('drawer')?.[0]).toEqual(['breathing']);
  });

  it('a spent pen is shown as used and cannot be picked', async () => {
    const { wrapper } = dock({ spent: ['auviq_adult'] });
    const pills = await callOut(wrapper, 'auvi');
    const pen = pills.find((p) => p.text().startsWith('Auvi-Q'));
    expect(pen?.text()).toBe('Auvi-Q 0.3 mg · used');
    expect(pen?.attributes('disabled')).toBeDefined();
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('pick')).toBeUndefined();
    expect((wrapper.find('#callout').element as HTMLInputElement).value).toBe('auvi');
  });
});
