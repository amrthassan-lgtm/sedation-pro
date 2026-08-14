/**
 * Storage for the practice's two Open Dental API keys. Entered once, on the
 * one device that files notes to the chart.
 *
 * The keys are secrets: this module never logs them, never puts them in a
 * thrown message, and never hands them anywhere except the Authorization
 * header built in `opendental.ts`.
 *
 * The entry is namespaced `sedation-pro:` so `useCaseReset()`'s namespace
 * scan can see it — which means it MUST also appear in that composable's
 * PRESERVED_KEYS. Credentials are per-PRACTICE, not per-case; if they ever
 * fall out of that list, "Start new case" silently unpairs the app from
 * Open Dental in the middle of a treatment day.
 */
const CREDENTIALS_KEY = 'sedation-pro:od-credentials:v1';

export interface OdCredentials {
  readonly developerKey: string;
  readonly customerKey: string;
}

const STORAGE_AVAILABLE = typeof window !== 'undefined' && 'localStorage' in window;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The stored pair, or null when unconfigured, unreadable, or half-filled.
 * A null here is the app's "no chart integration" state — with no keys the
 * send-to-chart affordance must not appear at all, so a corrupt entry has to
 * degrade to exactly the same thing as an absent one.
 */
export function readCredentials(): OdCredentials | null {
  if (!STORAGE_AVAILABLE) return null;
  try {
    const raw = window.localStorage.getItem(CREDENTIALS_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { developerKey, customerKey } = parsed as Record<string, unknown>;
    if (!isNonEmptyString(developerKey) || !isNonEmptyString(customerKey)) return null;
    return { developerKey: developerKey.trim(), customerKey: customerKey.trim() };
  } catch {
    return null;
  }
}

/**
 * Persist the pair. Returns false — rather than throwing — when either key is
 * blank or storage refuses the write (private mode, quota), so the settings
 * screen can say "not saved" instead of the app dying on a keystroke.
 * Surrounding whitespace is trimmed because these keys are always pasted.
 */
export function writeCredentials(credentials: OdCredentials): boolean {
  if (!STORAGE_AVAILABLE) return false;
  const developerKey = credentials.developerKey.trim();
  const customerKey = credentials.customerKey.trim();
  if (developerKey.length === 0 || customerKey.length === 0) return false;
  try {
    window.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ developerKey, customerKey }));
    return true;
  } catch {
    return false;
  }
}

export function clearCredentials(): void {
  if (!STORAGE_AVAILABLE) return;
  try {
    window.localStorage.removeItem(CREDENTIALS_KEY);
  } catch {
    // Nothing useful to do, and nothing safe to log.
  }
}

export function hasCredentials(): boolean {
  return readCredentials() !== null;
}
