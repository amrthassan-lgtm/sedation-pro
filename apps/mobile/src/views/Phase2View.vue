<script setup lang="ts">
import { UiBanner, UiCard } from '@sedation-pro/ui';
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Phase 2 · Oral Sedation</p>
      <h1 class="title-display">Pre-Op Anxiolytic</h1>
      <p class="body muted">
        This phase fills in Phase 4 of the roadmap. The shell mounts the route, sticky bar, and nav
        drawer wire correctly here — content lands when assessment + premed screens are built.
      </p>
    </header>

    <UiBanner tone="info" title="Coming in Phase 4" icon="🚧">
      Triazolam / Lorazepam / Hydroxyzine dose tiles, max-dose hint from
      <code class="mono">triazolamMax</code> / <code class="mono">lorazepamMax</code>, event log
      append.
    </UiBanner>

    <UiCard tint="ph2" active>
      <p class="heading">Roadmap reference</p>
      <p class="body muted">
        Roadmap Phase 4: "Filling in mock patient data unlocks Phase 2; a premed tap logs a stamped
        event and updates the sticky bar."
      </p>
    </UiCard>
  </main>
</template>

<style scoped>
.phase-view {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-4) var(--sp-7);
  max-width: 760px;
  margin-inline: auto;
}
.phase-hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.muted {
  color: var(--color-text-secondary);
}
</style>
