import { describe, expect, it, beforeEach } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import { layerDepth, resetLayerDepthForTests, useBackToClose } from './useBackToClose';

const Blank = { template: '<div />' };

async function makeRouter(): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/a', component: Blank },
      { path: '/b', component: Blank },
    ],
  });
  await router.push('/a');
  await router.isReady();
  return router;
}

/** Memory history resolves back() asynchronously; wait for the pop to land. */
async function settle(router: Router): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
  }
  void router;
}

describe('useBackToClose', () => {
  beforeEach(() => resetLayerDepthForTests());

  it('opening adds a layer entry on the same route', async () => {
    const router = await makeRouter();
    const open = ref(false);
    effectScope().run(() => useBackToClose(open, () => (open.value = false), router));
    open.value = true;
    await settle(router);
    expect(router.currentRoute.value.path).toBe('/a');
    expect(router.currentRoute.value.hash).toBe('#layer-1');
  });

  it('Back closes the overlay and stays on the screen', async () => {
    const router = await makeRouter();
    const open = ref(false);
    effectScope().run(() => useBackToClose(open, () => (open.value = false), router));
    open.value = true;
    await settle(router);
    router.back();
    await settle(router);
    expect(open.value).toBe(false);
    expect(router.currentRoute.value.fullPath).toBe('/a');
  });

  it('closing with ✕ / scrim steps back over its own entry', async () => {
    const router = await makeRouter();
    const open = ref(false);
    effectScope().run(() => useBackToClose(open, () => (open.value = false), router));
    open.value = true;
    await settle(router);
    open.value = false;
    await settle(router);
    expect(router.currentRoute.value.fullPath).toBe('/a');
  });

  it('nested overlays close one per Back, top first', async () => {
    const router = await makeRouter();
    const drawer = ref(false);
    const dialog = ref(false);
    effectScope().run(() => {
      useBackToClose(drawer, () => (drawer.value = false), router);
      useBackToClose(dialog, () => (dialog.value = false), router);
    });
    drawer.value = true;
    await settle(router);
    dialog.value = true;
    await settle(router);
    expect(router.currentRoute.value.hash).toBe('#layer-2');
    router.back();
    await settle(router);
    expect(dialog.value).toBe(false);
    expect(drawer.value).toBe(true);
    router.back();
    await settle(router);
    expect(drawer.value).toBe(false);
    expect(router.currentRoute.value.fullPath).toBe('/a');
  });

  it('navigating away from an open overlay does not step back', async () => {
    const router = await makeRouter();
    const open = ref(false);
    effectScope().run(() => useBackToClose(open, () => (open.value = false), router));
    open.value = true;
    await settle(router);
    await router.push('/b');
    await settle(router);
    expect(open.value).toBe(false);
    expect(router.currentRoute.value.path).toBe('/b');
  });

  it('reads the layer depth from the hash', () => {
    expect(layerDepth('')).toBe(0);
    expect(layerDepth('#layer-3')).toBe(3);
    expect(layerDepth('#other')).toBe(0);
  });
});
