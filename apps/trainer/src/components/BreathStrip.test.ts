import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { findProtocol } from '@sedation-pro/clinical';

import { BREATH, gapOnPace, holdOnPace } from '@/engine/engine';
import type { Breath } from '@/engine/types';

import BreathStrip from './BreathStrip.vue';

/** Squeezes let go `gap` seconds apart, each held for `held`, judged as the engine judges them. */
const every = (gap: number, times: number, from = 10, held = BREATH.overSec): Breath[] =>
  Array.from({ length: times }, (_, i) => {
    const since = i === 0 ? null : gap;
    return {
      t: from + i * gap,
      held,
      gap: since,
      onPace: gapOnPace(since) && holdOnPace(held),
      towardHandOver: null,
    };
  });

const strip = (
  breaths: ReadonlyArray<Breath>,
  assistantBagging: Array<{ from: number; to: number }> = [],
) => mount(BreathStrip, { props: { breaths, assistantBagging } });

describe('the breaths a debrief draws', () => {
  it('draws nothing for a run where the player never squeezed the bag', () => {
    expect(strip([]).find('.strip').exists()).toBe(false);
  });

  it('draws one bar a squeeze for the first minute, and counts them', () => {
    const drawn = strip(every(BREATH.everySec, 15));
    expect(drawn.findAll('.bar')).toHaveLength(11);
    expect(drawn.text()).toContain('11 in the first minute · 15 in all');
  });

  it('marks the gap the BVM page writes and prints its line, with no advice of its own', () => {
    const drawn = strip(every(3, 4));
    const line = findProtocol('bvm')!.steps.find((s) =>
      s.text.includes('just enough to see the chest rise'),
    )!.text;
    expect(drawn.text()).toContain(line);
    expect(drawn.text()).toContain(`Dotted lines are ${BREATH.everySec} seconds apart`);
    expect(drawn.findAll('.mark')).toHaveLength(60 / BREATH.everySec + 1);
    expect(drawn.text()).not.toMatch(/should|too fast|too slow|try/i);
  });

  it('draws each bar from where the squeeze began to where it was let go', () => {
    const [first, second] = strip(every(BREATH.everySec, 2)).findAll('.bar');
    const left = (bar: typeof first): number => Number(bar!.attributes('x'));
    const width = (bar: typeof first): number => Number(bar!.attributes('width'));
    // One page's gap apart is one dotted line apart, and a bar is as wide as its hold.
    const marks = strip(every(BREATH.everySec, 2))
      .findAll('.mark')
      .map((m) => Number(m.attributes('x1')));
    expect(left(first)).toBeCloseTo(marks[0]!);
    expect(left(second)).toBeCloseTo(marks[1]!);
    expect(width(first)).toBeCloseTo(((marks[1]! - marks[0]!) * BREATH.overSec) / BREATH.everySec);

    // A long hold let go late began on time: its bar starts on the line.
    const long: Breath[] = [
      ...every(BREATH.everySec, 1),
      {
        t: 10 + BREATH.everySec + 2,
        held: 3,
        gap: BREATH.everySec,
        onPace: false,
        towardHandOver: null,
      },
    ];
    expect(left(strip(long).findAll('.bar')[1])).toBeCloseTo(marks[1]!, 0);
  });

  it('draws a breath that was off pace as an outline, and says which is which', () => {
    const drawn = strip([...every(BREATH.everySec, 4), ...every(2, 3, 40)]);
    expect(drawn.findAll('.bar')).toHaveLength(7);
    // The first of the fast three came a long way after the fourth, the next two too soon.
    expect(drawn.findAll('.bar.is-off')).toHaveLength(2);
    expect(drawn.find('.strip-note').text()).toContain(
      'Each bar is one squeeze, as wide as it was held: solid when it was on pace, outlined when it was not.',
    );
    expect(drawn.text()).not.toMatch(/should|too fast|too slow|try/i);
  });

  it('a run with every breath on pace has no outlines', () => {
    expect(strip(every(BREATH.everySec, 6)).findAll('.bar.is-off')).toHaveLength(0);
  });

  it('a run saved before breaths were judged is drawn as it was, with nothing said about pace', () => {
    const old = [10, 13, 16].map((t) => ({ t, held: 1 })) as unknown as Breath[];
    const drawn = strip(old);
    expect(drawn.findAll('.bar')).toHaveLength(3);
    expect(drawn.findAll('.bar.is-off')).toHaveLength(0);
    expect(drawn.text()).toContain('Each bar is one squeeze, as wide as it was held.');
    expect(drawn.text()).not.toContain('on pace');
  });

  it('shades the stretch the assistant had the bag', () => {
    const drawn = strip(every(6, 3), [{ from: 30, to: 50 }]);
    expect(drawn.findAll('.handed')).toHaveLength(1);
    expect(drawn.text()).toContain('the assistant had the bag');
  });
});
