<script setup lang="ts">
/**
 * Responsive shell for phase views. Single column at narrow widths (every
 * iPhone, every iPad portrait); two-column at iPad landscape and wider with
 * a sticky right rail for live readouts.
 *
 * Usage:
 *   <PhaseLayout>
 *     <UiCard>…</UiCard>
 *     <template #rail>
 *       <PatientSummaryCard />
 *       <VitalsStatGrid />
 *     </template>
 *   </PhaseLayout>
 *
 * If the `rail` slot is unused the `<aside>` is omitted and the layout
 * collapses to the existing single-column experience.
 */
</script>

<template>
  <main class="phase-layout">
    <div class="phase-layout-main">
      <slot />
    </div>
    <aside v-if="$slots.rail" class="phase-layout-rail" aria-label="Live readouts">
      <slot name="rail" />
    </aside>
  </main>
</template>

<style scoped>
.phase-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-4) var(--sp-7);
  max-width: 760px;
  margin-inline: auto;
  width: 100%;
}
.phase-layout-main,
.phase-layout-rail {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-width: 0;
}

@media (min-width: 1024px) {
  .phase-layout {
    grid-template-columns: minmax(0, 1fr) 320px;
    max-width: 1180px;
    column-gap: var(--sp-5);
  }
  /* Sticky rail: pins under the StickyBar (~64px) so vitals + alerts stay
     visible while the form scrolls past them. Independent overflow so a
     long rail can scroll without dragging the form along. */
  .phase-layout-rail {
    position: sticky;
    top: calc(72px + env(safe-area-inset-top));
    align-self: start;
    max-height: calc(100vh - 72px - env(safe-area-inset-top) - var(--sp-5));
    overflow-y: auto;
    scrollbar-width: thin;
  }
}
</style>
