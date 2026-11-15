import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import {
  UI_LIB_VERSION,
  UiBanner,
  UiBpInput,
  UiButton,
  UiCard,
  UiCheckbox,
  UiChipMultiSelect,
  UiDrugButton,
  UiDrugSwatch,
  UiField,
  UiListRow,
  UiHeightInput,
  UiModal,
  UiNumberInput,
  UiPercentBar,
  UiPillButton,
  UiRow,
  UiSelect,
  UiStack,
  UiStatCard,
  UiStatusPill,
  UiSyringe,
  UiTextInput,
  UiTimerPill,
} from './index';

describe('UiSyringe marks', () => {
  const marks = (props: Record<string, unknown>) => {
    const wrapper = mount(UiSyringe, {
      props: { label: 'Test', capacityMl: 3, drawnMl: 1, color: 'red', ...props },
    });
    const count = wrapper.findAll('.ticks line').length;
    const labels = wrapper
      .findAll('.tick-labels text')
      .filter((t) => t.attributes('style') !== 'display: none;')
      .map((t) => t.text());
    wrapper.unmount();
    return { count, labels };
  };

  it('keeps the clinical cards as they were: half-millilitre marks on 3 ml', () => {
    expect(marks({})).toEqual({ count: 7, labels: ['0', '1', '2', '3'] });
    expect(marks({ capacityMl: 1 }).count).toBe(11);
    expect(marks({ capacityMl: 10 }).count).toBe(21);
  });

  it('hero marks the 3 ml barrel to the tenth and numbers each millilitre', () => {
    expect(marks({ hero: true })).toEqual({ count: 31, labels: ['0', '1', '2', '3'] });
  });

  it('hero leaves the 1 ml and 10 ml barrels on their usual marks', () => {
    expect(marks({ hero: true, capacityMl: 1 }).count).toBe(11);
    expect(marks({ hero: true, capacityMl: 10 }).count).toBe(21);
  });
});

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
    w(UiListRow);
    w(UiListRow, { interactive: true, chevron: true, inset: 22 });
    w(UiListRow, { interactive: true, disclosure: 'open' });

    // Action
    w(UiButton, { tone: 'primary' });
    w(UiPillButton);
    w(UiPillButton, { tone: 'key', disabled: true, block: true });
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
    w(UiHeightInput, { modelValue: 70 });
    w(UiHeightInput, { modelValue: null });

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
    w(UiSyringe, {
      label: 'Flumazenil',
      capacityMl: 3,
      drawnMl: 2,
      color: '#facc15',
    });
    w(UiSyringe, { label: 'Atropine', capacityMl: 3, drawnMl: 1, color: 'green', bare: true });

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

  describe('UiChipMultiSelect custom entry', () => {
    const options = [
      { value: 'CVD', label: 'CVD' },
      { value: 'Restless Leg Syndrome', label: 'RLS' },
    ];

    const mountWith = (modelValue: string[]) =>
      mount(UiChipMultiSelect, {
        props: { modelValue, options, allowCustom: true },
      });

    it('hides the entry affordance unless allowCustom is set', () => {
      const wrapper = mount(UiChipMultiSelect, {
        props: { modelValue: [], options },
      });
      expect(wrapper.find('.ui-chip-add').exists()).toBe(false);
      wrapper.unmount();
    });

    it('adds a typed condition on Enter', async () => {
      const wrapper = mountWith(['CVD']);
      await wrapper.find('.ui-chip-add').trigger('click');
      const input = wrapper.find('input.ui-chip-entry');
      expect(input.exists()).toBe(true);
      await input.setValue('  Epilepsy ');
      await input.trigger('keydown.enter');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['CVD', 'Epilepsy']]);
      expect(wrapper.find('input.ui-chip-entry').exists()).toBe(false);
      wrapper.unmount();
    });

    it('selects the listed option when the typed text matches its value or label', async () => {
      const wrapper = mountWith([]);
      await wrapper.find('.ui-chip-add').trigger('click');
      const input = wrapper.find('input.ui-chip-entry');
      await input.setValue('rls');
      await input.trigger('keydown.enter');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['Restless Leg Syndrome']]);
      wrapper.unmount();
    });

    it('ignores blanks and case-insensitive duplicates', async () => {
      const wrapper = mountWith(['Epilepsy']);
      await wrapper.find('.ui-chip-add').trigger('click');
      let input = wrapper.find('input.ui-chip-entry');
      await input.setValue('   ');
      await input.trigger('keydown.enter');
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();

      await wrapper.find('.ui-chip-add').trigger('click');
      input = wrapper.find('input.ui-chip-entry');
      await input.setValue('EPILEPSY');
      await input.trigger('keydown.enter');
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
      wrapper.unmount();
    });

    it('cancels entry on Escape without emitting', async () => {
      const wrapper = mountWith([]);
      await wrapper.find('.ui-chip-add').trigger('click');
      const input = wrapper.find('input.ui-chip-entry');
      await input.setValue('Epilepsy');
      await input.trigger('keydown.esc');
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
      expect(wrapper.find('input.ui-chip-entry').exists()).toBe(false);
      wrapper.unmount();
    });

    it('commits on blur so tapping away keeps the typed condition', async () => {
      const wrapper = mountWith([]);
      await wrapper.find('.ui-chip-add').trigger('click');
      const input = wrapper.find('input.ui-chip-entry');
      await input.setValue('Epilepsy');
      await input.trigger('blur');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['Epilepsy']]);
      wrapper.unmount();
    });

    it('renders custom selections as active chips that toggle off on tap', async () => {
      const wrapper = mountWith(['CVD', 'Epilepsy']);
      const custom = wrapper
        .findAll('button.ui-chip')
        .find((b) => b.text() === 'Epilepsy' && b.classes('is-active'));
      expect(custom).toBeTruthy();
      await custom?.trigger('click');
      expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['CVD']]);
      wrapper.unmount();
    });
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

  it('UiField marks itself invalid and exposes its id for scroll-to', () => {
    const wrapper = mount(UiField, {
      props: { label: 'Patient name', required: true, invalid: true, id: 'field-pt' },
    });
    expect(wrapper.classes()).toContain('is-invalid');
    expect((wrapper.element as HTMLElement).id).toBe('field-pt');
    // The "required" inline hint should appear once invalid.
    expect(wrapper.text()).toContain('required');
    wrapper.unmount();
  });

  it('UiCheckbox marks itself invalid and exposes its id for scroll-to', () => {
    const wrapper = mount(UiCheckbox, {
      props: {
        modelValue: false,
        label: 'NPO confirmed',
        required: true,
        invalid: true,
        id: 'field-npo_confirmed',
      },
    });
    expect(wrapper.classes()).toContain('is-invalid');
    expect((wrapper.element as HTMLElement).id).toBe('field-npo_confirmed');
    expect(wrapper.text()).toContain('required');
    wrapper.unmount();
  });

  it('UiHeightInput splits inches into ft/in and recombines on input', async () => {
    const wrapper = mount(UiHeightInput, { props: { modelValue: 70 } });
    const inputs = wrapper.findAll('input');
    expect(inputs).toHaveLength(2);
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('5');
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('10');

    await inputs[0]!.setValue('6');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([6 * 12 + 10]);

    await wrapper.setProps({ modelValue: 6 * 12 + 10 });
    await wrapper.findAll('input')[1]!.setValue('3');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([6 * 12 + 3]);

    wrapper.unmount();
  });

  it('UiHeightInput emits null when both fields are empty', async () => {
    const wrapper = mount(UiHeightInput, { props: { modelValue: null } });
    await wrapper.findAll('input')[0]!.setValue('');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null]);
    wrapper.unmount();
  });

  it('UiSyringe plunger seal sits at the right edge of the fluid column', () => {
    // Orientation matches the legacy app: needle on left, fluid fills the
    // barrel from the needle rightward, plunger seal pressed against the
    // RIGHT edge of the fluid as more is drawn. Regression guard for the
    // wrong-direction plunger that shipped previously.
    const wrapper = mount(UiSyringe, {
      props: { label: 'Flumazenil', capacityMl: 3, drawnMl: 2, color: '#facc15' },
    });
    const svg = wrapper.find('svg').element as SVGElement;
    const rects = Array.from(svg.querySelectorAll('rect'));
    const fluid = rects.find((r) => r.getAttribute('fill') === '#facc15');
    const plungerSeal = rects.find((r) => r.getAttribute('fill') === '#5d6b85');
    expect(fluid).toBeTruthy();
    expect(plungerSeal).toBeTruthy();
    const fluidRight = Number(fluid!.getAttribute('x')) + Number(fluid!.getAttribute('width'));
    const plungerLeft = Number(plungerSeal!.getAttribute('x'));
    // Plunger seal's left edge should meet the fluid's right edge (no gap, no overlap).
    expect(Math.abs(plungerLeft - fluidRight)).toBeLessThan(0.5);
    wrapper.unmount();
  });

  it('UiSyringe clamps the plunger seal inside the barrel when fully drawn', () => {
    const wrapper = mount(UiSyringe, {
      props: { label: 'Naloxone', capacityMl: 1, drawnMl: 1, color: '#fb7185' },
    });
    const svg = wrapper.find('svg').element as SVGElement;
    const rects = Array.from(svg.querySelectorAll('rect'));
    const plungerSeal = rects.find((r) => r.getAttribute('fill') === '#5d6b85');
    const sealRight =
      Number(plungerSeal!.getAttribute('x')) + Number(plungerSeal!.getAttribute('width'));
    // Barrel ends at x=206; seal's right edge must not extend past it.
    expect(sealRight).toBeLessThanOrEqual(206);
    wrapper.unmount();
  });

  it('UiSyringe renders a narrower barrel for 1cc tuberculin syringes', () => {
    // Versed ships in a 1cc tuberculin (capacity 1 mL); every other IV drug
    // uses a 3cc syringe. The barrel must visually reflect this — otherwise
    // every drug on the IV Drug Reference card looks like the same syringe.
    const versed = mount(UiSyringe, {
      props: { label: 'Versed', capacityMl: 1, drawnMl: 0.2, color: '#f97316' },
    });
    const fentanyl = mount(UiSyringe, {
      props: { label: 'Fentanyl', capacityMl: 3, drawnMl: 0.5, color: '#3b82f6' },
    });
    const barrelHeight = (w: ReturnType<typeof mount>) => {
      const svg = w.find('svg').element as SVGElement;
      const rects = Array.from(svg.querySelectorAll('rect'));
      const barrel = rects.find((r) => r.getAttribute('fill') === 'rgba(13, 21, 39, 0.6)');
      return Number(barrel!.getAttribute('height'));
    };
    expect(barrelHeight(versed)).toBeLessThan(barrelHeight(fentanyl));
    versed.unmount();
    fentanyl.unmount();
  });

  it('UiSyringe plunger rod bridges the seal to the thumb ring', () => {
    // Regression guard: a small draw (0.5 mL of 3 mL) used to leave a visible
    // empty span between the plunger seal (near the fluid) and the static
    // rod/thumb assembly at the back of the barrel. The rod must be dynamic
    // — wide enough to physically connect the seal's right edge to the
    // thumb ring's left edge.
    const wrapper = mount(UiSyringe, {
      props: { label: 'Fentanyl', capacityMl: 3, drawnMl: 0.5, color: '#3b82f6' },
    });
    const svg = wrapper.find('svg').element as SVGElement;
    const rects = Array.from(svg.querySelectorAll('rect'));
    const greyRects = rects.filter((r) => r.getAttribute('fill') === '#5d6b85');
    expect(greyRects.length).toBeGreaterThanOrEqual(2); // seal + rod
    const seal = greyRects[0]!; // rendered first in template
    const rod = greyRects[1]!;
    const sealRight = Number(seal.getAttribute('x')) + Number(seal.getAttribute('width'));
    const rodLeft = Number(rod.getAttribute('x'));
    const rodRight = rodLeft + Number(rod.getAttribute('width'));
    // Thumb ring is at x=256 (the only black rect with that x).
    const thumb = rects.find((r) => r.getAttribute('fill') === '#0d1527');
    const thumbLeft = Number(thumb!.getAttribute('x'));
    expect(Math.abs(rodLeft - sealRight)).toBeLessThan(0.5);
    expect(Math.abs(rodRight - thumbLeft)).toBeLessThan(0.5);
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

describe('UiSyringe bare', () => {
  it('drops its frame and its name when the box around it already names the drug', () => {
    const framed = mount(UiSyringe, {
      props: { label: 'Atropine', capacityMl: 3, drawnMl: 1, color: 'green' },
    });
    const bare = mount(UiSyringe, {
      props: {
        label: 'Atropine',
        capacityMl: 3,
        drawnMl: 1,
        color: 'green',
        bare: true,
        caption: 'Draw 1.0 ml',
      },
    });
    expect(framed.find('.syringe-label').text()).toBe('Atropine');
    expect(bare.find('.syringe-label').exists()).toBe(false);
    expect(bare.classes()).toContain('is-bare');
    // The drawing still says what it shows, for a screen reader and for the eye.
    expect(bare.find('svg').attributes('aria-label')).toContain('Atropine');
    expect(bare.text()).toContain('Draw 1.0 ml');
    framed.unmount();
    bare.unmount();
  });
});

describe('UiPillButton', () => {
  it('is a button, grey (nav) by default and white (key) when asked', () => {
    const nav = mount(UiPillButton, { slots: { default: 'Unlock' } });
    const key = mount(UiPillButton, { props: { tone: 'key' }, slots: { default: 'Back to case' } });
    expect(nav.element.tagName).toBe('BUTTON');
    expect(nav.attributes('type')).toBe('button');
    expect(nav.classes()).toContain('ui-pill-btn--nav');
    expect(key.classes()).toContain('ui-pill-btn--key');
    expect(nav.text()).toBe('Unlock');
    nav.unmount();
    key.unmount();
  });

  it('emits click, and not when disabled', async () => {
    const on = mount(UiPillButton, { slots: { default: 'Go' } });
    await on.trigger('click');
    expect(on.emitted('click')).toHaveLength(1);
    const off = mount(UiPillButton, { props: { disabled: true }, slots: { default: 'Go' } });
    await off.trigger('click');
    expect(off.emitted('click')).toBeUndefined();
    on.unmount();
    off.unmount();
  });

  it('a disabled key pill is disabled and keeps its tone class', () => {
    const off = mount(UiPillButton, { props: { tone: 'key', disabled: true } });
    expect(off.attributes('disabled')).toBeDefined();
    expect(off.classes()).toContain('ui-pill-btn--key');
    off.unmount();
  });

  it('its stylesheet sends a disabled pill back to the grey family, never a faded white slab', () => {
    // happy-dom applies no scoped CSS, so the rule itself is what is checked.
    const sfc = readFileSync(resolve(__dirname, 'primitives/UiPillButton.vue'), 'utf8');
    const rule = /\.ui-pill-btn:disabled \{([^}]*)\}/.exec(sfc)?.[1] ?? '';
    expect(rule).toContain('background: var(--color-surface-elevated)');
    expect(rule).not.toContain('opacity');
    expect(sfc).toMatch(/min-height: 44px/);
  });
});

describe('UiListRow', () => {
  it('is a plain row by default, and a button with a chevron when it opens something', async () => {
    const plain = mount(UiListRow, { slots: { default: 'Equipment' } });
    expect(plain.element.tagName).toBe('DIV');
    expect(plain.find('.ui-list-row-chevron').exists()).toBe(false);
    await plain.trigger('click');
    expect(plain.emitted('click')).toBeUndefined();

    const link = mount(UiListRow, {
      props: { interactive: true, chevron: true, inset: 22 },
      slots: { default: 'Anaphylaxis', leading: '<i class="dot" />', trailing: '2' },
    });
    expect(link.element.tagName).toBe('BUTTON');
    expect(link.find('.ui-list-row-leading .dot').exists()).toBe(true);
    expect(link.find('.ui-list-row-trailing').text()).toBe('2');
    expect(link.find('.ui-list-row-chevron').exists()).toBe(true);
    expect(link.attributes('style')).toContain('--ui-list-row-inset: 22px');
    await link.trigger('click');
    expect(link.emitted('click')).toHaveLength(1);
    plain.unmount();
    link.unmount();
  });
});

describe('UiListRow disclosure', () => {
  it('turns its chevron and says whether it is open; a plain row says nothing', () => {
    const open = mount(UiListRow, { props: { interactive: true, disclosure: 'open' } });
    const closed = mount(UiListRow, { props: { interactive: true, disclosure: 'closed' } });
    const plain = mount(UiListRow, { props: { interactive: true } });
    expect(open.attributes('aria-expanded')).toBe('true');
    expect(open.find('.ui-list-row-chevron').classes()).toContain('is-open');
    expect(closed.attributes('aria-expanded')).toBe('false');
    expect(closed.find('.ui-list-row-chevron').classes()).not.toContain('is-open');
    expect(plain.attributes('aria-expanded')).toBeUndefined();
    expect(plain.find('.ui-list-row-chevron').exists()).toBe(false);
    open.unmount();
    closed.unmount();
    plain.unmount();
  });
});
