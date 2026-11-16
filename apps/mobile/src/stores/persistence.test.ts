import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import {
  HEADROOM_CHARS,
  checkHeadroom,
  hasRoomFor,
  isStaleSession,
  persistRefs,
  recheckStorage,
  reportWrite,
  storageLow,
  unsavedKeys,
} from './persistence';

describe('isStaleSession', () => {
  const day = (iso: string) => new Date(iso).getTime();

  it('is not stale for two times on the same calendar day', () => {
    expect(isStaleSession(day('2026-05-15T08:00:00'), day('2026-05-15T23:59:59'))).toBe(false);
  });

  it('is stale across a midnight boundary even minutes apart', () => {
    expect(isStaleSession(day('2026-05-15T23:59:00'), day('2026-05-16T00:01:00'))).toBe(true);
  });

  it('is stale for a chart saved days earlier', () => {
    expect(isStaleSession(day('2026-05-10T14:00:00'), day('2026-05-15T09:00:00'))).toBe(true);
  });

  it('is not stale when saved later the same day than "now" (clock skew)', () => {
    // Defensive: even if savedAt is slightly ahead of now, same day → resume.
    expect(isStaleSession(day('2026-05-15T10:00:05'), day('2026-05-15T10:00:00'))).toBe(false);
  });

  it('returns false for non-finite inputs rather than throwing', () => {
    expect(isStaleSession(Number.NaN, Date.now())).toBe(false);
    expect(isStaleSession(Date.now(), Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('a full tablet is never silent (v1 audit)', () => {
  let full = false;

  // On the storage object itself: the test browser binds its methods on first
  // use, so a spy on the shared prototype stops seeing writes after that.
  beforeEach(() => {
    full = false;
    localStorage.clear();
    unsavedKeys.value = [];
    storageLow.value = false;
    const write = Storage.prototype.setItem;
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (full) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      write.call(window.localStorage, key, value);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists a store whose save failed, and clears it once that store saves again', async () => {
    const value = ref(1);
    persistRefs('sedation-pro:test:v1', { value });
    full = true;
    value.value = 2;
    await nextTick();
    expect(unsavedKeys.value).toEqual(['sedation-pro:test:v1']);

    full = false;
    value.value = 3;
    await nextTick();
    expect(unsavedKeys.value).toEqual([]);
    expect(JSON.parse(localStorage.getItem('sedation-pro:test:v1') ?? '')).toEqual({ value: 3 });
  });

  it('saves what was not saved once room is freed, without waiting for it to change', async () => {
    const value = ref('draft');
    persistRefs('sedation-pro:test:v1', { value });
    full = true;
    value.value = 'signed';
    await nextTick();
    full = false;

    recheckStorage();

    expect(unsavedKeys.value).toEqual([]);
    expect(JSON.parse(localStorage.getItem('sedation-pro:test:v1') ?? '')).toEqual({
      value: 'signed',
    });
  });

  it('a failed save checks the room at once, so the warning is up before anything else fails', async () => {
    const value = ref(1);
    persistRefs('sedation-pro:test:v1', { value });
    full = true;
    value.value = 2;
    await nextTick();
    expect(storageLow.value).toBe(true);
  });

  it('warns while a few signed notes still fit, and leaves nothing behind', () => {
    full = true;
    checkHeadroom();
    expect(storageLow.value).toBe(true);

    full = false;
    checkHeadroom();
    expect(storageLow.value).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('answers whether there is room without keeping what it wrote', () => {
    expect(hasRoomFor(HEADROOM_CHARS)).toBe(true);
    expect(localStorage.length).toBe(0);
    full = true;
    expect(hasRoomFor(10)).toBe(false);
  });

  it('lists a store once, and clears it once', () => {
    reportWrite('sedation-pro:a', false);
    reportWrite('sedation-pro:a', false);
    expect(unsavedKeys.value).toEqual(['sedation-pro:a']);
    reportWrite('sedation-pro:a', true);
    expect(unsavedKeys.value).toEqual([]);
  });
});
