<script setup lang="ts">
/**
 * Line icons for the menu. They replace emoji, which each device draws in
 * its own style (Samsung's are cartoon-like) and at its own weight, so the
 * menu never looked the same twice or sat on the app's own stroke.
 */
export type NavIconName = 'book' | 'capsule' | 'document' | 'gear' | 'bell' | 'bell-off';

defineProps<{ name: NavIconName }>();
</script>

<template>
  <svg
    class="nav-icon"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'book'">
      <path
        d="M12 6.6C10.2 5.4 8 4.8 5 4.8v12.6c3 0 5.2.6 7 1.8 1.8-1.2 4-1.8 7-1.8V4.8c-3 0-5.2.6-7 1.8z"
      />
      <path d="M12 6.6v12.6" />
    </template>
    <template v-else-if="name === 'capsule'">
      <g transform="rotate(-45 12 12)">
        <path
          d="M12 8.6h5.4a3.4 3.4 0 0 1 0 6.8H12z"
          fill="currentColor"
          fill-opacity="0.35"
          stroke="none"
        />
        <rect x="3.2" y="8.6" width="17.6" height="6.8" rx="3.4" />
        <path d="M12 8.6v6.8" />
      </g>
    </template>
    <template v-else-if="name === 'document'">
      <path d="M6.5 3.5h8L18 7v13.5H6.5z" />
      <path d="M14.5 3.5V7H18" />
      <path d="M9.5 12h5M9.5 15.5h5" />
    </template>
    <template v-else-if="name === 'gear'">
      <circle cx="12" cy="12" r="2.6" />
      <circle cx="12" cy="12" r="6" />
      <path
        d="M12 3.2V6M12 18v2.8M3.2 12H6M18 12h2.8M5.8 5.8l2 2M16.2 16.2l2 2M5.8 18.2l2-2M16.2 7.8l2-2"
      />
    </template>
    <template v-else>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5L19 18H5z" />
      <path d="M10 20.4a2.2 2.2 0 0 0 4 0" />
      <path v-if="name === 'bell-off'" d="M4.5 4.5l15 15" />
    </template>
  </svg>
</template>

<style scoped>
.nav-icon {
  display: block;
}
</style>
