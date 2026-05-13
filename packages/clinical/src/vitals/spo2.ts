import type { Severity } from '../types';

/**
 * SpO₂ classification:
 *
 * | Category       | SpO₂ %       |
 * | -------------- | ------------ |
 * | normal         | ≥ 95         |
 * | mild           | 90-94        |
 * | severe         | < 90         |
 */
export type Spo2Category = 'normal' | 'mild' | 'severe';

export interface Spo2Result {
  readonly value: number;
  readonly category: Spo2Category;
  readonly severity: Severity;
}

export function classifySpo2(value: number): Spo2Result | null {
  if (!Number.isFinite(value)) return null;
  if (value <= 0 || value > 100) return null;
  if (value >= 95) return { value, category: 'normal', severity: 'safe' };
  if (value >= 90) return { value, category: 'mild', severity: 'caution' };
  return { value, category: 'severe', severity: 'crisis' };
}
