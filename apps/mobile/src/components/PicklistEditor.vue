<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { UiCard, UiTextInput } from '@sedation-pro/ui';

/**
 * One editable practice pick-list — the staff roster, the IV supplies, the
 * note vocabulary.
 *
 * Shaped as a grouped list: rows sit on the card's own surface separated by
 * hairlines, matching the inventory rows rather than inventing a second list
 * idiom. At rest a row shows only the name; the destructive and reordering
 * controls live behind Edit, so the common act of reading the roster is not
 * a wall of buttons.
 *
 * Entries are not inline-editable on purpose. These strings print verbatim on
 * a medicolegal note, and a field that rewrites the list on every keystroke
 * makes a half-typed clinician a real, persisted state. Correcting an entry
 * is remove-then-add.
 */
const props = defineProps<{
  label: string;
  hint?: string | undefined;
  entries: ReadonlyArray<string>;
  overridden: boolean;
  /** Set when the first entry is what a new case is pre-filled with. */
  firstIsDefault?: boolean | undefined;
}>();

const emit = defineEmits<{
  update: [entries: string[]];
  restore: [];
}>();

const open = ref(false);
const editing = ref(false);
const adding = ref(false);
const draft = ref('');
const bodyId = `picklist-${Math.random().toString(36).slice(2, 9)}`;

// Collapsing the card puts it back to its resting state, so reopening never
// lands the clinician in a half-finished edit they have forgotten about.
watch(open, (isOpen) => {
  if (!isOpen) {
    editing.value = false;
    adding.value = false;
    draft.value = '';
  }
});

const trimmedDraft = computed(() => draft.value.trim());
const isDuplicate = computed(() =>
  props.entries.some((e) => e.toLowerCase() === trimmedDraft.value.toLowerCase()),
);
const canAdd = computed(() => trimmedDraft.value !== '' && !isDuplicate.value);

function add(): void {
  if (!canAdd.value) return;
  emit('update', [...props.entries, trimmedDraft.value]);
  draft.value = '';
  adding.value = false;
}

function cancelAdd(): void {
  draft.value = '';
  adding.value = false;
}

function removeAt(index: number): void {
  emit(
    'update',
    props.entries.filter((_, i) => i !== index),
  );
}

function move(index: number, delta: number): void {
  const target = index + delta;
  if (target < 0 || target >= props.entries.length) return;
  const next = [...props.entries];
  const moved = next[index];
  const displaced = next[target];
  if (moved === undefined || displaced === undefined) return;
  next[index] = displaced;
  next[target] = moved;
  emit('update', next);
}
</script>

<template>
  <UiCard>
    <div class="pl-head">
      <button
        type="button"
        class="pl-disclosure"
        :aria-expanded="open"
        :aria-controls="bodyId"
        @click="open = !open"
      >
        <span class="pl-head-text">
          <span class="pl-title">{{ label }}</span>
          <span class="pl-sub">
            {{ entries.length }} {{ entries.length === 1 ? 'entry' : 'entries' }}
            <template v-if="overridden"> · Customised</template>
          </span>
        </span>
        <span class="pl-chevron" :class="{ 'is-open': open }" aria-hidden="true">›</span>
      </button>
      <button
        v-if="open && entries.length > 0"
        type="button"
        class="pl-edit"
        @click="editing = !editing"
      >
        {{ editing ? 'Done' : 'Edit' }}
      </button>
    </div>

    <div v-if="open" :id="bodyId" class="pl-body">
      <p v-if="hint" class="pl-note">{{ hint }}</p>
      <p v-if="firstIsDefault && entries.length > 0" class="pl-note">
        “{{ entries[0] }}” is pre-filled on a new case. Tap Edit and move an entry to the top to
        change that.
      </p>

      <ul class="pl-rows">
        <li v-for="(entry, i) in entries" :key="entry" class="pl-row">
          <button
            v-if="editing"
            type="button"
            class="pl-remove"
            :aria-label="`Remove ${entry}`"
            @click="removeAt(i)"
          >
            <span aria-hidden="true">−</span>
          </button>
          <span class="pl-entry">{{ entry }}</span>
          <span v-if="editing" class="pl-reorder">
            <button
              type="button"
              class="pl-arrow"
              :disabled="i === 0"
              :aria-label="`Move ${entry} up`"
              @click="move(i, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="pl-arrow"
              :disabled="i === entries.length - 1"
              :aria-label="`Move ${entry} down`"
              @click="move(i, 1)"
            >
              ↓
            </button>
          </span>
        </li>

        <li v-if="entries.length === 0" class="pl-row pl-row-empty">
          Nothing on this list. A new case leaves the matching field blank.
        </li>

        <li v-if="adding" class="pl-row pl-row-add">
          <UiTextInput v-model="draft" placeholder="Name" autofocus @keyup.enter="add" />
          <button type="button" class="pl-action" @click="cancelAdd">Cancel</button>
          <button type="button" class="pl-action is-primary" :disabled="!canAdd" @click="add">
            Add
          </button>
        </li>
        <li v-else class="pl-row">
          <button type="button" class="pl-add" @click="adding = true">
            <span class="pl-add-glyph" aria-hidden="true">+</span>
            Add an entry
          </button>
        </li>
      </ul>

      <p v-if="adding && isDuplicate" class="pl-note">
        “{{ trimmedDraft }}” is already on the list.
      </p>

      <button v-if="overridden" type="button" class="pl-restore" @click="emit('restore')">
        Restore the shipped list
      </button>
    </div>
  </UiCard>
</template>

<style scoped>
.pl-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}
.pl-disclosure {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.pl-head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.pl-title {
  font-size: var(--type-heading);
  font-weight: 600;
}
.pl-sub,
.pl-note {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.pl-note {
  margin: 0;
}
.pl-chevron {
  flex-shrink: 0;
  font-size: 15px;
  color: var(--color-text-disabled);
  line-height: 1;
  transition: transform var(--dur-150) var(--ease-standard);
}
.pl-chevron.is-open {
  transform: rotate(90deg);
}
/* Text button, iOS list-header idiom — no chrome, accent colour, right-aligned. */
.pl-edit {
  flex-shrink: 0;
  background: none;
  border: 0;
  padding: var(--sp-2);
  margin: calc(var(--sp-2) * -1);
  font: inherit;
  font-size: var(--type-body);
  color: var(--color-accent);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.pl-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-top: var(--sp-3);
}
.pl-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
/* Hairline-separated rows on the card's own surface — the inventory idiom,
   not a stack of individually-backgrounded pills. */
.pl-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 44px;
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--color-border);
}
.pl-row:first-child {
  border-top: 0;
}
.pl-entry {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.pl-row-empty {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.pl-row-add {
  gap: var(--sp-2);
}
.pl-row-add > :first-child {
  flex: 1;
  min-width: 0;
}
.pl-remove,
.pl-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--r-pill);
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.pl-remove {
  color: #fff;
  background: var(--color-danger);
  font-size: 20px;
  line-height: 1;
}
.pl-reorder {
  display: flex;
  gap: var(--sp-1);
  flex-shrink: 0;
}
.pl-arrow {
  color: var(--color-text-secondary);
  font-size: 15px;
}
.pl-arrow:active:not(:disabled) {
  background: var(--color-surface);
}
.pl-arrow:disabled {
  color: var(--color-text-disabled);
  cursor: default;
}
.pl-add {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: var(--type-body);
  color: var(--color-accent);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.pl-add-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--r-pill);
  border: 1.5px solid currentColor;
  font-size: 15px;
  line-height: 1;
}
.pl-action {
  flex-shrink: 0;
  background: none;
  border: 0;
  padding: var(--sp-2);
  font: inherit;
  font-size: var(--type-body);
  color: var(--color-text-secondary);
  cursor: pointer;
}
.pl-action.is-primary {
  color: var(--color-accent);
  font-weight: 600;
}
.pl-action:disabled {
  color: var(--color-text-disabled);
  cursor: default;
}
.pl-restore {
  align-self: flex-start;
  background: none;
  border: 0;
  padding: var(--sp-2) 0;
  font: inherit;
  font-size: var(--type-body);
  color: var(--color-accent);
  cursor: pointer;
}
@media (prefers-reduced-motion: reduce) {
  .pl-chevron {
    transition: none;
  }
}
</style>
