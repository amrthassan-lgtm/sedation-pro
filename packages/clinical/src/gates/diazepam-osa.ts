import type { OsaStatus } from '../types';

/**
 * Bedtime diazepam gating outcome.
 *
 * - `allow`: OSA is `'none'` — prescribe normally.
 * - `block-missing-osa`: OSA status hasn't been recorded. UI must collect it
 *   before any diazepam button can fire.
 * - `requires-override-osa`: OSA or CPAP is documented. Diazepam is
 *   contraindicated for airway risk — UI must surface an override modal that
 *   the prescriber consciously confirms.
 */
export type DiazepamGateDecision = 'allow' | 'block-missing-osa' | 'requires-override-osa';

export function diazepamGate(osa: OsaStatus | null | undefined): DiazepamGateDecision {
  if (osa === null || osa === undefined) return 'block-missing-osa';
  if (osa === 'osa-diagnosed' || osa === 'cpap-prescribed') return 'requires-override-osa';
  return 'allow';
}
