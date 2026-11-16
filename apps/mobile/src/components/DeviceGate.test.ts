import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import DeviceGate from './DeviceGate.vue';
import { PIN_IDLE_MS, useDeviceStore } from '@/stores/device';
import { useEventLogStore } from '@/stores/event-log';
import { useFormularyStore } from '@/stores/formulary';
import { usePatientStore } from '@/stores/patient';

const Stub = { template: '<div />' };
let wrapper: VueWrapper | null = null;

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

async function mountGate(
  mode: 'setup' | 'lock' | 'change',
): Promise<{ w: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/phase/1', name: 'phase1', component: Stub },
      { path: '/quick-reference', name: 'quickref', component: Stub },
      { path: '/:pathMatch(.*)*', component: Stub },
    ],
  });
  await router.push('/phase/1');
  await router.isReady();
  wrapper = mount(DeviceGate, {
    props: { mode },
    global: { plugins: [router] },
    attachTo: document.body,
  });
  return { w: wrapper, router };
}

const button = (w: VueWrapper, label: string) =>
  w.findAll('button').find((b) => b.text() === label);

async function typePin(w: VueWrapper, pin: string): Promise<void> {
  for (const digit of pin) await button(w, digit)!.trigger('click');
  // The PIN is hashed with WebCrypto, which settles outside the microtask queue.
  await vi.waitFor(async () => {
    await flushPromises();
    expect(w.findAll('.pin-dot.is-on')).toHaveLength(0);
  });
}

describe('first-run setup', () => {
  it('takes the doctors, the assistants and the PIN twice, then starts the open case with doctor 1', async () => {
    const { w } = await mountGate('setup');
    await button(w, 'Get started')!.trigger('click');
    expect(w.text()).toContain('Step 1 of 3');
    expect(button(w, 'Continue')!.attributes('disabled')).toBeDefined();

    await w.find('.pl-add').trigger('click');
    await w.find('.pl-row-add input').setValue('Dr. Jordan Rivera');
    await w.find('.pl-action.is-primary').trigger('click');
    await button(w, 'Continue')!.trigger('click');
    expect(w.text()).toContain('Step 2 of 3');
    expect(button(w, 'Continue')!.attributes('disabled')).toBeDefined();

    await w.find('.pl-add').trigger('click');
    await w.find('.pl-row-add input').setValue('Alex Morgan, EFDA');
    await w.find('.pl-action.is-primary').trigger('click');
    await button(w, 'Continue')!.trigger('click');
    expect(w.text()).toContain('Create a PIN');

    await typePin(w, '1234');
    expect(w.text()).toContain('Enter it again');
    await typePin(w, '1234');
    await vi.waitFor(() => expect(useDeviceStore().isSetUp).toBe(true));

    expect(useFormularyStore().picklists.providers).toEqual(['Dr. Jordan Rivera']);
    expect(useFormularyStore().picklists.dentalAssistants).toEqual(['Alex Morgan, EFDA']);
    expect(usePatientStore().provider).toBe('Dr. Jordan Rivera');
    expect(usePatientStore().assistants).toBe('Alex Morgan, EFDA');
    expect(await useDeviceStore().checkPin('1234')).toBe(true);
    expect(w.emitted('close')).toHaveLength(1);
    // Setting up a tablet is not something that happened to a patient.
    expect(useEventLogStore().count).toBe(0);
  });

  it('asks for the PIN again when the two do not match', async () => {
    const { w } = await mountGate('setup');
    useFormularyStore().setList('providers', ['Dr. Jordan Rivera']);
    useFormularyStore().setList('dentalAssistants', ['Alex Morgan, EFDA']);
    await button(w, 'Get started')!.trigger('click');
    await button(w, 'Continue')!.trigger('click');
    await button(w, 'Continue')!.trigger('click');
    await typePin(w, '1234');
    await typePin(w, '9999');
    expect(w.text()).toContain('The two PINs did not match');
    expect(w.text()).toContain('Create a PIN');
    expect(useDeviceStore().isSetUp).toBe(false);
  });

  it('can open the emergency protocols before setup', async () => {
    const { w, router } = await mountGate('setup');
    await w.find('.gate-emerg').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quickref');
  });
});

describe('the PIN after twelve hours', () => {
  beforeEach(async () => {
    await useDeviceStore().setPin('2468', Date.now() - PIN_IDLE_MS - 1000);
  });

  it('says when a PIN is wrong and opens on the right one', async () => {
    const { w } = await mountGate('lock');
    expect(useDeviceStore().isLocked(Date.now())).toBe(true);
    await typePin(w, '1111');
    expect(w.text()).toContain('Wrong PIN');
    await typePin(w, '2468');
    expect(useDeviceStore().isLocked(Date.now())).toBe(false);
    expect(w.emitted('close')).toHaveLength(1);
  });

  it('Emergency on the keypad opens the protocols without the PIN', async () => {
    const { w, router } = await mountGate('lock');
    await button(w, 'Emergency')!.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('quickref');
    expect(useDeviceStore().isLocked(Date.now())).toBe(true);
  });

  it('Forgot PIN warns that unsent notes go with the reset', async () => {
    const { w } = await mountGate('lock');
    await button(w, 'Forgot PIN?')!.trigger('click');
    expect(document.body.textContent).toContain('including any note not yet sent to Open Dental');
  });
});

describe('changing the PIN from Settings', () => {
  it('proves the current PIN, then takes the new one twice', async () => {
    await useDeviceStore().setPin('1357', Date.now());
    const { w } = await mountGate('change');
    await typePin(w, '1357');
    expect(w.text()).toContain('Choose a new PIN');
    await typePin(w, '8642');
    await typePin(w, '8642');
    await vi.waitFor(async () => expect(await useDeviceStore().checkPin('8642')).toBe(true));
    expect(w.emitted('close')).toHaveLength(1);
  });
});
