/**
 * Shared types used across the clinical engine.
 *
 * Conventions
 * -----------
 * - Mass units are explicit in the property name (`mg`, `mcg`).
 * - Time is `Millis` (epoch ms) at the boundary; durations are minutes.
 * - Weight is **pounds** (the source app's input). Helpers convert to kg
 *   internally where the literature is in mg/kg.
 */

/** Pharmacological class — drives synergy and reversal rules. */
export type DrugCategory =
  | 'benzodiazepine'
  | 'opioid'
  | 'antiemetic'
  | 'benzodiazepine-reversal'
  | 'opioid-reversal'
  | 'local-anesthetic';

/** Patient-reported obstructive sleep apnea status. */
export type OsaStatus = 'none' | 'osa-diagnosed' | 'cpap-prescribed';

/** ASA physical status classification. */
export type AsaClass = 'I' | 'II' | 'III' | 'IV';

/** Mallampati airway score. */
export type MallampatiClass = 'I' | 'II' | 'III' | 'IV';

/** Smoking pattern. */
export type SmokingStatus = 'never' | 'former' | 'current';

/** Drug routes used by the engine. */
export type Route = 'IV' | 'PO' | 'IM' | 'SubQ' | 'SL' | 'IN' | 'topical';

/** Epoch milliseconds. */
export type Millis = number;

/** Severity bucket reused across vitals and dosing classifications. */
export type Severity = 'safe' | 'caution' | 'limit' | 'crisis';
