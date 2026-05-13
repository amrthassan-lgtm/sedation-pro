<script setup lang="ts">
import { CLINICAL_LIB_VERSION } from '@sedation-pro/clinical';
import { UI_LIB_VERSION } from '@sedation-pro/ui';

/**
 * App footer with the Apex ECG logo, brand name, and library versions.
 * The ECG trace is a small inline SVG that loops a sinus-rhythm waveform —
 * the same "this app is breathing with you" cue the legacy app had under its
 * splash. Keeps the footer feeling clinical, not corporate.
 */
const year = new Date().getFullYear();
</script>

<template>
  <footer class="app-footer">
    <div class="app-footer-brand">
      <svg
        class="app-footer-ecg"
        viewBox="0 0 220 36"
        preserveAspectRatio="none"
        role="img"
        aria-label="ECG sinus rhythm trace"
      >
        <!-- Lead-in baseline -->
        <path
          d="M 0 18 L 20 18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <!-- P-QRS-T complex repeats twice — pure SVG, animated via stroke-dasharray. -->
        <path
          class="ecg-trace"
          d="M 20 18 Q 26 18 30 14 Q 34 18 38 18 L 46 18 L 48 24 L 52 6 L 56 30 L 60 18 L 70 18 Q 76 14 80 18 L 90 18 L 92 22 L 96 14 L 100 18 L 110 18 Q 116 18 120 14 Q 124 18 128 18 L 136 18 L 138 24 L 142 6 L 146 30 L 150 18 L 160 18 Q 166 14 170 18 L 220 18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <div class="app-footer-name">
        <p class="app-footer-mark">APEX DENTAL</p>
        <p class="app-footer-tagline">Moderate IV Sedation Companion</p>
      </div>
    </div>
    <p class="app-footer-meta">
      © {{ year }} Apex Dental · Sedation Pro · clinical&nbsp;v{{ CLINICAL_LIB_VERSION }} ·
      ui&nbsp;v{{ UI_LIB_VERSION }}
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
  background: rgba(11, 20, 34, 0.6);
}
.app-footer-brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.app-footer-ecg {
  height: 28px;
  width: 140px;
  color: var(--color-good);
  overflow: visible;
}
/* Animated trace: the path is drawn with a moving dash pattern so the
   waveform scrolls right-to-left like a real bedside monitor. */
.ecg-trace {
  stroke-dasharray: 240 240;
  stroke-dashoffset: 0;
  filter: drop-shadow(0 0 4px rgba(74, 222, 128, 0.45));
  animation: ecg-pulse 3.2s linear infinite;
}
@keyframes ecg-pulse {
  0% {
    stroke-dashoffset: 240;
  }
  100% {
    stroke-dashoffset: -240;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ecg-trace {
    animation: none;
  }
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
