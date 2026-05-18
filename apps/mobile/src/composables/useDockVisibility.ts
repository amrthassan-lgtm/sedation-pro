import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';

/**
 * Bottom-dock visibility controller for Phase 3.
 *
 * UX: the SedationDock is a redose cockpit — it has no purpose until a
 * sedative has actually been given. It stays hidden when the user lands on
 * Phase 3 and remains hidden while they scroll/explore the protocol cards;
 * a beta tester who scrolled down to read ahead (no drug given) found the
 * dock appearing confusing. It only arms once the first dose is logged
 * (one-way `hasDosed` flag, set from Phase3View by watching `iv.doses`).
 *
 * After arming, dock visibility mirrors card 6's viewport state inversely:
 * hidden while card 6 is in view (its in-card titration buttons cover the
 * workflow), shown whenever card 6 is off-screen (above OR below the
 * viewport).
 *
 * The dock's expanded sheet suppresses auto-hide — once the user has
 * opened the per-class dose grid, the dock stays mounted until they close
 * it, regardless of scroll position.
 *
 * Module-level refs back the singleton state — SedationDock and App.vue
 * read it, Phase3View writes `hasDosed` via setDockDosed and feeds card 6's
 * viewport state through the IntersectionObserver hook. Resets on Phase 3
 * unmount so a fresh case starts hidden again.
 */
const hasDosed = ref(false);
const sentinelInView = ref(false);
const expanded = ref(false);

const dockVisible = computed(() => hasDosed.value && !sentinelInView.value);
const dockOnScreen = computed(() => dockVisible.value || expanded.value);

export function useDockVisibility() {
  return { dockVisible, dockOnScreen, expanded };
}

/**
 * Arm (or disarm) the dock based on whether any sedative has been logged.
 * Driven from Phase3View by watching the IV dose log so that returning to
 * Phase 3 mid-case with doses already on file re-arms the dock immediately.
 */
export function setDockDosed(dosed: boolean): void {
  hasDosed.value = dosed;
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
    hasDosed.value = false;
    sentinelInView.value = false;
    expanded.value = false;
  });
}
