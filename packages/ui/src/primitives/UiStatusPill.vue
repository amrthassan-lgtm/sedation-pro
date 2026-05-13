<script setup lang="ts">
import type { Severity } from '../types';

interface Props {
  severity: Severity | 'empty';
  /** Optional label override — defaults derived from severity. */
  label?: string | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
});

const defaultLabel: Record<Severity | 'empty', string> = {
  safe: 'Safe',
  caution: 'Caution',
  limit: 'Limit',
  crisis: 'Crisis',
  empty: '—',
};
</script>

<template>
  <span class="ui-status-pill" :class="`ui-status-pill--${props.severity}`">
    <slot>{{ props.label ?? defaultLabel[props.severity] }}</slot>
  </span>
</template>

<style scoped>
.ui-status-pill {
  display: inline-flex;
  align-items: center;
  font-size: 9px;
  font-weight: var(--weight-bold);
  letter-spacing: 1.2px;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  flex-shrink: 0;
}
.ui-status-pill--safe {
  color: var(--color-good);
  background: var(--color-good-soft);
  border-color: rgba(74, 222, 128, 0.3);
}
.ui-status-pill--caution {
  color: var(--color-warn);
  background: var(--color-warn-soft);
  border-color: rgba(250, 204, 21, 0.3);
}
.ui-status-pill--limit {
  color: var(--color-danger);
  background: var(--color-danger-soft);
  border-color: rgba(251, 113, 133, 0.3);
}
.ui-status-pill--crisis {
  color: var(--color-crisis);
  background: var(--color-crisis-soft);
  border-color: rgba(239, 68, 68, 0.3);
}
.ui-status-pill--empty {
  color: var(--color-text-tertiary);
  background: transparent;
  border-color: var(--color-border);
}
</style>
