import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import {
  UI_LIB_VERSION,
  UiBanner,
  UiBpInput,
  UiButton,
  UiCard,
  UiCheckbox,
  UiDrugButton,
  UiDrugSwatch,
  UiField,
  UiModal,
  UiNumberInput,
  UiPercentBar,
  UiRow,
  UiSelect,
  UiStack,
  UiStatCard,
  UiStatusPill,
  UiTextInput,
  UiTimerPill,
} from './index';

describe('@sedation-pro/ui', () => {
  it('exports a semver-shaped version', () => {
    expect(UI_LIB_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('renders every primitive without throwing', () => {
    const w = (component: unknown, props: Record<string, unknown> = {}) => {
      const wrapper = mount(component as Parameters<typeof mount>[0], { props });
      expect(wrapper.element).toBeTruthy();
      wrapper.unmount();
    };

    // Layout
    w(UiCard);
    w(UiCard, { tint: 'ph1', active: true });
    w(UiRow, { gap: 3, justify: 'between' });
    w(UiStack, { gap: 4, align: 'start' });

    // Action
    w(UiButton, { tone: 'primary' });
    w(UiButton, { state: 'locked' });
    w(UiButton, { state: 'logged', loggedAt: '10:23' });
    w(UiDrugButton, { tone: 'versed', name: 'Versed', dose: '1 mg', sub: '0.2 ml' });
    w(UiDrugButton, { tone: 'fentanyl', name: 'Fentanyl', dose: '25 mcg', state: 'locked' });
    w(UiDrugButton, {
      tone: 'naloxone',
      name: 'Naloxone',
      dose: '0.4 mg',
      state: 'logged',
      loggedAt: '11:02',
    });

    // Form
    w(UiField, { label: 'Weight', hint: 'lbs', required: true });
    w(UiTextInput, { modelValue: '', placeholder: 'Patient Name' });
    w(UiNumberInput, { modelValue: 170, placeholder: 'Weight' });
    w(UiSelect, {
      options: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
      modelValue: 'a',
      placeholder: 'Select…',
    });
    w(UiCheckbox, { modelValue: true, label: 'NPO confirmed' });
    w(UiCheckbox, { modelValue: false, label: 'Airway risk', tone: 'danger' });
    w(UiBpInput, { modelValue: { sbp: 120, dbp: 80 } });

    // Display
    w(UiPercentBar, { percent: 42 });
    w(UiPercentBar, { percent: 95, severity: 'limit' });
    w(UiStatusPill, { severity: 'safe' });
    w(UiStatusPill, { severity: 'caution', label: 'Approaching' });
    w(UiStatusPill, { severity: 'empty' });
    w(UiTimerPill, { label: 'Versed', count: '1:23', tone: 'versed', status: 'cooling' });
    w(UiTimerPill, { label: 'Fentanyl', count: '✓', tone: 'fentanyl', status: 'ready' });
    w(UiBanner, { tone: 'caution', title: 'Elevated baseline BP', icon: '⚠' });
    w(UiBanner, { tone: 'info' });
    w(UiDrugSwatch, { tone: 'versed' });
    w(UiDrugSwatch, { tone: 'lidocaine', size: 'lg' });

    // Health-style stat card variants.
    w(UiStatCard, {
      label: 'BMI',
      value: '27.3',
      unit: 'kg/m²',
      category: 'Overweight',
      severity: 'caution',
      detail: '180 lb · 70 in',
    });
    w(UiStatCard, {
      label: 'Baseline BP',
      value: '134/82',
      unit: 'mmHg',
      category: 'Stage 1',
      severity: 'caution',
    });
    w(UiStatCard, { label: 'SpO₂', value: '—', severity: 'empty' });

    // Modal — closed and open variants.
    w(UiModal, { open: false, title: 'Test' });
    w(UiModal, { open: true, title: 'Confirm release', tone: 'danger' });
  });

  it('UiModal emits cancel on backdrop click when dismissOnBackdrop is true', async () => {
    const wrapper = mount(UiModal, {
      props: { open: true, title: 'Test', dismissOnBackdrop: true },
      attachTo: document.body,
    });
    const overlay = document.querySelector('.ui-modal-overlay') as HTMLElement | null;
    overlay?.click();
    expect(wrapper.emitted('cancel')).toBeTruthy();
    wrapper.unmount();
  });

  it('UiModal does not emit cancel on backdrop click when dismissOnBackdrop is false', async () => {
    const wrapper = mount(UiModal, {
      props: { open: true, title: 'Test', dismissOnBackdrop: false },
      attachTo: document.body,
    });
    const overlay = document.querySelector('.ui-modal-overlay') as HTMLElement | null;
    overlay?.click();
    expect(wrapper.emitted('cancel')).toBeFalsy();
    wrapper.unmount();
  });

  it('UiButton emits click only when state is idle and not disabled', async () => {
    const wrapper = mount(UiButton, { props: { state: 'idle' } });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);

    await wrapper.setProps({ state: 'locked' });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);

    await wrapper.setProps({ state: 'idle', disabled: true });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);

    wrapper.unmount();
  });

  it('UiDrugButton suppresses clicks when state is logged or disabled', async () => {
    const wrapper = mount(UiDrugButton, {
      props: { tone: 'versed', name: 'Versed', dose: '1 mg' },
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);

    await wrapper.setProps({ state: 'logged', loggedAt: '10:30' });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);

    await wrapper.setProps({ state: 'idle', disabled: true });
    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);

    wrapper.unmount();
  });

  it('UiCheckbox toggles on click and skips when disabled', async () => {
    const wrapper = mount(UiCheckbox, { props: { modelValue: false, label: 'Test' } });
    await wrapper.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);

    await wrapper.setProps({ modelValue: false, disabled: true });
    await wrapper.trigger('click');
    // Only the first emit should be present
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    wrapper.unmount();
  });

  it('UiPercentBar derives severity from percent when not provided', () => {
    const cases: Array<[number, string]> = [
      [0, 'safe'],
      [69, 'safe'],
      [70, 'caution'],
      [90, 'limit'],
      [100, 'crisis'],
      [150, 'crisis'],
    ];
    for (const [pct, severity] of cases) {
      const wrapper = mount(UiPercentBar, { props: { percent: pct } });
      expect(wrapper.classes()).toContain(`ui-percent-bar--${severity}`);
      wrapper.unmount();
    }
  });
});
