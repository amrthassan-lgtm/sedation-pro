/**
 * BMI categories used in the legacy app (CDC adult ranges).
 * `severe` covers BMI ≥ 40 (Class III obesity) — surfaced separately because
 * the chairside UI treats it as a distinct airway-risk flag.
 */
export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese' | 'severe';

export interface BmiResult {
  readonly value: number;
  readonly category: BmiCategory;
}

/** BMI from US units: `(lb / in²) × 703`. */
export function bmiFromImperial(weightLb: number, heightIn: number): BmiResult | null {
  if (!Number.isFinite(weightLb) || weightLb <= 0) return null;
  if (!Number.isFinite(heightIn) || heightIn <= 0) return null;
  const value = (weightLb / (heightIn * heightIn)) * 703;
  return { value, category: classifyBmi(value) };
}

/** BMI from metric units: `kg / m²`. */
export function bmiFromMetric(weightKg: number, heightCm: number): BmiResult | null {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (!Number.isFinite(heightCm) || heightCm <= 0) return null;
  const m = heightCm / 100;
  const value = weightKg / (m * m);
  return { value, category: classifyBmi(value) };
}

export function classifyBmi(value: number): BmiCategory {
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'normal';
  if (value < 30) return 'overweight';
  if (value < 40) return 'obese';
  return 'severe';
}
