<script setup lang="ts">
interface Props {
  label?: string | undefined;
  /** Secondary label hint (e.g. units). */
  hint?: string | undefined;
  /** When true, mark the label with a required-dot. */
  required?: boolean;
  /** Error text shown below the input — pure display, validation is the caller's job. */
  error?: string | undefined;
  /**
   * When true, paint a red label, red required-dot, and a red ring around the
   * slotted input. Used by Phase 1 to highlight unfilled required fields once
   * the user has tried to navigate to a gated phase.
   */
  invalid?: boolean;
  /**
   * HTML id applied to the wrapper. Lets callers `scrollIntoView` straight to
   * the field — e.g. jumping to the first missing entry on a failed clearance.
   */
  id?: string | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  hint: undefined,
  required: false,
  error: undefined,
  invalid: false,
  id: undefined,
});
</script>

<template>
  <div :id="props.id" class="ui-field" :class="{ 'is-invalid': props.invalid }">
    <label v-if="props.label" class="ui-field-label">
      {{ props.label }}
      <span v-if="props.hint" class="ui-field-hint">{{ props.hint }}</span>
      <span v-if="props.required" class="ui-field-required" aria-hidden="true">·</span>
      <span v-if="props.invalid" class="ui-field-required-text">required</span>
    </label>
    <div class="ui-field-slot">
      <slot />
    </div>
    <p v-if="props.error" class="ui-field-error" role="alert">{{ props.error }}</p>
  </div>
</template>

<style scoped>
.ui-field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.ui-field-label {
  font-size: 10px;
  font-weight: var(--weight-semibold);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}
.ui-field-hint {
  color: var(--color-text-disabled);
  font-weight: var(--weight-regular);
  margin-left: 4px;
  text-transform: none;
  letter-spacing: 0;
}
.ui-field-required {
  /* Neutral required marker — was accent blue. Stays subtle until the
     `.is-invalid` rule flips it to danger on a clearance attempt. */
  color: var(--color-text-tertiary);
  opacity: 1;
  font-size: 18px;
  line-height: 1;
  font-weight: var(--weight-semibold);
  margin-left: 4px;
}
.ui-field-error {
  margin: 0;
  font-size: var(--type-footnote);
  color: var(--color-danger);
}

.ui-field-slot {
  border-radius: var(--r-sm);
  transition: box-shadow var(--dur-150) var(--ease-standard);
}
.ui-field.is-invalid .ui-field-label {
  color: var(--color-danger);
}
.ui-field.is-invalid .ui-field-required {
  color: var(--color-danger);
}
.ui-field-required-text {
  margin-left: 6px;
  color: var(--color-danger);
  font-weight: var(--weight-bold);
  letter-spacing: 0.5px;
  font-size: 9px;
  text-transform: uppercase;
}
.ui-field.is-invalid .ui-field-slot {
  box-shadow: 0 0 0 2px var(--color-danger);
}
</style>
