import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ORAL_PREMED_EVENT } from '@/composables/useEncounterReopen';
import { useDeviceStore } from '@/stores/device';
import { useEventLogStore } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
import { useRecoveryStore } from '@/stores/recovery';

/** Emergency never waits for setup or a PIN: these pages stay open behind both. */
export const OPEN_ROUTES: ReadonlySet<string> = new Set(['quickref', 'quickref-detail']);

/** What covers the app: first-run setup, the PIN, or nothing. */
export type GateView = 'setup' | 'lock' | null;

export function gateView(state: {
  readonly isSetUp: boolean;
  readonly locked: boolean;
  readonly sedationUnderway: boolean;
  readonly onOpenRoute: boolean;
}): GateView {
  if (state.onOpenRoute) return null;
  // A tablet that takes this update in the middle of a sedation finishes the
  // case first; setup appears once the patient is released.
  if (!state.isSetUp) return state.sedationUnderway ? null : 'setup';
  return state.locked ? 'lock' : null;
}

/** From the first sedative given until the patient is released. */
export function useSedationUnderway(): ComputedRef<boolean> {
  const iv = useIVStore();
  const recovery = useRecoveryStore();
  const eventLog = useEventLogStore();
  return computed(
    () =>
      recovery.releasedAt === null &&
      (iv.ivStarted ||
        iv.doses.length > 0 ||
        eventLog.events.some((e) => e.event === ORAL_PREMED_EVENT)),
  );
}

/**
 * The app-wide gate. Owns the clock the twelve hours are measured against
 * and records use: a tap or a key anywhere on the unlocked app.
 */
export function useDeviceGate(): {
  view: ComputedRef<GateView>;
  ready: Ref<boolean>;
} {
  const device = useDeviceStore();
  const route = useRoute();
  const router = useRouter();
  const sedationUnderway = useSedationUnderway();

  // Nothing is drawn until the first route resolves, so a protocol page
  // opened straight from the home screen never flashes the lock first.
  const ready = ref(false);
  void router.isReady().then(() => {
    ready.value = true;
  });

  const now = ref(Date.now());
  const tick = (): void => {
    now.value = Date.now();
  };
  const onUse = (): void => {
    tick();
    device.noteUse(now.value);
  };
  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') tick();
  };

  let timer: ReturnType<typeof setInterval> | null = null;
  if (typeof window !== 'undefined') {
    timer = setInterval(tick, 60_000);
    window.addEventListener('pointerdown', onUse, { passive: true });
    window.addEventListener('keydown', onUse);
    document.addEventListener('visibilitychange', onVisibility);
  }
  onScopeDispose(() => {
    if (timer) clearInterval(timer);
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointerdown', onUse);
    window.removeEventListener('keydown', onUse);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  const view = computed<GateView>(() =>
    gateView({
      isSetUp: device.isSetUp,
      locked: device.isLocked(now.value),
      sedationUnderway: sedationUnderway.value,
      onOpenRoute: OPEN_ROUTES.has(String(route.name ?? '')),
    }),
  );

  return { view, ready };
}
