import { ref, watch } from 'vue';

/**
 * Theme selector — `'auto'` follows the OS via `prefers-color-scheme`, `'light'`
 * and `'dark'` lock the app to that mode regardless of system preference.
 * Operatory environments often have one preference all day, but a manual
 * override matters when a clinician moves between rooms with different
 * lighting or hands the iPad to a patient for the consent screen.
 */
export type ThemeChoice = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'sedation-pro:theme:v1';

function readStoredChoice(): ThemeChoice {
  if (typeof localStorage === 'undefined') return 'auto';
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'auto';
}

const choice = ref<ThemeChoice>(readStoredChoice());

const systemLightMatcher =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: light)')
    : null;

function resolved(): 'light' | 'dark' {
  if (choice.value === 'light') return 'light';
  if (choice.value === 'dark') return 'dark';
  return systemLightMatcher?.matches ? 'light' : 'dark';
}

function applyTheme() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolved();
}

watch(choice, (next) => {
  if (typeof localStorage !== 'undefined') {
    if (next === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  }
  applyTheme();
});

systemLightMatcher?.addEventListener('change', () => {
  if (choice.value === 'auto') applyTheme();
});

// Apply immediately on module load so the first paint matches the resolved
// theme; importing this file from main.ts before mount avoids any flash.
applyTheme();

export function useTheme() {
  return { choice, resolved };
}
