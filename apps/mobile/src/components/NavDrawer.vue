<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';

import { useSessionStore, type Phase } from '@/stores/session';
import { usePatientStore } from '@/stores/patient';
import { useEventLogStore } from '@/stores/event-log';

interface NavPhaseEntry {
  id: Phase;
  number: number | null;
  title: string;
  sub: string;
  iconTint: string;
  route: string;
  locked: boolean;
}

const router = useRouter();
const session = useSessionStore();
const patient = usePatientStore();
const eventLog = useEventLogStore();

const { drawerOpen, currentPhase } = storeToRefs(session);
const { name: patientName, mrn, age, completeness, isPhase1Complete } = storeToRefs(patient);
const { count: eventCount } = storeToRefs(eventLog);

const initial = computed(() => {
  const raw = patientName.value.trim();
  if (!raw) return 'PT';
  const parts = raw.split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
});

const phaseEntries = computed<NavPhaseEntry[]>(() => {
  const gated = !isPhase1Complete.value;
  return [
    {
      id: 'phase1',
      number: 1,
      title: 'Pre-Sedation Assessment',
      sub: 'Patient info, vitals, history',
      iconTint: 'ph1',
      route: '/phase/1',
      locked: false,
    },
    {
      id: 'phase2',
      number: 2,
      title: 'Oral Sedation',
      sub: gated ? 'Complete Phase 1 to unlock' : 'Pre-op anxiolytic',
      iconTint: 'ph2',
      route: '/phase/2',
      locked: gated,
    },
    {
      id: 'phase3',
      number: 3,
      title: 'IV Sedation & Procedure',
      sub: gated ? 'Complete Phase 1 to unlock' : 'Drug administration',
      iconTint: 'ph3',
      route: '/phase/3',
      locked: gated,
    },
    {
      id: 'phase4',
      number: 4,
      title: 'Recovery & Discharge',
      sub: gated ? 'Complete Phase 1 to unlock' : 'Note, signature, release',
      iconTint: 'ph4',
      route: '/phase/4',
      locked: gated,
    },
  ];
});

const quickRefActive = computed(() => currentPhase.value === 'quickref');

async function go(target: NavPhaseEntry) {
  if (target.locked) return;
  await router.push(target.route);
  session.closeDrawer();
}

async function goQuickRef() {
  await router.push('/quick-reference');
  session.closeDrawer();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="drawerOpen" class="nav-overlay" role="presentation" @click="session.closeDrawer()" />
    <aside
      class="nav-drawer"
      :class="{ 'is-open': drawerOpen }"
      :aria-hidden="!drawerOpen"
      role="navigation"
      aria-label="Sedation workflow"
    >
      <header class="nav-summary">
        <div class="nav-summary-top">
          <div class="nav-avatar" aria-hidden="true">{{ initial }}</div>
          <div class="nav-patient">
            <div class="nav-patient-name">{{ patientName.trim() || 'No patient' }}</div>
            <div class="nav-patient-meta">
              <template v-if="mrn || age">
                <span v-if="mrn">MRN {{ mrn }}</span>
                <span v-if="mrn && age"> · </span>
                <span v-if="age">{{ age }} y/o</span>
              </template>
              <span v-else>Enter patient details to begin</span>
            </div>
          </div>
        </div>
        <div class="nav-sum-pills">
          <div class="nav-sum-pill">
            <div class="nav-sum-pill-label">Clearance</div>
            <div class="nav-sum-pill-value">{{ completeness.percent }}%</div>
          </div>
          <div class="nav-sum-pill">
            <div class="nav-sum-pill-label">Events</div>
            <div class="nav-sum-pill-value">{{ eventCount }}</div>
          </div>
          <div class="nav-sum-pill">
            <div class="nav-sum-pill-label">Status</div>
            <div class="nav-sum-pill-value" :class="{ good: isPhase1Complete }">
              {{ isPhase1Complete ? 'Ready' : 'Hold' }}
            </div>
          </div>
        </div>
      </header>

      <nav class="nav-section">
        <p class="nav-section-label">Reference</p>
        <button
          type="button"
          class="nav-phase nav-phase--qr"
          :class="{ 'is-current': quickRefActive }"
          @click="goQuickRef"
        >
          <span class="nav-phase-icon nav-phase-icon--qr" aria-hidden="true">📖</span>
          <span class="nav-phase-main">
            <span class="nav-phase-title">Quick Reference</span>
            <span class="nav-phase-sub">Drugs · ACLS · emergencies</span>
          </span>
          <span class="nav-phase-chevron" aria-hidden="true">›</span>
        </button>
      </nav>

      <nav class="nav-section">
        <p class="nav-section-label">Sedation Session</p>
        <button
          v-for="entry in phaseEntries"
          :key="entry.id"
          type="button"
          class="nav-phase"
          :class="[
            `nav-phase--${entry.iconTint}`,
            {
              'is-current': currentPhase === entry.id,
              'is-locked': entry.locked,
            },
          ]"
          :disabled="entry.locked"
          :aria-disabled="entry.locked"
          @click="go(entry)"
        >
          <span
            class="nav-phase-icon"
            :class="`nav-phase-icon--${entry.iconTint}`"
            aria-hidden="true"
          >
            <span v-if="entry.locked">🔒</span>
            <span v-else>{{ entry.number }}</span>
          </span>
          <span class="nav-phase-main">
            <span class="nav-phase-title">{{ entry.title }}</span>
            <span class="nav-phase-sub">{{ entry.sub }}</span>
          </span>
          <span class="nav-phase-chevron" aria-hidden="true">
            {{ currentPhase === entry.id ? '⌄' : '›' }}
          </span>
        </button>
      </nav>
    </aside>
  </Teleport>
</template>

<style scoped>
.nav-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 9991;
  backdrop-filter: blur(3px);
}

.nav-drawer {
  position: fixed;
  left: -288px;
  top: 0;
  width: 288px;
  height: 100%;
  background: #0b1422;
  border-right: 1px solid var(--color-border);
  z-index: 9992;
  overflow-y: auto;
  transition: left var(--dur-250) var(--ease-standard);
  display: flex;
  flex-direction: column;
}
.nav-drawer.is-open {
  left: 0;
}

.nav-summary {
  padding: 16px 18px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(59, 130, 246, 0.04), transparent);
}
.nav-summary-top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.nav-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent), var(--color-purple));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--type-heading);
  font-weight: var(--weight-bold);
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
  letter-spacing: -0.3px;
}
.nav-patient {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.nav-patient-name {
  font-size: var(--type-body);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nav-patient-meta {
  font-size: var(--type-caption);
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
  margin-top: 2px;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-sum-pills {
  display: flex;
  gap: 6px;
}
.nav-sum-pill {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--r-sm);
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.nav-sum-pill-label {
  font-size: 9px;
  font-weight: var(--weight-bold);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--color-text-disabled);
}
.nav-sum-pill-value {
  font-size: var(--type-caption);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
}
.nav-sum-pill-value.good {
  color: var(--color-good);
}

.nav-section {
  padding: 14px 0 0;
}
.nav-section-label {
  margin: 0 16px 8px;
  font-size: 9px;
  font-weight: var(--weight-bold);
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
}

.nav-phase {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  text-align: left;
  color: var(--color-text-primary);
  -webkit-tap-highlight-color: transparent;
  transition: background var(--dur-150) var(--ease-standard);
}
.nav-phase:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.04);
}
.nav-phase.is-current {
  background: rgba(255, 255, 255, 0.03);
}
.nav-phase.is-locked {
  opacity: 0.4;
  cursor: not-allowed;
}

.nav-phase-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--r-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: var(--weight-bold);
  color: #fff;
  flex-shrink: 0;
}
.nav-phase-icon--ph1 {
  background: linear-gradient(135deg, var(--ph1-color), #2563eb);
}
.nav-phase-icon--ph2 {
  background: linear-gradient(135deg, var(--ph2-color), #7c3aed);
}
.nav-phase-icon--ph3 {
  background: linear-gradient(135deg, var(--ph3-color), #ea580c);
}
.nav-phase-icon--ph4 {
  background: linear-gradient(135deg, var(--ph4-color), #16a34a);
}
.nav-phase-icon--qr {
  background: linear-gradient(135deg, #14b8a6, #0d9488);
}
.nav-phase.is-locked .nav-phase-icon {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.3);
}

.nav-phase-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-phase-title {
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
  line-height: 1.2;
}
.nav-phase.is-locked .nav-phase-title {
  color: var(--color-text-tertiary);
}
.nav-phase-sub {
  font-size: var(--type-caption);
  color: var(--color-text-disabled);
  letter-spacing: 0.2px;
}

.nav-phase-chevron {
  font-size: 15px;
  color: var(--color-text-disabled);
  flex-shrink: 0;
  line-height: 1;
}
.nav-phase.is-current .nav-phase-chevron {
  color: var(--color-text-secondary);
}
</style>
