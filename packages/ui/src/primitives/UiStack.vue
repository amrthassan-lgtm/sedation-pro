<script setup lang="ts">
type StackGap = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type StackAlign = 'start' | 'center' | 'end' | 'stretch';

interface Props {
  /** Spacing token. `3` = `--sp-3` = 12px. Default 4 = 16px. */
  gap?: StackGap;
  /** When true, the stack lays out horizontally with wrap. */
  inline?: boolean;
  /** Cross-axis alignment. Maps to `align-items`. */
  align?: StackAlign;
}

const props = withDefaults(defineProps<Props>(), {
  gap: 4,
  inline: false,
  align: 'stretch',
});
</script>

<template>
  <div
    class="ui-stack"
    :class="[
      `ui-stack--gap-${props.gap}`,
      `ui-stack--align-${props.align}`,
      { 'is-inline': props.inline },
    ]"
  >
    <slot />
  </div>
</template>

<style scoped>
.ui-stack {
  display: flex;
  flex-direction: column;
}
.ui-stack.is-inline {
  flex-direction: row;
  flex-wrap: wrap;
}
.ui-stack--align-start {
  align-items: flex-start;
}
.ui-stack--align-center {
  align-items: center;
}
.ui-stack--align-end {
  align-items: flex-end;
}
.ui-stack--align-stretch {
  align-items: stretch;
}
.ui-stack--gap-1 {
  gap: var(--sp-1);
}
.ui-stack--gap-2 {
  gap: var(--sp-2);
}
.ui-stack--gap-3 {
  gap: var(--sp-3);
}
.ui-stack--gap-4 {
  gap: var(--sp-4);
}
.ui-stack--gap-5 {
  gap: var(--sp-5);
}
.ui-stack--gap-6 {
  gap: var(--sp-6);
}
.ui-stack--gap-7 {
  gap: var(--sp-7);
}
.ui-stack--gap-8 {
  gap: var(--sp-8);
}
</style>
