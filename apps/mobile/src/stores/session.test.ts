import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useSessionStore } from './session';

describe('session store: back to case', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('remembers the last case phase across a Quick Reference detour', () => {
    const s = useSessionStore();
    s.setPhase('phase3');
    s.setPhase('quickref');
    expect(s.currentPhase).toBe('quickref');
    expect(s.lastCasePhase).toBe('phase3');
    s.setPhase('inventory');
    expect(s.lastCasePhase).toBe('phase3');
  });

  it('keeps a scroll position per case phase and ignores non-case screens', () => {
    const s = useSessionStore();
    s.rememberScroll('phase3', 420);
    s.rememberScroll('quickref', 99);
    expect(s.caseScroll).toEqual({ phase3: 420 });
    s.rememberScroll('phase3', 10);
    expect(s.caseScroll.phase3).toBe(10);
  });
});
