import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import { CHART_SEND_STORAGE_KEY, useChartSendStore } from './chart-send';
import type { ArtifactState } from './chart-send';

// Synthetic identifiers only. Nothing here corresponds to a real PatNum or a
// real person, and no test in this file touches the network.
const PAT_NUM = 4242;
const OTHER_PAT_NUM = 5150;
const LABEL = 'Testlast, Testfirst · 1970-01-01';

interface PersistedSnapshot {
  patNum: number | null;
  patientLabel: string | null;
  commlog: ArtifactState;
  pdf: ArtifactState;
}

/** Read what is on disk right now. Throws if the store never wrote anything. */
function storedSnapshot(): PersistedSnapshot {
  const raw = localStorage.getItem(CHART_SEND_STORAGE_KEY);
  if (raw === null) throw new Error('nothing persisted under the chart-send key');
  return JSON.parse(raw) as PersistedSnapshot;
}

/**
 * Cold launch: drop the live store (and its watcher) and rebuild from the same
 * localStorage. Deliberately called without an intervening `nextTick`, because
 * the whole point is that the record survives a process that dies before the
 * deep watcher ever runs.
 */
function reloadStore(previous?: { $dispose: () => void }) {
  previous?.$dispose();
  setActivePinia(createPinia());
  return useChartSendStore();
}

describe('chart-send store', () => {
  beforeEach(() => {
    // persistRefs() hydrates from localStorage at store init; a leftover
    // snapshot would mask the assertion under test.
    localStorage.clear();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('synchronous persistence', () => {
    it('persists a bind before the action returns, with no tick in between', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);

      const stored = storedSnapshot();
      expect(stored.patNum).toBe(PAT_NUM);
      expect(stored.patientLabel).toBe(LABEL);
    });

    it('persists every artifact transition before the action returns', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);

      store.markCommlogSending();
      expect(storedSnapshot().commlog).toEqual({ status: 'sending' });

      store.markCommlogSent();
      expect(storedSnapshot().commlog).toEqual({ status: 'sent', at: expect.any(String) });

      store.markPdfSending();
      expect(storedSnapshot().pdf).toEqual({ status: 'sending' });

      store.markPdfFailed('HTTP 500');
      expect(storedSnapshot().pdf).toEqual({
        status: 'failed',
        at: expect.any(String),
        detail: 'HTTP 500',
      });
    });

    it('survives a reload that happens between the two API calls', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSending();
      store.markCommlogSent();

      // Tablet sleeps / tab is killed here — no tick, so the deep watcher in
      // persistRefs has not run. Only the synchronous flush has.
      const reloaded = reloadStore(store);

      expect(reloaded.patNum).toBe(PAT_NUM);
      expect(reloaded.patientLabel).toBe(LABEL);
      expect(reloaded.commlog.status).toBe('sent');
      expect(reloaded.pdf.status).toBe('idle');
      expect(reloaded.pendingArtifacts).toEqual(['pdf']);
      expect(reloaded.markCommlogSending()).toBe(false);
    });

    it('keeps working when localStorage throws', () => {
      const store = useChartSendStore();
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(() => store.markCommlogSent()).not.toThrow();
      expect(store.commlog.status).toBe('sent');
    });

    it('writes the same shape the deep watcher would, so neither clobbers the other', async () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();
      const afterSyncFlush = localStorage.getItem(CHART_SEND_STORAGE_KEY);

      await nextTick();

      expect(localStorage.getItem(CHART_SEND_STORAGE_KEY)).toBe(afterSyncFlush);
    });
  });

  describe('artifact bookkeeping', () => {
    it('tracks anythingSent / allSent / pendingArtifacts across a full send', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);

      expect(store.anythingSent).toBe(false);
      expect(store.allSent).toBe(false);
      expect(store.pendingArtifacts).toEqual(['commlog', 'pdf']);

      store.markCommlogSent();
      expect(store.anythingSent).toBe(true);
      expect(store.allSent).toBe(false);
      expect(store.pendingArtifacts).toEqual(['pdf']);

      store.markPdfSent();
      expect(store.anythingSent).toBe(true);
      expect(store.allSent).toBe(true);
      expect(store.pendingArtifacts).toEqual([]);
    });

    it('counts a sending or failed artifact as still pending', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);

      store.markCommlogFailed('Network error');
      store.markPdfSending();

      expect(store.anythingSent).toBe(false);
      expect(store.pendingArtifacts).toEqual(['commlog', 'pdf']);
    });

    it('stamps ISO timestamps and never moves a sent timestamp', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-17T14:30:00.000Z'));

      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      expect(store.markCommlogSent()).toBe(true);
      expect(store.commlog).toEqual({ status: 'sent', at: '2026-08-17T14:30:00.000Z' });

      vi.setSystemTime(new Date('2026-08-17T15:00:00.000Z'));
      expect(store.markCommlogSent()).toBe(false);
      expect(store.commlog).toEqual({ status: 'sent', at: '2026-08-17T14:30:00.000Z' });
    });

    it('bounds a long failure detail instead of persisting it whole', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markPdfFailed('x'.repeat(1000));

      const pdf = storedSnapshot().pdf;
      if (pdf.status !== 'failed') throw new Error('expected a failed pdf artifact');
      expect(pdf.detail.length).toBeLessThanOrEqual(300);
    });
  });

  describe('a sent artifact is frozen', () => {
    it('leaves the commlog untouchable when the pdf fails after it', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();
      const sentAt = store.commlog.status === 'sent' ? store.commlog.at : '';
      store.markPdfFailed('HTTP 500');

      expect(store.markCommlogSending()).toBe(false);
      expect(store.markCommlogFailed('HTTP 500')).toBe(false);
      expect(store.markCommlogSent()).toBe(false);
      expect(store.commlog).toEqual({ status: 'sent', at: sentAt });

      // The retry only has the PDF left to do, and it is allowed to proceed.
      expect(store.pendingArtifacts).toEqual(['pdf']);
      expect(store.markPdfSending()).toBe(true);
    });

    it('keeps the commlog frozen across a reload', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();
      store.markPdfFailed('HTTP 500');

      const reloaded = reloadStore(store);

      expect(reloaded.markCommlogSending()).toBe(false);
      expect(reloaded.commlog.status).toBe('sent');
      expect(reloaded.pdf.status).toBe('failed');
      expect(reloaded.pendingArtifacts).toEqual(['pdf']);
    });
  });

  describe('patientMismatch', () => {
    it('is false before anything has been attempted', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);

      expect(store.sendRecordExists).toBe(false);
      expect(store.patientMismatch(OTHER_PAT_NUM)).toBe(false);
    });

    it('is true once a send is recorded against a different chart', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();

      expect(store.patientMismatch(OTHER_PAT_NUM)).toBe(true);
      expect(store.patientMismatch(String(OTHER_PAT_NUM))).toBe(true);
      expect(store.patientMismatch(PAT_NUM)).toBe(false);
      expect(store.patientMismatch(` ${PAT_NUM} `)).toBe(false);
    });

    it('treats a failed-only attempt as a record, since a failure is not proof nothing landed', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogFailed('Timeout');

      expect(store.sendRecordExists).toBe(true);
      expect(store.patientMismatch(OTHER_PAT_NUM)).toBe(true);
    });

    it('is false for a blank or non-numeric MRN field', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();

      expect(store.patientMismatch('')).toBe(false);
      expect(store.patientMismatch('   ')).toBe(false);
      expect(store.patientMismatch('abc')).toBe(false);
      expect(store.patientMismatch(null)).toBe(false);
      expect(store.patientMismatch(undefined)).toBe(false);
    });

    it('still blocks after a reload', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();

      const reloaded = reloadStore(store);

      expect(reloaded.patientMismatch(OTHER_PAT_NUM)).toBe(true);
    });
  });

  describe('bindPatient guards', () => {
    it('rejects a PatNum that is not a positive integer', () => {
      const store = useChartSendStore();

      expect(store.bindPatient(0, LABEL)).toBe(false);
      expect(store.bindPatient(-1, LABEL)).toBe(false);
      expect(store.bindPatient(Number.NaN, LABEL)).toBe(false);
      expect(store.bindPatient(1.5, LABEL)).toBe(false);
      expect(store.patNum).toBeNull();
    });

    it('rebinds freely while nothing has been attempted', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      expect(store.bindPatient(OTHER_PAT_NUM, LABEL)).toBe(true);
      expect(store.patNum).toBe(OTHER_PAT_NUM);
    });

    it('refuses to move a recorded send onto a different chart', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();

      expect(store.bindPatient(OTHER_PAT_NUM, 'Other, Test · 1970-01-01')).toBe(false);
      expect(store.patNum).toBe(PAT_NUM);
      expect(store.patientLabel).toBe(LABEL);
      // The mismatch signal stays visible instead of being silently rebound away.
      expect(store.patientMismatch(OTHER_PAT_NUM)).toBe(true);
    });

    it('allows a label refresh for the same chart', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();

      expect(store.bindPatient(PAT_NUM, 'Testlast, Testfirst · 1970-01-02')).toBe(true);
      expect(store.patientLabel).toBe('Testlast, Testfirst · 1970-01-02');
    });
  });

  describe('interrupted sends', () => {
    it('reports an artifact that was still sending when the app died', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSending();

      const reloaded = reloadStore(store);

      // Deliberately still 'sending', not rewritten to 'failed': the POST may
      // have committed before the process died.
      expect(reloaded.commlog.status).toBe('sending');
      expect(reloaded.interruptedArtifacts).toEqual(['commlog']);
      expect(reloaded.pdf.status).toBe('idle');
    });

    it('clears the interrupted flag once the artifact resolves', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSending();

      const reloaded = reloadStore(store);
      expect(reloaded.interruptedArtifacts).toEqual(['commlog']);

      reloaded.markCommlogSent();
      expect(reloaded.interruptedArtifacts).toEqual([]);
    });

    it('is empty on a normal launch', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();

      const reloaded = reloadStore(store);
      expect(reloaded.interruptedArtifacts).toEqual([]);
    });
  });

  describe('hydration hardening', () => {
    it('collapses an unrecognisable snapshot to a clean record', () => {
      localStorage.setItem(
        CHART_SEND_STORAGE_KEY,
        JSON.stringify({
          patNum: 'not-a-number',
          patientLabel: 12,
          commlog: 'sent',
          pdf: { status: 'bogus' },
        }),
      );

      const store = useChartSendStore();

      expect(store.patNum).toBeNull();
      expect(store.patientLabel).toBeNull();
      expect(store.commlog).toEqual({ status: 'idle' });
      expect(store.pdf).toEqual({ status: 'idle' });
      expect(store.sendRecordExists).toBe(false);
      // The cleaned record is written back immediately, not on the next tick.
      expect(storedSnapshot().commlog).toEqual({ status: 'idle' });
    });

    it('never downgrades a sent marker that lost its timestamp', () => {
      localStorage.setItem(
        CHART_SEND_STORAGE_KEY,
        JSON.stringify({
          patNum: PAT_NUM,
          patientLabel: LABEL,
          commlog: { status: 'sent' },
          pdf: { status: 'idle' },
        }),
      );

      const store = useChartSendStore();

      expect(store.commlog).toEqual({ status: 'sent', at: expect.any(String) });
      expect(store.pendingArtifacts).toEqual(['pdf']);
      expect(store.markCommlogSending()).toBe(false);
    });

    it('starts clean when there is no snapshot at all', () => {
      const store = useChartSendStore();

      expect(store.patNum).toBeNull();
      expect(store.commlog).toEqual({ status: 'idle' });
      expect(store.pdf).toEqual({ status: 'idle' });
      expect(store.anythingSent).toBe(false);
      // Nothing has happened, so nothing is written yet.
      expect(localStorage.getItem(CHART_SEND_STORAGE_KEY)).toBeNull();
    });
  });

  describe('reset', () => {
    it('clears the record in memory and on disk, and unblocks the button', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();
      store.markPdfFailed('HTTP 500');

      store.reset();

      expect(store.patNum).toBeNull();
      expect(store.patientLabel).toBeNull();
      expect(store.commlog).toEqual({ status: 'idle' });
      expect(store.pdf).toEqual({ status: 'idle' });
      expect(store.anythingSent).toBe(false);
      expect(store.allSent).toBe(false);
      expect(store.pendingArtifacts).toEqual(['commlog', 'pdf']);
      expect(store.sendRecordExists).toBe(false);
      expect(store.patientMismatch(OTHER_PAT_NUM)).toBe(false);
      expect(storedSnapshot()).toEqual({
        patNum: null,
        patientLabel: null,
        commlog: { status: 'idle' },
        pdf: { status: 'idle' },
      });
    });

    it('stays cleared across a reload', () => {
      const store = useChartSendStore();
      store.bindPatient(PAT_NUM, LABEL);
      store.markCommlogSent();
      store.reset();

      const reloaded = reloadStore(store);

      expect(reloaded.patNum).toBeNull();
      expect(reloaded.commlog).toEqual({ status: 'idle' });
      expect(reloaded.markCommlogSending()).toBe(true);
    });
  });
});
