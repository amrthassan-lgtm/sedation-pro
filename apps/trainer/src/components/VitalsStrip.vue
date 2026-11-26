<script setup lang="ts">
import type { MonitorView, Prompt, Voice } from '@/engine/types';

/**
 * What a sheet would otherwise hide: the monitor's numbers, the last thing
 * anyone said, and a question someone is waiting on. The patient keeps
 * changing while a drawer is open, and a question asked behind it would
 * otherwise go unseen and unanswered. A question with one answer has one way
 * forward, so that answer is the white button.
 */
defineProps<{ monitor: MonitorView; said: Voice | null; prompt?: Prompt | null }>();
const emit = defineEmits<{ (e: 'answer', optionId: string): void }>();
</script>

<template>
  <div class="strip mono">
    <span class="v v--hr">HR {{ monitor.hr }}</span>
    <span class="v v--spo2" :class="{ 'is-low': monitor.alarms.includes('spo2_low') }">
      SpO₂ {{ monitor.perfusion > 0 ? monitor.spo2 : '--' }}
    </span>
    <span class="v v--co2">EtCO₂ {{ monitor.etco2 ?? '--' }}</span>
    <span class="v v--co2">RR {{ monitor.rr }}</span>
    <span class="v v--bp">
      BP {{ monitor.nibp ? `${monitor.nibp.sbp}/${monitor.nibp.dbp}` : '--/--' }}
    </span>
  </div>
  <div v-if="prompt" class="ask" role="group" aria-label="Decision">
    <p class="said">
      <span class="eyebrow">{{ prompt.voice.who }}</span> {{ prompt.voice.line }}
    </p>
    <div class="ask-options">
      <button
        v-for="o in prompt.options"
        :key="o.id"
        type="button"
        class="btn"
        :class="{ 'btn--key': prompt.options.length === 1 }"
        @click="emit('answer', o.id)"
      >
        {{ o.label }}
      </button>
    </div>
  </div>
  <p v-else-if="said" class="said">
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
.ask-options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
}
.ask-options .btn {
  flex: 1 1 auto;
  font-family: var(--font-system);
}
.said {
  margin: var(--sp-1) 0 0;
  font-family: var(--font-system);
  font-size: var(--type-body);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
}
</style>
