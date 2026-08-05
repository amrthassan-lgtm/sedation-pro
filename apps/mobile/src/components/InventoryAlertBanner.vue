<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { expiryStatus } from '@sedation-pro/clinical';
import { UiBanner } from '@sedation-pro/ui';

import { EMERGENCY_INVENTORY } from '@/data/emergency-inventory';

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

const summary = computed(() => {
  let expired = 0;
  let expiring = 0;
  let soonest: { drug: string; daysLeft: number } | null = null;
  for (const item of EMERGENCY_INVENTORY) {
    const status = expiryStatus(item.expiresOn, nowMs);
    if (status.severity === 'limit') expired += 1;
    else if (status.severity === 'caution') expiring += 1;
    if (status.severity !== 'safe' && (soonest === null || status.daysLeft < soonest.daysLeft)) {
      soonest = { drug: item.drug, daysLeft: status.daysLeft };
    }
  }
  return { expired, expiring, soonest };
});

const visible = computed(
  () =>
    summary.value.expired + summary.value.expiring > 0 &&
    dismissedDay.value !== today &&
    // The inventory view carries its own always-on banner.
    route.path !== '/inventory',
);

const title = computed(() => {
  const { expired, expiring } = summary.value;
  const parts: string[] = [];
  if (expired > 0) parts.push(`${expired} emergency drug${expired === 1 ? '' : 's'} expired`);
  if (expiring > 0) parts.push(`${expiring} expiring soon`);
  return parts.join(' · ');
});

const detail = computed(() => {
  const s = summary.value.soonest;
  if (!s) return '';
  return s.daysLeft < 0 || !Number.isFinite(s.daysLeft)
    ? `${s.drug} needs replacement.`
    : `${s.drug} expires in ${s.daysLeft} days.`;
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
    :tone="summary.expired > 0 ? 'limit' : 'caution'"
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
  padding: 8px 14px;
  border-radius: var(--r-pill);
  border: 1px solid var(--color-border-strong);
  background: transparent;
  color: var(--color-text-primary);
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.inv-alert-btn--primary {
  background: var(--color-surface-elevated);
}
.inv-alert-btn:active {
  transform: scale(0.97);
}
</style>
