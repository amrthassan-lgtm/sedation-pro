import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { findProtocol } from '@sedation-pro/clinical';

import type { Run } from '@/composables/useRun';
import type { BagHolder } from '@/engine/types';

import BagPad from './BagPad.vue';

/** Just the parts of a run the pad reads. */
function pad(options: { holder?: BagHolder; since?: number | null; coached?: boolean } = {}) {
  const squeeze = vi.fn();
  const handBag = vi.fn();
  const run = {
    bagHeldBy: ref(options.holder ?? 'player'),
    sinceBreath: ref(options.since ?? null),
    squeeze,
    handBag,
  } as unknown as Run;
  const wrapper = mount(BagPad, { props: { run, coached: options.coached ?? false } });
  return { wrapper, squeeze, handBag };
}

describe('the bag in the player’s hand', () => {
  it('one press and release is one breath, timed by how long it was held', async () => {
    const now = vi.spyOn(performance, 'now');
    const { wrapper, squeeze } = pad();
    now.mockReturnValue(1_000);
    await wrapper.find('.squeeze').trigger('pointerdown');
    expect(wrapper.emitted('squeezing')?.at(-1)).toEqual([true]);
    expect(squeeze).not.toHaveBeenCalled();
    now.mockReturnValue(2_200);
    await wrapper.find('.squeeze').trigger('pointerup');
    expect(squeeze).toHaveBeenCalledTimes(1);
    expect(squeeze.mock.calls[0]?.[0]).toBeCloseTo(1.2);
    expect(wrapper.emitted('squeezing')?.at(-1)).toEqual([false]);
    now.mockRestore();
  });

  it('a finger that slides off ends the breath once, not twice', async () => {
    const { wrapper, squeeze } = pad();
    await wrapper.find('.squeeze').trigger('pointerdown');
    await wrapper.find('.squeeze').trigger('pointerleave');
    await wrapper.find('.squeeze').trigger('pointerup');
    expect(squeeze).toHaveBeenCalledTimes(1);
  });

  it('a scored run shows no ring and no line: the rhythm is the player’s to keep', () => {
    const { wrapper } = pad({ since: 4 });
    expect(wrapper.find('.ring').exists()).toBe(false);
    expect(wrapper.find('.page-line').exists()).toBe(false);
  });

  it('a practice run counts the seconds and prints the BVM page’s own line', () => {
    const { wrapper } = pad({ since: 4.6, coached: true });
    expect(wrapper.find('.ring-n').text()).toBe('4');
    const line = findProtocol('bvm')!.steps.find((s) =>
      s.text.includes('just enough to see the chest rise'),
    )!.text;
    expect(wrapper.find('.page-line').text()).toContain(line);
  });

  it('hands the bag to the assistant, and takes it back', async () => {
    const mine = pad();
    await mine.wrapper.find('.hand').trigger('click');
    expect(mine.handBag).toHaveBeenCalledWith('da');

    const hers = pad({ holder: 'da' });
    expect(hers.wrapper.find('.squeeze').exists()).toBe(false);
    expect(hers.wrapper.text()).toContain('has the bag');
    await hers.wrapper.find('.hand').trigger('click');
    expect(hers.handBag).toHaveBeenCalledWith('player');
  });
});
