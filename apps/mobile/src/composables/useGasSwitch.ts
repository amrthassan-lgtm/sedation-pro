import { computed } from 'vue';
import { storeToRefs } from 'pinia';

import { useEventLogStore } from '@/stores/event-log';
import { useIVStore } from '@/stores/iv';
import { useUndoStore } from '@/stores/undo';
import { haptic } from './useHaptics';

export const GAS_ON_EVENT = 'N₂O/O₂ ON';
export const GAS_OFF_EVENT = 'N₂O/O₂ OFF · O₂ 100% ON';

/**
 * The N₂O / O₂ switch. It is flipped on and off as needed through a case
 * (owner, Nov 2026), from steps 2 and 4 of the IV screen and from the dock.
 * Both come through here, so a flip writes the same log line, the same
 * pop-up and the same Undo wherever it was tapped.
 *
 * A tap that changes nothing writes nothing. The mix cannot be turned on
 * twice, and oxygen alone follows the mix: there is nothing to turn off
 * before it has been on. The buttons already refuse those taps; this is the
 * one place every flip passes, so the record does not depend on two screens
 * staying disabled.
 */
export function useGasSwitch() {
  const iv = useIVStore();
  const undo = useUndoStore();
  const log = useEventLogStore();
  const { n2oOn, o2OnlyOn } = storeToRefs(iv);

  const canTurnOff = computed(() => n2oOn.value);

  /**
   * When the gas now running was set, read from its log row and never kept
   * beside it: an Undo takes the row, and the time goes back with it to the
   * flip before.
   */
  const runningSince = computed<number | null>(() => {
    const running = n2oOn.value ? GAS_ON_EVENT : o2OnlyOn.value ? GAS_OFF_EVENT : null;
    if (running === null) return null;
    return log.events.filter((e) => e.event === running).at(-1)?.timestamp ?? null;
  });

  function turnOn(): void {
    if (iv.n2oOn) return;
    haptic('medium');
    // Both flags, captured before the change: Undo of a flip must put the
    // gas back as it was, not merely take the mix off.
    const prevN2oOn = iv.n2oOn;
    const prevO2OnlyOn = iv.o2OnlyOn;
    iv.setN2oOn();
    undo.stamp({
      event: GAS_ON_EVENT,
      details: { Route: 'Inhalation' },
      toast: { label: '✓ N₂O/O₂ ON', tone: 'safe' },
      revert: () => iv.restoreGasState(prevN2oOn, prevO2OnlyOn),
    });
  }

  function turnOff(): void {
    if (!iv.n2oOn) return;
    haptic('medium');
    const prevN2oOn = iv.n2oOn;
    const prevO2OnlyOn = iv.o2OnlyOn;
    iv.setN2oOff();
    undo.stamp({
      event: GAS_OFF_EVENT,
      details: { 'N₂O': 'Discontinued', 'O₂': '100% via nasal cannula' },
      toast: { label: '✓ N₂O off · O₂ 100% on', tone: 'safe' },
      revert: () => iv.restoreGasState(prevN2oOn, prevO2OnlyOn),
    });
  }

  return { n2oOn, o2OnlyOn, canTurnOff, runningSince, turnOn, turnOff };
}
