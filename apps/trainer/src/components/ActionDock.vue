<script setup lang="ts">
import { computed, ref } from 'vue';

import {
  CART_ACTIONS,
  GROUP_LABELS,
  searchCart,
  type ActionGroup,
  type CartEntry,
} from '@/engine/catalog';
import type { Run } from '@/composables/useRun';

/**
 * The hands. Two doors onto one cart: six drawers that never change, and a
 * box to type what you would call out. Neither one shows a dose, a rate or
 * anything that depends on the scenario being played.
 */
const props = defineProps<{ run: Run }>();

const emit = defineEmits<{
  (e: 'drawer', group: ActionGroup): void;
  (e: 'tray'): void;
  (e: 'pick', entry: CartEntry): void;
}>();

const query = ref('');
const hits = computed(() => searchCart(query.value, 4));
const missed = computed(() => query.value.trim().length >= 3 && hits.value.length === 0);

const GROUPS: ReadonlyArray<ActionGroup> = [
  'team',
  'breathing',
  'airway',
  'position',
  'circulation',
];

function activeIn(group: ActionGroup): number {
  return CART_ACTIONS.filter(
    (a) => a.group === group && (a.kind === 'toggle' ? props.run.isOn(a.id) : props.run.done(a.id)),
  ).length;
}

/**
 * Something already under way, or a device already spent. The pill says so,
 * and calling it out again cannot undo it: "oxygen" typed twice must not turn
 * the oxygen off. An act that is on opens its drawer instead, where it can be
 * seen and stopped on purpose.
 */
function stateOf(entry: CartEntry): 'on' | 'used' | null {
  if (entry.kind === 'device') return props.run.remaining(entry.id) === 0 ? 'used' : null;
  if (entry.kind !== 'action') return null;
  const action = CART_ACTIONS.find((a) => a.id === entry.id);
  return action?.kind === 'toggle' && props.run.isOn(entry.id) ? 'on' : null;
}

function pick(entry: CartEntry): void {
  const state = stateOf(entry);
  if (state === 'used') return;
  query.value = '';
  if (state === 'on') {
    const action = CART_ACTIONS.find((a) => a.id === entry.id);
    if (action) emit('drawer', action.group);
    return;
  }
  emit('pick', entry);
}

function submit(): void {
  const first = hits.value[0];
  if (first) pick(first);
}
</script>

<template>
  <section class="dock" aria-label="Actions">
    <div v-if="hits.length > 0 || missed" class="hits" aria-live="polite">
      <button
        v-for="hit in hits"
        :key="`${hit.kind}:${hit.id}`"
        type="button"
        class="pill"
        :disabled="stateOf(hit) === 'used'"
        @click="pick(hit)"
      >
        {{ hit.label }}<template v-if="stateOf(hit)"> · {{ stateOf(hit) }}</template>
      </button>
      <span v-if="missed" class="miss">Not on the cart</span>
    </div>
    <form class="callout" @submit.prevent="submit">
      <input
        id="callout"
        v-model="query"
        class="callout-input"
        type="text"
        inputmode="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="Call it out…"
        aria-label="Call it out"
        enterkeyhint="go"
      />
      <!-- Always here, in every scenario: the one call that must never take a search. -->
      <button
        type="button"
        class="call"
        :class="{ 'is-called': run.done('call_911') }"
        @click="run.act('call_911')"
      >
        {{ run.done('call_911') ? '911 called' : 'Call 911' }}
      </button>
    </form>
    <div class="tiles">
      <button v-for="g in GROUPS" :key="g" type="button" class="tile" @click="emit('drawer', g)">
        <span class="tile-name">{{ GROUP_LABELS[g] }}</span>
        <span v-if="activeIn(g) > 0" class="tile-count mono">{{ activeIn(g) }}</span>
      </button>
      <button type="button" class="tile" @click="emit('tray')">
        <span class="tile-name">Drug tray</span>
        <span v-if="run.tray.value.length > 0" class="tile-count mono">{{
          run.tray.value.length
        }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.dock {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.hits {
  display: flex;
  gap: var(--sp-2);
  overflow-x: auto;
  align-items: center;
}
.hits:empty {
  display: none;
}
.hits .pill {
  white-space: nowrap;
  flex: none;
}
.hits .pill:disabled {
  color: var(--color-text-disabled);
}
.miss {
  font-size: var(--type-footnote);
  color: var(--color-text-tertiary);
}
.callout {
  display: flex;
  gap: var(--sp-2);
}
.call {
  flex: none;
  min-height: 52px;
  padding: 0 var(--sp-4);
  border-radius: var(--r-md);
  background: var(--color-crisis);
  color: var(--color-text-primary);
  font-weight: var(--weight-bold);
  white-space: nowrap;
}
.call.is-called {
  background: var(--color-good-soft);
  color: var(--color-good);
}
.callout-input {
  flex: 1;
  min-width: 0;
  min-height: 52px;
  padding: 0 var(--sp-4);
  border-radius: var(--r-md);
  border: 1px solid var(--color-border);
  background: var(--color-input-bg);
  color: var(--color-text-primary);
  font: inherit;
  font-size: var(--type-heading);
}
.callout-input:focus {
  outline: none;
  border-color: var(--color-border-strong);
}
.tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
}
.tile {
  position: relative;
  min-height: 64px;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  background: var(--surface-highlight), var(--color-surface-elevated);
  font-weight: var(--weight-semibold);
  text-align: left;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}
.tile:active {
  transform: scale(0.98);
}
.tile-count {
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border-radius: var(--r-pill);
  background: var(--color-good-soft);
  color: var(--color-good);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
