<script setup lang="ts">
import { computed, ref } from 'vue';

import { UiButton, UiCard, UiStatusPill, UiTextInput } from '@sedation-pro/ui';

/**
 * One editable practice pick-list — the staff roster, the IV supplies, the
 * note vocabulary.
 *
 * Entries are not inline-editable on purpose. These strings land verbatim on
 * a medicolegal note, and a text input that rewrites the list on every
 * keystroke makes a half-typed name a real, persisted state. Correcting an
 * entry is remove-then-add, which is rare and unambiguous.
 *
 * Collapsed by default: eight of these open at once would bury the Open
 * Dental cards below several screens of scroll on the tablet.
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
const draft = ref('');
const bodyId = `picklist-${Math.random().toString(36).slice(2, 9)}`;

const trimmedDraft = computed(() => draft.value.trim());
const isDuplicate = computed(() =>
  props.entries.some((e) => e.toLowerCase() === trimmedDraft.value.toLowerCase()),
);
const canAdd = computed(() => trimmedDraft.value !== '' && !isDuplicate.value);

function add(): void {
  if (!canAdd.value) return;
  emit('update', [...props.entries, trimmedDraft.value]);
  draft.value = '';
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
    <button
      type="button"
      class="picklist-head"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="open = !open"
    >
      <span class="picklist-head-text">
        <span class="heading">{{ label }}</span>
        <span class="picklist-count">
          {{ entries.length }} {{ entries.length === 1 ? 'entry' : 'entries' }}
        </span>
      </span>
      <UiStatusPill v-if="overridden" severity="safe" label="Customised" />
      <span class="picklist-chevron" :class="{ 'is-open': open }" aria-hidden="true">›</span>
    </button>

    <div v-if="open" :id="bodyId" class="picklist-body">
      <p v-if="hint" class="picklist-note">{{ hint }}</p>
      <p v-if="firstIsDefault && entries.length > 0" class="picklist-note">
        “{{ entries[0] }}” is pre-filled on a new case. Move an entry to the top to change that.
      </p>

      <ul v-if="entries.length > 0" class="picklist-rows">
        <li v-for="(entry, i) in entries" :key="entry" class="picklist-row">
          <span class="picklist-entry">{{ entry }}</span>
          <span class="picklist-actions">
            <button
              type="button"
              class="picklist-icon"
              :disabled="i === 0"
              :aria-label="`Move ${entry} up`"
              @click="move(i, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="picklist-icon"
              :disabled="i === entries.length - 1"
              :aria-label="`Move ${entry} down`"
              @click="move(i, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              class="picklist-icon is-remove"
              :aria-label="`Remove ${entry}`"
              @click="removeAt(i)"
            >
              ✕
            </button>
          </span>
        </li>
      </ul>
      <p v-else class="picklist-note">
        Nothing on this list. A new case leaves the matching field blank.
      </p>

      <div class="picklist-add">
        <UiTextInput v-model="draft" placeholder="Add an entry" @keyup.enter="add" />
        <UiButton tone="neutral" :disabled="!canAdd" @click="add">Add</UiButton>
      </div>
      <p v-if="isDuplicate" class="picklist-note">“{{ trimmedDraft }}” is already on the list.</p>

      <UiButton v-if="overridden" tone="neutral" block @click="emit('restore')">
        Restore the shipped list
      </UiButton>
    </div>
  </UiCard>
</template>

<style scoped>
.picklist-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.picklist-head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.picklist-count,
.picklist-note {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.picklist-chevron {
  font-size: 1.25rem;
  color: var(--color-text-secondary);
  transition: transform var(--dur-250) var(--ease-standard);
}
.picklist-chevron.is-open {
  transform: rotate(90deg);
}
.picklist-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-top: var(--sp-3);
}
.picklist-rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  list-style: none;
  margin: 0;
  padding: 0;
}
.picklist-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-md);
  background: var(--color-surface-subtle);
}
.picklist-entry {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.picklist-actions {
  display: flex;
  gap: var(--sp-1);
  flex-shrink: 0;
}
.picklist-icon {
  min-width: 40px;
  min-height: 40px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-elevated);
  color: var(--color-text-secondary);
  font-size: 1rem;
  cursor: pointer;
}
.picklist-icon:disabled {
  opacity: 0.35;
  cursor: default;
}
.picklist-icon.is-remove {
  color: var(--color-danger);
}
.picklist-add {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}
.picklist-add > :first-child {
  flex: 1;
  min-width: 0;
}
/* The button is content-sized; without this the flex row squeezes it and
   clips the label. */
.picklist-add > :last-child {
  flex: 0 0 auto;
  white-space: nowrap;
}
</style>
