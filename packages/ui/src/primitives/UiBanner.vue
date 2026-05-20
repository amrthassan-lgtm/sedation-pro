<script setup lang="ts">
import type { BannerTone } from '../primitive-types';

interface Props {
  tone?: BannerTone;
  title?: string | undefined;
  icon?: string | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  tone: 'neutral',
  title: undefined,
  icon: undefined,
});
</script>

<template>
  <div class="ui-banner" :class="`ui-banner--${props.tone}`">
    <span v-if="props.icon" class="ui-banner-icon" aria-hidden="true">{{ props.icon }}</span>
    <div class="ui-banner-body">
      <p v-if="props.title" class="ui-banner-title">{{ props.title }}</p>
      <div class="ui-banner-content"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.ui-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: 14px 16px;
  border-radius: var(--r-md);
  /* The tinted variant fill carries the meaning — no border. */
  background: var(--color-surface);
}
.ui-banner-icon {
  font-size: 16px;
  line-height: 1.5;
  flex-shrink: 0;
}
.ui-banner-body {
  flex: 1;
  min-width: 0;
}
.ui-banner-title {
  margin: 0 0 4px;
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.3px;
}
.ui-banner-content {
  font-size: var(--type-body);
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.ui-banner--info {
  background: var(--color-accent-soft);
}
.ui-banner--info .ui-banner-title {
  color: var(--color-accent);
}
.ui-banner--safe {
  background: var(--color-good-soft);
}
.ui-banner--safe .ui-banner-title {
  color: var(--color-good);
}
.ui-banner--caution {
  background: var(--color-warn-soft);
}
.ui-banner--caution .ui-banner-title {
  color: var(--color-warn);
}
.ui-banner--limit {
  background: var(--color-danger-soft);
}
.ui-banner--limit .ui-banner-title {
  color: var(--color-danger);
}
.ui-banner--crisis {
  background: var(--color-crisis-soft);
}
.ui-banner--crisis .ui-banner-title {
  color: var(--color-crisis);
}
</style>
