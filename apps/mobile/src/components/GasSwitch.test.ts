import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';

import GasSwitch from './GasSwitch.vue';
import { fmtClock } from '@/composables/format';
import { useEventLogStore } from '@/stores/event-log';
import { useUndoStore } from '@/stores/undo';

const T0 = new Date('2026-11-21T10:00:00').getTime();
const MIN = 60_000;

interface Side {
  readonly label: string;
  readonly lit: boolean;
  readonly disabled: boolean;
  readonly time: string | null;
}

function sides(wrapper: VueWrapper): Side[] {
  return wrapper.findAll('button').map((b) => ({
    label: b.find('span').text(),
    lit: b.attributes('aria-pressed') === 'true',
    disabled: b.attributes('disabled') !== undefined,
    time: b.find('.gas-time').exists() ? b.find('.gas-time').text() : null,
  }));
}

describe('GasSwitch', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('before any gas: neither side lit, and O₂ 100% is not offered', () => {
    expect(sides(mount(GasSwitch))).toEqual([
      { label: 'N₂O / O₂', lit: false, disabled: false, time: null },
      { label: 'O₂ 100%', lit: false, disabled: true, time: null },
    ]);
  });

  it('lights the side that is running, with the time it was set', async () => {
    const wrapper = mount(GasSwitch);

    await wrapper.findAll('button')[0]!.trigger('click');
    expect(sides(wrapper)).toEqual([
      { label: 'N₂O / O₂', lit: true, disabled: false, time: fmtClock(T0) },
      { label: 'O₂ 100%', lit: false, disabled: false, time: null },
    ]);

    vi.setSystemTime(T0 + 12 * MIN);
    await wrapper.findAll('button')[1]!.trigger('click');
    expect(sides(wrapper)).toEqual([
      { label: 'N₂O / O₂', lit: false, disabled: false, time: null },
      { label: 'O₂ 100%', lit: true, disabled: false, time: fmtClock(T0 + 12 * MIN) },
    ]);
  });

  it('a tap on the lit side writes nothing', async () => {
    const wrapper = mount(GasSwitch);

    await wrapper.findAll('button')[0]!.trigger('click');
    await wrapper.findAll('button')[0]!.trigger('click');

    expect(useEventLogStore().events).toHaveLength(1);
  });

  it('is one switch in two places: step 4 and the dock show the same thing', async () => {
    const step4 = mount(GasSwitch, { props: { tall: true } });
    const dock = mount(GasSwitch);

    await dock.findAll('button')[0]!.trigger('click');
    expect(sides(step4)).toEqual(sides(dock));

    vi.setSystemTime(T0 + 5 * MIN);
    await step4.findAll('button')[1]!.trigger('click');
    expect(sides(dock)).toEqual(sides(step4));
    expect(sides(dock)[1]).toMatchObject({ lit: true, time: fmtClock(T0 + 5 * MIN) });
  });

  it('goes back with Undo, time and all', async () => {
    const wrapper = mount(GasSwitch);

    await wrapper.findAll('button')[0]!.trigger('click');
    vi.setSystemTime(T0 + 12 * MIN);
    await wrapper.findAll('button')[1]!.trigger('click');
    useUndoStore().undo();
    await wrapper.vm.$nextTick();

    expect(sides(wrapper)[0]).toMatchObject({ lit: true, time: fmtClock(T0) });
    expect(sides(wrapper)[1]).toMatchObject({ lit: false, time: null });
  });
});
