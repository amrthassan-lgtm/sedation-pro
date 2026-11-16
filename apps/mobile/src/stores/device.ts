import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { persistRefs } from './persistence';

/**
 * Per-TABLET, not per-case: kept through "Start new case" (`PRESERVED_KEYS`)
 * and erased only by Reset this tablet.
 */
export const DEVICE_KEY = 'sedation-pro:device:v1';

export const PIN_LENGTH = 4;
/** The PIN is asked again once the tablet has gone this long unused (owner, Nov 2026). */
export const PIN_IDLE_MS = 12 * 60 * 60 * 1000;
/** Wrong PINs in a row before the keypad makes the next try wait. */
export const PIN_TRIES = 5;
export const PIN_WAIT_MS = 60 * 1000;
/**
 * Use is recorded at most once a minute. Twelve hours does not need finer
 * than that, and a tablet in a case should not write storage on every tap.
 */
export const USE_GRAIN_MS = 60 * 1000;

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A four-digit PIN is a gate against a casual hand, not encryption: anyone
 * who can read this browser's storage can also read the case it guards. It is
 * still never kept as typed.
 */
export async function hashPin(salt: string, pin: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return hex(new Uint8Array(digest));
}

export type UnlockResult = 'ok' | 'wrong' | 'wait';

export const useDeviceStore = defineStore('device', () => {
  const pinSalt = ref('');
  const pinHash = ref('');
  /** Last time someone used the unlocked app. */
  const lastUsedAt = ref<number | null>(null);

  // In memory only: a reload starting the count again is acceptable for a
  // gate whose job is to stop a passer-by, not a determined attacker.
  const wrongTries = ref(0);
  const waitUntil = ref<number | null>(null);

  const isSetUp = computed(() => pinHash.value !== '');

  function isLocked(now: number): boolean {
    if (!isSetUp.value) return false;
    return lastUsedAt.value === null || now - lastUsedAt.value >= PIN_IDLE_MS;
  }

  /** A tap on the unlocked app. Taps on the lock screen or a protocol page behind it do not count. */
  function noteUse(now: number): void {
    if (!isSetUp.value || isLocked(now)) return;
    if (lastUsedAt.value === null || now - lastUsedAt.value >= USE_GRAIN_MS) {
      lastUsedAt.value = now;
    }
  }

  async function setPin(pin: string, now: number): Promise<void> {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await hashPin(salt, pin);
    pinSalt.value = salt;
    pinHash.value = hash;
    lastUsedAt.value = now;
    wrongTries.value = 0;
    waitUntil.value = null;
  }

  async function checkPin(pin: string): Promise<boolean> {
    if (!isSetUp.value) return false;
    return (await hashPin(pinSalt.value, pin)) === pinHash.value;
  }

  async function unlock(pin: string, now: number): Promise<UnlockResult> {
    if (waitUntil.value !== null && now < waitUntil.value) return 'wait';
    if (await checkPin(pin)) {
      wrongTries.value = 0;
      waitUntil.value = null;
      lastUsedAt.value = now;
      return 'ok';
    }
    wrongTries.value += 1;
    if (wrongTries.value >= PIN_TRIES) {
      wrongTries.value = 0;
      waitUntil.value = now + PIN_WAIT_MS;
      return 'wait';
    }
    return 'wrong';
  }

  persistRefs(DEVICE_KEY, { pinSalt, pinHash, lastUsedAt });

  return {
    pinSalt,
    pinHash,
    lastUsedAt,
    wrongTries,
    waitUntil,
    isSetUp,
    isLocked,
    noteUse,
    setPin,
    checkPin,
    unlock,
  };
});
