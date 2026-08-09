<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { EXPIRY_WARN_DAYS, type Severity } from '@sedation-pro/clinical';
import { UiBanner, UiCard, UiStack, UiStatCard, UiStatusPill } from '@sedation-pro/ui';

import { INVENTORY_AS_OF, type InventoryItem } from '@/data/emergency-inventory';
import {
  protocolsUsing,
  useInventoryStatus,
  type ClassifiedItem,
} from '@/composables/useInventoryStatus';

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

// -------- "Used in" expansion -----------------------------------------------
// Tapping a mapped row expands the exact protocols that call for the drug
// (same mapping as the stock pills — brand names resolve correctly).
// Single-open, keyed by item id or gap-row drug name.
const router = useRouter();
const expandedId = ref<string | null>(null);

// One protocol scan per item, not six per row per render.
const usesById = new Map(inv.classified.map((c) => [c.item.id, inv.usesFor(c.item)]));
function usesOf(item: InventoryItem) {
  return usesById.get(item.id) ?? [];
}

// "In date" is the longest, least-actionable section — collapsed by
// default so attention lands on the sections that need it.
const collapsed = ref(new Set<string>(['ok']));
function toggleSection(id: string): void {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

function toggleExpanded(key: string): void {
  expandedId.value = expandedId.value === key ? null : key;
}

function openProtocol(id: string): void {
  void router.push(`/quick-reference/${id}`);
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
        <header
          class="inv-head inv-head--toggle"
          role="button"
          tabindex="0"
          :aria-expanded="!collapsed.has(section.id)"
          @click="toggleSection(section.id)"
          @keydown.enter.prevent="toggleSection(section.id)"
        >
          <span class="inv-swatch" :class="`inv-swatch--${section.tone}`" aria-hidden="true" />
          <div class="inv-head-main">
            <p class="inv-title">{{ section.label }}</p>
            <p v-if="section.hint" class="inv-hint">{{ section.hint }}</p>
          </div>
          <span class="card-count">{{ section.entries.length }}</span>
          <span
            class="inv-chevron"
            :class="{ 'is-open': !collapsed.has(section.id) }"
            aria-hidden="true"
          >
            ›
          </span>
        </header>
        <UiStack v-if="!collapsed.has(section.id)" :gap="1">
          <template v-for="entry in section.entries" :key="entry.item.id">
            <component
              :is="usesOf(entry.item).length > 0 ? 'button' : 'div'"
              class="inv-row"
              :type="usesOf(entry.item).length > 0 ? 'button' : undefined"
              :aria-expanded="
                usesOf(entry.item).length > 0 ? expandedId === entry.item.id : undefined
              "
              :aria-label="
                usesOf(entry.item).length > 0
                  ? `${entry.item.drug} — show protocols using it`
                  : undefined
              "
              @click="usesOf(entry.item).length > 0 && toggleExpanded(entry.item.id)"
            >
              <span class="inv-bar" :class="`inv-bar--${rowTone(entry)}`" aria-hidden="true" />
              <span class="inv-main">
                <span class="inv-drug">{{ entry.item.drug }}</span>
                <span class="inv-desc">{{ entry.item.description }}</span>
                <span class="inv-meta">{{ metaLine(entry.item) }}</span>
                <span v-if="entry.item.onOrder" class="inv-order">{{ orderLine(entry.item) }}</span>
                <span v-if="entry.item.notes" class="inv-note">{{ entry.item.notes }}</span>
              </span>
              <span class="inv-pills">
                <UiStatusPill :severity="pillSeverity(entry)">{{ pillLabel(entry) }}</UiStatusPill>
                <UiStatusPill v-if="entry.item.onOrder" severity="empty">On order</UiStatusPill>
                <UiStatusPill v-if="entry.item.category === 'sedation'" severity="empty">
                  Sedation cart
                </UiStatusPill>
              </span>
              <span
                v-if="usesOf(entry.item).length > 0"
                class="inv-chevron"
                :class="{ 'is-open': expandedId === entry.item.id }"
                aria-hidden="true"
              >
                ›
              </span>
            </component>
            <div v-if="expandedId === entry.item.id" class="inv-uses">
              <p class="inv-uses-label">Used in</p>
              <button
                v-for="proto in usesOf(entry.item)"
                :key="proto.id"
                type="button"
                class="inv-uses-row"
                @click="openProtocol(proto.id)"
              >
                <span class="inv-uses-name">{{ proto.name }}</span>
                <span class="inv-uses-chevron" aria-hidden="true">›</span>
              </button>
            </div>
          </template>
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
        <template v-for="name in inv.notStocked" :key="name">
          <button
            type="button"
            class="inv-row"
            :aria-expanded="expandedId === name"
            :aria-label="`${name} — show protocols calling for it`"
            @click="toggleExpanded(name)"
          >
            <span class="inv-bar inv-bar--slate" aria-hidden="true" />
            <span class="inv-main">
              <span class="inv-drug">{{ name }}</span>
            </span>
            <span class="inv-pills">
              <UiStatusPill severity="empty">Not stocked</UiStatusPill>
            </span>
            <span
              class="inv-chevron"
              :class="{ 'is-open': expandedId === name }"
              aria-hidden="true"
            >
              ›
            </span>
          </button>
          <div v-if="expandedId === name" class="inv-uses">
            <p class="inv-uses-label">Called for by</p>
            <button
              v-for="proto in protocolsUsing([name])"
              :key="proto.id"
              type="button"
              class="inv-uses-row"
              @click="openProtocol(proto.id)"
            >
              <span class="inv-uses-name">{{ proto.name }}</span>
              <span class="inv-uses-chevron" aria-hidden="true">›</span>
            </button>
          </div>
        </template>
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
.inv-head--toggle {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
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
  /* Button reset — mapped rows render as <button> for the Used-in
     expansion; unmapped rows stay divs and these are no-ops there. */
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  font: inherit;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
}
button.inv-row {
  cursor: pointer;
}
.inv-row:active {
  background: var(--color-surface);
}
.inv-chevron {
  flex-shrink: 0;
  align-self: center;
  font-size: 15px;
  color: var(--color-text-disabled);
  line-height: 1;
  transition: transform var(--dur-150) var(--ease-standard);
}
.inv-chevron.is-open {
  transform: rotate(90deg);
}
/* Expanded "Used in" panel — indented protocol links under the row. */
.inv-uses {
  margin: 0 4px 4px 34px;
  padding: var(--sp-2) var(--sp-3);
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--r-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.inv-uses-label {
  margin: 0 0 2px;
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
.inv-uses-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: 8px 6px;
  min-height: 44px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-150) var(--ease-standard);
}
.inv-uses-row:active {
  background: var(--color-surface);
}
.inv-uses-name {
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
}
.inv-uses-chevron {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--color-text-disabled);
  line-height: 1;
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
  display: block;
  min-width: 0;
  flex: 1;
}
.inv-drug {
  display: block;
  margin: 0;
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
}
.inv-desc {
  display: block;
  margin: 2px 0 0;
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.inv-meta {
  display: block;
  margin: 4px 0 0;
  font-size: var(--type-caption);
  letter-spacing: 0.2px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
}
.inv-order {
  display: block;
  margin: 4px 0 0;
  font-size: var(--type-caption);
  color: var(--color-text-secondary);
}
.inv-note {
  display: block;
  margin: 4px 0 0;
  font-size: var(--type-caption);
  color: var(--color-text-secondary);
}
.inv-pills {
  display: inline-flex;
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
