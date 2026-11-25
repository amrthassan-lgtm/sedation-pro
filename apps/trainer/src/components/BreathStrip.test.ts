import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { findProtocol } from '@sedation-pro/clinical';

import { BREATH } from '@/engine/engine';
import type { Breath } from '@/engine/types';

import BreathStrip from './BreathStrip.vue';

const every = (gap: number, times: number, from = 10): Breath[] =>
  Array.from({ length: times }, (_, i) => ({ t: from + i * gap, held: 1 }));

describe('the breaths a debrief draws', () => {
  it('draws nothing for a run where the player never squeezed the bag', () => {
    const strip = mount(BreathStrip, { props: { breaths: [], assistantBagging: [] } });
    expect(strip.find('.strip').exists()).toBe(false);
  });

  it('draws one bar a squeeze for the first minute, and counts them', () => {
    const strip = mount(BreathStrip, {
      props: { breaths: every(BREATH.everySec, 15), assistantBagging: [] },
    });
    expect(strip.findAll('.bar')).toHaveLength(11);
    expect(strip.text()).toContain('11 in the first minute · 15 in all');
  });

  it('marks the gap the BVM page writes and prints its line, with no advice of its own', () => {
    const strip = mount(BreathStrip, { props: { breaths: every(3, 4), assistantBagging: [] } });
    const line = findProtocol('bvm')!.steps.find((s) =>
      s.text.includes('just enough to see the chest rise'),
    )!.text;
    expect(strip.text()).toContain(line);
    expect(strip.text()).toContain(`Dotted lines are ${BREATH.everySec} seconds apart`);
    expect(strip.findAll('.mark')).toHaveLength(60 / BREATH.everySec + 1);
    expect(strip.text()).not.toMatch(/should|too fast|too slow|try/i);
  });

  it('shades the stretch the assistant had the bag', () => {
    const strip = mount(BreathStrip, {
      props: { breaths: every(6, 3), assistantBagging: [{ from: 30, to: 50 }] },
    });
    expect(strip.findAll('.handed')).toHaveLength(1);
    expect(strip.text()).toContain('the assistant had the bag');
  });
});
