import { beforeEach, describe, expect, it } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import { forgetStepFolds, isScrolledPast, SCROLLED_PAST_PX, useStepFold } from './useStepFold';

function mount(key: string, done: { value: boolean }) {
  const scope = effectScope();
  const fold = scope.run(() => useStepFold(key, () => done.value, ref(null)))!;
  return { ...fold, leave: () => scope.stop() };
}

describe('useStepFold', () => {
  beforeEach(() => forgetStepFolds());

  it('a step still to do is open', () => {
    expect(mount('a', ref(false)).folded.value).toBe(false);
  });

  it('a step already finished comes up folded on arrival', () => {
    expect(mount('a', ref(true)).folded.value).toBe(true);
  });

  it('a step finished while you are on it stays open: it never folds under the finger', async () => {
    const done = ref(false);
    const step = mount('a', done);

    done.value = true;
    await nextTick();

    expect(step.folded.value).toBe(false);
  });

  it('opens again when the step is undone, and forgets it was folded', async () => {
    const done = ref(true);
    const step = mount('a', done);
    expect(step.folded.value).toBe(true);

    done.value = false;
    await nextTick();
    expect(step.folded.value).toBe(false);

    step.leave();
    done.value = true;
    expect(mount('a', done).folded.value).toBe(true);
  });

  it('remembers a step opened by hand when the screen is left and come back to', () => {
    const done = ref(true);
    const step = mount('a', done);
    step.open();
    step.leave();

    expect(mount('a', done).folded.value).toBe(false);
  });

  it('remembers a step folded by hand the same way', () => {
    const done = ref(true);
    const step = mount('a', done);
    step.open();
    step.fold();
    step.leave();

    expect(mount('a', done).folded.value).toBe(true);
  });

  it('keeps each step on its own key', () => {
    const done = ref(true);
    mount('a', done).open();

    expect(mount('b', done).folded.value).toBe(true);
  });

  it('counts a card as scrolled past only once its bottom is under the top bar', () => {
    expect(isScrolledPast(SCROLLED_PAST_PX)).toBe(true);
    expect(isScrolledPast(SCROLLED_PAST_PX + 1)).toBe(false);
    expect(isScrolledPast(-400)).toBe(true);
  });
});
