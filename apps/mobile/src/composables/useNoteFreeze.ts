import { watch } from 'vue';

import { useClinicalNote } from './useClinicalNote';
import { useNoteArchiveStore } from '@/stores/note-archive';
import { usePatientStore } from '@/stores/patient';
import { useRecoveryStore } from '@/stores/recovery';

/**
 * Freezes the clinical note the moment an encounter becomes a finished
 * record, and exactly once.
 *
 * The trigger is "concluded AND signed", whichever lands second. An
 * assessment case cannot conclude unsigned — the signature is the only thing
 * gating it — but a sedation case can be released first and signed after, so
 * freezing on release alone would archive an unsigned note. Waiting for both
 * avoids that without touching either gate.
 *
 * `immediate` matters: if the tablet reloads between the two conditions
 * becoming true and the freeze happening, the watcher settles the case on
 * the next boot rather than losing the note.
 *
 * Mounted once in App.vue, not per view, so it does not matter which screen
 * the clinician is on when the encounter finishes.
 */
export function useNoteFreeze(): void {
  const recovery = useRecoveryStore();
  const patient = usePatientStore();
  const archive = useNoteArchiveStore();
  const note = useClinicalNote();

  watch(
    () => recovery.releasedAt !== null && recovery.providerSignatureDataUrl !== null,
    (finished) => {
      if (!finished || recovery.noteFrozenId !== null) return;

      const frozen = archive.freeze({
        kind: note.value.disposition.kind,
        patientName: patient.name,
        mrn: patient.mrn,
        // Detached from the live stores on purpose. The note is a computed
        // projection of current state; keeping the reference would let a
        // later edit rewrite a signed record.
        note: JSON.parse(JSON.stringify(note.value)) as typeof note.value,
      });
      recovery.noteFrozenId = frozen.id;
    },
    { immediate: true },
  );
}
