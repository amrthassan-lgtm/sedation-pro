import { describe, expect, it } from 'vitest';

import { snapDecision } from './navDrawerSwipe';

const WIDTH = 288;

describe('snapDecision', () => {
  it('opens when an opening drag passes the 40% commit ratio', () => {
    expect(
      snapDecision({ mode: 'open', offsetPx: WIDTH * 0.5, velocityPxPerMs: 0, widthPx: WIDTH }),
    ).toBe('open');
  });

  it('snaps back closed when an opening drag stays below 40%', () => {
    expect(
      snapDecision({ mode: 'open', offsetPx: WIDTH * 0.3, velocityPxPerMs: 0, widthPx: WIDTH }),
    ).toBe('closed');
  });

  it('opens on a rightward flick even without distance', () => {
    expect(snapDecision({ mode: 'open', offsetPx: 30, velocityPxPerMs: 1, widthPx: WIDTH })).toBe(
      'open',
    );
  });

  it('closes when a closing drag falls below 60% of width', () => {
    expect(
      snapDecision({ mode: 'close', offsetPx: WIDTH * 0.5, velocityPxPerMs: 0, widthPx: WIDTH }),
    ).toBe('closed');
  });

  it('stays open when a closing drag releases above 60%', () => {
    expect(
      snapDecision({ mode: 'close', offsetPx: WIDTH * 0.8, velocityPxPerMs: 0, widthPx: WIDTH }),
    ).toBe('open');
  });

  it('closes on a leftward flick even when most of the drawer is still on screen', () => {
    expect(
      snapDecision({ mode: 'close', offsetPx: WIDTH * 0.9, velocityPxPerMs: -1, widthPx: WIDTH }),
    ).toBe('closed');
  });

  it('respects the supplied commit ratio and flick velocity overrides', () => {
    expect(
      snapDecision({
        mode: 'open',
        offsetPx: WIDTH * 0.25,
        velocityPxPerMs: 0.3,
        widthPx: WIDTH,
        commitRatio: 0.2,
        flickVelocity: 0.2,
      }),
    ).toBe('open');
  });
});
