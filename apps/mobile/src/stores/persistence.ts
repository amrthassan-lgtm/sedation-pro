import { ref, watch, type Ref } from 'vue';

/**
 * Minimal localStorage persistence for ref-shaped Pinia state. Pulled into a
 * small helper here so each store can opt in with a one-liner without
 * reinventing JSON guards. The contract — `read` / `write` keyed by string —
 * is small on purpose, so a future storage swap won't touch caller code.
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

/**
 * Keys whose latest write failed. A full tablet used to fail in silence: the
 * case went on in memory and was gone after the next reload, and a lost
 * "sent to chart" record invited a second, permanent send. While any key is
 * listed, something on screen is not saved and the app says so.
 */
export const unsavedKeys: Ref<ReadonlyArray<string>> = ref([]);

/** Records how a write went, so the warning clears once that key saves again. */
export function reportWrite(key: string, ok: boolean): void {
  const listed = unsavedKeys.value.includes(key);
  if (ok && listed) unsavedKeys.value = unsavedKeys.value.filter((k) => k !== key);
  else if (!ok && !listed) unsavedKeys.value = [...unsavedKeys.value, key];
}

const PROBE_KEY = 'sedation-pro:storage-probe:v1';

/** True when `chars` more characters would still fit. Writes and removes a probe. */
export function hasRoomFor(chars: number): boolean {
  if (!STORAGE_AVAILABLE) return false;
  let fits = true;
  try {
    window.localStorage.setItem(PROBE_KEY, 'x'.repeat(chars));
  } catch {
    fits = false;
  }
  try {
    window.localStorage.removeItem(PROBE_KEY);
  } catch {
    // Nothing to remove when the probe did not fit.
  }
  return fits;
}

/**
 * Room for about four more signed notes (each near 65,000 characters with
 * its signature). Below it the app warns while there is still time to act,
 * rather than only after a save has failed.
 */
export const HEADROOM_CHARS = 250_000;

export const storageLow: Ref<boolean> = ref(false);

export function checkHeadroom(): void {
  if (STORAGE_AVAILABLE) storageLow.value = !hasRoomFor(HEADROOM_CHARS);
}

const rewriters = new Map<string, () => void>();

/**
 * Freeing space (deleting a saved note) re-saves whatever could not be saved,
 * so the warning goes away without waiting for each screen to change again.
 */
export function recheckStorage(): void {
  for (const key of [...unsavedKeys.value]) rewriters.get(key)?.();
  checkHeadroom();
}

function safeWrite(key: string, value: unknown) {
  if (!STORAGE_AVAILABLE) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled: listed, so the app warns.
    reportWrite(key, false);
    checkHeadroom();
    return;
  }
  reportWrite(key, true);
  const now = Date.now();
  try {
    window.localStorage.setItem(LAST_SAVED_KEY, String(now));
  } catch {
    // Only the resume gate's day check reads this; the data itself is saved.
  }
  lastSavedAt.value = now;
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

  const collect = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [field, r] of Object.entries(refs)) {
      out[field] = r.value;
    }
    return out;
  };
  rewriters.set(key, () => safeWrite(key, collect()));
  watch(collect, (value) => safeWrite(key, value), { deep: true });
}
