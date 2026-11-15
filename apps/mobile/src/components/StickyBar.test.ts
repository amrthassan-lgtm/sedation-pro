import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import StickyBar from './StickyBar.vue';
import { protocolTitleHidden } from '@/composables/protocolTitle';
import { useSessionStore } from '@/stores/session';

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
