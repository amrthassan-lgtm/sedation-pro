import { useIVStore } from '@/stores/iv';
import { useUndoStore } from '@/stores/undo';

/**
 * Shared IV-dose logging helpers. Phase 3 cards *and* the Sedation Dock both
 * need to log Versed / Fentanyl / Zofran / Flumazenil / Naloxone with the
 * same side effects: append to the dose log, emit an undo-able toast, and
 * fire the appropriate haptic (handled inside `iv.logDose`).
 *
 * Kept here as a thin composable rather than duplicated in two surfaces so a
 * change to the toast wording, the undo revert behaviour, or the haptic
 * intensity lands in one place.
 *
 * The reversal handlers do *not* open the in-card process panels — that's
 * local UI state owned by Phase3View. Callers that want to surface the
 * process steps wire that separately.
 */
export function useIvDosing() {
  const iv = useIVStore();
  const undo = useUndoStore();

  function nowClock(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function logIvVersed(mg: number, sub: string) {
    iv.logDose({ drug: 'versed', mg });
    undo.stamp({
      event: 'IV Dose',
      details: { Drug: 'Midazolam (Versed)', Dose: `${mg} mg`, Route: 'IV' },
      toast: { label: `✓ Versed ${mg} mg IV (${sub})`, sub: nowClock(), tone: 'caution' },
      revert: () => {
        const last = iv.doses[iv.doses.length - 1];
        if (last && last.drug === 'versed' && last.mg === mg) iv.removeDoseById(last.id);
      },
    });
  }

  function logIvFentanyl(mcg: number, sub: string) {
    iv.logDose({ drug: 'fentanyl', mcg });
    undo.stamp({
      event: 'IV Dose',
      details: { Drug: 'Fentanyl', Dose: `${mcg} mcg`, Route: 'IV' },
      toast: { label: `✓ Fentanyl ${mcg} mcg IV (${sub})`, sub: nowClock(), tone: 'caution' },
      revert: () => {
        const last = iv.doses[iv.doses.length - 1];
        if (last && last.drug === 'fentanyl' && last.mcg === mcg) iv.removeDoseById(last.id);
      },
    });
  }

  function logIvZofran(mg: number) {
    iv.logDose({ drug: 'zofran', mg });
    undo.stamp({
      event: 'IV Dose',
      details: { Drug: 'Ondansetron (Zofran)', Dose: `${mg} mg`, Route: 'IV' },
      toast: { label: `✓ Zofran ${mg} mg IV`, sub: nowClock(), tone: 'safe' },
      revert: () => {
        const last = iv.doses[iv.doses.length - 1];
        if (last && last.drug === 'zofran' && last.mg === mg) iv.removeDoseById(last.id);
      },
    });
  }

  function logIvFlumazenil() {
    iv.logDose({ drug: 'flumazenil', mg: 0.2 });
    undo.stamp({
      event: 'Reversal Agent',
      details: { Drug: 'Flumazenil', Dose: '0.2 mg', Route: 'IV', Notes: 'benzo reversal' },
      toast: { label: '✓ Flumazenil 0.2 mg IV', sub: nowClock(), tone: 'limit' },
      revert: () => {
        const last = iv.doses[iv.doses.length - 1];
        if (last && last.drug === 'flumazenil') iv.removeDoseById(last.id);
      },
    });
  }

  function logIvNaloxone() {
    iv.logDose({ drug: 'naloxone', mg: 0.4 });
    undo.stamp({
      event: 'Reversal Agent',
      details: { Drug: 'Naloxone', Dose: '0.4 mg', Route: 'IV', Notes: 'opioid reversal' },
      toast: { label: '✓ Naloxone 0.4 mg IV', sub: nowClock(), tone: 'limit' },
      revert: () => {
        const last = iv.doses[iv.doses.length - 1];
        if (last && last.drug === 'naloxone') iv.removeDoseById(last.id);
      },
    });
  }

  return {
    logIvVersed,
    logIvFentanyl,
    logIvZofran,
    logIvFlumazenil,
    logIvNaloxone,
  };
}
