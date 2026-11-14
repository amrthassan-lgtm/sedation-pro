import type { Scenario } from '@/engine/types';

import { quiet } from './quiet';
import { wheeze } from './wheeze';

/** In the order they appear on the home screen. */
export const SCENARIOS: ReadonlyArray<Scenario> = [quiet, wheeze];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
