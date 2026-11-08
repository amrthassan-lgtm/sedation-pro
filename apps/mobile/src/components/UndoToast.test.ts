import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import UndoToast from './UndoToast.vue';
import { useEventLogStore } from '@/stores/event-log';
import { useToastStore } from '@/stores/toast';
import { useUndoStore } from '@/stores/undo';

function mountToast() {
  return mount(UndoToast, { attachTo: document.body });
}

describe('UndoToast', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    document.body.innerHTML = '';
  });

  it('shows an Undo button for a stamped action and reverts it on tap', async () => {
    const undo = useUndoStore();
    const log = useEventLogStore();
    const wrapper = mountToast();
    undo.stamp({ event: 'IV Dose', toast: { label: '✓ Versed 2.5 mg IV', tone: 'safe' } });
    await nextTick();
    const btn = document.body.querySelector<HTMLButtonElement>('.undo-toast-btn');
    expect(btn).not.toBeNull();
    btn!.click();
    await nextTick();
    expect(log.events).toHaveLength(0);
    expect(document.body.querySelector('.undo-toast')).toBeNull();
    wrapper.unmount();
  });

  it('renders no Undo button on a gate toast, so a logged dose cannot be reverted by it', async () => {
    const undo = useUndoStore();
    const log = useEventLogStore();
    const toast = useToastStore();
    const wrapper = mountToast();
    undo.stamp({ event: 'Bedtime Premedication', toast: { label: 'Diazepam 5 mg', tone: 'safe' } });
    toast.show({ id: 'gate-1', label: 'Complete Phase 1 first', tone: 'caution' });
    await nextTick();
    expect(document.body.querySelector('.undo-toast-action')?.textContent).toContain(
      'Complete Phase 1 first',
    );
    expect(document.body.querySelector('.undo-toast-btn')).toBeNull();
    expect(log.events).toHaveLength(1);
    expect(undo.count).toBe(1);
    wrapper.unmount();
  });
});
