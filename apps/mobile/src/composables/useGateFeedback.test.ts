import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';

import { useGateFeedback, type GateEntry } from './useGateFeedback';

describe('useGateFeedback', () => {
  it('does not flag anything until an attempt is made', () => {
    const entries = computed<GateEntry[]>(() => [{ anchorId: 'a', failing: true }]);
    const g = useGateFeedback({ entries, scrollTo: () => {} });
    expect(g.isInvalid('a')).toBe(false);
  });

  it('flags only failing entries once attempted', async () => {
    const entries = computed<GateEntry[]>(() => [
      { anchorId: 'a', failing: true },
      { anchorId: 'b', failing: false },
    ]);
    const g = useGateFeedback({ entries, scrollTo: () => {} });
    await g.attempt();
    expect(g.isInvalid('a')).toBe(true);
    expect(g.isInvalid('b')).toBe(false);
    expect(g.isInvalid('unknown')).toBe(false);
  });

  it('attempt scrolls to the first failing entry in order and returns false', async () => {
    const scrolled: string[] = [];
    const entries = computed<GateEntry[]>(() => [
      { anchorId: 'first', failing: false },
      { anchorId: 'second', failing: true },
      { anchorId: 'third', failing: true },
    ]);
    const g = useGateFeedback({ entries, scrollTo: (id) => scrolled.push(id) });
    const ok = await g.attempt();
    expect(ok).toBe(false);
    expect(scrolled).toEqual(['second']);
  });

  it('attempt returns true and does not scroll when nothing fails', async () => {
    const scrolled: string[] = [];
    const entries = computed<GateEntry[]>(() => [{ anchorId: 'a', failing: false }]);
    const g = useGateFeedback({ entries, scrollTo: (id) => scrolled.push(id) });
    expect(await g.attempt()).toBe(true);
    expect(scrolled).toEqual([]);
  });

  it('respects an external attempted ref (Phase 1 store flag)', () => {
    const attempted = ref(false);
    const entries = computed<GateEntry[]>(() => [{ anchorId: 'a', failing: true }]);
    const g = useGateFeedback({ entries, attempted, scrollTo: () => {} });
    expect(g.isInvalid('a')).toBe(false);
    attempted.value = true;
    expect(g.isInvalid('a')).toBe(true);
  });
});
