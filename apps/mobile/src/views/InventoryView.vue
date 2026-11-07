<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { EXPIRY_WARN_DAYS, type Severity } from '@sedation-pro/clinical';
import {
  UiBanner,
  UiButton,
  UiCard,
  UiStack,
  UiStatCard,
  UiStatusPill,
  UiTextInput,
} from '@sedation-pro/ui';

import { INVENTORY_AS_OF, type InventoryItem } from '@/data/emergency-inventory';
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
    label: 'Needs ordering',
    hint: 'Expired or missing, nothing on the way',
    tone: 'danger',
    entries: inv.needsAttention,
  },
  {
    id: 'shipped',
    label: 'Shipped, check in on arrival',
    hint: 'Compare the lot and expiry on the box to the shipping line, then tell Claude',
    tone: 'warn',
    entries: inv.shipped,
  },
  {
    id: 'expiring',
    label: `Expiring within ${EXPIRY_WARN_DAYS} days`,
    hint: 'Reorder window, unless the row says otherwise',
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
    label: 'Awaiting photo',
    hint: 'Required kit, date not read yet — not counted as a warning',
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
  if (c.item.awaitingPhoto) return 'Awaiting photo';
  if (c.item.noExpiry) return 'On hand';
  if (isInbound(c)) return 'Inbound';
  if (!c.status.valid) return 'No date';
  if (c.status.daysLeft < 0) return 'Expired';
  if (c.status.severity === 'caution') return `${c.status.daysLeft} d`;
  return 'OK';
}

function rowTone(c: ClassifiedItem): SectionTone {
  if (c.item.awaitingPhoto) return 'slate';
  if (c.item.noExpiry) return 'good';
  if (c.item.onOrder && c.status.severity !== 'safe') return 'warn';
  if (c.status.severity === 'limit') return 'danger';
  if (c.status.severity === 'caution') return 'warn';
  return 'good';
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
    ? `SKU ${item.onOrder.sku} · arriving as ${item.onOrder.substitution}`
    : `SKU ${item.onOrder.sku}`;
}

/** The lot and expiry printed on the shipping line, for the check-in sheet. */
function shippedLine(item: InventoryItem): string {
  const note = item.notes ?? '';
  const m = /Shipped[^:]*:\s*(.*)$/.exec(note);
  return m?.[1] ?? note;
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

// -------- To do + print sheet --------------------------------------------------
const todoCount = computed(
  () => inv.awaitingPhoto.length + inv.shipped.length + inv.needsAttention.length,
);
const printedOn = new Date().toLocaleDateString(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
function printSheet(): void {
  window.print();
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
        :title="`${inv.needsAttention.length} item${inv.needsAttention.length === 1 ? '' : 's'} with nothing on the way`"
      >
        Order before the next sedation case.
      </UiBanner>
      <UiBanner
        v-else-if="inv.shipped.length > 0"
        tone="caution"
        icon="📦"
        :title="`${inv.shipped.length} replacement${inv.shipped.length === 1 ? '' : 's'} shipped`"
      >
        Nothing to order. Check each box in when it arrives.
      </UiBanner>
      <UiBanner
        v-else-if="inv.expiringSoon.length > 0"
        tone="caution"
        icon="⏳"
        :title="`${inv.expiringSoon.length} medication${inv.expiringSoon.length === 1 ? '' : 's'} expiring soon`"
      >
        Inside the {{ EXPIRY_WARN_DAYS }}-day reorder window.
      </UiBanner>

      <div class="stat-row">
        <UiStatCard
          label="Needs ordering"
          :value="String(inv.needsAttention.length)"
          :severity="inv.needsAttention.length > 0 ? 'limit' : 'safe'"
          :category="inv.needsAttention.length > 0 ? 'Decide' : 'Clear'"
        />
        <UiStatCard
          label="Shipped"
          :value="String(inv.shipped.length)"
          :severity="inv.shipped.length > 0 ? 'caution' : 'safe'"
          :category="inv.shipped.length > 0 ? 'Check in' : 'Clear'"
        />
        <UiStatCard
          :label="`Expiring ≤ ${EXPIRY_WARN_DAYS} d`"
          :value="String(inv.expiringSoon.length)"
          :severity="inv.expiringSoon.length > 0 ? 'caution' : 'safe'"
          :category="inv.expiringSoon.length > 0 ? 'Review' : 'Clear'"
        />
      </div>

      <!-- The DA's three jobs, with counts, and the sheet to carry to the cart. -->
      <UiCard v-if="todoCount > 0" class="inv-card inv-todo">
        <header class="inv-head">
          <span class="inv-swatch inv-swatch--warn" aria-hidden="true" />
          <div class="inv-head-main">
            <p class="inv-title">To do</p>
            <p class="inv-hint">
              Photograph, check in, or flag for ordering. Send photos to Dr. Hassan.
            </p>
          </div>
          <span class="card-count">{{ todoCount }}</span>
        </header>
        <ul class="inv-todo-list">
          <li v-if="inv.awaitingPhoto.length > 0">
            <span class="inv-todo-n">{{ inv.awaitingPhoto.length }}</span>
            <span>
              <strong>Photograph the label</strong> showing LOT and EXP:
              {{ inv.awaitingPhoto.map((c) => c.item.drug).join(', ') }}
            </span>
          </li>
          <li v-if="inv.shipped.length > 0">
            <span class="inv-todo-n">{{ inv.shipped.length }}</span>
            <span>
              <strong>Check in when the box arrives.</strong> Compare the lot and expiry to the
              shipping line, put the new stock in the cart, pull the expired one. Then tell Claude
              "arrived" so every device updates.
            </span>
          </li>
          <li v-if="inv.needsAttention.length > 0">
            <span class="inv-todo-n">{{ inv.needsAttention.length }}</span>
            <span>
              <strong>Needs ordering:</strong>
              {{ inv.needsAttention.map((c) => c.item.drug).join(', ') }}
            </span>
          </li>
        </ul>
        <UiButton tone="primary" block class="mt-2" @click="printSheet">Print check sheet</UiButton>
      </UiCard>

      <UiCard v-if="inv.courseShort.length > 0" class="inv-card">
        <header class="inv-head">
          <span class="inv-swatch inv-swatch--danger" aria-hidden="true" />
          <div class="inv-head-main">
            <p class="inv-title">Not enough for a full protocol course</p>
            <p class="inv-hint">In-date stock only; shipped units are shown but don't count yet</p>
          </div>
          <span class="card-count">{{ inv.courseShort.length }}</span>
        </header>
        <UiStack :gap="1">
          <div v-for="course in inv.courseShort" :key="course.drug" class="inv-row">
            <span class="inv-bar inv-bar--danger" aria-hidden="true" />
            <span class="inv-main">
              <span class="inv-drug">{{ course.drug }}</span>
              <span class="inv-desc">{{ course.basis }}</span>
              <span class="inv-meta"
                >Have {{ course.haveMg }} mg · need {{ course.needMg }} mg<template
                  v-if="course.onOrderMg > 0"
                >
                  · {{ course.onOrderMg }} mg shipped</template
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
                    <span
                      class="inv-bar"
                      :class="`inv-bar--${rowTone(entry)}`"
                      aria-hidden="true"
                    />
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
                        Shipped
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
          Controlled substances (Midazolam, Fentanyl, Diazepam) are stored and tracked separately
          and are deliberately excluded here.
        </p>
      </UiCard>

      <p class="caption inv-footer">
        Paper sheet transcribed {{ INVENTORY_AS_OF }} · the inventory lives in the practice repo and
        every device updates on the next deploy.
      </p>
    </div>

    <!-- Print only: the sheet the DA carries to the cart. -->
    <section class="inv-print" aria-hidden="true">
      <header class="inv-print-head">
        <h1>Emergency Kit Check Sheet</h1>
        <div>
          Inventory as of {{ INVENTORY_AS_OF }} · Printed {{ printedOn }} · Done by ____________
        </div>
      </header>
      <p class="inv-print-how">
        Tick each line when done. Photograph the label showing <b>LOT</b> and <b>EXP</b> and send
        the photos to Dr. Hassan. Write MISSING if an item is not in the cart.
      </p>
      <template v-if="inv.awaitingPhoto.length > 0">
        <h2>1 · Photograph the label</h2>
        <table>
          <tr>
            <th></th>
            <th>Item</th>
            <th>Lot</th>
            <th>Exp</th>
          </tr>
          <tr v-for="c in inv.awaitingPhoto" :key="c.item.id">
            <td class="box"><span class="sq" /></td>
            <td>
              <b>{{ c.item.drug }}</b
              ><br /><span>{{ c.item.description }}</span>
            </td>
            <td class="write"></td>
            <td class="write"></td>
          </tr>
        </table>
      </template>
      <template v-if="inv.shipped.length > 0">
        <h2>2 · Check in when the box arrives</h2>
        <table>
          <tr>
            <th></th>
            <th>Item</th>
            <th>Should read</th>
            <th>Matches?</th>
          </tr>
          <tr v-for="c in inv.shipped" :key="c.item.id">
            <td class="box"><span class="sq" /></td>
            <td>
              <b>{{ c.item.drug }}</b
              ><br /><span>{{ c.item.description }}</span>
            </td>
            <td>
              <span>{{ shippedLine(c.item) || orderLine(c.item) }}</span>
            </td>
            <td class="write"></td>
          </tr>
        </table>
      </template>
      <template v-if="inv.needsAttention.length > 0">
        <h2>3 · Needs ordering</h2>
        <table>
          <tr>
            <th></th>
            <th>Item</th>
            <th>Note</th>
          </tr>
          <tr v-for="c in inv.needsAttention" :key="c.item.id">
            <td class="box"><span class="sq" /></td>
            <td>
              <b>{{ c.item.drug }}</b
              ><br /><span>{{ c.item.description }}</span>
            </td>
            <td>
              <span>{{ c.item.notes ?? '' }}</span>
            </td>
          </tr>
        </table>
      </template>
      <template v-if="inv.expiringSoon.length > 0">
        <h2>4 · Expiring within {{ EXPIRY_WARN_DAYS }} days</h2>
        <table>
          <tr>
            <th></th>
            <th>Item</th>
            <th>Expires</th>
            <th>Note</th>
          </tr>
          <tr v-for="c in inv.expiringSoon" :key="c.item.id">
            <td class="box"><span class="sq" /></td>
            <td>
              <b>{{ c.item.drug }}</b
              ><br /><span>{{ c.item.description }}</span>
            </td>
            <td>{{ formatExpiry(c.item.expiresOn) }}</td>
            <td>
              <span>{{ c.item.notes ?? '' }}</span>
            </td>
          </tr>
        </table>
      </template>
    </section>
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

/* To do card */
.inv-todo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.inv-todo-list li {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
  font-size: var(--type-footnote);
  line-height: 1.4;
}
.inv-todo-n {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--color-warn-soft);
  color: var(--color-warn);
  font-weight: var(--weight-bold);
  font-size: var(--type-footnote);
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

/* Print sheet: hidden on screen, the only thing on paper. */
.inv-print {
  display: none;
}
@media print {
  :global(html),
  :global(body) {
    background: #fff;
  }
  .inv-screen {
    display: none;
  }
  .inv-print {
    display: block;
    color: #111;
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.3;
  }
  .inv-print-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #111;
    padding-bottom: 6px;
  }
  .inv-print h1 {
    margin: 0;
    font-size: 17pt;
  }
  .inv-print h2 {
    margin: 11px 0 2px;
    font-size: 11.5pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    break-after: avoid;
  }
  .inv-print-how {
    margin: 8px 0 4px;
    padding: 7px 10px;
    border: 1px solid #999;
    border-radius: 6px;
    font-size: 9.5pt;
  }
  .inv-print table {
    width: 100%;
    border-collapse: collapse;
  }
  .inv-print tr {
    break-inside: avoid;
  }
  .inv-print th {
    text-align: left;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #444;
    padding: 4px 4px 2px;
    border-bottom: 1px solid #111;
  }
  .inv-print td {
    padding: 4px;
    border-bottom: 1px solid #bbb;
    vertical-align: top;
  }
  .inv-print td span {
    display: block;
    font-size: 8.5pt;
    color: #444;
  }
  .inv-print td.box {
    width: 22px;
  }
  .inv-print td.write {
    width: 1.2in;
  }
  .inv-print .sq {
    display: inline-block;
    width: 13px;
    height: 13px;
    border: 1.5px solid #111;
    border-radius: 2px;
  }
  .inv-print footer {
    margin-top: 14px;
    padding-top: 6px;
    border-top: 1px solid #111;
    font-size: 9pt;
  }
  @page {
    size: letter;
    margin: 0.5in 0.55in;
  }
}
</style>
