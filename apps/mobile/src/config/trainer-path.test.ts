import { describe, expect, it } from 'vitest';

import { TRAINER_PATH } from './trainer-path';

describe('the paths the clinical service worker leaves to the trainer', () => {
  it.each([
    '/sedation-pro/trainer',
    '/sedation-pro/trainer/',
    '/sedation-pro/trainer?x=1',
    '/sedation-pro/trainer/?utm_source=x',
    '/sedation-pro/trainer/index.html',
    '/trainer/',
  ])('%s is the trainer', (url) => {
    expect(TRAINER_PATH.test(url)).toBe(true);
  });

  it.each([
    '/sedation-pro/',
    '/sedation-pro/phase/1',
    '/sedation-pro/quick-reference/anaphylaxis',
    '/sedation-pro/trainers',
    '/sedation-pro/trainer-notes',
    '/sedation-pro/phase/1?from=/trainer',
  ])('%s stays with the clinical app', (url) => {
    expect(TRAINER_PATH.test(url)).toBe(false);
  });
});
