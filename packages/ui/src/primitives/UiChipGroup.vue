<script setup lang="ts" generic="T extends string | number | boolean">
import { computed } from 'vue';
import type { ChipOption } from '../primitive-types';

interface Props {
  modelValue: T;
  options: ReadonlyArray<ChipOption<T>>;
  /**
   * When true, render the active chip's `caption` beneath the row. Lets
   * ASA-style "Roman numeral chip + descriptive subtitle" render without
   * making the chips themselves wider.
   */
  showCaption?: boolean;
  /**
   * When true, tapping the currently-active chip emits `deselectValue`
   * instead of staying selected — for non-required fields where the user
   * might genuinely want to clear their answer (e.g. accidentally tapped
   * a chip). Required fields leave this off so the chip row always shows
   * a definite selection once answered.
   */
  allowDeselect?: boolean;
  /**
   * Value emitted when the user taps the already-active chip and
   * `allowDeselect` is on. Caller picks the sentinel that matches "no
   * answer" for their store: `''` for string-backed picks (sedation
   * rating), `-1` for bucket-bound numerics (alcohol, cigarettes), etc.
   * Ignored unless `allowDeselect` is true.
   */
  deselectValue?: T;
  /**
   * Sizing variant. `compact` is the default pill-style chip row that
   * sits packed at the left — used for buckets and dense intake fields.
   * `tap-target` upgrades each chip to a row-filling, ~56 px-tall
   * segmented-control button — used for chairside / clinical-headline
   * picks (Mallampati, ASA, OSA, vitals response, Nausea / Bleeding,
   * sedation rating, IV gauge / attempts) where a gloved finger needs
   * an unambiguous tap target. Callers should drop `inline` from the
   * surrounding `<UiField>` for tap-target groups so the chips fill the
   * row instead of being trapped inside a content-sized slot.
   */
  size?: 'compact' | 'tap-target';
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showCaption: false,
  allowDeselect: false,
  size: 'compact',
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void;
}>();

function select(value: T): void {
  if (props.disabled) return;
  // Deselect: tap-while-active emits the deselectValue sentinel back so
  // the parent ref can drop to its empty state. Caller opts in per-field.
  if (props.allowDeselect && props.modelValue === value && props.deselectValue !== undefined) {
    emit('update:modelValue', props.deselectValue);
    return;
  }
  emit('update:modelValue', value);
}

const activeCaption = computed<string | undefined>(() => {
  const active = props.options.find((opt) => opt.value === props.modelValue);
  return active?.caption;
});
</script>

<template>
  <div
    class="ui-chip-group"
    :class="[`ui-chip-group--${props.size}`, { 'is-disabled': props.disabled }]"
  >
    <div class="ui-chip-row" role="radiogroup">
      <button
        v-for="opt in props.options"
        :key="String(opt.value)"
        type="button"
        class="ui-chip"
        :class="{ 'is-active': props.modelValue === opt.value }"
        :aria-pressed="props.modelValue === opt.value"
        :disabled="props.disabled || opt.disabled"
        @click="select(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
    <p v-if="props.showCaption && activeCaption" class="ui-chip-caption">
      {{ activeCaption }}
    </p>
  </div>
</template>

<style scoped>
.ui-chip-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
/* iOS segmented-control track — the row is a single rounded container;
   chips sit transparent inside it and the active one lifts off the
   track. Compact buckets keep the pill radius; the tap-target override
   below squares the track to md. */
.ui-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-pill);
}
.ui-chip {
  min-width: 44px;
  padding: 8px 14px;
  border-radius: var(--r-pill);
  border: 1px solid transparent;
  background: transparent;
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

/* Tap-target variant — each chip flexes to share the row width evenly so
   a gloved finger lands on the right one without aiming; height clears
   the iOS 44 pt / Android 48 dp minimum with generous margin. The track
   squares to md radius (vs the pill of compact buckets) so it reads as a
   decisive control rather than a tag. */
.ui-chip-group--tap-target .ui-chip-row {
  border-radius: var(--r-md);
}
.ui-chip-group--tap-target .ui-chip {
  flex: 1 1 0;
  min-width: 0;
  min-height: 56px;
  padding: 14px 12px;
  border-radius: var(--r-md);
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
}
/* Phone portrait: a row of 5 chips at 5 × ~70 px doesn't fit a 360 px
   viewport; let them wrap to two lines but keep the per-chip height
   so the tap target stays generous. */
@media (max-width: 480px) {
  .ui-chip-group--tap-target .ui-chip {
    flex-basis: calc(50% - 4px);
  }
}

.ui-chip:active:not(:disabled) {
  transform: scale(0.96);
}
/* Active segment lifts off the track: brighter surface, hairline border,
   and a small shadow. Border width stays 1px (transparent → visible) so
   the chip's box never changes size between states. */
.ui-chip.is-active {
  background: var(--color-segment-active);
  border-color: var(--color-border);
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
.ui-chip-caption {
  margin: 0;
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  letter-spacing: 0.2px;
  font-weight: var(--weight-regular);
}
</style>
