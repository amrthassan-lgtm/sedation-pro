/**
 * Pre-sedation nicotine protocol for current smokers, by cigarettes/day:
 *
 * | cigs/day | Pre-op instruction                |
 * | -------- | --------------------------------- |
 * | < 10     | No smoking · 12 hr before         |
 * | 10-19    | No smoking · 8 hr before          |
 * | 20-29    | No smoking · 4 hr before          |
 * | ≥ 30     | Smoke right before · heavy smoker |
 *
 * Heavy smokers are advised to smoke immediately pre-op because abrupt
 * withdrawal in surgery raises cardiovascular reactivity.
 */
export type NicotineProtocolTier =
  | 'no-smoking-12h'
  | 'no-smoking-8h'
  | 'no-smoking-4h'
  | 'smoke-immediately';

export interface NicotineProtocol {
  readonly tier: NicotineProtocolTier;
  readonly hoursBefore: number;
  readonly instruction: string;
}

export function nicotineProtocol(cigsPerDay: number): NicotineProtocol | null {
  if (!Number.isFinite(cigsPerDay) || cigsPerDay < 0) return null;
  if (cigsPerDay < 10) {
    return {
      tier: 'no-smoking-12h',
      hoursBefore: 12,
      instruction: 'No smoking 12 hours before appointment',
    };
  }
  if (cigsPerDay < 20) {
    return {
      tier: 'no-smoking-8h',
      hoursBefore: 8,
      instruction: 'No smoking 8 hours before appointment',
    };
  }
  if (cigsPerDay < 30) {
    return {
      tier: 'no-smoking-4h',
      hoursBefore: 4,
      instruction: 'No smoking 4 hours before appointment',
    };
  }
  return {
    tier: 'smoke-immediately',
    hoursBefore: 0,
    instruction: 'Smoke right before appointment (heavy smoker)',
  };
}
