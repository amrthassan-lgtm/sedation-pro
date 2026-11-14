<script setup lang="ts">
/**
 * The one thing on every screen. A training tool that shares a tablet with a
 * clinical one must never be mistaken for it, so this band is fixed above
 * everything, sheets included, and says so in words, not only in colour.
 */
</script>

<template>
  <div class="band" role="note">
    <span class="band-stripes" aria-hidden="true"></span>
    <span class="band-text">TRAINING · NOT A PATIENT</span>
    <span class="band-stripes" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.band {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 200;
  height: calc(var(--band-h) + var(--safe-top));
  padding-top: var(--safe-top);
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  background: var(--train);
  color: var(--train-ink);
}
.band-text {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.14em;
  white-space: nowrap;
}
.band-stripes {
  flex: 1;
  height: 100%;
  background: repeating-linear-gradient(
    -45deg,
    transparent 0 10px,
    color-mix(in srgb, var(--train-ink) 22%, transparent) 10px 20px
  );
}
</style>
