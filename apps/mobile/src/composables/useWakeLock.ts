import { onScopeDispose, ref, type Ref } from 'vue';

/**
 * Screen wake-lock. Calls the web Wake Lock API
 * (https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
 * to keep the device's screen from sleeping for the entire time the app is
 * in use — operators read the sticky bar, drug timers, and vitals readouts
 * passively for long stretches, and an auto-locked screen during a case is
 * a clinical-safety hazard.
 *
 * `App.vue` calls `request()` once at mount; the lock is held until the app
 * unmounts (handled by `onScopeDispose`). Per-phase gating is intentionally
 * gone — the universal "on while open" model matches every other clinical
 * tablet workflow operators are used to.
 *
 * Supported in iOS Safari 16.4+ and Chrome / Edge / Android Chrome. On
 * unsupported browsers this is a no-op — components stay functional, just
 * without the keep-awake guarantee.
 *
 * The browser automatically releases the lock when the tab loses visibility
 * (e.g. backgrounded). We listen for `visibilitychange` and re-acquire when
 * the tab comes back, so a quick switch to another app and back doesn't
 * leave the screen unlocked.
 *
 * When you swap the web shell for a Capacitor native shell, replace the
 * `navigator.wakeLock.request('screen')` call with the native plugin
 * (`@capacitor-community/keep-awake` or platform-native APIs). The
 * composable's `active` ref and `request()` / `release()` contract stay
 * the same.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
}

export interface UseWakeLock {
  /** True when the screen-wake-lock is currently held. */
  readonly active: Readonly<Ref<boolean>>;
  /** True when the underlying API is available in this browser. */
  readonly supported: boolean;
  /** Acquire the lock. Idempotent — returns `true` on success. */
  request(): Promise<boolean>;
  /** Release the lock. Idempotent. */
  release(): Promise<void>;
}

export function useWakeLock(): UseWakeLock {
  const active = ref(false);
  let sentinel: WakeLockSentinelLike | null = null;
  let wantsLock = false;

  const nav: NavigatorWithWakeLock | undefined =
    typeof navigator === 'undefined' ? undefined : (navigator as NavigatorWithWakeLock);
  const supported = nav?.wakeLock !== undefined;

  async function request(): Promise<boolean> {
    wantsLock = true;
    if (!supported || !nav?.wakeLock) return false;
    if (sentinel && !sentinel.released) {
      active.value = true;
      return true;
    }
    try {
      sentinel = await nav.wakeLock.request('screen');
      active.value = true;
      sentinel.addEventListener('release', () => {
        active.value = false;
      });
      return true;
    } catch {
      // Permission denied / page not visible. Caller decides whether to surface.
      active.value = false;
      return false;
    }
  }

  async function release(): Promise<void> {
    wantsLock = false;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch {
        // Already released by the browser — fine.
      }
    }
    sentinel = null;
    active.value = false;
  }

  /**
   * Re-acquire on visibility change. Browsers auto-release the lock when
   * the document becomes hidden; without this handler the screen would stop
   * staying awake after a quick app-switch.
   */
  function onVisibility() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible' && wantsLock) {
      void request();
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  onScopeDispose(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
    void release();
  });

  return { active, supported, request, release };
}
