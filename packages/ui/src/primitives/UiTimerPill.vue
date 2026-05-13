<script setup lang="ts">
import type { DrugTone } from '../types';
import type { TimerPillStatus } from '../primitive-types';

interface Props {
  /** Top-line label — drug name. */
  label: string;
  /** Big mono count — e.g. `"1:23"` or `"✓"`. */
  count: string;
  /** Optional hint line — e.g. `"wait · 1:30"` or `"ready"`. */
  hint?: string | undefined;
  /** Drug tone for the count color. */
  tone: DrugTone;
  /** Visual status — drives border + background. */
  status?: TimerPillStatus;
}

const props = withDefaults(defineProps<Props>(), {
  hint: undefined,
  status: 'cooling',
});
</script>

<template>
  <div
    class="ui-timer-pill"
    :class="[`ui-timer-pill--${props.status}`, `ui-timer-pill--${props.tone}`]"
  >
    <div class="ui-timer-pill-label">{{ props.label }}</div>
    <div class="ui-timer-pill-count">{{ props.count }}</div>
    <div v-if="props.hint" class="ui-timer-pill-hint">{{ props.hint }}</div>
  </div>
</template>

<style scoped>
.ui-timer-pill {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 16px;
  border-radius: var(--r-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}
.ui-timer-pill-label {
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  letter-spacing: 0.8px;
  text-transform: uppercase;
  opacity: 0.55;
  margin-bottom: 6px;
}
.ui-timer-pill-count {
  font-size: 36px;
  font-weight: 800;
  font-family: var(--font-mono);
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
}
.ui-timer-pill-hint {
  font-size: var(--type-footnote);
  font-weight: var(--weight-medium);
  margin-top: 6px;
  letter-spacing: 0.2px;
  opacity: 0.9;
}
.ui-timer-pill--cooling {
  border-color: rgba(251, 113, 133, 0.3);
  background: var(--color-danger-soft);
}
.ui-timer-pill--ramping {
  border-color: rgba(249, 115, 22, 0.3);
  background: var(--color-orange-soft);
}
.ui-timer-pill--ready {
  border-color: rgba(74, 222, 128, 0.25);
  background: var(--color-good-soft);
}

/* Drug-tone count color — only applied while cooling/ramping; ready overrides. */
.ui-timer-pill--versed .ui-timer-pill-count {
  color: var(--color-orange);
}
.ui-timer-pill--fentanyl .ui-timer-pill-count {
  color: var(--color-blue);
}
.ui-timer-pill--zofran .ui-timer-pill-count {
  color: var(--color-slate);
}
.ui-timer-pill--flumazenil .ui-timer-pill-count {
  color: var(--color-warn);
}
.ui-timer-pill--naloxone .ui-timer-pill-count {
  color: var(--color-danger);
}
.ui-timer-pill--ready .ui-timer-pill-count {
  color: var(--color-good);
}
</style>
