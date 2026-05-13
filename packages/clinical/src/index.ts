export * from './types';
export * from './formulary';
export * from './dosing';
export * from './gates';
export * from './vitals';
export * from './protocols';

/**
 * Pinned semver for the clinical engine. Bump any time the dosing rules,
 * formulary entries, or phase/release algorithms change so consumers can
 * detect a behavior shift at runtime.
 */
export const CLINICAL_LIB_VERSION = '0.1.0';
