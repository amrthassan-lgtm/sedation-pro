import { computed, watch } from 'vue';

import { useChartSendStore, type ArtifactState, type ResendAttempt } from '@/stores/chart-send';
import { useEventLogStore } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
import { useRecoveryStore } from '@/stores/recovery';

export const ORAL_PREMED_EVENT = 'Preoperative Oral Dose';
export const REOPEN_EVENT = 'Record reopened for sedation visit';

interface ClosedAssessment {
  readonly releasedAt: number;
  readonly signature: string | null;
  readonly noteFrozenId: string | null;
  readonly releaseAttempted: boolean;
  readonly chart: {
    readonly patNum: number | null;
    readonly patientLabel: string | null;
    readonly commlog: ArtifactState;
    readonly pdf: ArtifactState;
    readonly resendLog: ResendAttempt[];
  };
  readonly eventId: string;
}

/**
 * Reopens a case whose assessment was completed when sedation then starts on
 * the same case.
 *
 * Completing an assessment stamps the release time, takes the signature,
 * freezes the note and may file it to the chart. Those four belong to the
 * assessment. Without this, giving the first sedative afterwards (later the
 * same day, or after "Resume patient" on another day) turned the live note
 * into a sedation note that was already signed, already "released" at a time
 * before the procedure, never archived and blocked from the chart as a
 * duplicate.
 *
 * The test is a fact about the record, not a transition: a release stamp
 * older than the first sedative cannot be the sedation's release. That makes
 * it safe to run at boot, where it also repairs a case already in this state.
 *
 * The assessment's own note is untouched: it is the frozen copy in Saved
 * Notes, and whatever was filed to the chart stays filed.
 *
 * Undo: if the sedative that triggered the reopen is undone, the closed
 * assessment is put back exactly, including its chart-send record, so the
 * assessment cannot be filed twice. The snapshot is held in memory because
 * the undo stack is too; neither survives a reload.
 */
export function useEncounterReopen(): void {
  const recovery = useRecoveryStore();
  const iv = useIVStore();
  const eventLog = useEventLogStore();
  const chart = useChartSendStore();

  const firstSedativeAt = computed<number | null>(() => {
    const times = [
      ...iv.doses.map((d) => d.at),
      ...eventLog.events.filter((e) => e.event === ORAL_PREMED_EVENT).map((e) => e.timestamp),
    ];
    return times.length === 0 ? null : Math.min(...times);
  });

  let closed: ClosedAssessment | null = null;

  function reopen(releasedAt: number): void {
    const entry = eventLog.append(REOPEN_EVENT, {
      'Assessment completed': new Date(releasedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    });
    closed = {
      releasedAt,
      signature: recovery.providerSignatureDataUrl,
      noteFrozenId: recovery.noteFrozenId,
      releaseAttempted: recovery.releaseAttempted,
      chart: {
        patNum: chart.patNum,
        patientLabel: chart.patientLabel,
        commlog: chart.commlog,
        pdf: chart.pdf,
        resendLog: [...chart.resendLog],
      },
      eventId: entry.id,
    };
    recovery.releasedAt = null;
    recovery.providerSignatureDataUrl = null;
    recovery.noteFrozenId = null;
    recovery.releaseAttempted = false;
    chart.reset();
  }

  function restore(snapshot: ClosedAssessment): void {
    eventLog.removeById(snapshot.eventId);
    // noteFrozenId first: the freeze watcher must see the note as already
    // archived before release and signature make the case "finished" again.
    recovery.noteFrozenId = snapshot.noteFrozenId;
    recovery.releasedAt = snapshot.releasedAt;
    recovery.providerSignatureDataUrl = snapshot.signature;
    recovery.releaseAttempted = snapshot.releaseAttempted;
    chart.patNum = snapshot.chart.patNum;
    chart.patientLabel = snapshot.chart.patientLabel;
    chart.commlog = snapshot.chart.commlog;
    chart.pdf = snapshot.chart.pdf;
    chart.resendLog = snapshot.chart.resendLog;
  }

  watch(
    () => [firstSedativeAt.value, recovery.releasedAt] as const,
    ([sedativeAt, releasedAt]) => {
      if (sedativeAt !== null && releasedAt !== null && releasedAt < sedativeAt) {
        reopen(releasedAt);
        return;
      }
      // Sedative undone and nothing re-concluded since: back to the closed assessment.
      if (
        sedativeAt === null &&
        closed !== null &&
        releasedAt === null &&
        recovery.providerSignatureDataUrl === null
      ) {
        const snapshot = closed;
        closed = null;
        restore(snapshot);
        return;
      }
      if (sedativeAt === null) closed = null;
    },
    // Default (pre) flush on purpose: reopening appends to the event log, and a
    // sync watcher would do that in the middle of the push that triggered it.
    { immediate: true },
  );
}
