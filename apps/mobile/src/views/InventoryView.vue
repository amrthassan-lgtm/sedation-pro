<script setup lang="ts">
import { EXPIRY_WARN_DAYS, type Severity } from '@sedation-pro/clinical';
import { UiBanner, UiCard, UiStack, UiStatCard, UiStatusPill } from '@sedation-pro/ui';

import { INVENTORY_AS_OF, type InventoryItem } from '@/data/emergency-inventory';
import { useInventoryStatus, type ClassifiedItem } from '@/composables/useInventoryStatus';

/**
 * Read-only by design: the inventory's source of truth is the checked-in
 * data file (see its header comment), updated via a Claude session or a
 * GitHub edit when stock changes. Day granularity means a mount-time
 * timestamp is fresh enough — no ticking clock needed.
 */
const inv = useInventoryStatus();

const expiredCount = inv.summary.expired;
const expiringCount = inv.summary.expiringSoon;

type SectionTone = 'danger' | 'warn' | 'good' | 'slate';

const sections: ReadonlyArray<{
  id: string;
  label: string;
  hint: string;
  tone: SectionTone;
  entries: ReadonlyArray<ClassifiedItem>;
}> = [
  {
    id: 'attention',
    label: 'Needs attention',
    hint: 'Expired or unknown expiration',
    tone: 'danger',
    entries: inv.needsAttention,
  },
  {
    id: 'expiring',
    label: `Expiring within ${EXPIRY_WARN_DAYS} days`,
    hint: 'Reorder window',
    tone: 'warn',
    entries: inv.expiringSoon,
  },
  { id: 'ok', label: 'In date', hint: '', tone: 'good', entries: inv.inDate },
];

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

function rowTone(c: ClassifiedItem): SectionTone {
  if (c.status.severity === 'limit') return 'danger';
  if (c.status.severity === 'caution') return 'warn';
  return 'good';
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
  return [
    item.lot === '' ? 'Lot —' : `Lot ${item.lot}`,
    `Qty ${item.quantity}`,
    `Exp ${formatExpiryMonth(item.expiresOn)}`,
  ].join(' · ');
}

function orderLine(item: InventoryItem): string {
  if (!item.onOrder) return '';
  return item.onOrder.substitution
    ? `SKU ${item.onOrder.sku} · arriving as ${item.onOrder.substitution}`
    : `SKU ${item.onOrder.sku}`;
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
      Replace before the next sedation case.
      {{
        inv.summary.onOrder > 0 ? `${inv.summary.onOrder} replacements are already on order.` : ''
      }}
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
        :category="expiredCount > 0 ? 'Action' : 'Clear'"
      />
      <UiStatCard
        :label="`Expiring ≤ ${EXPIRY_WARN_DAYS} d`"
        :value="String(expiringCount)"
        :severity="expiringCount > 0 ? 'caution' : 'safe'"
        :category="expiringCount > 0 ? 'Reorder' : 'Clear'"
      />
      <UiStatCard
        label="Line items"
        :value="String(inv.summary.total)"
        severity="safe"
        category="Tracked"
      />
    </div>

    <template v-for="section in sections" :key="section.id">
      <UiCard v-if="section.entries.length > 0" class="inv-card">
        <header class="inv-head">
          <span class="inv-swatch" :class="`inv-swatch--${section.tone}`" aria-hidden="true" />
          <div class="inv-head-main">
            <p class="inv-title">{{ section.label }}</p>
            <p v-if="section.hint" class="inv-hint">{{ section.hint }}</p>
          </div>
          <span class="card-count">{{ section.entries.length }}</span>
        </header>
        <UiStack :gap="1">
          <div v-for="entry in section.entries" :key="entry.item.id" class="inv-row">
            <span class="inv-bar" :class="`inv-bar--${rowTone(entry)}`" aria-hidden="true" />
            <div class="inv-main">
              <p class="inv-drug">{{ entry.item.drug }}</p>
              <p class="inv-desc">{{ entry.item.description }}</p>
              <p class="inv-meta">{{ metaLine(entry.item) }}</p>
              <p v-if="entry.item.onOrder" class="inv-order">{{ orderLine(entry.item) }}</p>
              <p v-if="entry.item.notes" class="inv-note">{{ entry.item.notes }}</p>
            </div>
            <div class="inv-pills">
              <UiStatusPill :severity="pillSeverity(entry)">{{ pillLabel(entry) }}</UiStatusPill>
              <UiStatusPill v-if="entry.item.onOrder" severity="empty">On order</UiStatusPill>
            </div>
          </div>
        </UiStack>
      </UiCard>
    </template>

    <UiCard v-if="inv.notStocked.length > 0" class="inv-card">
      <header class="inv-head">
        <span class="inv-swatch inv-swatch--slate" aria-hidden="true" />
        <div class="inv-head-main">
          <p class="inv-title">Called for by protocols, not stocked</p>
          <p class="inv-hint">A purchasing decision — not currently part of the kit</p>
        </div>
        <span class="card-count">{{ inv.notStocked.length }}</span>
      </header>
      <UiStack :gap="1">
        <div v-for="name in inv.notStocked" :key="name" class="inv-row">
          <span class="inv-bar inv-bar--slate" aria-hidden="true" />
          <div class="inv-main">
            <p class="inv-drug">{{ name }}</p>
          </div>
          <div class="inv-pills">
            <UiStatusPill severity="empty">Not stocked</UiStatusPill>
          </div>
        </div>
      </UiStack>
      <p class="inv-hint">
        Controlled substances (Midazolam, Fentanyl, Diazepam) are stored and tracked separately and
        are deliberately excluded here.
      </p>
    </UiCard>

    <p class="caption inv-footer">
      Paper sheet transcribed {{ INVENTORY_AS_OF }} · inventory is maintained in the practice repo —
      tell Claude the new lot and expiration when replacement stock arrives, and every device
      updates on the next deploy.
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
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
.inv-head-main {
  min-width: 0;
}
.inv-title {
  margin: 0;
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
}
.inv-swatch {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.inv-swatch--danger {
  background: var(--color-danger);
}
.inv-swatch--warn {
  background: var(--color-warn);
}
.inv-swatch--good {
  background: var(--color-good);
}
.inv-swatch--slate {
  background: var(--color-text-disabled);
}
.inv-hint {
  margin: 0;
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  letter-spacing: 0.2px;
}
.inv-row {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: 10px 12px;
  border-radius: var(--r-md);
  transition: background var(--dur-150) var(--ease-standard);
}
.inv-row:active {
  background: var(--color-surface);
}
.inv-bar {
  flex-shrink: 0;
  width: 10px;
  height: 28px;
  border-radius: 3px;
  margin-top: 2px;
}
.inv-bar--danger {
  background: var(--color-danger);
}
.inv-bar--warn {
  background: var(--color-warn);
}
.inv-bar--good {
  background: var(--color-good);
}
.inv-bar--slate {
  background: var(--color-text-disabled);
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
.inv-order {
  margin: 4px 0 0;
  font-size: var(--type-caption);
  color: var(--color-text-secondary);
}
.inv-note {
  margin: 4px 0 0;
  font-size: var(--type-caption);
  color: var(--color-text-secondary);
}
.inv-pills {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.inv-footer {
  text-align: center;
  padding-inline: var(--sp-4);
}
</style>
