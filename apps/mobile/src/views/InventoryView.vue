<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { EXPIRY_WARN_DAYS, type Severity } from '@sedation-pro/clinical';
import { UiBanner, UiCard, UiStack, UiStatCard, UiStatusPill, UiTextInput } from '@sedation-pro/ui';

import type { InventoryItem } from '@/data/emergency-inventory';
import {
  protocolsUsing,
  useInventoryStatus,
  type ClassifiedItem,
} from '@/composables/useInventoryStatus';

const inv = useInventoryStatus();

type SectionTone = 'danger' | 'warn' | 'good' | 'slate';

interface Section {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly tone: SectionTone;
  readonly entries: ReadonlyArray<ClassifiedItem>;
  /** Subheads inside the section: the in-date list is long enough to need them. */
  readonly grouped?: boolean;
}

const sections: ReadonlyArray<Section> = [
  {
    id: 'ordering',
    label: 'Expired, none on order',
    hint: 'Not usable',
    tone: 'danger',
    entries: inv.needsAttention,
  },
  {
    id: 'shipped',
    label: 'On order',
    hint: 'Replacement on the way; not usable until it is in the cart',
    tone: 'warn',
    entries: inv.shipped,
  },
  {
    id: 'expiring',
    label: `Expiring within ${EXPIRY_WARN_DAYS} days`,
    hint: 'Usable until the date shown',
    tone: 'warn',
    entries: inv.expiringSoon,
  },
  { id: 'ok', label: 'In date', hint: '', tone: 'good', entries: inv.inDate, grouped: true },
  {
    id: 'no-expiry',
    label: 'No expiry',
    hint: 'On hand — nothing to date',
    tone: 'good',
    entries: inv.noExpiry,
  },
  {
    id: 'awaiting',
    label: 'Expiry not recorded',
    hint: 'Required kit on hand; date not on file yet, not counted as a warning',
    tone: 'slate',
    entries: inv.awaitingPhoto,
  },
];

// -------- Search --------------------------------------------------------------
const query = ref('');
const normalizedQuery = computed(() => query.value.trim().toLowerCase());
const isSearching = computed(() => normalizedQuery.value !== '');
function matches(c: ClassifiedItem, q: string): boolean {
  if (q === '') return true;
  const hay =
    `${c.item.drug} ${c.item.description} ${c.item.lot} ${c.item.notes ?? ''}`.toLowerCase();
  return hay.includes(q);
}
const visibleSections = computed(() =>
  sections
    .map((sec) => ({
      ...sec,
      entries: sec.entries.filter((c) => matches(c, normalizedQuery.value)),
    }))
    .filter((sec) => sec.entries.length > 0),
);

// In date splits by what the row is: the crash cart, the sedation cart, or equipment.
const GROUP_LABEL: Readonly<Record<string, string>> = {
  drug: 'Emergency drugs',
  sedation: 'Sedation cart',
  equipment: 'Equipment',
};
function groupOf(item: InventoryItem): string {
  return item.category ?? 'drug';
}
function groupsFor(entries: ReadonlyArray<ClassifiedItem>) {
  return ['drug', 'sedation', 'equipment']
    .map((key) => ({
      key,
      label: GROUP_LABEL[key] ?? key,
      entries: entries.filter((c) => groupOf(c.item) === key),
    }))
    .filter((g) => g.entries.length > 0);
}

// -------- Pills and lines -------------------------------------------------------
function isInbound(c: ClassifiedItem): boolean {
  return Boolean(c.item.onOrder) && !c.status.valid;
}

function pillSeverity(c: ClassifiedItem): Severity | 'empty' {
  if (c.item.noExpiry) return 'safe';
  if (isInbound(c)) return 'empty';
  if (!c.status.valid) return 'empty';
  return c.status.severity;
}

function pillLabel(c: ClassifiedItem): string {
  if (c.item.awaitingPhoto) return 'No date';
  if (c.item.noExpiry) return 'On hand';
  if (isInbound(c)) return 'On order';
  if (!c.status.valid) return 'No date';
  if (c.status.daysLeft < 0) return 'Expired';
  if (c.status.severity === 'caution') return `${c.status.daysLeft} d`;
  return 'OK';
}

function formatExpiry(expiresOn: string): string {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(expiresOn);
  if (!match) return '—';
  const day = match[3];
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, day === undefined ? 1 : Number(day)),
  ).toLocaleDateString(undefined, {
    ...(day === undefined ? {} : { day: 'numeric' }),
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function metaLine(item: InventoryItem): string {
  return [
    item.lot === '' ? 'Lot —' : `Lot ${item.lot}`,
    `Qty ${item.quantity}`,
    `Exp ${formatExpiry(item.expiresOn)}`,
  ].join(' · ');
}

function orderLine(item: InventoryItem): string {
  if (!item.onOrder) return '';
  return item.onOrder.substitution
    ? `Replacement on order · arriving as ${item.onOrder.substitution}`
    : 'Replacement on order';
}

const router = useRouter();
const expandedId = ref<string | null>(null);

const usesById = new Map(inv.classified.map((c) => [c.item.id, inv.usesFor(c.item)]));
function usesOf(item: InventoryItem) {
  return usesById.get(item.id) ?? [];
}

const collapsed = ref(new Set<string>(['ok', 'no-expiry', 'awaiting']));
function isOpen(id: string): boolean {
  // A search opens everything it matched; nothing to hunt for.
  return isSearching.value || !collapsed.value.has(id);
}
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
    <div class="inv-screen">
      <header class="phase-hero">
        <p class="caption">Practice</p>
        <h1 class="title-display">Emergency Drug Inventory</h1>
      </header>

      <UiBanner
        v-if="inv.needsAttention.length > 0"
        tone="limit"
        icon="⚠"
        :title="`${inv.needsAttention.length} expired item${inv.needsAttention.length === 1 ? '' : 's'}`"
      >
        Not usable. Nothing is on order to replace it.
      </UiBanner>
      <UiBanner
        v-else-if="inv.shipped.length > 0"
        tone="caution"
        icon="📦"
        :title="`${inv.shipped.length} replacement${inv.shipped.length === 1 ? '' : 's'} on order`"
      >
        The stock they replace is not usable until they arrive.
      </UiBanner>
      <UiBanner
        v-else-if="inv.expiringSoon.length > 0"
        tone="caution"
        icon="⏳"
        :title="`${inv.expiringSoon.length} medication${inv.expiringSoon.length === 1 ? '' : 's'} expiring soon`"
      >
        Within {{ EXPIRY_WARN_DAYS }} days. Usable until the date shown.
      </UiBanner>

      <div class="stat-row">
        <UiStatCard
          label="Expired"
          :value="String(inv.needsAttention.length)"
          :severity="inv.needsAttention.length > 0 ? 'limit' : 'safe'"
          :category="inv.needsAttention.length > 0 ? 'Not usable' : 'None'"
        />
        <UiStatCard
          label="On order"
          :value="String(inv.shipped.length)"
          :severity="inv.shipped.length > 0 ? 'caution' : 'safe'"
          :category="inv.shipped.length > 0 ? 'In transit' : 'None'"
        />
        <UiStatCard
          :label="`≤ ${EXPIRY_WARN_DAYS} days`"
          :value="String(inv.expiringSoon.length)"
          :severity="inv.expiringSoon.length > 0 ? 'caution' : 'safe'"
          :category="inv.expiringSoon.length > 0 ? 'Usable' : 'None'"
        />
      </div>

      <UiCard v-if="inv.courseShort.length > 0" class="inv-card">
        <header class="inv-head">
          <span class="inv-swatch inv-swatch--danger" aria-hidden="true" />
          <div class="inv-head-main">
            <p class="inv-title">Not enough for a full protocol course</p>
            <p class="inv-hint">In-date stock only; units on order are shown but don't count yet</p>
          </div>
          <span class="card-count">{{ inv.courseShort.length }}</span>
        </header>
        <UiStack :gap="1">
          <div v-for="course in inv.courseShort" :key="course.drug" class="inv-row">
            <span class="inv-main">
              <span class="inv-drug">{{ course.drug }}</span>
              <span class="inv-desc">{{ course.basis }}</span>
              <span class="inv-meta"
                >Have {{ course.haveMg }} mg · need {{ course.needMg }} mg<template
                  v-if="course.onOrderMg > 0"
                >
                  · {{ course.onOrderMg }} mg on order</template
                ></span
              >
            </span>
            <span class="inv-pills">
              <UiStatusPill severity="limit">Short</UiStatusPill>
            </span>
          </div>
        </UiStack>
      </UiCard>

      <section class="inv-search">
        <UiTextInput
          v-model="query"
          type="search"
          inputmode="search"
          leading-icon="🔍"
          placeholder="Search drug, lot, note…"
          block
        />
      </section>

      <UiBanner v-if="isSearching && visibleSections.length === 0" tone="info" icon="🔍">
        Nothing in the inventory matches <strong>“{{ query }}”</strong>.
      </UiBanner>

      <template v-for="section in visibleSections" :key="section.id">
        <UiCard class="inv-card">
          <header
            class="inv-head inv-head--toggle"
            role="button"
            tabindex="0"
            :aria-expanded="isOpen(section.id)"
            @click="toggleSection(section.id)"
            @keydown.enter.prevent="toggleSection(section.id)"
          >
            <span class="inv-swatch" :class="`inv-swatch--${section.tone}`" aria-hidden="true" />
            <div class="inv-head-main">
              <p class="inv-title">{{ section.label }}</p>
              <p v-if="section.hint" class="inv-hint">{{ section.hint }}</p>
            </div>
            <span class="card-count">{{ section.entries.length }}</span>
            <span class="inv-chevron" :class="{ 'is-open': isOpen(section.id) }" aria-hidden="true">
              ›
            </span>
          </header>
          <template v-if="isOpen(section.id)">
            <template
              v-for="group in section.grouped
                ? groupsFor(section.entries)
                : [{ key: 'all', label: '', entries: section.entries }]"
              :key="group.key"
            >
              <p v-if="group.label" class="inv-subhead">{{ group.label }}</p>
              <UiStack :gap="1">
                <template v-for="entry in group.entries" :key="entry.item.id">
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
                    <span class="inv-main">
                      <span class="inv-drug">{{ entry.item.drug }}</span>
                      <span class="inv-desc">{{ entry.item.description }}</span>
                      <span class="inv-meta">{{ metaLine(entry.item) }}</span>
                      <span v-if="entry.item.onOrder" class="inv-order">{{
                        orderLine(entry.item)
                      }}</span>
                      <span v-if="entry.item.notes" class="inv-note">{{ entry.item.notes }}</span>
                    </span>
                    <span class="inv-pills">
                      <UiStatusPill :severity="pillSeverity(entry)">{{
                        pillLabel(entry)
                      }}</UiStatusPill>
                      <UiStatusPill v-if="entry.item.onOrder && !isInbound(entry)" severity="empty">
                        On order
                      </UiStatusPill>
                      <UiStatusPill v-if="entry.item.category === 'sedation'" severity="empty">
                        Sedation cart
                      </UiStatusPill>
                      <UiStatusPill v-if="entry.item.category === 'equipment'" severity="empty">
                        Equipment
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
            </template>
          </template>
        </UiCard>
      </template>

      <UiCard v-if="inv.notStocked.length > 0 && !isSearching" class="inv-card">
        <header class="inv-head">
          <span class="inv-swatch inv-swatch--slate" aria-hidden="true" />
          <div class="inv-head-main">
            <p class="inv-title">Named in a protocol, not in the kit</p>
            <p class="inv-hint">The protocol gives an alternative</p>
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
      </UiCard>
    </div>
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
.inv-screen {
  /* Same rhythm as Quick Reference: every card separated by --sp-4. */
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
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
  min-height: 44px;
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
  min-height: 44px;
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
.inv-search {
  display: flex;
}
.inv-subhead {
  margin: var(--sp-2) 0 2px;
  font-size: var(--type-caption);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-tertiary);
}
</style>
