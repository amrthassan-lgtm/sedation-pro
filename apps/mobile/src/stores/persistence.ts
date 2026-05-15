import { ref, watch, type Ref } from 'vue';

/**
 * Minimal localStorage persistence for ref-shaped Pinia state. Pulled into a
 * small helper here so each store can opt in with a one-liner without
 * reinventing JSON guards. Phase 5 will replace this with a typed adapter
 * inside `@sedation-pro/persistence` (Capacitor Preferences in native, IDB
 * for web fallback). The contract — `read` / `write` keyed by string — stays
 * the same so swapping the impl out won't touch caller code.
 */

/**
 * Last successful autosave timestamp across every `persistRefs` caller in the
 * app. Imported by the sticky bar so the user gets a live "Saved · HH:MM"
 * pill confirming progress isn't being lost.
 */
export const lastSavedAt: Ref<number | null> = ref(null);

const STORAGE_AVAILABLE = typeof window !== 'undefined' && 'localStorage' in window;

/**
 * Persisted mirror of `lastSavedAt`. The launch-time "resume previous
 * patient?" gate reads this to decide whether the restored session is stale
 * (saved on a different calendar day). Lives under the `sedation-pro:`
 * namespace so `useCaseReset()` wipes it along with everything else.
 */
const LAST_SAVED_KEY = 'sedation-pro:last-saved:v1';

/** Read the persisted last-save epoch ms, or null if absent/unparseable. */
export function readPersistedSavedAt(): number | null {
  if (!STORAGE_AVAILABLE) return null;
  try {
    const raw = window.localStorage.getItem(LAST_SAVED_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * True when a persisted session is "stale" — saved on a different calendar
 * day than `now`. The launch gate only interrupts on stale sessions; a
 * same-day reload (accidental refresh, app resumed from background) restores
 * silently. Pure + deterministic so the day-boundary behaviour is locked by
 * tests rather than discovered in production at 23:59.
 */
export function isStaleSession(savedAt: number, now: number): boolean {
  if (!Number.isFinite(savedAt) || !Number.isFinite(now)) return false;
  return new Date(savedAt).toDateString() !== new Date(now).toDateString();
}

function safeRead<T>(key: string): T | undefined {
  if (!STORAGE_AVAILABLE) return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function safeWrite(key: string, value: unknown) {
  if (!STORAGE_AVAILABLE) return;
  try {
    const now = Date.now();
    window.localStorage.setItem(key, JSON.stringify(value));
    window.localStorage.setItem(LAST_SAVED_KEY, String(now));
    lastSavedAt.value = now;
  } catch {
    // Quota exceeded or storage disabled — ignore silently. Persistence is a
    // convenience, not a clinical-safety boundary.
  }
}

/**
 * Bind a collection of refs to a single localStorage entry. On call, hydrates
 * each ref from storage if a snapshot exists. Then sets up a deep watcher
 * that writes the full collection back on any change.
 *
 * Pass `refs` keyed by the field names you want serialized. Any non-ref
 * fields the store exposes (computeds, methods) are ignored — caller
 * controls exactly what gets persisted.
 */
export function persistRefs<T extends Record<string, Ref<unknown>>>(key: string, refs: T): void {
  const snapshot = safeRead<Record<string, unknown>>(key);
  if (snapshot) {
    for (const [field, r] of Object.entries(refs)) {
      if (field in snapshot) {
        // We trust the snapshot shape — schema migrations land in Phase 5.
        r.value = snapshot[field] as never;
      }
    }
  }

  watch(
    () => {
      const out: Record<string, unknown> = {};
      for (const [field, r] of Object.entries(refs)) {
        out[field] = r.value;
      }
      return out;
    },
    (value) => safeWrite(key, value),
    { deep: true },
  );
}
