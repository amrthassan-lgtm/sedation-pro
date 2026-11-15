<script setup lang="ts">
/**
 * One row of a grouped inset list, the way iOS draws Settings: content on
 * the card's own surface, a hairline between rows that starts where the
 * text starts (after the leading dot or icon), an optional chevron. Rows
 * placed one after another draw their own separators.
 */
import type { ListRowDisclosure } from '../primitive-types';

interface Props {
  /** A row that opens something: renders as a button with a pressed state. */
  interactive?: boolean;
  chevron?: boolean;
  /**
   * A row that shows or hides the rows under it: the chevron turns down when
   * open and the button says whether it is expanded. A string, not a
   * boolean, so "not a disclosure" stays distinct from "closed".
   */
  disclosure?: ListRowDisclosure;
  /** Where the hairline above this row starts, in px from the left edge. */
  inset?: number;
}

const props = withDefaults(defineProps<Props>(), {
  interactive: false,
  chevron: false,
  inset: 0,
});

defineEmits<{
  (e: 'click', event: MouseEvent): void;
}>();
</script>

<template>
  <component
    :is="props.interactive ? 'button' : 'div'"
    :type="props.interactive ? 'button' : undefined"
    :aria-expanded="props.disclosure ? props.disclosure === 'open' : undefined"
    class="ui-list-row"
    :class="{ 'is-interactive': props.interactive }"
    :style="{ '--ui-list-row-inset': `${props.inset}px` }"
    @click="props.interactive && $emit('click', $event)"
  >
    <span v-if="$slots.leading" class="ui-list-row-leading"><slot name="leading" /></span>
    <span class="ui-list-row-main"><slot /></span>
    <span v-if="$slots.trailing" class="ui-list-row-trailing"><slot name="trailing" /></span>
    <span
      v-if="props.chevron || props.disclosure"
      class="ui-list-row-chevron"
      :class="{ 'is-open': props.disclosure === 'open' }"
      aria-hidden="true"
      >›</span
    >
  </component>
</template>

<style scoped>
.ui-list-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  min-height: 44px;
  padding: 10px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.ui-list-row + .ui-list-row::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  left: var(--ui-list-row-inset, 0px);
  height: 1px;
  background: var(--color-border);
}
/* A row that can be pressed reaches a little past the text on each side, so
   its pressed fill does not sit flush against the words; its hairline stays
   aligned with the text. */
.ui-list-row.is-interactive {
  width: calc(100% + 2 * var(--sp-2));
  margin-inline: calc(-1 * var(--sp-2));
  padding-inline: var(--sp-2);
  cursor: pointer;
  border-radius: var(--r-sm);
  transition: background var(--dur-150) var(--ease-standard);
}
.ui-list-row.is-interactive + .ui-list-row.is-interactive::before {
  left: calc(var(--ui-list-row-inset, 0px) + var(--sp-2));
  right: var(--sp-2);
}
.ui-list-row.is-interactive:active {
  background: var(--color-surface);
}
.ui-list-row-leading,
.ui-list-row-trailing {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
.ui-list-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.ui-list-row-chevron {
  flex-shrink: 0;
  font-size: 18px;
  line-height: 1;
  color: var(--color-text-disabled);
  transition: transform var(--dur-150) var(--ease-standard);
}
.ui-list-row-chevron.is-open {
  transform: rotate(90deg);
}
</style>
