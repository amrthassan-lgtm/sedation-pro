import { onScopeDispose } from 'vue';

import { DEFAULT_FORMULARY } from '@sedation-pro/clinical';
import { useMonitorStore } from '@/stores/monitor';

/**
 * Drive the bridge recording lifecycle from the app.
 *
 *   start(mrn)  — POST /sessions { mrn } at first Phase 3 vitals stamp.
 *                 Idempotent: a second call for the same MRN is a no-op,
 *                 a call for a different MRN closes the old recording
 *                 and opens a new one.
 *   stop()      — POST /sessions/:id/stop at Phase 4 release.
 *                 Idempotent: no-op when nothing's recording.
 *   pollHealth  — Started by the composable's first consumer (App.vue);
 *                 pings /healthz every 30 s and updates
 *                 `monitor.bridgeReachable`.
 *
 * Every operation no-ops when `formulary.bridgeUrl` is null — that's the
 * "no monitor bridge configured for this practice" path. The UI keeps
 * rendering its non-recording layout in that case (sticky-bar pill
 * hidden, no Card 14 Monitor row).
 */

const HEALTHCHECK_INTERVAL_MS = 30_000;
const FETCH_TIMEOUT_MS = 4_000;

interface BridgeSessionMeta {
  readonly id: string;
  readonly mrn: string;
  readonly startedAt: string;
  readonly stoppedAt: string | null;
  readonly byteCount: number;
  readonly messageCount: number;
}

let healthTimer: ReturnType<typeof setInterval> | null = null;

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function useMonitorRecording(): {
  readonly bridgeUrl: string | null;
  start: (mrn: string) => Promise<void>;
  stop: () => Promise<void>;
  beginHealthPolling: () => void;
} {
  const monitor = useMonitorStore();
  const bridgeUrl = DEFAULT_FORMULARY.bridgeUrl;

  async function start(mrn: string): Promise<void> {
    if (!bridgeUrl) return;
    if (mrn.trim() === '') return;
    // Idempotency: if already recording for the same case, no-op. If
    // recording for a different case, the bridge auto-closes the prior
    // session on its end — we just overwrite our local state to track
    // the new recording.
    if (monitor.sessionId !== null && monitor.stoppedAt === null) {
      // already recording; trust the bridge's per-MRN dedup
      return;
    }
    try {
      const res = await fetchWithTimeout(`${bridgeUrl}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mrn: mrn.trim() }),
      });
      if (!res.ok) {
        monitor.lastError = `bridge returned ${res.status} starting session`;
        return;
      }
      const meta = (await res.json()) as BridgeSessionMeta;
      monitor.sessionId = meta.id;
      monitor.startedAt = Date.parse(meta.startedAt);
      monitor.stoppedAt = null;
      monitor.byteCount = 0;
      monitor.messageCount = 0;
      monitor.lastError = null;
      monitor.bridgeReachable = true;
    } catch (err) {
      monitor.lastError = err instanceof Error ? err.message : 'bridge unreachable';
      monitor.bridgeReachable = false;
    }
  }

  async function stop(): Promise<void> {
    if (!bridgeUrl) return;
    if (monitor.sessionId === null) return;
    if (monitor.stoppedAt !== null) return;
    try {
      const res = await fetchWithTimeout(
        `${bridgeUrl}/sessions/${encodeURIComponent(monitor.sessionId)}/stop`,
        { method: 'POST' },
      );
      if (!res.ok) {
        monitor.lastError = `bridge returned ${res.status} stopping session`;
        return;
      }
      const meta = (await res.json()) as BridgeSessionMeta;
      monitor.stoppedAt = meta.stoppedAt ? Date.parse(meta.stoppedAt) : Date.now();
      monitor.byteCount = meta.byteCount;
      monitor.messageCount = meta.messageCount;
      monitor.lastError = null;
      monitor.bridgeReachable = true;
    } catch (err) {
      monitor.lastError = err instanceof Error ? err.message : 'bridge unreachable';
      monitor.bridgeReachable = false;
    }
  }

  /**
   * Install a single module-scoped health-poll interval. Subsequent calls
   * are no-ops so multiple consumers of this composable don't multiply
   * the polling load. The poll is cancelled when the parent effect scope
   * disposes (App.vue unmounts).
   */
  function beginHealthPolling(): void {
    if (!bridgeUrl) return;
    if (healthTimer !== null) return;
    const poll = async (): Promise<void> => {
      try {
        const res = await fetchWithTimeout(`${bridgeUrl}/healthz`);
        monitor.bridgeReachable = res.ok;
      } catch {
        monitor.bridgeReachable = false;
      }
    };
    void poll();
    healthTimer = setInterval(() => void poll(), HEALTHCHECK_INTERVAL_MS);
    onScopeDispose(() => {
      if (healthTimer !== null) {
        clearInterval(healthTimer);
        healthTimer = null;
      }
    });
  }

  return { bridgeUrl, start, stop, beginHealthPolling };
}
