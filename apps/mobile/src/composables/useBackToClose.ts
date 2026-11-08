import { onScopeDispose, watch, type Ref } from 'vue';
import { useRouter, type Router } from 'vue-router';

/**
 * Android Back (the gesture or the button) closes the top overlay first —
 * the drawer, the expanded dock, a dismissible dialog — instead of leaving
 * the screen behind it. Material and Android both expect this.
 *
 * Each overlay that opens adds one history entry on the same route,
 * `#layer-N` (N = how many overlays are open). Back pops that entry and the
 * overlay whose layer disappeared closes itself. Closing an overlay any
 * other way (✕, scrim, swipe, Cancel) steps back over its own entry so
 * history never fills with dead steps.
 *
 * Only for overlays where dismissing is harmless. Dialogs whose Cancel is
 * a real decision (discard the resumed session, the wrong-patient check)
 * must not use this: a stray Back should never make that choice.
 */

const LAYER = /^#layer-(\d+)$/;
let depth = 0;

export function layerDepth(hash: string): number {
  const m = LAYER.exec(hash);
  return m ? Number(m[1]) : 0;
}

/** Test seam: the module keeps one stack for the whole app. */
export function resetLayerDepthForTests(): void {
  depth = 0;
}

export function useBackToClose(
  isOpen: Readonly<Ref<boolean>>,
  close: () => void,
  router: Router = useRouter(),
): void {
  let mine = 0;

  const stopOpen = watch(
    isOpen,
    (open) => {
      if (open && mine === 0) {
        depth += 1;
        mine = depth;
        const cur = router.currentRoute.value;
        void router.push({ path: cur.path, query: cur.query, hash: `#layer-${mine}` });
      } else if (!open && mine !== 0) {
        const onMyEntry = layerDepth(router.currentRoute.value.hash) === mine;
        depth = mine - 1;
        mine = 0;
        if (onMyEntry) router.back();
      }
    },
    { flush: 'sync' },
  );

  const stopRoute = watch(
    () => router.currentRoute.value.hash,
    (hash) => {
      if (mine !== 0 && layerDepth(hash) < mine) {
        depth = mine - 1;
        mine = 0;
        if (isOpen.value) close();
      }
    },
    { flush: 'sync' },
  );

  onScopeDispose(() => {
    stopOpen();
    stopRoute();
    if (mine !== 0) depth = mine - 1;
  });
}
