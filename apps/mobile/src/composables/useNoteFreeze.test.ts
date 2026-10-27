import { createPinia, setActivePinia } from 'pinia';
import { effectScope, nextTick } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';

import { useNoteFreeze } from './useNoteFreeze';
import { useNoteArchiveStore } from '@/stores/note-archive';
import { PRESERVED_KEYS } from './useCaseReset';
import { NOTE_ARCHIVE_KEY } from '@/stores/note-archive';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';

const SIGNED = 'data:image/png;base64,iVBORw0KGgo=';

/** `useNoteFreeze` registers a watcher, so it needs a scope to live in. */
function mountFreeze(): () => void {
  const scope = effectScope();
  scope.run(() => useNoteFreeze());
  return () => scope.stop();
}

function namedPatient(name = 'Rivera, Dana', mrn = '4242'): void {
  const patient = usePatientStore();
  patient.name = name;
  patient.mrn = mrn;
}

beforeEach(() => {
  window.localStorage.clear();
  setActivePinia(createPinia());
});

describe('freezing a finished encounter', () => {
  it('archives nothing while the case is still open', async () => {
    namedPatient();
    mountFreeze();
    await nextTick();

    expect(useNoteArchiveStore().count).toBe(0);
  });

  /**
   * An assessment case cannot conclude unsigned, so this is the ordinary
   * path: signature first, then Complete Assessment.
   */
  it('archives once concluded after signing', async () => {
    namedPatient();
    const recovery = useRecoveryStore();
    recovery.providerSignatureDataUrl = SIGNED;
    mountFreeze();

    recovery.releasedAt = Date.now();
    await nextTick();

    const archive = useNoteArchiveStore();
    expect(archive.count).toBe(1);
    expect(archive.byNewest[0]?.patientName).toBe('Rivera, Dana');
    expect(archive.byNewest[0]?.mrn).toBe('4242');
  });

  /**
   * The reason the trigger is "both, whichever is second": a sedation case
   * can be released before the provider signs, and freezing on release alone
   * would archive an unsigned note.
   */
  it('waits for the signature when the patient was released first', async () => {
    namedPatient();
    const recovery = useRecoveryStore();
    mountFreeze();

    recovery.releasedAt = Date.now();
    await nextTick();
    expect(useNoteArchiveStore().count).toBe(0);

    recovery.providerSignatureDataUrl = SIGNED;
    await nextTick();
    expect(useNoteArchiveStore().count).toBe(1);
  });

  it('freezes once, not on every subsequent change', async () => {
    namedPatient();
    const recovery = useRecoveryStore();
    recovery.providerSignatureDataUrl = SIGNED;
    mountFreeze();
    recovery.releasedAt = Date.now();
    await nextTick();

    recovery.clearReleased();
    await nextTick();
    recovery.releasedAt = Date.now();
    await nextTick();

    expect(useNoteArchiveStore().count).toBe(1);
  });

  /**
   * If the tablet reloads between concluding and freezing, the encounter
   * must still end up archived rather than silently lost.
   */
  it('settles an already-finished encounter on the next boot', async () => {
    namedPatient();
    const recovery = useRecoveryStore();
    recovery.providerSignatureDataUrl = SIGNED;
    recovery.releasedAt = Date.now();

    mountFreeze();
    await nextTick();

    expect(useNoteArchiveStore().count).toBe(1);
  });

  /**
   * The note is a live computed over the stores. If the archive held that
   * reference, continuing on this tablet would silently rewrite a signed
   * record.
   */
  it('detaches the note from the stores that produced it', async () => {
    namedPatient('Rivera, Dana');
    const recovery = useRecoveryStore();
    recovery.providerSignatureDataUrl = SIGNED;
    mountFreeze();
    recovery.releasedAt = Date.now();
    await nextTick();

    usePatientStore().name = 'Okafor, Sam';
    await nextTick();

    const frozen = useNoteArchiveStore().byNewest[0];
    expect(frozen?.patientName).toBe('Rivera, Dana');
    expect(frozen?.note.header.patient).toBe('Rivera, Dana');
  });
});

describe('the archive itself', () => {
  /**
   * The whole point of freezing is that the note outlives its case, so the
   * reset that starts the next one must not touch it.
   */
  it('survives Start new case', () => {
    expect(PRESERVED_KEYS.has(NOTE_ARCHIVE_KEY)).toBe(true);
  });

  it('survives a reload', async () => {
    namedPatient();
    const recovery = useRecoveryStore();
    recovery.providerSignatureDataUrl = SIGNED;
    mountFreeze();
    recovery.releasedAt = Date.now();
    await nextTick();
    await nextTick();

    setActivePinia(createPinia());

    expect(useNoteArchiveStore().count).toBe(1);
  });

  it('removes only the note asked for', async () => {
    const archive = useNoteArchiveStore();
    const a = archive.freeze({ kind: 'assessment', patientName: 'A', mrn: '1', note: {} as never });
    archive.freeze({ kind: 'sedation', patientName: 'B', mrn: '2', note: {} as never });

    expect(archive.remove(a.id)).toBe(true);
    expect(archive.count).toBe(1);
    expect(archive.byNewest[0]?.patientName).toBe('B');
  });
});
