import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { persistRefs } from './persistence';

/**
 * Continuous-monitor recording state. Tracks the lifecycle of the recording
 * the `@sedation-pro/bridge` service is capturing for the current case so
 * the sticky-bar indicator and the Phase 4 Discharge-Handoff appendix can
 * render without re-fetching from the bridge on every poll.
 *
 * Three medicolegal facts we persist:
 *   - `sessionId`: which recording on the bridge corresponds to this case
 *   - `startedAt` / `stoppedAt`: when monitoring covered the case
 *   - `byteCount` / `messageCount`: post-stop stats from the bridge's
 *     final session metadata; included in the chart appendix
 *
 * Two runtime-only flags drive UI but aren't worth persisting:
 *   - `bridgeReachable`: rebuilt from the next /healthz poll on reload
 *   - `lastError`: ephemeral
 */
export const useMonitorStore = defineStore('monitor', () => {
  const sessionId = ref<string | null>(null);
  const startedAt = ref<number | null>(null);
  const stoppedAt = ref<number | null>(null);
  const byteCount = ref<number>(0);
  const messageCount = ref<number>(0);
  const bridgeReachable = ref<boolean>(false);
  const lastError = ref<string | null>(null);

  persistRefs('sedation-pro:monitor:v1', {
    sessionId,
    startedAt,
    stoppedAt,
    byteCount,
    messageCount,
  });

  /** True while a recording session is open on the bridge. */
  const isRecording = computed(() => sessionId.value !== null && stoppedAt.value === null);

  /** True after the recording stopped, so the chart appendix can render. */
  const isAttached = computed(() => stoppedAt.value !== null);

  /**
   * Wipe to clean slate. Called by `useCaseReset` so a new case doesn't
   * inherit the previous patient's recording metadata.
   */
  function reset(): void {
    sessionId.value = null;
    startedAt.value = null;
    stoppedAt.value = null;
    byteCount.value = 0;
    messageCount.value = 0;
    bridgeReachable.value = false;
    lastError.value = null;
  }

  return {
    sessionId,
    startedAt,
    stoppedAt,
    byteCount,
    messageCount,
    bridgeReachable,
    lastError,
    isRecording,
    isAttached,
    reset,
  };
});
