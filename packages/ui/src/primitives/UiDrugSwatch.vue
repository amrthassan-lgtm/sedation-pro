<script setup lang="ts">
import type { DrugTone } from '../types';

interface Props {
  tone: DrugTone;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  ariaLabel: undefined,
});
</script>

<template>
  <span
    class="ui-swatch"
    :class="[`ui-swatch--${props.size}`, `ui-swatch--${props.tone}`]"
    :aria-label="props.ariaLabel"
    :role="props.ariaLabel ? 'img' : undefined"
    :aria-hidden="props.ariaLabel ? undefined : 'true'"
  />
</template>

<style scoped>
.ui-swatch {
  display: inline-block;
  border-radius: 50%;
  flex-shrink: 0;
  opacity: 0.9;
}
.ui-swatch--sm {
  width: 8px;
  height: 8px;
}
.ui-swatch--md {
  width: 10px;
  height: 10px;
}
.ui-swatch--lg {
  width: 14px;
  height: 14px;
}
.ui-swatch--versed {
  background: var(--color-orange);
}
.ui-swatch--fentanyl {
  background: var(--color-blue);
}
.ui-swatch--zofran {
  background: var(--color-slate);
}
.ui-swatch--flumazenil {
  background: var(--color-warn);
}
.ui-swatch--naloxone {
  background: var(--color-danger);
}
.ui-swatch--oral {
  background: var(--color-purple);
}
.ui-swatch--bedtime {
  background: rgba(139, 92, 246, 0.6);
}
.ui-swatch--lidocaine {
  background: var(--color-red);
}
.ui-swatch--septocaine-gold {
  background: var(--color-gold);
}
.ui-swatch--septocaine-silver {
  background: var(--color-slate);
}
.ui-swatch--marcaine {
  background: var(--color-blue);
}
.ui-swatch--mepivacaine {
  background: var(--color-tan);
}
</style>
