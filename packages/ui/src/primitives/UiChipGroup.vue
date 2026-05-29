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
  /* Compact buckets: the track shrink-wraps its segments so there's no
     empty rail to the right. Tap-target overrides to stretch (below) so
     the segments fill the row evenly. */
  align-items: flex-start;
}
.ui-chip-group--tap-target {
  align-items: stretch;
}
/* iOS segmented-control track — one rounded container; segments sit flush
   inside it, separated by hairline dividers, and the active one lifts as
   an inset thumb. nowrap keeps it a single strip: every tap-target group
   is ≤4 short options by design, so segments shrink to share width rather
   than wrapping into a button grid. */
.ui-chip-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 0;
  padding: 3px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-pill);
}
.ui-chip {
  position: relative;
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
/* Hairline divider between adjacent inactive segments. Both the divider on
   the active segment and the one on the segment right after it fade out, so
   the active thumb reads as a lifted, gap-flanked pill (the iOS
   UISegmentedControl idiom). */
.ui-chip + .ui-chip::before {
  content: '';
  position: absolute;
  left: 0;
  top: 22%;
  bottom: 22%;
  width: 1px;
  background: var(--color-border);
  transition: opacity var(--dur-150) var(--ease-standard);
}
.ui-chip.is-active::before,
.ui-chip.is-active + .ui-chip::before {
  opacity: 0;
}

/* Tap-target variant — each segment flexes to share the row width evenly
   so a gloved finger lands on the right one without aiming; height clears
   the iOS 44 pt / Android 48 dp minimum with generous margin. The track
   squares to md radius (vs the pill of compact buckets); the thumb takes
   the smaller sm radius so it nests cleanly inside the track padding. */
.ui-chip-group--tap-target .ui-chip-row {
  border-radius: var(--r-md);
}
.ui-chip-group--tap-target .ui-chip {
  flex: 1 1 0;
  min-width: 0;
  min-height: 56px;
  padding: 14px 12px;
  border-radius: var(--r-sm);
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
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
