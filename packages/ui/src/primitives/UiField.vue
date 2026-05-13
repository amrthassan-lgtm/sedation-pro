<script setup lang="ts">
interface Props {
  label?: string | undefined;
  /** Secondary label hint (e.g. units). */
  hint?: string | undefined;
  /** When true, mark the label with a required-dot. */
  required?: boolean;
  /** Error text shown below the input — pure display, validation is the caller's job. */
  error?: string | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  hint: undefined,
  required: false,
  error: undefined,
});
</script>

<template>
  <div class="ui-field">
    <label v-if="props.label" class="ui-field-label">
      {{ props.label }}
      <span v-if="props.hint" class="ui-field-hint">{{ props.hint }}</span>
      <span v-if="props.required" class="ui-field-required" aria-hidden="true">·</span>
    </label>
    <slot />
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
  color: rgba(255, 255, 255, 0.22);
  font-weight: var(--weight-regular);
  margin-left: 4px;
  text-transform: none;
  letter-spacing: 0;
}
.ui-field-required {
  color: var(--color-accent);
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
</style>
