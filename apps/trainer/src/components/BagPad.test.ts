import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { findProtocol } from '@sedation-pro/clinical';

import type { Run } from '@/composables/useRun';
import {
  BREATH,
  BREATH_WORDS,
  CPR,
  CPR_WORDS,
  gapOnPace,
  HAND_OVER_AFTER,
  holdOnPace,
} from '@/engine/engine';
import type { BagHolder, Breath, Compressions, CyclePause } from '@/engine/types';

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
    /** Where the assistant's hands are, with CPR on. */
    chest?: Compressions | null;
    pauses?: CyclePause[];
    /** The run's clock. */
    t?: number;
    /** No pulse wave on the monitor. */
    pulseless?: boolean;
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
    compressions: ref(options.chest ?? null),
    pauses: ref(options.pauses ?? []),
    t: ref(options.t ?? 0),
    monitor: ref({ perfusion: options.pulseless ? 0 : 1 }),
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

describe('with the assistant on the chest (owner, Nov 2026)', () => {
  /** Seconds into a set at which she has counted `n` compressions, at the page's rate. */
  const counted = (n: number): number => (n * 60) / CPR.perMin + 0.01;
  const compressing = (elapsed: number): Compressions => ({
    mode: 'cycle',
    compressing: true,
    elapsed,
    breaths: 0,
  });
  const pausing = (breaths: number): Compressions => ({
    mode: 'cycle',
    compressing: false,
    elapsed: 0.5,
    breaths,
  });
  /** A squeeze of the cycle, as the engine would record it. */
  const cycleBreath = (cycle: 'pause' | 'compressions', held = BREATH.overSec): Breath => ({
    t: 30,
    held,
    gap: 2,
    onPace: cycle === 'pause' && holdOnPace(held),
    towardHandOver: null,
    cycle,
  });

  it('there is no hand-over to offer: the bag is the player’s for as long as CPR is on', () => {
    for (const chest of [compressing(3), pausing(0), { ...compressing(3), mode: 'continuous' }]) {
      const { wrapper } = pad({ chest: chest as Compressions, earned: true });
      expect(wrapper.find('.hand').exists()).toBe(false);
      expect(wrapper.find('.squeeze').exists()).toBe(true);
      expect(wrapper.text()).not.toContain('DA takes the bag');
    }
  });

  it('the ring keeps her time: it counts her compressions to the page’s thirty, at the page’s rate', () => {
    expect(CPR).toMatchObject({ compressions: 30, breaths: 2, perMin: 110 });
    const start = pad({ chest: compressing(0) });
    expect(start.wrapper.find('.ring-n').text()).toBe('0');
    expect(start.wrapper.find('.ring').classes()).not.toContain('is-due');

    const mid = pad({ chest: compressing(counted(12)) });
    expect(mid.wrapper.find('.ring-n').text()).toBe('12');
    expect(mid.wrapper.find('.ring').classes()).not.toContain('is-due');
    // The arc is as far round as she has counted.
    const dash = Number(mid.wrapper.find('.ring-fill').attributes('stroke-dasharray'));
    const offset = Number(mid.wrapper.find('.ring-fill').attributes('stroke-dashoffset'));
    expect(1 - offset / dash).toBeCloseTo(12 / 30, 5);

    const nearly = pad({ chest: compressing(counted(29)) });
    expect(nearly.wrapper.find('.ring-n').text()).toBe('29');
  });

  it('is carried on between two steps of the run by the screen’s own clock, as the bag’s ring is', async () => {
    let ahead = 0;
    const { wrapper } = pad({ chest: compressing(counted(12)), ahead: () => ahead });
    expect(wrapper.find('.ring-n').text()).toBe('12');
    ahead = 60 / CPR.perMin;
    clock.draw(16);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ring-n').text()).toBe('13');
  });

  it('at thirty it stands white with the breaths her pause is waiting for: two, then one', () => {
    const waiting = pad({ chest: pausing(0) });
    expect(waiting.wrapper.find('.ring').classes()).toContain('is-due');
    expect(waiting.wrapper.find('.ring-n').text()).toBe('2');

    const one = pad({ chest: pausing(1) });
    expect(one.wrapper.find('.ring').classes()).toContain('is-due');
    expect(one.wrapper.find('.ring-n').text()).toBe('1');

    // The thirtieth is counted on the screen a moment before the run's next step says so.
    const counting = pad({ chest: compressing(counted(30)) });
    expect(counting.wrapper.find('.ring').classes()).toContain('is-due');
    expect(counting.wrapper.find('.ring-n').text()).toBe('2');
  });

  it('the bag is at rest while she compresses, and the white button the moment her pause wants a breath', () => {
    const resting = pad({ chest: compressing(counted(12)) });
    expect(resting.wrapper.find('.squeeze').classes()).toContain('is-resting');
    // Still a button, and still his to squeeze.
    expect(resting.wrapper.find('.squeeze').attributes('disabled')).toBeUndefined();

    for (const chest of [pausing(0), pausing(1), compressing(counted(30))]) {
      expect(pad({ chest }).wrapper.find('.squeeze').classes()).not.toContain('is-resting');
    }
    // Wanted this instant when her pause begins, so it does not fade in; not once a breath is in.
    expect(
      pad({ chest: pausing(0) })
        .wrapper.find('.squeeze')
        .classes(),
    ).toContain('is-called');
    expect(
      pad({ chest: compressing(counted(30)) })
        .wrapper.find('.squeeze')
        .classes(),
    ).toContain('is-called');
    expect(
      pad({ chest: pausing(1) })
        .wrapper.find('.squeeze')
        .classes(),
    ).not.toContain('is-called');
    expect(resting.wrapper.find('.squeeze').classes()).not.toContain('is-called');
    // On the bag's own time it is never at rest: a breath is always the next thing.
    expect(pad({ since: 2 }).wrapper.find('.squeeze').classes()).not.toContain('is-resting');
    const tube: Compressions = { mode: 'continuous', compressing: true, elapsed: 9, breaths: 0 };
    expect(pad({ chest: tube, since: 2 }).wrapper.find('.squeeze').classes()).not.toContain(
      'is-resting',
    );
  });

  it('pressed in a pause it goes on showing the pause, not the seconds of the squeeze', async () => {
    const { wrapper, squeeze } = pad({ chest: pausing(0) });
    clock.at(1_000);
    await wrapper.find('.squeeze').trigger('pointerdown');
    clock.draw(1_900);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.ring-n').text()).toBe('2');
    expect(wrapper.find('.ring').classes()).toContain('is-due');
    clock.at(2_000);
    await wrapper.find('.squeeze').trigger('pointerup');
    expect(squeeze).toHaveBeenCalledTimes(1);
    expect(squeeze.mock.calls[0]?.[0]).toBeCloseTo(1);
  });

  it('a breath in the pause: which of the two it was, and nothing about a gap', () => {
    const first = pad({
      chest: pausing(1),
      last: cycleBreath('pause'),
      pauses: [{ t: 16, ended: null, breaths: 1, wentIn: 1 }],
    });
    expect(first.wrapper.find('.fact').text()).toBe('Breath 1 of 2');
    expect(first.wrapper.find('.fact').classes()).not.toContain('is-off');
    expect(first.wrapper.find('.page-line').exists()).toBe(false);

    const second = pad({
      chest: compressing(0.5),
      last: cycleBreath('pause'),
      pauses: [{ t: 16, ended: 30, breaths: 2, wentIn: 2 }],
      t: 30.5,
    });
    expect(second.wrapper.find('.fact').text()).toBe('Breath 2 of 2');
    expect(second.wrapper.find('.page-line').exists()).toBe(false);
  });

  it('a pause’s breath off the page’s length: how long it was held, beside the BVM page’s own length', () => {
    const { wrapper } = pad({
      chest: pausing(1),
      last: cycleBreath('pause', 0.3),
      pauses: [{ t: 16, ended: null, breaths: 1, wentIn: 1 }],
    });
    expect(wrapper.find('.fact').text()).toBe('Breath 1 of 2, held 0.3 s');
    expect(wrapper.find('.fact').classes()).toContain('is-off');
    expect(wrapper.find('.page-line').text()).toBe(`BVM page ${BREATH_WORDS.over}`);
  });

  it('a pause that went by short: how many breaths it got, beside the arrest page’s own 30:2', () => {
    const none = pad({
      chest: compressing(2),
      pauses: [{ t: 16, ended: 22, breaths: 0, wentIn: 0 }],
      t: 24,
    });
    expect(none.wrapper.find('.fact').text()).toBe('No breaths in the pause');
    expect(none.wrapper.find('.fact').classes()).toContain('is-off');
    expect(none.wrapper.find('.page-line').text()).toBe(`Cardiac arrest page ${CPR_WORDS.ratio}`);
    expect(CPR_WORDS.ratio).toBe('30:2');

    const one = pad({
      chest: compressing(2),
      last: { ...cycleBreath('pause'), t: 18 },
      pauses: [{ t: 16, ended: 24, breaths: 1, wentIn: 1 }],
      t: 26,
    });
    expect(one.wrapper.find('.fact').text()).toBe('1 of 2 breaths in the pause');
    expect(one.wrapper.find('.page-line').text()).toBe(`Cardiac arrest page ${CPR_WORDS.ratio}`);
  });

  it('says nothing of a pause once the set that followed it is over, or of one that had both', () => {
    // A time cut, or CPR stopped and started: this set did not follow that pause.
    const stale = pad({
      chest: compressing(2),
      pauses: [{ t: 16, ended: 22, breaths: 0, wentIn: 0 }],
      t: 150,
    });
    expect(stale.wrapper.find('.fact').text()).toBe('');
    expect(stale.wrapper.find('.page-line').exists()).toBe(false);

    const full = pad({
      chest: compressing(2),
      pauses: [{ t: 16, ended: 20, breaths: 2, wentIn: 2 }],
      t: 22,
    });
    expect(full.wrapper.find('.fact').text()).toBe('');
  });

  it('a breath squeezed while she is compressing: that fact, beside the page’s 30:2', () => {
    const { wrapper } = pad({ chest: compressing(5), last: cycleBreath('compressions') });
    expect(wrapper.find('.fact').text()).toBe('Breath during compressions');
    expect(wrapper.find('.fact').classes()).toContain('is-off');
    expect(wrapper.find('.page-line').text()).toBe(`Cardiac arrest page ${CPR_WORDS.ratio}`);
  });

  it('states facts beside the pages’ words and gives no advice of its own', () => {
    const texts = [
      pad({ chest: compressing(5), last: cycleBreath('compressions') }),
      pad({
        chest: compressing(2),
        pauses: [{ t: 16, ended: 22, breaths: 0, wentIn: 0 }],
        t: 24,
      }),
      pad({
        chest: pausing(1),
        last: cycleBreath('pause', 3),
        pauses: [{ t: 16, ended: null, breaths: 1, wentIn: 1 }],
      }),
    ].map((p) => p.wrapper.find('.hint').text());
    for (const text of texts) {
      expect(text).not.toMatch(/should|too |slow|fast|quick|try|aim|wait|early|late|long|short/i);
    }
  });

  it('a practice run prints the arrest page’s own clause for the cycle, whatever the breath', () => {
    const idle = pad({ chest: compressing(4), coached: true });
    expect(idle.wrapper.find('.page-line').text()).toBe(`Cardiac arrest page ${CPR_WORDS.until}`);
    expect(CPR_WORDS.until).toBe('30:2 until an LMA/King/ET tube is placed');
    const scored = pad({ chest: compressing(4) });
    expect(scored.wrapper.find('.page-line').exists()).toBe(false);
  });

  it('with no pulse and nobody on his chest the bag is at rest, and the pad asks for nothing', () => {
    // Before CPR has started, or with her hands off for the AED: a breath is not the next thing.
    for (const since of [null, 2, 9]) {
      const { wrapper } = pad({ pulseless: true, since, last: breath(3.4, 0.3), earned: true });
      expect(wrapper.find('.ring').classes()).not.toContain('is-due');
      expect(wrapper.find('.ring-n').text()).toBe('');
      expect(wrapper.find('.squeeze').classes()).toContain('is-resting');
      expect(wrapper.find('.hand').exists()).toBe(false);
      expect(wrapper.find('.fact').text()).toBe('');
      expect(wrapper.find('.fact').classes()).not.toContain('is-off');
      expect(wrapper.find('.page-line').exists()).toBe(false);
    }
    // A practice run prints no page's line there either: neither page's breath is what is wanting.
    expect(pad({ pulseless: true, coached: true }).wrapper.find('.page-line').exists()).toBe(false);
  });

  it('it is still the player’s to squeeze there, and a squeeze is still a breath', async () => {
    const { wrapper, squeeze } = pad({ pulseless: true });
    expect(wrapper.find('.squeeze').attributes('disabled')).toBeUndefined();
    clock.at(1_000);
    await wrapper.find('.squeeze').trigger('pointerdown');
    clock.at(2_000);
    await wrapper.find('.squeeze').trigger('pointerup');
    expect(squeeze).toHaveBeenCalledTimes(1);
  });

  it('with a pulse and no CPR it is the bag as it is in every other room', () => {
    const { wrapper } = pad({ since: BREATH.everySec + 1, inARow: 1 });
    expect(wrapper.find('.ring').classes()).toContain('is-due');
    expect(wrapper.find('.squeeze').classes()).not.toContain('is-resting');
    expect(wrapper.find('.hand').exists()).toBe(true);
  });

  it('with a tube in it is the bag’s own six-second ring again, still with no hand-over', () => {
    const chest: Compressions = { mode: 'continuous', compressing: true, elapsed: 40, breaths: 0 };
    const { wrapper } = pad({ chest, since: 4.6, last: breath(3.4, BREATH.overSec) });
    expect(wrapper.find('.ring-n').text()).toBe('4');
    expect(wrapper.find('.fact').text()).toBe('3 s since the last breath');
    expect(wrapper.find('.page-line').text()).toBe(`BVM page ${BREATH_WORDS.every}`);
    expect(wrapper.find('.hand').exists()).toBe(false);
    // A breath of the cycle before the tube went in is not held to the bag's six seconds.
    const carried = pad({ chest, since: 2, last: cycleBreath('pause') });
    expect(carried.wrapper.find('.fact').text()).toBe('');
    expect(carried.wrapper.find('.page-line').exists()).toBe(false);
  });
});
