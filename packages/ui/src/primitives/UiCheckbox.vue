<script setup lang="ts">
interface Props {
  modelValue: boolean;
  label?: string | undefined;
  /** Smaller hint shown beneath the label. */
  hint?: string | undefined;
  /** When true, the dot draws with the required-blue ring. */
  required?: boolean;
  /** Danger variant — used for airway-risk acknowledgement. */
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
  /**
   * When true, paint the row red — red dot border, red label, red ring. Used
   * by Phase 1 to surface unfilled required checkboxes once the user has tried
   * to navigate to a gated phase.
   */
  invalid?: boolean;
  /**
   * HTML id applied to the wrapper. Lets callers `scrollIntoView` straight to
   * the checkbox — same affordance as UiField.
   */
  id?: string | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  hint: undefined,
  required: false,
  tone: 'neutral',
  disabled: false,
  invalid: false,
  id: undefined,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

function toggle() {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <label
    :id="props.id"
    class="ui-check"
    :class="[
      `ui-check--${props.tone}`,
      {
        'is-checked': props.modelValue,
        'is-disabled': props.disabled,
        'is-required': props.required,
        'is-invalid': props.invalid,
      },
    ]"
    @click.prevent="toggle"
  >
    <span class="ui-check-dot" aria-hidden="true">
      <span v-if="props.modelValue" class="ui-check-tick">✓</span>
      <span v-else-if="props.tone === 'danger'" class="ui-check-bang">!</span>
    </span>
    <span v-if="props.label || $slots.default" class="ui-check-body">
      <span class="ui-check-label">
        <slot>{{ props.label }}</slot>
        <span v-if="props.invalid" class="ui-check-required-text">required</span>
      </span>
      <span v-if="props.hint" class="ui-check-hint">{{ props.hint }}</span>
    </span>
    <input
      type="checkbox"
      class="ui-check-input"
      :checked="props.modelValue"
      :disabled="props.disabled"
      tabindex="-1"
      aria-hidden="true"
    />
  </label>
</template>

<style scoped>
.ui-check {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  cursor: pointer;
  opacity: 0.4;
  transition:
    opacity var(--dur-250) var(--ease-standard),
    background var(--dur-250) var(--ease-standard);
  -webkit-tap-highlight-color: transparent;
}
.ui-check.is-checked {
  opacity: 1;
  background: var(--color-surface-subtle);
}
.ui-check.is-disabled {
  cursor: not-allowed;
  opacity: 0.25;
}
/* Keyboard focus indication stays in-place on the dot (non-glowy) — no
   outer halo, consistent with the inputs' border-color-only treatment. */
.ui-check:focus-within .ui-check-dot {
  border-color: var(--color-accent);
}
.ui-check-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
.ui-check-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid var(--color-border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  color: transparent;
  background: transparent;
  transition:
    background var(--dur-250) var(--ease-standard),
    border-color var(--dur-250) var(--ease-standard),
    color var(--dur-250) var(--ease-standard);
}
.ui-check.is-checked .ui-check-dot {
  background: var(--color-good);
  border-color: var(--color-good);
  color: #000;
}
.ui-check.is-required .ui-check-dot {
  border-color: rgba(59, 130, 246, 0.6);
  background: var(--color-accent-soft);
}
.ui-check.is-required.is-checked .ui-check-dot {
  background: var(--color-good);
  border-color: var(--color-good);
}
.ui-check--danger .ui-check-dot {
  border-color: rgba(251, 113, 133, 0.5);
  color: var(--color-danger);
}
.ui-check-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.2;
}
.ui-check-label {
  font-size: var(--type-step, var(--type-footnote));
  font-weight: var(--weight-medium);
  color: var(--color-text-primary);
}
.ui-check-hint {
  font-size: var(--type-footnote);
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

.ui-check.is-invalid {
  opacity: 1;
  box-shadow: 0 0 0 2px var(--color-danger);
  background: var(--color-danger-soft);
}
.ui-check.is-invalid .ui-check-dot {
  border-color: var(--color-danger);
  background: transparent;
}
.ui-check.is-invalid .ui-check-label {
  color: var(--color-danger);
}
.ui-check-required-text {
  margin-left: 6px;
  color: var(--color-danger);
  font-weight: var(--weight-bold);
  letter-spacing: 0.5px;
  font-size: 9px;
  text-transform: uppercase;
}
</style>
