<script setup lang="ts">
import { UiBanner, UiCard } from '@sedation-pro/ui';
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Phase 4 · Recovery & Discharge</p>
      <h1 class="title-display">Clinical Note & Release</h1>
      <p class="body muted">
        IV-out countdown, discharge checklist, signature pad, and generated clinical note ship with
        roadmap Phase 6.
      </p>
    </header>

    <UiBanner tone="caution" title="Coming in Phase 6" icon="🚧">
      Recovery vitals, IV-out (with 20-min / 120-min countdown), discharge checklist with
      do-not-dismiss guards, signature pad, and the printable clinical note built from the event
      log.
    </UiBanner>

    <UiCard tint="ph4" active>
      <p class="heading">Roadmap reference</p>
      <p class="body muted">
        Roadmap Phase 6: "Producing a clinical note that includes every logged event in
        chronological order, with the provider's signature."
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
