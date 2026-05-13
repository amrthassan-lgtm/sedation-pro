<script setup lang="ts">
import { CLINICAL_LIB_VERSION } from '@sedation-pro/clinical';
</script>

<template>
  <main class="home">
    <header class="hero">
      <p class="caption">Phase 0 · Foundation</p>
      <h1 class="title-display">Sedation Pro</h1>
      <p class="body muted">
        Clinical IV sedation companion. Drug formulary, dosing rules, and phase gating land in Phase
        1.
      </p>
    </header>

    <section class="card">
      <p class="heading">Build info</p>
      <dl class="kv">
        <dt class="caption">clinical lib</dt>
        <dd class="body mono">v{{ CLINICAL_LIB_VERSION }}</dd>
      </dl>
    </section>
  </main>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  padding: var(--sp-6) var(--sp-5) var(--sp-7);
  max-width: 480px;
  margin-inline: auto;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.muted {
  color: var(--color-text-secondary);
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-lg);
  padding: var(--sp-4) var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.kv {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--sp-2) var(--sp-4);
  align-items: baseline;
}

.kv dt {
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.kv dd {
  margin: 0;
  color: var(--color-text-primary);
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
</style>
