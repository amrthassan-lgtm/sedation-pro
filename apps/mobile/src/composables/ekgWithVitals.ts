import { PHASE1_AMENDMENT_EVENT, useEventLogStore } from '@/stores/event-log';
import { usePatientStore } from '@/stores/patient';
import { useUndoStore } from '@/stores/undo';
import { nowClock } from './format';

/**
 * Owner, Nov 2026: the leads go on with the rest of the monitor just before
 * the first pre-op vitals, long after the assistant has left Phase 1, so the
 * box was only ever ticked by walking back to it. Stamping those vitals now
 * ticks it. It is the one assessment field the app sets by itself, on his
 * decision; until then the card tells whoever stamps to place the leads.
 *
 * Once the assessment is locked the tick goes into the log as the same
 * amendment row a hand tick in Phase 1 writes. Phase 1's audit is not mounted
 * on this screen to write it, and without the row the note would print "Yes"
 * over a lock row that reads "—" with nothing in between.
 *
 * Returns what Undo has to run. A box ticked by hand is left alone both ways.
 */
export function confirmEkgWithVitals(): () => void {
  const patient = usePatientStore();
  const log = useEventLogStore();

  if (patient.ekgPlaced) return () => {};

  patient.ekgPlaced = true;
  const row =
    log.phase1LockedAt !== null
      ? log.append(PHASE1_AMENDMENT_EVENT, { 'EKG placed': '— → Yes' })
      : null;

  return () => {
    patient.ekgPlaced = false;
    if (row) log.removeById(row.id);
  };
}

/**
 * The box itself, ticked or unticked by hand on the Pre-Op Vitals card. It
 * left the Phase 1 safety checklist (owner, Nov 2026) because a run of taps
 * down that list could tick it with the leads still in the drawer, and the
 * tick is what unlocks the IV sedatives.
 *
 * On a locked assessment it writes the same amendment row a hand tick in
 * Phase 1 wrote, as an action Undo can take back. Before the lock it writes
 * nothing: the lock row carries the box as it stands.
 */
export function setEkgByHand(placed: boolean): void {
  const patient = usePatientStore();
  const log = useEventLogStore();
  const before = patient.ekgPlaced;
  if (before === placed) return;

  patient.ekgPlaced = placed;
  if (log.phase1LockedAt === null) return;

  useUndoStore().stamp({
    event: PHASE1_AMENDMENT_EVENT,
    details: { 'EKG placed': placed ? '— → Yes' : 'Yes → —' },
    toast: {
      label: placed ? '✓ EKG leads placed' : 'EKG leads unticked',
      sub: nowClock(),
      tone: placed ? 'safe' : 'caution',
    },
    revert: () => {
      patient.ekgPlaced = before;
    },
  });
}
