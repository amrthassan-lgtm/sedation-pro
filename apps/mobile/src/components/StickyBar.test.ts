import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import StickyBar from './StickyBar.vue';
import { protocolTitleHidden } from '@/composables/protocolTitle';
import { useSessionStore } from '@/stores/session';
import { lastSavedAt, unsavedKeys } from '@/stores/persistence';

const Stub = { template: '<div />' };

async function barAt(path: string, titleHidden = true) {
  setActivePinia(createPinia());
  protocolTitleHidden.value = titleHidden;
  useSessionStore().setPhase('quickref');
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/quick-reference', name: 'quickref', component: Stub },
      { path: '/quick-reference/:id', name: 'quickref-detail', component: Stub },
      { path: '/:pathMatch(.*)*', component: Stub },
    ],
  });
  await router.push(path);
  await router.isReady();
  const w = mount(StickyBar, { global: { plugins: [router] } });
  return {
    fade: w.find('.sticky-bar-phase transition-stub').attributes('name'),
    label: w.find('.sticky-bar-phase-label').text(),
    sub: w.find('.sticky-bar-phase-sub').text(),
    unmount: () => w.unmount(),
  };
}

describe('the top bar on a protocol page', () => {
  it('says Quick Reference while the page shows its own large title', async () => {
    const bar = await barAt('/quick-reference/vfib_vtach', false);
    expect(bar.label).toBe('Quick Reference');
    bar.unmount();
  });

  it('names the protocol and its category once that title has scrolled away', async () => {
    const bar = await barAt('/quick-reference/vfib_vtach');
    expect(bar.label).toBe('V-Fib / Pulseless V-Tach');
    expect(bar.sub).toBe('Cardiac · Arrest');
    bar.unmount();
  });

  it('uses the full name where two pages share a short one', async () => {
    const bar = await barAt('/quick-reference/oversedation_opioid');
    expect(bar.label).toBe('Oversedation (Opioid)');
    bar.unmount();
  });

  it('says Quick Reference on the list and on an unknown page', async () => {
    for (const path of ['/quick-reference', '/quick-reference/nope']) {
      const bar = await barAt(path);
      expect(bar.label, path).toBe('Quick Reference');
      bar.unmount();
    }
  });
});

describe('the top bar title on other screens', () => {
  it('changes at once on every other screen: only the protocol name fades', async () => {
    const elsewhere = await barAt('/phase1', false);
    expect(elsewhere.fade).toBe('bar-now');
    elsewhere.unmount();
    const protocol = await barAt('/quick-reference/anaphylaxis');
    expect(protocol.fade).toBe('bar-title');
    protocol.unmount();
  });
});

describe('the save pill (v1 audit)', () => {
  afterEach(() => {
    unsavedKeys.value = [];
  });

  it('never says Saved while a save is failing', async () => {
    setActivePinia(createPinia());
    useSessionStore().setPhase('quickref');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: Stub }],
    });
    await router.push('/quick-reference');
    await router.isReady();
    lastSavedAt.value = Date.now();
    unsavedKeys.value = ['sedation-pro:recovery:v6'];

    const w = mount(StickyBar, { global: { plugins: [router] } });
    const pill = w.get('.sticky-bar-saved');

    expect(pill.text()).toContain('Not saved');
    expect(pill.text()).not.toContain('Saved ·');
    expect(pill.classes()).toContain('is-failed');
    w.unmount();
  });
});
