import { onScopeDispose, ref, type Ref } from 'vue';

/**
 * Reactive `Date.now()` that updates on a fixed interval. Drug timer pills,
 * IV-out countdowns, and the post-flumazenil monitoring chip all subscribe to
 * one of these so they re-render in lockstep — no setInterval scattered
 * across components.
 *
 * One `useNow(intervalMs)` instance per call site is fine; Vue's effect
 * scope handles cleanup automatically when the consumer unmounts.
 *
 * Usage:
 *   const now = useNow(1000); // ticks every second
 *   const remainingMin = computed(() => Math.ceil((deadline - now.value) / 60_000));
 */
export function useNow(intervalMs = 1000): Readonly<Ref<number>> {
  const now = ref(Date.now());
  let timer: ReturnType<typeof setInterval> | null = null;

  if (typeof window !== 'undefined') {
    timer = setInterval(() => {
      now.value = Date.now();
    }, intervalMs);
  }

  onScopeDispose(() => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  });

  return now;
}
