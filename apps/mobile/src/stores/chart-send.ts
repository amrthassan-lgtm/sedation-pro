import { computed, ref } from 'vue';
import type { Ref } from 'vue';
import { defineStore } from 'pinia';

import { persistRefs } from './persistence';

/**
 * The durable record of what has already been written into the patient's
 * Open Dental chart for the current case.
 *
 * Every write this feature performs is PERMANENT: commlogs have no delete
 * (UI-only removal) and document deletes are rejected by this practice's
 * cloud API. The two writes are also INDEPENDENT — the commlog can land
 * while the PDF fails. So "retry the send" can never mean "run both calls
 * again"; it means "run the calls for the artifacts this record does not
 * already mark as sent". This store is that record, and it is the only
 * thing standing between a partial failure and a duplicated clinical note
 * in a real chart.
 */

export type ArtifactKind = 'commlog' | 'pdf';

export type ArtifactState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'sent'; at: string }
  | { status: 'failed'; at: string; detail: string };

export interface ChartSendState {
  patNum: number | null;
  /** "Lastname, Firstname · YYYY-MM-DD" as confirmed against the PMS at send time. */
  patientLabel: string | null;
  commlog: ArtifactState;
  pdf: ArtifactState;
}

export const CHART_SEND_STORAGE_KEY = 'sedation-pro:chart-send:v1';

const ARTIFACT_KINDS = ['commlog', 'pdf'] as const;

/** Failure text is provider-facing and persisted; keep it bounded and PHI-free. */
const MAX_DETAIL_LENGTH = 300;

const STORAGE_AVAILABLE = typeof window !== 'undefined' && 'localStorage' in window;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizePatNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function sanitizeLabel(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function sanitizeDetail(value: unknown): string {
  const text = typeof value === 'string' && value.trim() !== '' ? value.trim() : 'Unknown error';
  return text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH - 1)}…` : text;
}

/**
 * Re-narrow a value rehydrated from storage. `persistRefs` assigns whatever
 * JSON it finds (`as never`), so a truncated or hand-edited snapshot could
 * otherwise leave an artifact in a shape the send guards don't recognise —
 * and an unrecognised artifact reads as "not sent", which is the one wrong
 * answer here. Unknown shapes collapse to 'idle'; a 'sent' marker is never
 * downgraded, because losing its timestamp is recoverable and duplicating a
 * chart entry is not.
 */
function sanitizeArtifact(value: unknown, fallbackAt: string): ArtifactState {
  if (!isRecord(value)) return { status: 'idle' };
  const at = typeof value.at === 'string' && value.at !== '' ? value.at : fallbackAt;
  switch (value.status) {
    case 'sending':
      return { status: 'sending' };
    case 'sent':
      return { status: 'sent', at };
    case 'failed':
      return { status: 'failed', at, detail: sanitizeDetail(value.detail) };
    default:
      return { status: 'idle' };
  }
}

function normalizeMrn(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return sanitizePatNum(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // Anything non-numeric can't be a PatNum, and Number('') === 0 would
  // otherwise sneak through as a falsy-but-finite match.
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
  return sanitizePatNum(Number(trimmed));
}

export const useChartSendStore = defineStore('chart-send', () => {
  const patNum = ref<number | null>(null);
  const patientLabel = ref<string | null>(null);
  const commlog = ref<ArtifactState>({ status: 'idle' });
  const pdf = ref<ArtifactState>({ status: 'idle' });

  const persisted = { patNum, patientLabel, commlog, pdf };

  function artifactFor(kind: ArtifactKind): Ref<ArtifactState> {
    return kind === 'commlog' ? commlog : pdf;
  }

  function snapshot(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [field, source] of Object.entries(persisted)) out[field] = source.value;
    return out;
  }

  /**
   * PERSISTENCE MECHANISM — read before changing anything here.
   *
   * `persistRefs` writes through a deep `watch` with the default 'pre' flush,
   * i.e. asynchronously on the next tick. For every other store that is fine.
   * It is not fine for this one: the gap between marking the commlog 'sent'
   * and the watcher actually reaching localStorage spans the second API call,
   * and if the tablet sleeps or the tab is killed inside that gap the 'sent'
   * marker never leaves memory. The next launch would then re-post a commlog
   * that is already permanently in the chart.
   *
   * So `persistRefs` is kept for hydration and as a backstop, and every
   * artifact transition additionally calls `flushSync()`, which writes the
   * same snapshot with a plain synchronous `setItem` before the action
   * returns. Both writers serialize the same `persisted` object, so the
   * watcher's later write is byte-identical and can never clobber a newer
   * synchronous one.
   */
  function flushSync(): void {
    if (!STORAGE_AVAILABLE) return;
    try {
      window.localStorage.setItem(CHART_SEND_STORAGE_KEY, JSON.stringify(snapshot()));
    } catch {
      // Storage disabled or over quota. In-memory state stays authoritative
      // for this session and the deep watcher retries on the next change;
      // there is nothing better to do from here, and throwing mid-send would
      // strand the caller between two irreversible writes.
    }
  }

  persistRefs(CHART_SEND_STORAGE_KEY, persisted);

  const hydratedAt = new Date().toISOString();
  const cleanPatNum = sanitizePatNum(patNum.value);
  const cleanLabel = sanitizeLabel(patientLabel.value);
  const cleanCommlog = sanitizeArtifact(commlog.value, hydratedAt);
  const cleanPdf = sanitizeArtifact(pdf.value, hydratedAt);
  if (
    cleanPatNum !== patNum.value ||
    cleanLabel !== patientLabel.value ||
    JSON.stringify(cleanCommlog) !== JSON.stringify(commlog.value) ||
    JSON.stringify(cleanPdf) !== JSON.stringify(pdf.value)
  ) {
    patNum.value = cleanPatNum;
    patientLabel.value = cleanLabel;
    commlog.value = cleanCommlog;
    pdf.value = cleanPdf;
    flushSync();
  }

  /**
   * Artifacts that were mid-flight when the app last stopped. Their outcome is
   * genuinely unknown — the POST may have committed before the process died —
   * so they are deliberately left as 'sending' rather than rewritten to
   * 'failed', which would invite a one-tap retry of a write that may already
   * be in the chart. The UI should make the provider confirm against Open
   * Dental before offering a resend.
   */
  const interruptedAtLoad = new Set<ArtifactKind>(
    ARTIFACT_KINDS.filter((kind) => artifactFor(kind).value.status === 'sending'),
  );

  const anythingSent = computed(
    () => commlog.value.status === 'sent' || pdf.value.status === 'sent',
  );
  const allSent = computed(() => commlog.value.status === 'sent' && pdf.value.status === 'sent');
  const pendingArtifacts = computed<readonly ArtifactKind[]>(() =>
    ARTIFACT_KINDS.filter((kind) => artifactFor(kind).value.status !== 'sent'),
  );
  const interruptedArtifacts = computed<readonly ArtifactKind[]>(() =>
    ARTIFACT_KINDS.filter(
      (kind) => interruptedAtLoad.has(kind) && artifactFor(kind).value.status === 'sending',
    ),
  );

  /**
   * True once this case has attempted anything against a chart. Deliberately
   * counts 'failed' and 'sending', not just 'sent': a failed POST is not proof
   * that nothing landed (a timeout can follow a committed write), so an
   * attempt is treated as a record until the provider clears it with
   * `reset()`.
   */
  const sendRecordExists = computed(
    () => patNum.value !== null && (commlog.value.status !== 'idle' || pdf.value.status !== 'idle'),
  );

  /**
   * Bind the record to the patient the provider confirmed. Refuses to move an
   * existing record onto a different PatNum — silently rebinding would erase
   * the evidence that the chart was switched and make `patientMismatch` blind.
   * Returns false when refused so the caller can surface the block.
   */
  function bindPatient(nextPatNum: number, label: string): boolean {
    if (sanitizePatNum(nextPatNum) === null) return false;
    if (sendRecordExists.value && patNum.value !== nextPatNum) return false;
    patNum.value = nextPatNum;
    patientLabel.value = sanitizeLabel(label);
    flushSync();
    return true;
  }

  /**
   * True when this case already has a send record against a different PatNum
   * than the MRN field now holds — the chart was switched under a recorded
   * send, and sending again would write this case's note into the wrong
   * patient. Blocks the button; `reset()` is the deliberate escape hatch.
   *
   * A blank or non-numeric MRN returns false: there is no other chart to
   * confuse this one with, and the send is already blocked upstream by having
   * no target PatNum.
   *
   * NOT redundant with the `caseOwner` check in `useSendToChart`, despite
   * both answering a wrong-patient question. They cover different windows and
   * neither subsumes the other:
   *
   *   this one   — keyed on the SEND RECORD, so it only exists once something
   *                has been filed. Covers "I already wrote to patient A and
   *                the MRN now says B", and works even when the identity was
   *                never confirmed (offline at intake leaves caseOwner null).
   *   caseOwner  — keyed on the CONFIRMED IDENTITY, so it works before
   *                anything is filed. Covers "this case is about A and the
   *                note is about to go to B".
   *
   * Deleting either one opens a hole the other does not cover. Both are
   * pinned by tests naming the scenario they alone catch.
   */
  function patientMismatch(currentMrn: string | number | null | undefined): boolean {
    if (!sendRecordExists.value) return false;
    const current = normalizeMrn(currentMrn);
    if (current === null) return false;
    return current !== patNum.value;
  }

  /**
   * The three transitions. Each returns false when it was refused because the
   * artifact is already 'sent' — a sent artifact is frozen, since every path
   * out of 'sent' would eventually authorise a second irreversible write.
   * Callers drive their loop from `pendingArtifacts` and can treat a false
   * return as "skip this call".
   */
  function markSending(artifact: ArtifactKind): boolean {
    const target = artifactFor(artifact);
    if (target.value.status === 'sent') return false;
    target.value = { status: 'sending' };
    flushSync();
    return true;
  }

  function markSent(artifact: ArtifactKind): boolean {
    const target = artifactFor(artifact);
    // Re-marking keeps the original timestamp: it is the medicolegal moment
    // the artifact entered the chart, not the moment we last noticed.
    if (target.value.status === 'sent') return false;
    target.value = { status: 'sent', at: new Date().toISOString() };
    flushSync();
    return true;
  }

  function markFailed(artifact: ArtifactKind, detail: string): boolean {
    const target = artifactFor(artifact);
    if (target.value.status === 'sent') return false;
    target.value = {
      status: 'failed',
      at: new Date().toISOString(),
      detail: sanitizeDetail(detail),
    };
    flushSync();
    return true;
  }

  const markCommlogSending = (): boolean => markSending('commlog');
  const markCommlogSent = (): boolean => markSent('commlog');
  const markCommlogFailed = (detail: string): boolean => markFailed('commlog', detail);
  const markPdfSending = (): boolean => markSending('pdf');
  const markPdfSent = (): boolean => markSent('pdf');
  const markPdfFailed = (detail: string): boolean => markFailed('pdf', detail);

  /**
   * Forget the record entirely. "Start new case" already wipes the key via
   * `useCaseReset`, so this exists for the in-case escape hatch: the provider
   * has checked Open Dental, knows what is actually in the chart, and is
   * deliberately starting a fresh send record (e.g. after a wrong MRN).
   */
  function reset(): void {
    patNum.value = null;
    patientLabel.value = null;
    commlog.value = { status: 'idle' };
    pdf.value = { status: 'idle' };
    flushSync();
  }

  return {
    patNum,
    patientLabel,
    commlog,
    pdf,

    anythingSent,
    allSent,
    pendingArtifacts,
    interruptedArtifacts,
    sendRecordExists,

    bindPatient,
    patientMismatch,
    markSending,
    markSent,
    markFailed,
    markCommlogSending,
    markCommlogSent,
    markCommlogFailed,
    markPdfSending,
    markPdfSent,
    markPdfFailed,
    reset,
  };
});
