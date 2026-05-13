<script setup lang="ts">
import { UiBanner, UiCard } from '@sedation-pro/ui';
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Phase 3 · IV Sedation & Procedure</p>
      <h1 class="title-display">Drug Administration</h1>
      <p class="body muted">
        The shell is wired; this route ships in roadmap Phase 6 along with the full drug-tile +
        timer-pill + local-anesthesia console.
      </p>
    </header>

    <UiBanner tone="caution" title="Coming in Phase 6" icon="🚧">
      N₂O on/off, IV start, initial / additional dose tiles, drug timer pills, IV-max tracker,
      Malamed combined-percent card, reversal panel.
    </UiBanner>

    <UiCard tint="ph3" active>
      <p class="heading">Roadmap reference</p>
      <p class="body muted">
        Roadmap Phase 6: A full mock session — Phase 1 → release — produces a clinical note that
        includes every logged event in chronological order, with the provider's signature.
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
