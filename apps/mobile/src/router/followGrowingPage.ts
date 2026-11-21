const GESTURES = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * Finish a scroll restore on a page that is still growing.
 *
 * A case screen is not at its full height when the router scrolls: cards are
 * still rendering, and the IV screen makes room for the dock a moment after
 * it arrives. A position saved near the foot is then deeper than the page is
 * tall, and the browser stops short of it. Coming back from an emergency
 * page to the reversal agents, that left the screen higher than it was left.
 *
 * This follows the foot of the page down as it grows, until the saved
 * position is reached. It lets go at the first touch, wheel or key (a hand
 * always wins) and after `budgetMs` when the page never grows that far.
 */
export function followGrowingPage(top: number, budgetMs = 1200): void {
  if (typeof window === 'undefined') return;

  const started = performance.now();
  let handOnPage = false;
  const letGo = (): void => {
    handOnPage = true;
  };
  const listening = { capture: true, passive: true } as const;
  for (const gesture of GESTURES) window.addEventListener(gesture, letGo, listening);
  const finish = (): void => {
    for (const gesture of GESTURES) window.removeEventListener(gesture, letGo, listening);
  };

  const step = (): void => {
    const y = window.scrollY;
    if (handOnPage || y >= top - 1 || performance.now() - started > budgetMs) {
      finish();
      return;
    }
    const deepest = document.documentElement.scrollHeight - window.innerHeight;
    if (deepest > y + 0.5) window.scrollTo({ top: Math.min(top, deepest), behavior: 'instant' });
    requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}
