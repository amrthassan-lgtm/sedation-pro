import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { followGrowingPage } from './followGrowingPage';

const VIEWPORT = 1280;

/** A page whose height the test sets, scrolled the way a browser scrolls: never past its foot. */
function fakePage(height: number) {
  const page = { height, y: 0, now: 0 };
  const frames: Array<() => void> = [];
  const deepest = () => Math.max(0, page.height - VIEWPORT);

  vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(VIEWPORT);
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => page.y);
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockImplementation(() => page.height);
  vi.spyOn(performance, 'now').mockImplementation(() => page.now);
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => frames.push(run));
  const scrollTo = vi.fn((to: ScrollToOptions) => {
    page.y = Math.min(to.top ?? 0, deepest());
  });
  vi.stubGlobal('scrollTo', scrollTo);

  return {
    page,
    scrollTo,
    /** What the router does first: scroll to the saved place, as far as the page allows. */
    routerScrollsTo: (top: number) => {
      page.y = Math.min(top, deepest());
    },
    frame: (ms = 16) => {
      page.now += ms;
      frames.shift()?.();
    },
    pending: () => frames.length,
  };
}

describe('followGrowingPage', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('follows the foot of the page down to the saved place as the page grows', () => {
    const browser = fakePage(2751);
    browser.routerScrollsTo(1535);
    expect(browser.page.y).toBe(1471);

    followGrowingPage(1535);
    browser.frame();
    browser.page.height = 2780;
    browser.frame();
    expect(browser.page.y).toBe(1500);

    browser.page.height = 2815;
    browser.frame();
    expect(browser.page.y).toBe(1535);

    browser.frame();
    expect(browser.pending()).toBe(0);
  });

  it('does nothing when the saved place was reached at once', () => {
    const browser = fakePage(4000);
    browser.routerScrollsTo(900);

    followGrowingPage(900);
    browser.frame();

    expect(browser.scrollTo).not.toHaveBeenCalled();
    expect(browser.pending()).toBe(0);
  });

  it('never scrolls past the saved place when the page grows beyond it', () => {
    const browser = fakePage(2751);
    browser.routerScrollsTo(1535);

    followGrowingPage(1535);
    browser.frame();
    browser.page.height = 3400;
    browser.frame();

    expect(browser.page.y).toBe(1535);
  });

  it('lets go at the first touch: a hand on the page always wins', () => {
    const browser = fakePage(2751);
    browser.routerScrollsTo(1535);

    followGrowingPage(1535);
    browser.frame();
    window.dispatchEvent(new Event('touchstart'));
    browser.page.y = 1300;
    browser.page.height = 2815;
    browser.frame();

    expect(browser.page.y).toBe(1300);
    expect(browser.pending()).toBe(0);
  });

  it('keeps going when the page itself shifts as its cards render', () => {
    const browser = fakePage(2052);
    browser.routerScrollsTo(1535);
    expect(browser.page.y).toBe(772);

    followGrowingPage(1535);
    browser.frame();
    browser.page.height = 2751;
    browser.page.y = 1100;
    browser.frame();
    expect(browser.page.y).toBe(1471);

    browser.page.height = 2815;
    browser.frame();
    expect(browser.page.y).toBe(1535);
  });

  it('gives up when the page never grows that far', () => {
    const browser = fakePage(2751);
    browser.routerScrollsTo(1535);

    followGrowingPage(1535, 600);
    for (let i = 0; i < 60 && browser.pending() > 0; i += 1) browser.frame();

    expect(browser.page.y).toBe(1471);
    expect(browser.pending()).toBe(0);
    expect(browser.page.now).toBeLessThan(700);
  });

  it('stops listening for a hand once it is done', () => {
    const browser = fakePage(4000);
    const removed = vi.spyOn(window, 'removeEventListener');
    browser.routerScrollsTo(900);

    followGrowingPage(900);
    browser.frame();

    expect(removed.mock.calls.map((call) => call[0])).toEqual([
      'wheel',
      'touchstart',
      'pointerdown',
      'keydown',
    ]);
  });
});
