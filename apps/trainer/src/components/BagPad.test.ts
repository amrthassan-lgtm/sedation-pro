import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { findProtocol } from '@sedation-pro/clinical';

import type { Run } from '@/composables/useRun';
import { BREATH, BREATH_WORDS, gapOnPace, HAND_OVER_AFTER, holdOnPace } from '@/engine/engine';
import type { BagHolder, Breath } from '@/engine/types';

import BagPad from './BagPad.vue';

/** A squeeze as the engine would record it: the pace is the engine's to judge, not the test's. */
function breath(gap: number | null, held: number, towardHandOver: number | null = null): Breath {
  return { t: 20, held, gap, onPace: gapOnPace(gap) && holdOnPace(held), towardHandOver };
}

/** Just the parts of a run the pad reads. */
function pad(
  options: {
    holder?: BagHolder;
    since?: number | null;
    last?: Breath | null;
    inARow?: number;
    earned?: boolean;
    coached?: boolean;
    /** Seconds the screen is ahead of the run's last step. */
    ahead?: () => number;
  } = {},
) {
  const squeeze = vi.fn();
  const handBag = vi.fn();
  const run = {
    bagHeldBy: ref(options.holder ?? 'player'),
    sinceBreath: ref(options.since ?? null),
    lastBreath: ref(options.last ?? null),
    paceRun: ref(options.inARow ?? 0),
    handOverEarned: ref(options.earned ?? false),
    ahead: options.ahead ?? (() => 0),
    squeeze,
    handBag,
  } as unknown as Run;
  const wrapper = mount(BagPad, { props: { run, coached: options.coached ?? false } });
  return { wrapper, squeeze, handBag };
}

/**
 * The screen's clock and its frames, moved by hand. The pad asks for a frame
 * for as long as it is up, so every test here draws its own or none.
 */
function frames() {
  const now = vi.spyOn(performance, 'now').mockReturnValue(0);
  let next: FrameRequestCallback | null = null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    next = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    next = null;
  });
  return {
    at(ms: number): void {
      now.mockReturnValue(ms);
    },
    draw(ms: number): void {
      now.mockReturnValue(ms);
      const cb = next;
      next = null;
      cb?.(ms);
    },
  };
}

const PAGE_LINE = findProtocol('bvm')!.steps.find((s) =>
  s.text.includes('just enough to see the chest rise'),
)!.text;

let clock: ReturnType<typeof frames>;

beforeEach(() => {
  clock = frames();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the bag in the player’s hand', () => {
  it('one press and release is one breath, timed by how long it was held', async () => {
    const { wrapper, squeeze } = pad();
    clock.at(1_000);
    await wrapper.find('.squeeze').trigger('pointerdown');
    expect(wrapper.emitted('squeezing')?.at(-1)).toEqual([true]);
    expect(squeeze).not.toHaveBeenCalled();
    clock.at(2_200);
    await wrapper.find('.squeeze').trigger('pointerup');
    expect(squeeze).toHaveBeenCalledTimes(1);
    expect(squeeze.mock.calls[0]?.[0]).toBeCloseTo(1.2);
    expect(wrapper.emitted('squeezing')?.at(-1)).toEqual([false]);
  });

  it('a finger that slides off ends the breath once, not twice', async () => {
    const { wrapper, squeeze } = pad();
    await wrapper.find('.squeeze').trigger('pointerdown');
    await wrapper.find('.squeeze').trigger('pointerleave');
    await wrapper.find('.squeeze').trigger('pointerup');
    expect(squeeze).toHaveBeenCalledTimes(1);
  });
});

describe('the timer on the pad', () => {
  it('is there in a scored run as in a practice one, counting whole seconds since the last squeeze began', () => {
    for (const coached of [false, true]) {
      const { wrapper } = pad({ since: 4.6, coached });
      expect(wrapper.find('.ring').exists()).toBe(true);
      expect(wrapper.find('.ring-n').text()).toBe('4');
      expect(wrapper.find('.ring').classes()).not.toContain('is-due');
    }
  });

  it('reads as due before the first breath, and once the page’s gap has passed', () => {
    const first = pad();
    expect(first.wrapper.find('.ring').classes()).toContain('is-due');
    expect(first.wrapper.find('.ring-n').text()).toBe('');

    const nearly = pad({ since: BREATH.everySec - 0.2 });
    expect(nearly.wrapper.find('.ring').classes()).not.toContain('is-due');

    const due = pad({ since: BREATH.everySec + 1.3 });
    expect(due.wrapper.find('.ring').classes()).toContain('is-due');
    expect(due.wrapper.find('.ring-n').text()).toBe(String(BREATH.everySec + 1));
  });

  it('is carried on between two steps of the run by the screen’s own clock, so it comes due on time', async () => {
    let ahead = 0;
    const { wrapper } = pad({ since: BREATH.everySec - 0.2, ahead: () => ahead });
    expect(wrapper.find('.ring').classes()).not.toContain('is-due');
    expect(wrapper.find('.ring-n').text()).toBe(String(BREATH.everySec - 1));

    ahead = 0.21;
    clock.draw(16);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ring').classes()).toContain('is-due');
    expect(wrapper.find('.ring-n').text()).toBe(String(BREATH.everySec));
  });

  it('starts again the moment the bag is pressed, and counts through the squeeze', async () => {
    const { wrapper } = pad({ since: BREATH.everySec + 2 });
    await wrapper.find('.squeeze').trigger('pointerdown');
    expect(wrapper.find('.ring').classes()).not.toContain('is-due');
    expect(wrapper.find('.ring-n').text()).toBe('0');
    clock.draw(1_100);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ring-n').text()).toBe('1');
  });
});

describe('the squeeze, felt', () => {
  const sweep = (wrapper: ReturnType<typeof pad>['wrapper']): number =>
    Number(/scaleX\(([\d.]+)\)/.exec(wrapper.find('.sweep').attributes('style') ?? '')?.[1]);
  const mark = (wrapper: ReturnType<typeof pad>['wrapper']): number =>
    Number(/left:\s*([\d.]+)%/.exec(wrapper.find('.mark').attributes('style') ?? '')?.[1]) / 100;

  it('a fill sweeps across the button and reaches the mark at the page’s breath length', async () => {
    const { wrapper } = pad();
    expect(mark(wrapper)).toBeGreaterThan(0.5);
    expect(mark(wrapper)).toBeLessThan(1);

    await wrapper.find('.squeeze').trigger('pointerdown');
    expect(wrapper.find('.squeeze').classes()).toContain('is-down');
    expect(sweep(wrapper)).toBe(0);

    clock.draw((BREATH.overSec * 1_000) / 2);
    await wrapper.vm.$nextTick();
    expect(sweep(wrapper)).toBeCloseTo(mark(wrapper) / 2, 2);

    clock.draw(BREATH.overSec * 1_000);
    await wrapper.vm.$nextTick();
    expect(sweep(wrapper)).toBeCloseTo(mark(wrapper), 2);

    // Held on, it runs to the far edge and stops there.
    clock.draw(BREATH.overSec * 5_000);
    await wrapper.vm.$nextTick();
    expect(sweep(wrapper)).toBe(1);
  });

  it('stays where the bag was let go, and starts from nothing at the next press', async () => {
    const { wrapper } = pad();
    await wrapper.find('.squeeze').trigger('pointerdown');
    clock.at(BREATH.overSec * 1_000);
    await wrapper.find('.squeeze').trigger('pointerup');
    expect(wrapper.find('.squeeze').classes()).not.toContain('is-down');
    expect(sweep(wrapper)).toBeCloseTo(mark(wrapper), 2);

    clock.at(7_000);
    await wrapper.find('.squeeze').trigger('pointerdown');
    expect(sweep(wrapper)).toBe(0);
  });
});

describe('the line under the pad', () => {
  const hint = (last: Breath, coached = false) =>
    pad({ last, since: 2, coached }).wrapper.find('.hint');

  it('says nothing before the first breath', () => {
    const { wrapper } = pad();
    expect(wrapper.find('.fact').text()).toBe('');
    expect(wrapper.find('.page-line').exists()).toBe(false);
  });

  it('an early breath: the seconds since the last, beside the page’s own gap', () => {
    const line = hint(breath(3.4, BREATH.overSec));
    expect(line.find('.fact').text()).toBe('3 s since the last breath');
    expect(line.find('.page-line').text()).toBe(`BVM page ${BREATH_WORDS.every}`);
  });

  it('a late breath: the same fact, the same words', () => {
    const line = hint(breath(12.2, BREATH.overSec));
    expect(line.find('.fact').text()).toBe('12 s since the last breath');
    expect(line.find('.page-line').text()).toBe(`BVM page ${BREATH_WORDS.every}`);
  });

  it('a short tap: how long it was held, beside the page’s own length', () => {
    const line = hint(breath(BREATH.everySec, 0.34));
    expect(line.find('.fact').text()).toBe('Held 0.3 s');
    expect(line.find('.page-line').text()).toBe(`BVM page ${BREATH_WORDS.over}`);
  });

  it('a long hold: the same', () => {
    const line = hint(breath(BREATH.everySec, 3));
    expect(line.find('.fact').text()).toBe('Held 3.0 s');
    expect(line.find('.page-line').text()).toBe(`BVM page ${BREATH_WORDS.over}`);
  });

  it('a first breath has no gap to state, only its hold', () => {
    const line = hint(breath(null, 0.2));
    expect(line.find('.fact').text()).toBe('Held 0.2 s');
  });

  it('both off: both facts, and the page’s words for both', () => {
    const line = hint(breath(2, 0.3));
    expect(line.find('.fact').text()).toBe('2 s since the last breath, held 0.3 s');
    expect(line.find('.page-line').text()).toBe(`BVM page ${BREATH_WORDS.both}`);
  });

  it('breaths a fraction of a second apart are counted to the tenth', () => {
    const line = hint(breath(0.62, BREATH.overSec * 0.5));
    expect(line.find('.fact').text()).toBe('0.6 s since the last breath');
  });

  it('a breath on pace says so, with the count toward the hand-over while there is one', () => {
    const second = hint(breath(BREATH.everySec, BREATH.overSec, 2));
    expect(second.find('.fact').text()).toBe(`On pace · 2 of ${HAND_OVER_AFTER}`);
    expect(second.find('.page-line').exists()).toBe(false);

    const later = hint(breath(BREATH.everySec, BREATH.overSec, null));
    expect(later.find('.fact').text()).toBe('On pace');
  });

  it('is cleared while the next breath is being squeezed', async () => {
    const { wrapper } = pad({ last: breath(3, BREATH.overSec), since: 3 });
    expect(wrapper.find('.fact').text()).not.toBe('');
    await wrapper.find('.squeeze').trigger('pointerdown');
    expect(wrapper.find('.fact').text()).toBe('');
    expect(wrapper.find('.page-line').exists()).toBe(false);
  });

  it('states facts beside the page’s words and gives no advice of its own', () => {
    const lines = [
      breath(3, BREATH.overSec),
      breath(14, BREATH.overSec),
      breath(BREATH.everySec, 0.2),
      breath(BREATH.everySec, 4),
      breath(1, 5),
      breath(BREATH.everySec, BREATH.overSec, 1),
    ].map((b) => hint(b).text());
    for (const text of lines) {
      expect(text).not.toMatch(/should|too |slow|fast|quick|try|aim|wait|early|late|long|short/i);
    }
  });

  it('a practice run keeps printing the BVM page’s whole line, breath or no breath', () => {
    const idle = pad({ coached: true });
    expect(idle.wrapper.find('.page-line').text()).toBe(`BVM page ${PAGE_LINE}`);

    const off = hint(breath(3, BREATH.overSec), true);
    expect(off.find('.fact').text()).toBe('3 s since the last breath');
    expect(off.find('.page-line').text()).toBe(`BVM page ${PAGE_LINE}`);
    expect(off.findAll('.page-line')).toHaveLength(1);
  });

  it('a scored run prints the page’s words only beside a breath that missed them', () => {
    const { wrapper } = pad({ since: 4 });
    expect(wrapper.find('.page-line').exists()).toBe(false);
  });
});

describe('handing the bag over', () => {
  it('the assistant’s pill is locked, with the count as the reason, until the hand-over is earned', async () => {
    const { wrapper, handBag } = pad({ inARow: 1 });
    const pill = wrapper.find('.hand');
    expect(pill.attributes('disabled')).toBeDefined();
    expect(pill.text()).toContain('DA takes the bag');
    expect(pill.find('.hand-why').text()).toBe(`On pace 1 of ${HAND_OVER_AFTER}`);
    await pill.trigger('click');
    expect(handBag).not.toHaveBeenCalled();
  });

  it('earned, it is a plain pill again and hands the bag to the assistant', async () => {
    const { wrapper, handBag } = pad({ earned: true, inARow: HAND_OVER_AFTER });
    const pill = wrapper.find('.hand');
    expect(pill.attributes('disabled')).toBeUndefined();
    expect(pill.text()).toBe('DA takes the bag');
    await pill.trigger('click');
    expect(handBag).toHaveBeenCalledWith('da');
  });

  it('with the assistant on the bag there is nothing to squeeze, and it can be taken back', async () => {
    const hers = pad({ holder: 'da', earned: true });
    expect(hers.wrapper.find('.squeeze').exists()).toBe(false);
    expect(hers.wrapper.find('.ring').exists()).toBe(false);
    expect(hers.wrapper.text()).toContain('has the bag');
    await hers.wrapper.find('.hand').trigger('click');
    expect(hers.handBag).toHaveBeenCalledWith('player');
  });
});
