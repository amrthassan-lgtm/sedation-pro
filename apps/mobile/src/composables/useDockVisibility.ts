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
 * After arming, the dock follows the step 6 sedative buttons exactly (owner,
 * Nov 2026): it is away only while every one of them is whole on screen,
 * between the top bar and the bottom edge, and it is up the moment one is
 * cut, above or below. A dose is then always within reach, from the card or
 * from the dock, on any screen: the top edge is the bar as measured, not a
 * number of pixels that suited one tablet.
 *
 * The dock's expanded sheet suppresses auto-hide — once the user has
 * opened the per-class dose grid, the dock stays mounted until they close
 * it, regardless of scroll position.
 *
 * Module-level refs back the singleton state — SedationDock and App.vue
 * read it, Phase3View writes `hasDosed` via setDockDosed and feeds the
 * buttons' place on screen through the IntersectionObserver hook. Resets on Phase 3
 * unmount so a fresh case starts hidden again.
 */
const hasDosed = ref(false);
const buttonsWhole = ref(false);
const expanded = ref(false);

const dockVisible = computed(() => hasDosed.value && !buttonsWhole.value);
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
 * The share of the buttons that must be on screen to count as whole. Not 1:
 * browsers report 0.99-something for an untouched element that sits on a
 * half pixel, and the dock would then never go away.
 */
export const WHOLE = 0.99;

const BAR_FALLBACK_PX = 90;

/** Where the top bar ends: the buttons are out of reach above this line. */
function barBottom(): number {
  const bar = document.querySelector('.sticky-bar');
  return bar ? Math.ceil(bar.getBoundingClientRect().bottom) : BAR_FALLBACK_PX;
}

/**
 * Watch the step 6 sedative buttons (the wrapper from the first to the last
 * of them). Called once from Phase3View; disconnects on scope dispose.
 */
export function useDockSentinel(elRef: Ref<HTMLElement | null>): void {
  let observer: IntersectionObserver | null = null;
  let barWatch: ResizeObserver | null = null;
  let top = -1;

  function disconnect(): void {
    observer?.disconnect();
    observer = null;
    barWatch?.disconnect();
    barWatch = null;
    top = -1;
  }

  function observe(el: HTMLElement): void {
    const edge = barBottom();
    if (observer && edge === top) return;
    observer?.disconnect();
    top = edge;
    observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        buttonsWhole.value = entry.intersectionRatio >= WHOLE;
      },
      { rootMargin: `-${edge}px 0px 0px 0px`, threshold: [WHOLE] },
    );
    observer.observe(el);
  }

  watch(
    elRef,
    (el) => {
      disconnect();
      if (!el) return;
      observe(el);
      // The bar grows and shrinks (an alert chip wraps to a second line, a
      // phone turns): keep the top edge where the bar really ends.
      const bar = document.querySelector('.sticky-bar');
      if (bar && typeof ResizeObserver !== 'undefined') {
        barWatch = new ResizeObserver(() => observe(el));
        barWatch.observe(bar);
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    disconnect();
    hasDosed.value = false;
    buttonsWhole.value = false;
    expanded.value = false;
  });
}
