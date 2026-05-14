import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';

/**
 * Bottom-dock visibility controller for Phase 3.
 *
 * UX: the SedationDock should not compete with the in-card dose buttons on
 * cards 5 ("Initial Test Dose") and 6 ("Additional Doses"). The dock starts
 * hidden when the user lands on Phase 3 — there's nothing to titrate yet —
 * and reveals itself the first time card 6 enters the viewport (one-way
 * "reveal" flag). After that reveal, dock visibility mirrors card 6's
 * viewport state inversely: hidden while card 6 is in view (its in-card
 * titration buttons cover the workflow), shown whenever card 6 is
 * off-screen (above OR below the viewport).
 *
 * The dock's expanded sheet suppresses auto-hide — once the user has
 * opened the per-class dose grid, the dock stays mounted until they close
 * it, regardless of scroll position.
 *
 * Module-level refs back the singleton state — SedationDock and App.vue
 * read it, and Phase3View writes it via the IntersectionObserver hook.
 * Resets on Phase 3 unmount so a fresh case starts hidden again.
 */
const hasRevealed = ref(false);
const sentinelInView = ref(false);
const expanded = ref(false);

const dockVisible = computed(() => hasRevealed.value && !sentinelInView.value);
const dockOnScreen = computed(() => dockVisible.value || expanded.value);

export function useDockVisibility() {
  return { dockVisible, dockOnScreen, expanded };
}

/**
 * Attach an IntersectionObserver to the given Phase 3 card-6 wrapper.
 * Called once from Phase3View; auto-disconnects on scope dispose.
 */
export function useDockSentinel(elRef: Ref<HTMLElement | null>): void {
  let observer: IntersectionObserver | null = null;

  function disconnect(): void {
    observer?.disconnect();
    observer = null;
  }

  watch(
    elRef,
    (el) => {
      disconnect();
      if (!el) return;
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          sentinelInView.value = entry.isIntersecting;
          if (entry.isIntersecting) hasRevealed.value = true;
        },
        // Require ~80 px of card 5 to be inside the viewport (top + bottom
        // insets) before it counts as "in view". Without this, a 1-px peek
        // at the edges of viewport flips the dock — twitchy on small
        // scrolls. 80 px keeps the toggle calm without making the dock
        // feel sluggish.
        { rootMargin: '-80px 0px -80px 0px' },
      );
      observer.observe(el);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    disconnect();
    hasRevealed.value = false;
    sentinelInView.value = false;
    expanded.value = false;
  });
}
