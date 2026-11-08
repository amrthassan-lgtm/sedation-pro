<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { UiBanner } from '@sedation-pro/ui';

import {
  classifyInventory,
  protocolCourseCoverage,
  summarizeInventory,
} from '@/composables/useInventoryStatus';

/**
 * Launch-time expiry warning. Non-blocking by design — the launch
 * interrupt (a modal) is reserved for the wrong-patient resume gate, so
 * stock problems surface as a banner above the page content instead.
 * Dismissal holds for the calendar day (same day-comparison idiom as the
 * stale-session gate) and the key survives "Start new case" via
 * useCaseReset's PRESERVED_KEYS.
 */
const DISMISS_KEY = 'sedation-pro:inventory-banner:v1';

const route = useRoute();
const router = useRouter();

const nowMs = Date.now();
const today = new Date(nowMs).toDateString();

function readDismissedDay(): string {
  if (typeof window === 'undefined' || !('localStorage' in window)) return '';
  try {
    return window.localStorage.getItem(DISMISS_KEY) ?? '';
  } catch {
    return '';
  }
}

const dismissedDay = ref(readDismissedDay());

function dismissForToday(): void {
  dismissedDay.value = today;
  try {
    window.localStorage.setItem(DISMISS_KEY, today);
  } catch {
    // Storage unavailable — banner just reappears next launch. Harmless.
  }
}

const classified = classifyInventory(nowMs);
const summary = computed(() => summarizeInventory(classified));
// A drug can be in date yet too little to finish its protocol (one 1 mg
// atropine syringe against a 3 mg course) — that must reach the same
// banner, or it only surfaces to someone who opens the inventory screen.
const shortCourses = computed(() => protocolCourseCoverage(classified).filter((c) => c.short));

const visible = computed(
  () =>
    summary.value.expired + summary.value.expiringSoon + shortCourses.value.length > 0 &&
    dismissedDay.value !== today &&
    // Only on the case phases. Notes, settings and the inventory screen
    // either repeat the warning themselves or have nothing to do with the
    // next case, and the drawer badge carries it everywhere else.
    route.path.startsWith('/phase/') &&
    route.path !== '/phase/1',
);

const title = computed(() => {
  const { expired, expiringSoon } = summary.value;
  const parts: string[] = [];
  if (expired > 0) parts.push(`${expired} emergency drug${expired === 1 ? '' : 's'} expired`);
  if (expiringSoon > 0) parts.push(`${expiringSoon} expiring soon`);
  const short = shortCourses.value.length;
  if (short > 0) parts.push(`${short} short of a full protocol course`);
  return parts.join(' · ');
});

const detail = computed(() => {
  const s = summary.value.soonest;
  if (!s) {
    const names = shortCourses.value.map((c) => c.drug).join(', ');
    return names ? `Short of a full course: ${names}.` : '';
  }
  const lead =
    s.daysLeft < 0 || !Number.isFinite(s.daysLeft)
      ? `${s.drug} is expired.`
      : `${s.drug} expires in ${s.daysLeft} days.`;
  // Truthful reassurance, derived from the structured onOrder field —
  // reduces alarm fatigue on a warn-only banner.
  const onOrder = summary.value.onOrder;
  return onOrder > 0
    ? `${lead} ${onOrder} replacement${onOrder === 1 ? '' : 's'} already on order.`
    : lead;
});

function review(): void {
  dismissForToday();
  void router.push('/inventory');
}
</script>

<template>
  <UiBanner
    v-if="visible"
    class="inv-alert no-print"
    :tone="summary.expired + shortCourses.length > 0 ? 'limit' : 'caution'"
    icon="⚠"
    :title="title"
  >
    <p class="inv-alert-detail">{{ detail }}</p>
    <div class="inv-alert-actions">
      <button type="button" class="inv-alert-btn inv-alert-btn--primary" @click="review">
        Review inventory
      </button>
      <button type="button" class="inv-alert-btn" @click="dismissForToday">
        Dismiss for today
      </button>
    </div>
  </UiBanner>
</template>

<style scoped>
.inv-alert {
  margin: var(--sp-4) var(--sp-4) 0;
}
.inv-alert-detail {
  margin: 0 0 var(--sp-2);
}
.inv-alert-actions {
  display: flex;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.inv-alert-btn {
  font-size: var(--type-footnote);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
  min-height: 44px;
  padding: 0 16px;
  border-radius: var(--r-pill);
  border: 0;
  background: var(--color-surface-elevated);
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
}
/* Hierarchy via weight + surface, per the house button doctrine. */
.inv-alert-btn--primary {
  background: var(--color-text-primary);
  color: var(--color-bg);
  font-weight: var(--weight-bold);
}
.inv-alert-btn:active {
  transform: scale(0.97);
}
</style>
