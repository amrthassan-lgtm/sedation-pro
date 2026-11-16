import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import StorageAlertBanner from './StorageAlertBanner.vue';
import { storageLow, unsavedKeys } from '@/stores/persistence';

const Stub = { template: '<div />' };

async function bannerAt(path: string) {
  setActivePinia(createPinia());
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: Stub }],
  });
  await router.push(path);
  await router.isReady();
  return { w: mount(StorageAlertBanner, { global: { plugins: [router] } }), router };
}

describe('the storage warning (v1 audit)', () => {
  afterEach(() => {
    unsavedKeys.value = [];
    storageLow.value = false;
  });

  it('says nothing while there is room', async () => {
    const { w } = await bannerAt('/phase/1');
    expect(w.find('.storage-alert').exists()).toBe(false);
  });

  it('after a failed save: full, cannot be put away, and leads to Saved Notes', async () => {
    unsavedKeys.value = ['sedation-pro:recovery:v6'];
    const { w, router } = await bannerAt('/phase/4');
    expect(w.text()).toContain('Storage is full: changes are not being saved');
    expect(w.text()).not.toContain('Not now');

    await w.get('.storage-alert-btn--primary').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/notes');
  });

  it('almost full: a warning that can be put away', async () => {
    storageLow.value = true;
    const { w } = await bannerAt('/phase/1');
    expect(w.text()).toContain('Storage is almost full');

    const notNow = w.findAll('.storage-alert-btn').find((b) => b.text() === 'Not now');
    await notNow?.trigger('click');
    expect(w.find('.storage-alert').exists()).toBe(false);
  });

  it('never on a protocol page', async () => {
    unsavedKeys.value = ['sedation-pro:recovery:v6'];
    const { w } = await bannerAt('/quick-reference/anaphylaxis');
    expect(w.find('.storage-alert').exists()).toBe(false);
  });
});
