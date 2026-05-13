/**
 * Decides whether a swipe gesture commits the drawer open or closed. Pure
 * function so the snap logic can be unit-tested without synthesising touch
 * events. The actual touch wiring lives in `NavDrawer.vue`.
 *
 * The thresholds mirror iOS: a fast flick wins regardless of distance, a slow
 * drag needs to cross ~40% of the drawer width to commit in the gesture's
 * direction, otherwise the drawer snaps back.
 */
export interface SnapDecisionInput {
  readonly mode: 'open' | 'close';
  /** Current offset from closed position, in px. 0 = closed, width = open. */
  readonly offsetPx: number;
  /** Last-sample velocity, px/ms. Positive = rightward. */
  readonly velocityPxPerMs: number;
  /** Drawer width in px. */
  readonly widthPx: number;
  /** Drag distance ratio that commits without a flick (default 0.4). */
  readonly commitRatio?: number;
  /** Velocity magnitude that overrides distance (default 0.5 px/ms). */
  readonly flickVelocity?: number;
}

export function snapDecision(input: SnapDecisionInput): 'open' | 'closed' {
  const {
    mode,
    offsetPx,
    velocityPxPerMs,
    widthPx,
    commitRatio = 0.4,
    flickVelocity = 0.5,
  } = input;

  if (mode === 'open') {
    const flickedOpen = velocityPxPerMs > flickVelocity;
    const draggedOpen = offsetPx > widthPx * commitRatio;
    return flickedOpen || draggedOpen ? 'open' : 'closed';
  }

  const flickedClosed = velocityPxPerMs < -flickVelocity;
  const draggedClosed = offsetPx < widthPx * (1 - commitRatio);
  return flickedClosed || draggedClosed ? 'closed' : 'open';
}
