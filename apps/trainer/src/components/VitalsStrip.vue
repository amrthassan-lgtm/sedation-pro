<script setup lang="ts">
import type { MonitorView, Voice } from '@/engine/types';

/**
 * What a sheet would otherwise hide: the monitor's numbers and the last
 * thing anyone said. The patient keeps changing while a drawer is open.
 */
defineProps<{ monitor: MonitorView; said: Voice | null }>();
</script>

<template>
  <div class="strip mono">
    <span class="v v--hr">HR {{ monitor.hr }}</span>
    <span class="v v--spo2" :class="{ 'is-low': monitor.alarms.includes('spo2_low') }">
      SpO₂ {{ monitor.spo2 }}
    </span>
    <span class="v v--co2">EtCO₂ {{ monitor.etco2 ?? '--' }}</span>
    <span class="v v--co2">RR {{ monitor.rr }}</span>
    <span class="v v--bp">
      BP {{ monitor.nibp ? `${monitor.nibp.sbp}/${monitor.nibp.dbp}` : '--/--' }}
    </span>
  </div>
  <p v-if="said" class="said">
    <span class="eyebrow">{{ said.who }}</span> {{ said.line }}
  </p>
</template>

<style scoped>
.strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1) var(--sp-4);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
}
.v--hr {
  color: var(--mon-ecg);
}
.v--spo2 {
  color: var(--mon-spo2);
}
.v--co2 {
  color: var(--mon-co2);
}
.v--bp {
  color: var(--mon-nibp);
}
.is-low {
  color: var(--mon-alarm);
}
.said {
  margin: var(--sp-1) 0 0;
  font-family: var(--font-system);
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
}
</style>
