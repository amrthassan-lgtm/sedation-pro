import { nextTick, ref, type ComputedRef, type Ref } from 'vue';

/**
 * One idiom for "you tried to proceed but required fields aren't met":
 * paint the offending fields, and scroll to the first one.
 *
 * Phase 1 (required-field clearance) and Phase 4 (discharge / conclude
 * gate) were each hand-rolling this — two attempted-flags, two
 * `isInvalid`s, two scroll-to-first functions, and a hand-maintained
 * blocker→DOM-id map in Phase 4 that silently no-ops if you add a gate
 * and forget the anchor. This collapses both onto one contract.
 *
 * The clinical engine stays pure: it returns codes/labels, never DOM
 * ids. The caller supplies the ordered `entries` (in document order) —
 * the list *is* the code↔anchor mapping, colocated with the markup, so a
 * new gate is one line and can't drift out of sync with the scroll.
 */
export interface GateEntry {
  /** DOM id of the field/card to flag and scroll to. */
  readonly anchorId: string;
  /** True when this gate item is currently unsatisfied. */
  readonly failing: boolean;
}

export interface GateFeedbackOptions {
  /** Gate entries in document order — recomputed reactively. */
  readonly entries: ComputedRef<ReadonlyArray<GateEntry>>;
  /**
   * External "has the user attempted to proceed?" flag. Phase 1 passes
   * its persisted store ref (also flipped by the router guard); omit to
   * let the composable own an in-memory one (Phase 4).
   */
  readonly attempted?: Ref<boolean>;
  /** Scroll impl — overridable so tests can assert without a real DOM. */
  readonly scrollTo?: (anchorId: string) => void;
}

function defaultScroll(anchorId: string): void {
  document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function useGateFeedback(opts: GateFeedbackOptions) {
  const ownAttempted = ref(false);
  const attempted = opts.attempted ?? ownAttempted;
  const scrollTo = opts.scrollTo ?? defaultScroll;

  /** First failing entry in document order, or null when all satisfied. */
  function firstFailing(): string | null {
    return opts.entries.value.find((e) => e.failing)?.anchorId ?? null;
  }

  /** Red-ring this field — but only once the user has attempted. */
  function isInvalid(anchorId: string): boolean {
    if (!attempted.value) return false;
    const entry = opts.entries.value.find((e) => e.anchorId === anchorId);
    return entry ? entry.failing : false;
  }

  /** Scroll to the first failing field (after the rings have painted). */
  async function scrollToFirst(): Promise<void> {
    const id = firstFailing();
    if (id === null) return;
    await nextTick();
    scrollTo(id);
  }

  /**
   * Mark a proceed attempt: flip `attempted` and scroll to the first
   * failing field. Returns true when nothing is failing (caller proceeds).
   */
  async function attempt(): Promise<boolean> {
    attempted.value = true;
    const id = firstFailing();
    if (id === null) return true;
    await nextTick();
    scrollTo(id);
    return false;
  }

  return { attempted, isInvalid, firstFailing, scrollToFirst, attempt };
}
