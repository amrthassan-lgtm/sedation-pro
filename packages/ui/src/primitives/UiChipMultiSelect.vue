<script setup lang="ts" generic="T extends string | number">
import type { ChipOption } from '../primitive-types';

interface Props {
  /** Currently-selected values. Chip with matching value lights up. */
  modelValue: ReadonlyArray<T>;
  options: ReadonlyArray<ChipOption<T>>;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
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
</style>
