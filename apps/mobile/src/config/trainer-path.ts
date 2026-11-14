/**
 * Navigations the clinical service worker must leave alone.
 *
 * The training simulator is a separate app served from `/trainer/` inside
 * this worker's scope. Without this the worker would answer a visit to it
 * with the clinical app's own shell. Workbox tests the pattern against the
 * path and the query string together: a `$` alone would miss `/trainer?x=1`,
 * and an unanchored match would take a clinical page whose query merely
 * mentions the word.
 */
export const TRAINER_PATH = /^[^?]*\/trainer(?:[/?]|$)/;
