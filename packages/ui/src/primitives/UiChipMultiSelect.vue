<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, ref } from 'vue';
import type { ChipOption } from '../primitive-types';

interface Props {
  /** Currently-selected values. Chip with matching value lights up. */
  modelValue: ReadonlyArray<T>;
  options: ReadonlyArray<ChipOption<T>>;
  /**
   * Renders a trailing ghost "+ label" chip that morphs into an inline
   * pill input, for vocabularies that can't enumerate every answer
   * (medical problems, allergies). Committed text joins `modelValue` as
   * a first-class selection — it renders as an active chip and a second
   * tap removes it. Only meaningful when T is string: typed entries are
   * emitted as-is.
   */
  allowCustom?: boolean;
  /** Ghost-chip label; rendered as "+ <customLabel>". */
  customLabel?: string;
  customPlaceholder?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  allowCustom: false,
  customLabel: 'Other',
  customPlaceholder: 'Type & press return',
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: T[]): void;
}>();

function toggle(value: T): void {
  if (props.disabled) return;
  const cur = props.modelValue;
  if (cur.includes(value)) {
    emit(
      'update:modelValue',
      cur.filter((v) => v !== value),
    );
  } else {
    emit('update:modelValue', [...cur, value]);
  }
}

/** Selections with no matching option — free-text entries added via the
    ghost chip (or restored from a saved chart whose vocabulary changed).
    Rendered after the option chips so the cloud keeps a stable order. */
const customValues = computed<ReadonlyArray<T>>(() =>
  props.modelValue.filter((v) => !props.options.some((opt) => opt.value === v)),
);

const entering = ref(false);
const draft = ref('');
const entryEl = ref<HTMLInputElement | null>(null);

function startEntry(): void {
  if (props.disabled) return;
  entering.value = true;
  draft.value = '';
  void nextTick(() => entryEl.value?.focus());
}

function cancelEntry(): void {
  entering.value = false;
  draft.value = '';
}

function commitEntry(): void {
  if (!entering.value) return;
  const text = draft.value.trim();
  cancelEntry();
  if (text === '') return;
  // Typing something already on the chip cloud shouldn't mint a duplicate:
  // match against option values and labels (the cloud may abbreviate, e.g.
  // "RLS" for Restless Leg Syndrome) and raise the existing chip instead.
  const lower = text.toLowerCase();
  const match = props.options.find(
    (opt) => String(opt.value).toLowerCase() === lower || opt.label.toLowerCase() === lower,
  );
  if (match) {
    if (!props.modelValue.includes(match.value)) {
      emit('update:modelValue', [...props.modelValue, match.value]);
    }
    return;
  }
  if (props.modelValue.some((v) => String(v).toLowerCase() === lower)) return;
  // Safe cast: free-text entry is only reachable on string-valued models
  // (allowCustom is documented as string-only).
  emit('update:modelValue', [...props.modelValue, text as T]);
}
</script>

<template>
  <div class="ui-chip-group" :class="{ 'is-disabled': props.disabled }">
    <div class="ui-chip-row" role="group">
      <button
        v-for="opt in props.options"
        :key="String(opt.value)"
        type="button"
        class="ui-chip"
        :class="{ 'is-active': props.modelValue.includes(opt.value) }"
        :aria-pressed="props.modelValue.includes(opt.value)"
        :disabled="props.disabled || opt.disabled"
        @click="toggle(opt.value)"
      >
        {{ opt.label }}
      </button>
      <button
        v-for="val in customValues"
        :key="String(val)"
        type="button"
        class="ui-chip is-active"
        :aria-pressed="true"
        :disabled="props.disabled"
        @click="toggle(val)"
      >
        {{ val }}
      </button>
      <input
        v-if="props.allowCustom && entering"
        ref="entryEl"
        v-model="draft"
        class="ui-chip-entry"
        type="text"
        :placeholder="props.customPlaceholder"
        :aria-label="props.customPlaceholder"
        enterkeyhint="done"
        autocapitalize="words"
        @keydown.enter.prevent="commitEntry"
        @keydown.esc.prevent="cancelEntry"
        @blur="commitEntry"
      />
      <button
        v-else-if="props.allowCustom"
        type="button"
        class="ui-chip ui-chip-add"
        :disabled="props.disabled"
        @click="startEntry"
      >
        + {{ props.customLabel }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Multi-select is a filter-chip set, not a segmented control: chips are
   standalone pills (no shared track) that toggle independently, and any
   number can be raised at once — so the segmented track of UiChipGroup
   would be wrong here (it wraps to several rows, and multiple thumbs in
   one track isn't a real control). Inactive chips carry their own subtle
   surface + border so they read as tappable; the active state reuses the
   same lifted surface + shadow as a UiChipGroup thumb so selection feels
   consistent across the two. `aria-pressed` per chip surfaces the toggle
   semantics. */
.ui-chip-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ui-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ui-chip {
  min-width: 44px;
  /* 44pt HIG minimum for gloved fingers; inline-flex keeps the label
     visually centered so density doesn't change. */
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  border-radius: var(--r-pill);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  letter-spacing: 0.2px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background var(--dur-150) var(--ease-standard),
    color var(--dur-150) var(--ease-standard),
    border-color var(--dur-150) var(--ease-standard),
    box-shadow var(--dur-150) var(--ease-standard),
    transform var(--dur-150) var(--ease-standard);
}
.ui-chip:active:not(:disabled) {
  transform: scale(0.96);
}
/* Active filter chip lifts: brighter fill (surface-overlay reads in both
   themes — there's no track behind it to lift off of), stronger border,
   shadow. */
.ui-chip.is-active {
  background: var(--color-surface-overlay);
  border-color: var(--color-border-strong);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}
.ui-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ui-chip-group.is-disabled {
  opacity: 0.5;
}
/* Ghost "+ Other" chip: dashed border + tertiary text so it reads as an
   affordance to extend the cloud, not another selectable condition. */
.ui-chip-add {
  background: transparent;
  border-style: dashed;
  border-color: var(--color-border-strong);
  color: var(--color-text-tertiary);
}
.ui-chip-add:active:not(:disabled) {
  color: var(--color-text-primary);
  background: var(--color-surface);
}
/* Inline entry keeps the chip's pill metrics (same padding/type scale, so
   the row doesn't jump when it swaps in) and follows the app's input-focus
   convention: border shifts to the muted accent, no outer halo. */
.ui-chip-entry {
  width: 168px;
  padding: 8px 14px;
  border-radius: var(--r-pill);
  border: 1px solid var(--color-accent-muted);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.2px;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.ui-chip-entry::placeholder {
  color: var(--color-text-tertiary);
  font-weight: var(--weight-regular);
}
</style>
