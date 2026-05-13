import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';

import PhaseLayout from './PhaseLayout.vue';

describe('PhaseLayout', () => {
  it('renders default-slot content', () => {
    const wrapper = mount(PhaseLayout, {
      slots: { default: () => h('p', { class: 'sentinel' }, 'form-content') },
    });
    expect(wrapper.find('.phase-layout-main .sentinel').text()).toBe('form-content');
    wrapper.unmount();
  });

  it('renders the rail aside only when the rail slot is provided', () => {
    const without = mount(PhaseLayout, {
      slots: { default: () => h('div', 'main') },
    });
    expect(without.find('aside.phase-layout-rail').exists()).toBe(false);
    without.unmount();

    const withRail = mount(PhaseLayout, {
      slots: {
        default: () => h('div', 'main'),
        rail: () => h('p', { class: 'rail-sentinel' }, 'rail-content'),
      },
    });
    expect(withRail.find('aside.phase-layout-rail').exists()).toBe(true);
    expect(withRail.find('.rail-sentinel').text()).toBe('rail-content');
    withRail.unmount();
  });
});
