/**
 * Shared UI types. Re-exports the engine `Severity` so consumers can pass
 * it directly into status pills, percent bars, and banners without a
 * second import.
 */
export type { Severity } from '@sedation-pro/clinical';

/**
 * Drug-tone identities. Map onto fixed colors in `tokens.css`. Practices
 * can reassign which drugs use which tone via the formulary, but the tone
 * names themselves are part of the design language.
 */
export type DrugTone =
  | 'versed'
  | 'fentanyl'
  | 'zofran'
  | 'flumazenil'
  | 'naloxone'
  | 'oral'
  | 'bedtime'
  | 'lidocaine'
  | 'septocaine-gold'
  | 'septocaine-silver'
  | 'marcaine'
  | 'mepivacaine';

/** Phase tints — drive sticky bar, nav drawer rings, card border-lefts. */
export type PhaseTint = 'ph1' | 'ph2' | 'ph3' | 'ph4';

/** Visual tone for buttons. */
export type ButtonTone = 'neutral' | 'primary' | 'danger' | 'success';

/** Action button states — the consumer drives these; the component renders them. */
export type ActionState = 'idle' | 'locked' | 'logged';
