<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { UiButton, UiCard, UiListRow, UiModal } from '@sedation-pro/ui';

import PicklistEditor from '@/components/PicklistEditor.vue';
import PinPad from '@/components/PinPad.vue';
import { eraseThisTablet } from '@/composables/useCaseReset';
import { useNow } from '@/composables/useNow';
import { PIN_WAIT_MS, useDeviceStore } from '@/stores/device';
import { useFormularyStore } from '@/stores/formulary';
import { usePatientStore } from '@/stores/patient';

/**
 * The tablet's own front door (owner, Nov 2026). Staff names no longer ship
 * in the code, which is public: each tablet is set up once with its doctors,
 * assistants and a four-digit PIN, and the PIN is asked again after twelve
 * hours without use.
 *
 * - `setup`: first run. Doctors, assistants (optional), then the PIN twice.
 * - `lock`: the PIN. Emergency on the keypad opens the protocols without it.
 * - `change`: from Settings. The current PIN, then the new one twice.
 *
 * Nothing here writes to the case or its event log.
 */
const props = defineProps<{ mode: 'setup' | 'lock' | 'change' }>();
const emit = defineEmits<{ close: [] }>();

const device = useDeviceStore();
const formulary = useFormularyStore();
const patient = usePatientStore();
const router = useRouter();
const now = useNow(1000);
const logoSrc = `${import.meta.env.BASE_URL}logo-source.svg`;

type Step = 'welcome' | 'doctors' | 'assistants' | 'current' | 'pin' | 'confirm' | 'enter';
const step = ref<Step>(
  props.mode === 'setup' ? 'welcome' : props.mode === 'change' ? 'current' : 'enter',
);

const pin = ref('');
const firstPin = ref('');
const message = ref('');
const busy = ref(false);
const forgetOpen = ref(false);

const doctors = computed(() => formulary.picklists.providers);
const assistants = computed(() => formulary.picklists.dentalAssistants);
// Both lists pre-fill every case, so setup needs at least one of each.
const listEmpty = computed(
  () =>
    (step.value === 'doctors' && doctors.value.length === 0) ||
    (step.value === 'assistants' && assistants.value.length === 0),
);

const STEP_OF: Partial<Record<Step, number>> = { doctors: 1, assistants: 2, pin: 3, confirm: 3 };
const stepLabel = computed(() => {
  const n = props.mode === 'setup' ? STEP_OF[step.value] : undefined;
  return n === undefined ? '' : `Step ${n} of 3`;
});

// The ticking clock can lag the moment the wait began by up to a second;
// the countdown never reads more than the wait itself.
const waitSeconds = computed(() => {
  const until = device.waitUntil;
  if (until === null) return 0;
  return Math.min(PIN_WAIT_MS / 1000, Math.max(0, Math.ceil((until - now.value) / 1000)));
});
const padDisabled = computed(() => busy.value || waitSeconds.value > 0);

const title = computed(() => {
  switch (step.value) {
    case 'current':
      return 'Enter your current PIN';
    case 'pin':
      return props.mode === 'change' ? 'Choose a new PIN' : 'Create a PIN';
    case 'confirm':
      return 'Enter it again';
    default:
      return 'Enter PIN';
  }
});

const lede = computed(() => {
  if (waitSeconds.value > 0) return `Too many tries. Try again in ${waitSeconds.value} s.`;
  if (message.value) return message.value;
  switch (step.value) {
    case 'pin':
      return 'Four digits. The app asks for it again after 12 hours without use.';
    case 'confirm':
      return 'The same four digits.';
    case 'current':
      return 'Then choose the new one.';
    default:
      return formulary.practiceName;
  }
});

function emergency(): void {
  void router.push({ name: 'quickref' });
}

function backToAssistants(): void {
  pin.value = '';
  firstPin.value = '';
  message.value = '';
  step.value = 'assistants';
}

/** The first case after setup starts with the names just typed, as every later one will. */
function seedOpenCase(): void {
  if (patient.provider.trim() === '') patient.provider = doctors.value[0] ?? '';
  if (patient.assistants.trim() === '') patient.assistants = assistants.value[0] ?? '';
}

async function onComplete(value: string): Promise<void> {
  message.value = '';
  if (step.value === 'pin') {
    firstPin.value = value;
    pin.value = '';
    step.value = 'confirm';
    return;
  }
  if (step.value === 'confirm') {
    if (value !== firstPin.value) {
      firstPin.value = '';
      pin.value = '';
      step.value = 'pin';
      message.value = 'The two PINs did not match. Choose one again.';
      return;
    }
    busy.value = true;
    await device.setPin(value, Date.now());
    busy.value = false;
    pin.value = '';
    firstPin.value = '';
    if (props.mode === 'setup') seedOpenCase();
    emit('close');
    return;
  }
  // `enter` (lock) and `current` (change) both prove the PIN.
  busy.value = true;
  const result = await device.unlock(value, Date.now());
  busy.value = false;
  pin.value = '';
  if (result === 'ok') {
    if (step.value === 'current') step.value = 'pin';
    else emit('close');
    return;
  }
  if (result === 'wrong') message.value = 'Wrong PIN. Try again.';
}
</script>

<template>
  <div class="gate" :class="{ 'gate--overlay': mode === 'change' }">
    <header class="gate-bar">
      <span class="gate-brand">
        <img :src="logoSrc" alt="" width="28" height="28" />
        <span>Sedation Pro</span>
      </span>
      <UiButton :cooldown-ms="0" v-if="mode === 'change'" tone="nav" compact @click="emit('close')"
        >Cancel</UiButton
      >
      <button
        v-else-if="mode === 'setup'"
        type="button"
        class="gate-emerg"
        aria-label="Open emergency protocols"
        @click="emergency"
      >
        Emergency
      </button>
    </header>

    <main
      class="gate-main"
      :class="{ 'gate-main--pad': ['enter', 'current', 'pin', 'confirm'].includes(step) }"
    >
      <template v-if="step === 'welcome'">
        <img class="gate-logo" :src="logoSrc" alt="" width="72" height="72" />
        <h1 class="gate-title">Set up this tablet</h1>
        <p class="gate-lede">
          Each tablet keeps its own doctors, assistants and PIN. They stay on this tablet and are
          never part of the app's code.
        </p>
        <UiCard>
          <UiListRow :inset="40">
            <template #leading><span class="gate-num">1</span></template>
            <span class="gate-text">
              <span class="gate-row-title">Doctors</span>
              <span class="gate-row-sub">Named as the attending provider on every note</span>
            </span>
          </UiListRow>
          <UiListRow :inset="40">
            <template #leading><span class="gate-num">2</span></template>
            <span class="gate-text">
              <span class="gate-row-title">Assistants</span>
              <span class="gate-row-sub">Named as the dental assistant on every note</span>
            </span>
          </UiListRow>
          <UiListRow :inset="40">
            <template #leading><span class="gate-num">3</span></template>
            <span class="gate-text">
              <span class="gate-row-title">PIN</span>
              <span class="gate-row-sub">Four digits, asked after 12 hours without use</span>
            </span>
          </UiListRow>
        </UiCard>
        <UiButton :cooldown-ms="0" tone="key" block @click="step = 'doctors'">Get started</UiButton>
        <p class="gate-foot">Emergency protocols work before setup and never ask for the PIN.</p>
      </template>

      <template v-else-if="step === 'doctors' || step === 'assistants'">
        <p class="gate-step">{{ stepLabel }}</p>
        <h1 class="gate-title">{{ step === 'doctors' ? 'Doctors' : 'Assistants' }}</h1>
        <p class="gate-lede">
          {{
            step === 'doctors'
              ? 'Named as the attending provider on the note, exactly as typed.'
              : 'Include the credential: the name prints on the note exactly as typed.'
          }}
        </p>
        <PicklistEditor
          v-if="step === 'doctors'"
          key="doctors"
          label="Doctors"
          :entries="doctors"
          :overridden="false"
          first-is-default
          start-open
          @update="formulary.setList('providers', $event)"
        />
        <PicklistEditor
          v-else
          key="assistants"
          label="Assistants"
          :entries="assistants"
          :overridden="false"
          first-is-default
          start-open
          @update="formulary.setList('dentalAssistants', $event)"
        />
        <p class="gate-note">
          {{
            listEmpty
              ? `Add at least one ${step === 'doctors' ? 'doctor' : 'assistant'} to continue.`
              : 'You can change these later in Settings.'
          }}
        </p>
        <div class="gate-actions">
          <UiButton
            :cooldown-ms="0"
            tone="nav"
            compact
            @click="step = step === 'doctors' ? 'welcome' : 'doctors'"
            >Back</UiButton
          >
          <UiButton
            :cooldown-ms="0"
            tone="key"
            compact
            :disabled="listEmpty"
            @click="step = step === 'doctors' ? 'assistants' : 'pin'"
            >Continue</UiButton
          >
        </div>
      </template>

      <template v-else>
        <img
          v-if="step === 'enter'"
          class="gate-logo"
          :src="logoSrc"
          alt=""
          width="64"
          height="64"
        />
        <p v-else-if="stepLabel" class="gate-step">{{ stepLabel }}</p>
        <h1 class="gate-title">{{ title }}</h1>
        <p
          class="gate-lede"
          :class="{ 'gate-lede--alert': message !== '' || waitSeconds > 0 }"
          role="status"
          aria-live="polite"
        >
          {{ lede }}
        </p>
        <PinPad
          v-model="pin"
          :emergency="step === 'enter'"
          :disabled="padDisabled"
          @complete="onComplete"
          @emergency="emergency"
        />
        <button
          v-if="step === 'enter'"
          type="button"
          class="gate-forgot"
          @click="forgetOpen = true"
        >
          Forgot PIN?
        </button>
        <UiButton
          :cooldown-ms="0"
          v-else-if="mode === 'setup'"
          tone="nav"
          compact
          class="gate-back"
          @click="backToAssistants"
          >Back</UiButton
        >
      </template>
    </main>

    <UiModal
      :open="forgetOpen"
      title="Reset this tablet?"
      tone="danger"
      confirm-label="Erase this tablet"
      cancel-label="Cancel"
      @confirm="eraseThisTablet"
      @cancel="forgetOpen = false"
    >
      This erases the names, the PIN and everything stored on this tablet, including any note not
      yet sent to Open Dental. Notes already in Open Dental are not affected. Setup then runs again.
    </UiModal>
  </div>
</template>

<style scoped>
.gate {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  color: var(--color-text-primary);
}
/* Over Settings, under the toast and the modal layers. */
.gate--overlay {
  position: fixed;
  inset: 0;
  z-index: 9995;
  overflow-y: auto;
}
.gate-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64px;
  padding: var(--sp-3) var(--sp-4);
}
.gate-brand {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--type-heading);
  font-weight: var(--weight-semibold);
}
.gate-emerg {
  min-height: 44px;
  padding: 10px 14px;
  border: 0;
  border-radius: var(--r-sm);
  background: var(--color-danger-soft);
  color: var(--color-danger);
  font: inherit;
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
  cursor: pointer;
}
.gate-main {
  flex: 1;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  /* Centred on the tall portrait screen; the bottom pad offsets the top bar. */
  padding: var(--sp-6) var(--sp-4) calc(64px + var(--sp-6));
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--sp-4);
}
.gate-main--pad {
  align-items: center;
  text-align: center;
}
.gate-logo {
  border-radius: var(--r-lg);
}
.gate-step {
  margin: 0;
  font-size: var(--type-footnote);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
}
.gate-title {
  margin: 0;
  font-size: var(--type-display);
  font-weight: var(--weight-bold);
}
.gate-lede,
.gate-note,
.gate-foot {
  margin: 0;
  color: var(--color-text-secondary);
  line-height: var(--leading-normal);
}
.gate-lede {
  font-size: var(--type-body);
}
.gate-lede--alert {
  color: var(--color-warn);
}
.gate-note,
.gate-foot {
  font-size: var(--type-footnote);
}
.gate-foot {
  text-align: center;
}
.gate-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--r-pill);
  background: var(--color-surface-elevated);
  font-size: var(--type-footnote);
  font-weight: var(--weight-bold);
}
.gate-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.gate-row-title {
  font-weight: var(--weight-semibold);
}
.gate-row-sub {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.gate-actions {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: var(--sp-3);
  margin-top: var(--sp-2);
}
.gate-forgot {
  margin-top: var(--sp-5);
  min-height: 44px;
  padding: 0 var(--sp-4);
  border: 0;
  background: none;
  color: var(--color-text-secondary);
  font: inherit;
  font-size: var(--type-body);
  cursor: pointer;
}
.gate-back {
  margin-top: var(--sp-5);
  min-width: 160px;
}
</style>
