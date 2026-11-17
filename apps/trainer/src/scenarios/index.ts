import type { Scenario } from '@/engine/types';

import { crown } from './crown';
import { quiet } from './quiet';
import { stridor } from './stridor';
import { tight } from './tight';
import { wheeze } from './wheeze';

/** In the order they appear on the home screen. */
export const SCENARIOS: ReadonlyArray<Scenario> = [quiet, tight, wheeze, crown, stridor];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
