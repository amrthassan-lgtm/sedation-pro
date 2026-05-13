<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  CRITICAL_PROTOCOL_IDS,
  EMERGENCY_PROTOCOLS,
  type EmergencyCategory,
  type EmergencyProtocol,
} from '@sedation-pro/clinical';
import { UiBanner, UiCard, UiStack, UiTextInput } from '@sedation-pro/ui';

const router = useRouter();

const query = ref('');

interface CategoryGroup {
  id: string;
  label: string;
  swatch: string;
  // Subset of EmergencyCategory values that roll up under this display group.
  categories: ReadonlyArray<EmergencyCategory>;
}

/**
 * Display-time grouping — the engine carries 7 fine-grained categories,
 * the view rolls cardiac sub-categories under one card so the screen stays
 * scannable.
 */
const GROUPS: ReadonlyArray<CategoryGroup> = [
  { id: 'airway', label: 'Airway', swatch: 'airway', categories: ['airway'] },
  {
    id: 'cardiac',
    label: 'Cardiac',
    swatch: 'cardiac',
    categories: ['cardiac-ischemia', 'cardiac-arrhythmia', 'cardiac-arrest'],
  },
  {
    id: 'allergic',
    label: 'Allergic & Toxicity',
    swatch: 'allergic',
    categories: ['allergic'],
  },
  { id: 'neuro', label: 'Neurological', swatch: 'neuro', categories: ['neurological'] },
  { id: 'other', label: 'Other', swatch: 'other', categories: ['other'] },
];

const CARDIAC_SUBHEADS: Partial<Record<EmergencyCategory, string>> = {
  'cardiac-ischemia': 'Ischemia & pressure',
  'cardiac-arrhythmia': 'Arrhythmias',
  'cardiac-arrest': 'Cardiac arrest',
};

const criticalProtocols = computed<ReadonlyArray<EmergencyProtocol>>(() =>
  CRITICAL_PROTOCOL_IDS.map((id) => EMERGENCY_PROTOCOLS.find((p) => p.id === id)).filter(
    (p): p is EmergencyProtocol => Boolean(p),
  ),
);

const normalizedQuery = computed(() => query.value.trim().toLowerCase());

function protocolMatches(p: EmergencyProtocol, q: string): boolean {
  if (q === '') return true;
  if (p.name.toLowerCase().includes(q)) return true;
  if (p.summary.toLowerCase().includes(q)) return true;
  for (const sign of p.signs) {
    if (sign.toLowerCase().includes(q)) return true;
  }
  for (const step of p.steps) {
    if (step.drug && step.drug.name.toLowerCase().includes(q)) return true;
  }
  return false;
}

const filtered = computed<ReadonlyArray<EmergencyProtocol>>(() => {
  const q = normalizedQuery.value;
  return EMERGENCY_PROTOCOLS.filter((p) => protocolMatches(p, q));
});

const grouped = computed(() => {
  return GROUPS.map((group) => {
    const protocols = filtered.value.filter((p) => group.categories.includes(p.category));
    return { ...group, protocols };
  });
});

const isSearching = computed(() => normalizedQuery.value !== '');

function open(id: string) {
  void router.push(`/quick-reference/${id}`);
}

function clearSearch() {
  query.value = '';
}
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Quick Reference</p>
      <h1 class="title-display">Emergency Protocols</h1>
      <p class="body muted">
        Tap a shortcut, search by sign / drug, or pick a category. Reachable from any phase via the
        sticky bar's <strong>Emergency</strong> button.
      </p>
    </header>

    <!-- Critical shortcuts: 6 chips in one wrap row, big tap targets. -->

    <section class="shortcuts">
      <p class="caption">Critical</p>
      <div class="shortcut-row">
        <button
          v-for="proto in criticalProtocols"
          :key="proto.id"
          type="button"
          class="shortcut"
          :class="`shortcut--${proto.category}`"
          @click="open(proto.id)"
        >
          <span class="shortcut-name">{{ proto.name }}</span>
          <span class="shortcut-summary">{{ proto.summary }}</span>
        </button>
      </div>
    </section>

    <!-- Search across protocol name, signs, drug names. -->

    <section class="search">
      <UiTextInput v-model="query" placeholder="Search — signs, drug, protocol name…" block />
      <button v-if="isSearching" type="button" class="search-clear" @click="clearSearch">
        Clear search
      </button>
    </section>

    <UiBanner v-if="isSearching && filtered.length === 0" tone="caution" icon="🔍">
      No protocols match <strong>“{{ query }}”</strong>. Try a shorter keyword or browse the
      categories below.
    </UiBanner>

    <!-- Category cards — each expanded when searching, otherwise tap to focus. -->

    <UiCard
      v-for="group in grouped"
      :key="group.id"
      :class="`category-card category-card--${group.swatch}`"
    >
      <header class="category-head">
        <span
          class="category-swatch"
          :class="`category-swatch--${group.swatch}`"
          aria-hidden="true"
        />
        <p class="heading category-title">{{ group.label }}</p>
        <span class="category-count">{{ group.protocols.length }}</span>
      </header>

      <p v-if="group.protocols.length === 0" class="body muted empty">
        <template v-if="isSearching">No matches in this category.</template>
        <template v-else>No protocols.</template>
      </p>

      <template v-else>
        <!-- Cardiac gets sub-headings to keep its 14 protocols scannable. -->
        <template v-if="group.id === 'cardiac' && !isSearching">
          <template v-for="sub in group.categories" :key="sub">
            <p v-if="CARDIAC_SUBHEADS[sub]" class="subhead">{{ CARDIAC_SUBHEADS[sub] }}</p>
            <UiStack :gap="1">
              <button
                v-for="proto in group.protocols.filter((p) => p.category === sub)"
                :key="proto.id"
                type="button"
                class="row"
                @click="open(proto.id)"
              >
                <span class="row-name">{{ proto.name }}</span>
                <span class="row-summary">{{ proto.summary }}</span>
                <span class="row-chevron" aria-hidden="true">›</span>
              </button>
            </UiStack>
          </template>
        </template>

        <UiStack v-else :gap="1">
          <button
            v-for="proto in group.protocols"
            :key="proto.id"
            type="button"
            class="row"
            @click="open(proto.id)"
          >
            <span class="row-name">{{ proto.name }}</span>
            <span class="row-summary">{{ proto.summary }}</span>
            <span class="row-chevron" aria-hidden="true">›</span>
          </button>
        </UiStack>
      </template>
    </UiCard>
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
.phase-hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.muted {
  color: var(--color-text-secondary);
}

/* ----------------- Critical shortcut row ---------------------------- */
.shortcuts {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.shortcut-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--sp-2);
}
.shortcut {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--sp-3) var(--sp-3) var(--sp-3) calc(var(--sp-3) + 4px);
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left-width: 4px;
  border-radius: var(--r-md);
  color: var(--color-text-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.shortcut:active {
  transform: scale(0.98);
  background: var(--color-surface-elevated);
}
.shortcut-name {
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
}
.shortcut-summary {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  letter-spacing: 0.1px;
  line-height: 1.35;
}

/* Per-category border-left + soft tint */
.shortcut--airway {
  border-left-color: #38bdf8;
}
.shortcut--cardiac-ischemia,
.shortcut--cardiac-arrhythmia,
.shortcut--cardiac-arrest {
  border-left-color: var(--color-danger);
}
.shortcut--cardiac-arrest {
  background: var(--color-crisis-soft);
}
.shortcut--allergic {
  border-left-color: var(--color-purple);
}
.shortcut--neurological {
  border-left-color: var(--color-warn);
}
.shortcut--other {
  border-left-color: var(--color-slate);
}

/* ----------------- Search ------------------------------------------- */
.search {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.search-clear {
  align-self: flex-end;
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: var(--r-pill);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
}

/* ----------------- Category cards ----------------------------------- */
.category-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.category-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.category-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.category-swatch--airway {
  background: #38bdf8;
}
.category-swatch--cardiac {
  background: var(--color-danger);
}
.category-swatch--allergic {
  background: var(--color-purple);
}
.category-swatch--neuro {
  background: var(--color-warn);
}
.category-swatch--other {
  background: var(--color-slate);
}
.category-title {
  flex: 1;
  margin: 0;
}
.category-count {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.4px;
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
}

.subhead {
  margin: var(--sp-2) 0 4px;
  font-size: var(--type-caption);
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--color-text-disabled);
  font-weight: var(--weight-bold);
}

.row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 12px;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  color: var(--color-text-primary);
  cursor: pointer;
  position: relative;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-150) var(--ease-standard);
}
.row:active {
  background: rgba(255, 255, 255, 0.05);
}
.row-name {
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  padding-right: 24px;
}
.row-summary {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  line-height: 1.4;
  padding-right: 24px;
}
.row-chevron {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--color-text-disabled);
}
.empty {
  font-size: var(--type-footnote);
  font-style: italic;
}
</style>
