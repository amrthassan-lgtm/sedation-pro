<script setup lang="ts">
import type { Severity } from '../types';

interface Props {
  /** Numeric percent 0-150+. Visually clamped to 100 but value over 100 shows over-state. */
  percent: number;
  /** Severity drives the fill color. Defaults to deriving from percent. */
  severity?: Severity | undefined;
  /** Optional override of the fill color (e.g. drug tone). */
  fillColor?: string | undefined;
  /** Visual thickness — match legacy 3/6/8 px values. */
  thickness?: 'sm' | 'md' | 'lg';
}

const props = withDefaults(defineProps<Props>(), {
  severity: undefined,
  fillColor: undefined,
  thickness: 'md',
});

function deriveSeverity(p: number): Severity {
  if (p >= 100) return 'crisis';
  if (p >= 90) return 'limit';
  if (p >= 70) return 'caution';
  return 'safe';
}

const resolvedSeverity = (): Severity => props.severity ?? deriveSeverity(props.percent);
const fillWidth = () => `${Math.min(100, Math.max(0, props.percent))}%`;
</script>

<template>
  <div
    class="ui-percent-bar"
    :class="[`ui-percent-bar--${props.thickness}`, `ui-percent-bar--${resolvedSeverity()}`]"
    role="progressbar"
    :aria-valuenow="Math.round(props.percent)"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div class="ui-percent-bar-fill" :style="{ width: fillWidth(), background: props.fillColor }" />
  </div>
</template>

<style scoped>
.ui-percent-bar {
  width: 100%;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
}
.ui-percent-bar--sm {
  height: 3px;
}
.ui-percent-bar--md {
  height: 6px;
}
.ui-percent-bar--lg {
  height: 8px;
}
.ui-percent-bar-fill {
  height: 100%;
  border-radius: inherit;
  transition:
    width var(--dur-250) var(--ease-standard),
    background var(--dur-250) var(--ease-standard);
}
.ui-percent-bar--safe .ui-percent-bar-fill {
  background: var(--color-good);
}
.ui-percent-bar--caution .ui-percent-bar-fill {
  background: var(--color-warn);
}
.ui-percent-bar--limit .ui-percent-bar-fill {
  background: var(--color-danger);
}
.ui-percent-bar--crisis .ui-percent-bar-fill {
  background: var(--color-crisis);
}
</style>
