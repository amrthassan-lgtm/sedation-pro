import { watch, type Ref } from 'vue';

/**
 * Minimal localStorage persistence for ref-shaped Pinia state. Pulled into a
 * small helper here so each store can opt in with a one-liner without
 * reinventing JSON guards. Phase 5 will replace this with a typed adapter
 * inside `@sedation-pro/persistence` (Capacitor Preferences in native, IDB
 * for web fallback). The contract — `read` / `write` keyed by string — stays
 * the same so swapping the impl out won't touch caller code.
 */

const STORAGE_AVAILABLE = typeof window !== 'undefined' && 'localStorage' in window;

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
    window.localStorage.setItem(key, JSON.stringify(value));
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
