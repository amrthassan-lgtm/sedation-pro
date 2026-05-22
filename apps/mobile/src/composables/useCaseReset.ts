/**
 * Wipes every persisted store under the `sedation-pro:*` namespace and
 * hard-reloads onto Phase 1, so every Pinia setup-store re-initializes
 * from defaults and the route resets cleanly. A page reload is the cheap,
 * bug-proof way to guarantee no stale ref values leak between cases — and
 * since this is an explicit, confirmed action, the brief flash is fine.
 *
 * Why a fresh helper instead of a `reset()` on each store: setup-stores
 * don't get Pinia's free `$reset`, and adding one per store would duplicate
 * the initial-value defaults already encoded inline in each `defineStore`.
 * Clearing storage + reload sidesteps that whole maintenance burden.
 */
export function useCaseReset(): { reset: () => void } {
  function reset(): void {
    if (typeof window === 'undefined') return;

    const keysToClear: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith('sedation-pro:')) keysToClear.push(k);
    }
    keysToClear.forEach((k) => window.localStorage.removeItem(k));

    // Honor Vite's base path — '/' in dev, '/sedation-pro/' on GitHub Pages
    // (vite.config.ts:8). An absolute '/phase/1' would 404 under any
    // subpath deploy. BASE_URL always ends in '/'.
    window.location.assign(`${import.meta.env.BASE_URL}phase/1`);
  }

  return { reset };
}
