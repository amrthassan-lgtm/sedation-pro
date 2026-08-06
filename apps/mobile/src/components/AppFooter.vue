<script setup lang="ts">
import { CLINICAL_LIB_VERSION, DEFAULT_FORMULARY } from '@sedation-pro/clinical';
import { UI_LIB_VERSION } from '@sedation-pro/ui';

import { INVENTORY_AS_OF } from '@/data/emergency-inventory';

/**
 * App footer: the single-source logo, brand name, and library versions.
 * Uses `public/logo-source.svg` (the same asset that drives the favicon,
 * apple-touch and PWA icons) so the in-app mark can never drift from the
 * installed-app icon. Path goes through BASE_URL so it resolves under the
 * GitHub Pages subpath as well as a custom-domain root.
 */
const year = new Date().getFullYear();
const logoSrc = `${import.meta.env.BASE_URL}logo-source.svg`;
const practiceName = DEFAULT_FORMULARY.practiceName;
</script>

<template>
  <footer class="app-footer">
    <div class="app-footer-brand">
      <img class="app-footer-logo" :src="logoSrc" alt="" width="32" height="32" />
      <div class="app-footer-name">
        <p class="app-footer-mark">{{ practiceName }}</p>
        <p class="app-footer-tagline">Moderate IV Sedation Companion</p>
      </div>
    </div>
    <p class="app-footer-meta">
      © {{ year }} {{ practiceName }} · Sedation Pro · clinical&nbsp;v{{ CLINICAL_LIB_VERSION }} ·
      ui&nbsp;v{{ UI_LIB_VERSION }} · inv&nbsp;{{ INVENTORY_AS_OF }}
    </p>
  </footer>
</template>

<style scoped>
.app-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-5) var(--sp-4);
  margin-top: var(--sp-6);
  border-top: 1px solid var(--color-border);
  background: var(--color-frosted-bg);
}
.app-footer-brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.app-footer-logo {
  width: 32px;
  height: 32px;
  border-radius: var(--r-sm);
  flex-shrink: 0;
}
.app-footer-name {
  display: flex;
  flex-direction: column;
}
.app-footer-mark {
  margin: 0;
  font-size: 11px;
  font-weight: var(--weight-bold);
  letter-spacing: 2px;
  color: var(--color-text-primary);
  text-transform: uppercase;
}
.app-footer-tagline {
  margin: 0;
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  letter-spacing: 0.3px;
}
.app-footer-meta {
  margin: 0;
  font-size: 10px;
  color: var(--color-text-disabled);
  letter-spacing: 0.4px;
}
</style>
