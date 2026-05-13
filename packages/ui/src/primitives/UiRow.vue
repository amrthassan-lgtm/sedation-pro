<script setup lang="ts">
type RowGap = 1 | 2 | 3 | 4 | 5;
type RowAlign = 'start' | 'center' | 'end' | 'baseline' | 'stretch';
type RowJustify = 'start' | 'center' | 'end' | 'between' | 'around';

interface Props {
  gap?: RowGap;
  align?: RowAlign;
  justify?: RowJustify;
  wrap?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  gap: 3,
  align: 'center',
  justify: 'start',
  wrap: false,
});
</script>

<template>
  <div
    class="ui-row"
    :class="[
      `ui-row--gap-${props.gap}`,
      `ui-row--align-${props.align}`,
      `ui-row--justify-${props.justify}`,
      { 'is-wrap': props.wrap },
    ]"
  >
    <slot />
  </div>
</template>

<style scoped>
.ui-row {
  display: flex;
  flex-direction: row;
}
.ui-row.is-wrap {
  flex-wrap: wrap;
}
.ui-row--gap-1 {
  gap: var(--sp-1);
}
.ui-row--gap-2 {
  gap: var(--sp-2);
}
.ui-row--gap-3 {
  gap: var(--sp-3);
}
.ui-row--gap-4 {
  gap: var(--sp-4);
}
.ui-row--gap-5 {
  gap: var(--sp-5);
}
.ui-row--align-start {
  align-items: flex-start;
}
.ui-row--align-center {
  align-items: center;
}
.ui-row--align-end {
  align-items: flex-end;
}
.ui-row--align-baseline {
  align-items: baseline;
}
.ui-row--align-stretch {
  align-items: stretch;
}
.ui-row--justify-start {
  justify-content: flex-start;
}
.ui-row--justify-center {
  justify-content: center;
}
.ui-row--justify-end {
  justify-content: flex-end;
}
.ui-row--justify-between {
  justify-content: space-between;
}
.ui-row--justify-around {
  justify-content: space-around;
}
</style>
