import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';

/**
 * A finished step on the IV sedation screen folds to one line (owner, Nov
 * 2026: the screen had grown to three screens, most of it finished work).
 *
 * It never folds under the finger. A step that is finished while you are on
 * it stays open until it has been scrolled past, and the page is then moved
 * by exactly what the fold took away, so nothing on screen shifts. On
 * arrival, steps that are already finished come up folded.
 *
 * The folded-or-open choice is remembered while the app is open: leaving for
 * a protocol page and coming back restores the scroll position, and that
 * position is only right if the layout is the one that was left.
 */
const memory = new Map<string, boolean>();

/** A card counts as scrolled past once its bottom edge is under the top bar. */
export const SCROLLED_PAST_PX = 64;

export function isScrolledPast(bottom: number): boolean {
  return bottom <= SCROLLED_PAST_PX;
}

export function forgetStepFolds(): void {
  memory.clear();
}

export function useStepFold(key: string, isDone: () => boolean, el: Ref<HTMLElement | null>) {
  const folded = ref(isDone() ? (memory.get(key) ?? true) : false);
  /** Opened by hand: left open until it is folded by hand or the screen is left. */
  let heldOpen = memory.get(key) === false;

  watch(isDone, (done) => {
    if (done) {
      // Finished from somewhere else, with this card already above the screen
      // (the gas started from the dock): nobody is on it, so it folds now. No
      // scroll will come to fold it later, because it has already gone past.
      const node = el.value;
      if (node && !heldOpen && isScrolledPast(node.getBoundingClientRect().bottom)) {
        void foldKeepingView();
      }
      return;
    }
    // Undone: the step is live again and has to be seen.
    folded.value = false;
    heldOpen = false;
    memory.delete(key);
  });

  function open(): void {
    folded.value = false;
    heldOpen = true;
    memory.set(key, false);
  }

  function fold(): void {
    folded.value = true;
    heldOpen = false;
    memory.set(key, true);
  }

  async function foldKeepingView(): Promise<void> {
    const node = el.value;
    if (!node) return;
    const root = document.documentElement;
    const before = node.getBoundingClientRect().height;
    // The browser's own scroll anchoring would make the same correction a
    // second time on the browsers that have it.
    const anchoring = root.style.overflowAnchor;
    root.style.overflowAnchor = 'none';
    fold();
    await nextTick();
    const after = node.getBoundingClientRect().height;
    window.scrollBy({ top: after - before, behavior: 'instant' });
    root.style.overflowAnchor = anchoring;
  }

  let observer: IntersectionObserver | null = null;
  watch(
    el,
    (node) => {
      observer?.disconnect();
      observer = null;
      if (!node || typeof IntersectionObserver === 'undefined') return;
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry || entry.isIntersecting) return;
          if (folded.value || heldOpen || !isDone()) return;
          if (isScrolledPast(entry.boundingClientRect.bottom)) void foldKeepingView();
        },
        { rootMargin: `-${SCROLLED_PAST_PX}px 0px 0px 0px` },
      );
      observer.observe(node);
    },
    { immediate: true, flush: 'post' },
  );

  onBeforeUnmount(() => observer?.disconnect());

  return { folded, open, fold };
}
