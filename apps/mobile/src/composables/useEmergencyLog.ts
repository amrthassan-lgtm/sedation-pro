import type { EmergencyDrugCallout } from '@sedation-pro/clinical';

import { useEventLogStore } from '@/stores/event-log';
import { useIVStore, type IVDoseRecord } from '@/stores/iv';
import { useUndoStore } from '@/stores/undo';

import { MEDICATION_GIVEN, REPEATABLE_STAMPS, type LogPill, type TimeStamp } from './emergencyLog';
import { fmtClock, nowClock } from './format';

/**
 * Tray drugs given from a protocol page are the same drug in the same
 * patient, so they are logged exactly as the sedation screen logs them and
 * count toward its totals and timers (owner, Nov 2026). No readiness check
 * stands in front of them here: these are rescue doses.
 */
const TRAY: Readonly<Record<string, { drug: IVDoseRecord['drug']; label: string }>> = {
  Midazolam: { drug: 'versed', label: 'Midazolam (Versed)' },
  Fentanyl: { drug: 'fentanyl', label: 'Fentanyl' },
  Ondansetron: { drug: 'zofran', label: 'Ondansetron (Zofran)' },
};

function amount(dose: string): number {
  return parseFloat(dose);
}

export function useEmergencyLog() {
  const iv = useIVStore();
  const undo = useUndoStore();
  const log = useEventLogStore();

  function record(drug: EmergencyDrugCallout, pill: LogPill) {
    const tray = TRAY[drug.name];
    const iv_ = pill.route === 'IV';
    return {
      event: tray && iv_ ? 'IV Dose' : MEDICATION_GIVEN,
      details: {
        Drug: tray?.label ?? drug.name,
        Dose: pill.dose,
        Route: pill.route,
        ...(pill.notes !== undefined && { Notes: pill.notes }),
      } as Record<string, string>,
    };
  }

  function give(drug: EmergencyDrugCallout, pill: LogPill): void {
    const { event, details } = record(drug, pill);
    const tray = TRAY[drug.name];
    const dose = tray
      ? iv.logDose(
          pill.dose.includes('mcg')
            ? { drug: tray.drug, mcg: amount(pill.dose) }
            : { drug: tray.drug, mg: amount(pill.dose) },
        )
      : null;
    undo.stamp({
      event,
      details,
      toast: {
        label: `✓ ${drug.name} ${pill.dose} ${pill.route}`,
        sub: nowClock(),
        tone: 'safe',
      },
      ...(dose && { revert: () => iv.removeDoseById(dose.id) }),
    });
  }

  /** "✓ 2:14 PM", with a count once it has been given more than once. */
  function lastGiven(drug: EmergencyDrugCallout, pill: LogPill): string | undefined {
    const { event, details } = record(drug, pill);
    const hits = log.events.filter(
      (e) =>
        e.event === event &&
        e.details.Drug === details.Drug &&
        e.details.Dose === details.Dose &&
        e.details.Route === details.Route,
    );
    const last = hits.at(-1);
    if (!last) return undefined;
    return `✓ ${fmtClock(last.timestamp)}${hits.length > 1 ? ` · ×${hits.length}` : ''}`;
  }

  function stamp(what: TimeStamp): void {
    if (!REPEATABLE_STAMPS.has(what) && stamped(what) !== undefined) return;
    undo.stamp({ event: what, toast: { label: `✓ ${what}`, sub: nowClock(), tone: 'safe' } });
  }

  function stamped(what: TimeStamp): string | undefined {
    const hits = log.events.filter((e) => e.event === what);
    const last = hits.at(-1);
    if (!last) return undefined;
    return `✓ ${fmtClock(last.timestamp)}${hits.length > 1 ? ` · ×${hits.length}` : ''}`;
  }

  return { give, lastGiven, stamp, stamped };
}
