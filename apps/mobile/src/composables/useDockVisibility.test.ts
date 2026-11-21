import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';

import { setDockDosed, useDockSentinel, useDockVisibility, WHOLE } from './useDockVisibility';

interface FakeObserver {
  readonly margin: string;
  readonly thresholds: ReadonlyArray<number>;
  disconnected: boolean;
  /** The browser reporting how much of the buttons is on screen. */
  report(ratio: number): void;
}

const observers: FakeObserver[] = [];
let barResized: (() => void) | null = null;

function fakeBrowser(): void {
  observers.length = 0;
  barResized = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private readonly record: FakeObserver;
      constructor(
        callback: (entries: Array<{ intersectionRatio: number }>) => void,
        options: { rootMargin: string; threshold: number[] },
      ) {
        this.record = {
          margin: options.rootMargin,
          thresholds: options.threshold,
          disconnected: false,
          report: (intersectionRatio) => callback([{ intersectionRatio }]),
        };
        observers.push(this.record);
      }
      observe(): void {}
      disconnect(): void {
        this.record.disconnected = true;
      }
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        barResized = callback;
      }
      observe(): void {}
      disconnect(): void {}
    },
  );
}

/** A top bar of the given height, as the sticky bar sits at the top of the screen. */
function topBar(height: number): HTMLElement {
  document.querySelector('.sticky-bar')?.remove();
  const bar = document.createElement('header');
  bar.className = 'sticky-bar';
  bar.getBoundingClientRect = () => ({ bottom: height }) as DOMRect;
  document.body.append(bar);
  return bar;
}

describe('the dock follows the step 6 buttons', () => {
  let scope: EffectScope;
  const { dockVisible, dockOnScreen, expanded } = useDockVisibility();
  const live = (): FakeObserver => observers.filter((o) => !o.disconnected).at(-1)!;

  function openPhase3(): void {
    scope = effectScope();
    scope.run(() => useDockSentinel(ref(document.createElement('div'))));
  }

  beforeEach(() => {
    fakeBrowser();
    topBar(90);
  });

  afterEach(() => {
    scope?.stop();
    vi.unstubAllGlobals();
    document.querySelector('.sticky-bar')?.remove();
  });

  it('stays away before any sedative is given, wherever the page is', () => {
    openPhase3();
    live().report(0);

    expect(dockVisible.value).toBe(false);
  });

  it('is away while every button is whole on screen, and up the moment one is cut', () => {
    openPhase3();
    setDockDosed(true);

    live().report(1);
    expect(dockVisible.value).toBe(false);

    live().report(0.9);
    expect(dockVisible.value).toBe(true);

    live().report(0);
    expect(dockVisible.value).toBe(true);

    live().report(1);
    expect(dockVisible.value).toBe(false);
  });

  it('counts the buttons as whole on a half pixel, where a browser reports just under 1', () => {
    openPhase3();
    setDockDosed(true);

    live().report(0.996);

    expect(dockVisible.value).toBe(false);
    expect(live().thresholds).toEqual([WHOLE]);
  });

  it('measures the top edge from the bar itself: a tablet and a phone differ', () => {
    openPhase3();
    expect(live().margin).toBe('-90px 0px 0px 0px');
    scope.stop();

    topBar(71);
    openPhase3();
    expect(live().margin).toBe('-71px 0px 0px 0px');
  });

  it('follows the bar when it grows, and leaves the watch alone when it has not changed', () => {
    openPhase3();
    const first = live();

    barResized?.();
    expect(live()).toBe(first);

    topBar(118).getBoundingClientRect = () => ({ bottom: 118 }) as DOMRect;
    barResized?.();
    expect(first.disconnected).toBe(true);
    expect(live().margin).toBe('-118px 0px 0px 0px');
  });

  it('stays up while its sheet is open, even with the buttons whole on screen', () => {
    openPhase3();
    setDockDosed(true);
    live().report(1);

    expanded.value = true;

    expect(dockOnScreen.value).toBe(true);
  });

  it('starts hidden again for the next case', () => {
    openPhase3();
    setDockDosed(true);
    live().report(0);
    expanded.value = true;

    scope.stop();

    expect(dockVisible.value).toBe(false);
    expect(dockOnScreen.value).toBe(false);
  });
});
