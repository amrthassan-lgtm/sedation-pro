<script setup lang="ts">
import { UiBanner, UiCard, UiDrugSwatch, UiRow, UiStack } from '@sedation-pro/ui';
import { DEFAULT_FORMULARY } from '@sedation-pro/clinical';
import type { DrugTone } from '@sedation-pro/ui';

const drugTones: Record<string, DrugTone> = {
  versed: 'versed',
  fentanyl: 'fentanyl',
  zofran: 'zofran',
  flumazenil: 'flumazenil',
  naloxone: 'naloxone',
};
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Quick Reference</p>
      <h1 class="title-display">Emergency Protocols & Drug Doses</h1>
      <p class="body muted">
        Reachable from any phase via the sticky bar's <strong>Emergency</strong> button or the nav
        drawer. The full ACLS protocols and syringe illustrations land in Phase 6 alongside the
        dose-tile content they reference.
      </p>
    </header>

    <UiBanner tone="info" title="Phase 3 placeholder" icon="🚧">
      The Phase 6 build will populate this route with the 30 ACLS protocols and the 5 syringe
      illustrations modelled as structured data in
      <code class="mono">packages/clinical</code>.
    </UiBanner>

    <UiCard>
      <p class="heading">Active formulary</p>
      <p class="body muted">
        These are the drugs the engine ships by default. Practices can override
        <code class="mono">DEFAULT_FORMULARY</code> at runtime in Phase 5.
      </p>
      <UiStack :gap="3" class="mt-2">
        <UiRow v-for="drug in DEFAULT_FORMULARY.iv" :key="drug.id" :gap="3" align="center">
          <UiDrugSwatch :tone="drugTones[drug.id] ?? 'oral'" />
          <span class="body">{{ drug.name }}</span>
          <span class="muted body mono" style="margin-left: auto">
            {{ drug.concentration.value }} {{ drug.concentration.unit }}
          </span>
        </UiRow>
      </UiStack>
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
.mt-2 {
  margin-top: var(--sp-3);
}
</style>
