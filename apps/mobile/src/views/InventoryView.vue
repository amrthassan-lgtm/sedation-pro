<script setup lang="ts">
import { computed } from 'vue';

import {
  expiryStatus,
  EXPIRY_WARN_DAYS,
  type ExpiryStatus,
  type Severity,
} from '@sedation-pro/clinical';
import { UiBanner, UiCard, UiStack, UiStatCard, UiStatusPill } from '@sedation-pro/ui';

import { EMERGENCY_INVENTORY, type InventoryItem } from '@/data/emergency-inventory';

/**
 * Read-only by design: the inventory's source of truth is the checked-in
 * data file (see its header comment), updated via a Claude session or a
 * GitHub edit when stock changes. Day granularity means a mount-time
 * timestamp is fresh enough — no ticking clock needed.
 */
const now = Date.now();

interface ClassifiedItem {
  readonly item: InventoryItem;
  readonly status: ExpiryStatus;
}

const classified = computed<ReadonlyArray<ClassifiedItem>>(() =>
  EMERGENCY_INVENTORY.map((item) => ({ item, status: expiryStatus(item.expiresOn, now) })),
);

function byUrgency(a: ClassifiedItem, b: ClassifiedItem): number {
  // -Infinity (unknown expiry) naturally sorts first — the least-trusted
  // stock tops the attention list.
  return a.status.daysLeft - b.status.daysLeft;
}

const needsAttention = computed(() =>
  classified.value.filter((c) => c.status.severity === 'limit').sort(byUrgency),
);
const expiringSoon = computed(() =>
  classified.value.filter((c) => c.status.severity === 'caution').sort(byUrgency),
);
const inDate = computed(() =>
  classified.value.filter((c) => c.status.severity === 'safe').sort(byUrgency),
);

const expiredCount = computed(() => needsAttention.value.length);
const expiringCount = computed(() => expiringSoon.value.length);

const sections = computed(() => [
  {
    id: 'attention',
    label: 'Needs attention',
    hint: 'Expired or unknown expiration',
    entries: needsAttention.value,
  },
  {
    id: 'expiring',
    label: `Expiring within ${EXPIRY_WARN_DAYS} days`,
    hint: 'Reorder window',
    entries: expiringSoon.value,
  },
  { id: 'ok', label: 'In date', hint: '', entries: inDate.value },
]);

function pillSeverity(c: ClassifiedItem): Severity | 'empty' {
  if (!c.status.valid) return 'empty';
  return c.status.severity;
}

function pillLabel(c: ClassifiedItem): string {
  if (!c.status.valid) return 'No date';
  if (c.status.daysLeft < 0) return 'Expired';
  if (c.status.severity === 'caution') return `${c.status.daysLeft} d`;
  return 'OK';
}

function formatExpiryMonth(expiresOn: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(expiresOn);
  if (!match) return '—';
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1)).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function metaLine(item: InventoryItem): string {
  const parts = [
    item.lot === '' ? 'Lot —' : `Lot ${item.lot}`,
    `Qty ${item.quantity}`,
    `Exp ${formatExpiryMonth(item.expiresOn)}`,
  ];
  return parts.join(' · ');
}
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Practice</p>
      <h1 class="title-display">Emergency Drug Inventory</h1>
    </header>

    <UiBanner
      v-if="expiredCount > 0"
      tone="limit"
      icon="⚠"
      :title="`${expiredCount} medication${expiredCount === 1 ? '' : 's'} expired or unverified`"
    >
      Replace before the next sedation case. Items marked "on order" are already being handled.
    </UiBanner>
    <UiBanner
      v-else-if="expiringCount > 0"
      tone="caution"
      icon="⏳"
      :title="`${expiringCount} medication${expiringCount === 1 ? '' : 's'} expiring soon`"
    >
      Inside the {{ EXPIRY_WARN_DAYS }}-day reorder window.
    </UiBanner>

    <div class="stat-row">
      <UiStatCard
        label="Expired / no date"
        :value="String(expiredCount)"
        :severity="expiredCount > 0 ? 'limit' : 'safe'"
      />
      <UiStatCard
        :label="`Expiring ≤ ${EXPIRY_WARN_DAYS} d`"
        :value="String(expiringCount)"
        :severity="expiringCount > 0 ? 'caution' : 'safe'"
      />
      <UiStatCard label="Line items" :value="String(classified.length)" severity="empty" />
    </div>

    <template v-for="section in sections" :key="section.id">
      <UiCard v-if="section.entries.length > 0" class="inv-card">
        <header class="inv-head">
          <p class="heading">{{ section.label }}</p>
          <span class="inv-count">{{ section.entries.length }}</span>
        </header>
        <p v-if="section.hint" class="caption inv-hint">{{ section.hint }}</p>
        <UiStack :gap="1">
          <div v-for="entry in section.entries" :key="entry.item.id" class="inv-row">
            <div class="inv-main">
              <p class="inv-drug">{{ entry.item.drug }}</p>
              <p class="inv-desc">{{ entry.item.description }}</p>
              <p class="inv-meta">{{ metaLine(entry.item) }}</p>
              <p v-if="entry.item.notes" class="inv-note">{{ entry.item.notes }}</p>
            </div>
            <UiStatusPill :severity="pillSeverity(entry)">{{ pillLabel(entry) }}</UiStatusPill>
          </div>
        </UiStack>
      </UiCard>
    </template>

    <p class="caption inv-footer">
      Inventory is maintained in the practice repo — tell Claude the new lot and expiration when
      replacement stock arrives, and every device updates on the next deploy.
    </p>
  </main>
</template>

<style scoped>
.phase-view {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-4) var(--sp-7);
  max-width: 760px;
  margin-inline: auto;
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
}
.inv-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.inv-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.inv-count {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.4px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
  margin-left: auto;
}
.inv-hint {
  margin-top: calc(-1 * var(--sp-2));
}
.inv-row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: 10px 4px;
  border-bottom: 1px solid var(--color-border);
}
.inv-row:last-child {
  border-bottom: none;
}
.inv-main {
  min-width: 0;
  flex: 1;
}
.inv-drug {
  margin: 0;
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
}
.inv-desc {
  margin: 2px 0 0;
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.inv-meta {
  margin: 4px 0 0;
  font-size: var(--type-caption);
  letter-spacing: 0.2px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
}
.inv-note {
  margin: 4px 0 0;
  font-size: var(--type-caption);
  color: var(--color-warn);
}
.inv-footer {
  text-align: center;
  padding-inline: var(--sp-4);
}
</style>
