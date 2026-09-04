import { describe, expect, it } from 'vitest';

import { ivSedationReadiness } from './iv-sedation-readiness';
import { PHASE1_REQUIRED_FIELDS } from './phase1-completeness';

describe('ivSedationReadiness', () => {
  it('is ready once the EKG is confirmed', () => {
    const r = ivSedationReadiness({ ekgPlaced: true });

    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('blocks with a named code when the EKG is not confirmed', () => {
    const r = ivSedationReadiness({ ekgPlaced: false });

    expect(r.ready).toBe(false);
    expect(r.blockers.map((b) => b.code)).toEqual(['ekg-not-confirmed']);
  });

  /**
   * The blocker is read off a disabled control, so it has to say what to do
   * rather than only what is wrong — otherwise the clinician meets a dead
   * button with no explanation at the moment they reach for the syringe.
   */
  it('names the remedy, not just the fault', () => {
    const blocker = ivSedationReadiness({ ekgPlaced: false }).blockers[0];

    expect(blocker?.label).toMatch(/EKG/i);
    expect(blocker?.detail).toMatch(/phase 1/i);
  });

  /**
   * The rule this gate exists to express: EKG confirmation is a
   * day-of-sedation check, so it must NOT sit in the Phase 1 completeness
   * set. An assessment-only visit never places leads, and requiring it there
   * forced the clinician to assert a monitoring step that never happened in
   * order to reach the note. This assertion is the tripwire on that move —
   * if `ekg_placed` reappears in Phase 1, the two gates are fighting.
   */
  it('is the only place EKG gates the workflow', () => {
    expect(PHASE1_REQUIRED_FIELDS.map((f) => f.id)).not.toContain('ekg_placed');
  });
});
