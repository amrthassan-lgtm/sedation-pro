<script setup lang="ts">
import type { GlyphName } from '../glyphs';

interface Props {
  name: GlyphName;
  /** Edge length in px. */
  size?: number;
}

const props = withDefaults(defineProps<Props>(), { size: 18 });
</script>

<template>
  <svg
    class="ui-glyph"
    viewBox="0 0 24 24"
    :width="props.size"
    :height="props.size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="props.name === 'warning'">
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10.2v4.3M12 17.2v.1" />
    </template>
    <template v-else-if="props.name === 'timer'">
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 13.5V9.8M9.6 3.5h4.8M12 3.5v3" />
    </template>
    <template v-else-if="props.name === 'scale'">
      <path d="M12 4.5v15M7.5 19.5h9M5.5 8h13" />
      <path d="M5.5 8 3 14a2.6 2.6 0 0 0 5 0zM18.5 8 16 14a2.6 2.6 0 0 0 5 0z" />
    </template>
    <template v-else-if="props.name === 'box'">
      <path d="M4 8l8-4 8 4v8l-8 4-8-4z" />
      <path d="M4 8l8 4 8-4M12 12v8" />
    </template>
    <template v-else-if="props.name === 'hourglass'">
      <path d="M7 4h10M7 20h10" />
      <path d="M8 4c0 4.2 8 4.8 8 8s-8 3.8-8 8M16 4c0 4.2-8 4.8-8 8s8 3.8 8 8" />
    </template>
    <template v-else-if="props.name === 'search'">
      <circle cx="11" cy="11" r="6" />
      <path d="M15.5 15.5 20 20" />
    </template>
    <template v-else-if="props.name === 'lock'">
      <rect x="6" y="11" width="12" height="9" rx="2" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </template>
    <template v-else-if="props.name === 'refresh'">
      <path d="M19 12a7 7 0 1 1-2.6-5.4" />
      <path d="M19 4.5v4h-4" />
    </template>
    <template v-else>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5M12 8v.1" />
    </template>
  </svg>
</template>

<style scoped>
.ui-glyph {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: -0.2em;
}
</style>
