/**
 * Component-local types lifted out of `<script setup>` blocks so they can be
 * re-exported from the package root.
 *
 * Anything used as a *value* (component default export) stays in the .vue
 * file. Anything used as a *type* lives here.
 */

import type { Severity } from './types';

/** Severity-shaped tones for banners — adds `info` and `neutral`. */
export type BannerTone = Severity | 'info' | 'neutral';

/** Visual state of a drug timer pill. `idle` is the before-any-dose state —
 *  neutral, no tone. The other three are timer-driven once a dose is logged. */
export type TimerPillStatus = 'idle' | 'cooling' | 'ramping' | 'ready';

/** Paired blood-pressure value used by `<UiBpInput>`. */
export interface BpValue {
  readonly sbp: number | null;
  readonly dbp: number | null;
}

/** Option shape used by `<UiSelect>`. */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

/**
 * Option shape used by `<UiChipGroup>`. Generic over the value type so the
 * same primitive handles numeric chip rows (bathroom breaks, attempts),
 * string chip rows (Roman-numeral classes, rating tokens), and Yes/No
 * boolean chip rows (Diabetic, Nausea, Excessive bleeding).
 *
 * `caption` is surfaced beneath the chip row when the group is configured
 * with `show-caption` and this option is active — used for ASA's
 * "I → Healthy" subtitle without making the chips themselves wider.
 */
export interface ChipOption<T extends string | number | boolean> {
  readonly value: T;
  readonly label: string;
  readonly caption?: string;
  readonly disabled?: boolean;
}
