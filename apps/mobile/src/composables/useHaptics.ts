/**
 * Haptic feedback wrapper.
 *
 * On Android Chrome and most desktop browsers this calls the Web Vibration
 * API. iOS Safari does not (and historically will not) support the Vibration
 * API — so on iPhone web this is a deliberate no-op. When the app moves into
 * a Capacitor native shell, swap the implementations below for
 * `@capacitor/haptics` calls (`Haptics.impact({ style: ... })`,
 * `Haptics.notification({ type: ... })`) and the call-sites stay identical.
 *
 * Style guide for callers:
 *   - `tap('light')`   — minor confirmation (button focus, toggle)
 *   - `tap('medium')`  — dose logged, vitals stamped, IV out
 *   - `tap('heavy')`   — critical action (reversal agent given, release)
 *   - `tap('warning')` — caution surfaced (Mallampati III, BMI ≥40)
 *   - `tap('error')`   — blocked action / safety gate failure
 *
 * No reactive state — pure side-effect function exported as `useHaptics()`
 * for ergonomic call-sites inside `<script setup>`.
 */

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

interface NavigatorWithVibrate {
  vibrate?: (pattern: number | ReadonlyArray<number>) => boolean;
}

const PATTERNS: Record<HapticStyle, number | ReadonlyArray<number>> = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [10, 50, 10],
  warning: [20, 40, 20],
  error: [40, 30, 40, 30, 40],
};

/**
 * Bare function so non-component code (Pinia stores, plain TS helpers) can
 * fire haptics without setting up a composable. Safe to call anywhere — it
 * no-ops on unsupported platforms.
 */
export function haptic(style: HapticStyle = 'medium'): void {
  const nav: NavigatorWithVibrate | undefined =
    typeof navigator === 'undefined' ? undefined : (navigator as NavigatorWithVibrate);
  if (typeof nav?.vibrate !== 'function') return;
  try {
    nav.vibrate(PATTERNS[style]);
  } catch {
    // Some browsers throw on certain patterns under user-gesture restrictions —
    // not worth surfacing, haptics are advisory.
  }
}

export interface UseHaptics {
  /** True when the underlying vibration API is available. */
  readonly supported: boolean;
  /** Fire a haptic of the requested style. Safe to call anywhere — no-ops if unsupported. */
  tap(style?: HapticStyle): void;
}

export function useHaptics(): UseHaptics {
  const nav: NavigatorWithVibrate | undefined =
    typeof navigator === 'undefined' ? undefined : (navigator as NavigatorWithVibrate);
  const supported = typeof nav?.vibrate === 'function';

  return { supported, tap: haptic };
}
