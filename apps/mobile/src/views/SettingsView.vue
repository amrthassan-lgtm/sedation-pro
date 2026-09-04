<script setup lang="ts">
import { computed, ref } from 'vue';

import { UiBanner, UiButton, UiCard, UiField, UiStack, UiTextInput } from '@sedation-pro/ui';

import PicklistEditor from '@/components/PicklistEditor.vue';
import { useFormularyStore, type PicklistKey } from '@/stores/formulary';
import {
  clearCredentials,
  readCredentials,
  writeCredentials,
  type OdCredentials,
} from '@/services/od-credentials';
import { describeOdError, getPatient, isOdError } from '@/services/opendental';

/**
 * Practice setup: the roster and pick-lists this office runs on, plus the
 * Open Dental pairing.
 *
 * The API keys live in this device's localStorage and nowhere else — never in
 * the repo, the bundle, or any committed file. They are entered once, on the
 * one tablet that files notes to the chart.
 *
 * Drug data — concentrations, ceilings, wait windows — is deliberately absent.
 * Those are clinical safety values on a separate tier and stay a code change
 * until the gated editor exists.
 */

const formulary = useFormularyStore();

/**
 * Grouped so the roster a practice actually edits at setup sits above the
 * vocabulary they rarely touch. `firstIsDefault` marks the two lists whose
 * head entry pre-fills a new case.
 */
const PICKLIST_GROUPS: ReadonlyArray<{
  readonly title: string;
  readonly lists: ReadonlyArray<{
    readonly key: PicklistKey;
    readonly label: string;
    readonly hint?: string;
    readonly firstIsDefault?: boolean;
  }>;
}> = [
  {
    title: 'Staff',
    lists: [
      {
        key: 'providers',
        label: 'Sedation providers',
        hint: 'Named as the attending provider on the note.',
        firstIsDefault: true,
      },
      {
        key: 'dentalAssistants',
        label: 'Dental assistants',
        hint: 'Include the credential — the name prints on the note exactly as typed.',
        firstIsDefault: true,
      },
    ],
  },
  {
    title: 'IV supplies',
    lists: [
      { key: 'ivSites', label: 'IV sites', firstIsDefault: true },
      { key: 'ivFluids', label: 'IV fluids', firstIsDefault: true },
      { key: 'catheterGauges', label: 'Catheter gauges', firstIsDefault: true },
    ],
  },
  {
    title: 'Note vocabulary',
    lists: [
      { key: 'companionRelations', label: 'Companion relations' },
      {
        key: 'sedationComplications',
        label: 'Sedation complications',
        hint: 'Quick-fill terms only. The free-text note stays the record.',
      },
      { key: 'venipunctureComplications', label: 'Venipuncture complications' },
    ],
  },
];

const stored = readCredentials();
const developerKey = ref(stored?.developerKey ?? '');
const customerKey = ref(stored?.customerKey ?? '');

/**
 * Tracks what is actually in storage, not what is typed. Showing "connected"
 * off the input boxes would claim a pairing the app hasn't got.
 */
const savedPair = ref<OdCredentials | null>(stored);
const isStored = computed(() => savedPair.value !== null);

const dirty = computed(
  () =>
    developerKey.value.trim() !== (savedPair.value?.developerKey ?? '') ||
    customerKey.value.trim() !== (savedPair.value?.customerKey ?? ''),
);
const canSave = computed(
  () => developerKey.value.trim() !== '' && customerKey.value.trim() !== '' && dirty.value,
);

const saveNote = ref('');

function save(): void {
  const ok = writeCredentials({
    developerKey: developerKey.value,
    customerKey: customerKey.value,
  });
  if (ok) {
    savedPair.value = readCredentials();
    saveNote.value = 'Keys saved on this device.';
  } else {
    saveNote.value = 'Could not save — this browser is refusing to store data.';
  }
  testResult.value = null;
}

function forget(): void {
  clearCredentials();
  savedPair.value = null;
  developerKey.value = '';
  customerKey.value = '';
  saveNote.value = 'Keys removed from this device.';
  testResult.value = null;
}

// -------- Test connection --------------------------------------------------

const testPatNum = ref('');
const testing = ref(false);
const testResult = ref<{ ok: boolean; message: string } | null>(null);

const canTest = computed(() => isStored.value && !dirty.value && testPatNum.value.trim() !== '');

async function testConnection(): Promise<void> {
  const creds = readCredentials();
  if (creds === null) {
    testResult.value = { ok: false, message: 'No keys saved on this device yet.' };
    return;
  }
  const patNum = Number(testPatNum.value.trim());
  if (!Number.isInteger(patNum) || patNum <= 0) {
    testResult.value = { ok: false, message: 'Patient ID must be a positive whole number.' };
    return;
  }

  testing.value = true;
  testResult.value = null;
  try {
    const patient = await getPatient(patNum, creds);
    testResult.value = {
      ok: true,
      message: `Connected. Patient ${patNum} is ${patient.LName}, ${patient.FName}.`,
    };
  } catch (error) {
    testResult.value = {
      ok: false,
      message: isOdError(error)
        ? describeOdError(error)
        : 'The connection test failed for an unrecognised reason.',
    };
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <main class="phase-view">
    <header class="phase-hero">
      <p class="caption">Practice</p>
      <h1 class="title-display">Settings</h1>
    </header>

    <h2 class="settings-section">This practice</h2>

    <UiCard>
      <p class="heading">Practice name</p>
      <p class="settings-note mt-1">Prints on the note letterhead and in the narrative.</p>
      <UiStack :gap="3" class="mt-2">
        <UiField label="Name">
          <UiTextInput
            v-model="formulary.practiceNameOverride"
            :placeholder="formulary.practiceName"
          />
        </UiField>
        <p class="settings-note">Leave it blank to use the shipped name.</p>
      </UiStack>
    </UiCard>

    <template v-for="group in PICKLIST_GROUPS" :key="group.title">
      <p class="settings-group">{{ group.title }}</p>
      <PicklistEditor
        v-for="list in group.lists"
        :key="list.key"
        :label="list.label"
        :hint="list.hint"
        :entries="formulary.picklists[list.key]"
        :overridden="formulary.isOverridden(list.key)"
        :first-is-default="list.firstIsDefault"
        @update="formulary.setList(list.key, $event)"
        @restore="formulary.restoreList(list.key)"
      />
    </template>

    <h2 class="settings-section">Open Dental</h2>

    <UiBanner v-if="isStored" tone="info" title="Keys are saved on this device">
      Saved keys are not proof of a working connection. Run the test below to confirm Open Dental
      accepts them.
    </UiBanner>
    <UiBanner v-else tone="caution" title="Not connected">
      Without keys, Send to chart stays switched off. Everything else in the app works exactly as it
      does now.
    </UiBanner>

    <UiCard>
      <p class="heading">API keys</p>
      <UiStack :gap="3" class="mt-2">
        <UiField label="Developer key" required>
          <UiTextInput
            v-model="developerKey"
            type="password"
            placeholder="Paste the developer key"
          />
        </UiField>
        <UiField label="Customer key" required>
          <UiTextInput v-model="customerKey" type="password" placeholder="Paste the customer key" />
        </UiField>

        <UiButton tone="primary" block :disabled="!canSave" @click="save">
          {{ isStored ? 'Update keys' : 'Save keys' }}
        </UiButton>
        <UiButton v-if="isStored" tone="neutral" block @click="forget">
          Remove keys from this device
        </UiButton>
        <p v-if="saveNote" class="settings-note">{{ saveNote }}</p>
      </UiStack>
    </UiCard>

    <UiCard>
      <p class="heading">Test connection</p>
      <p class="settings-note mt-1">Reads one patient record. Nothing is written to the chart.</p>
      <UiStack :gap="3" class="mt-2">
        <UiField label="Patient ID (the number you put in MRN)">
          <UiTextInput
            v-model="testPatNum"
            type="tel"
            inputmode="numeric"
            placeholder="e.g. 1234"
          />
        </UiField>
        <UiButton tone="neutral" block :disabled="!canTest || testing" @click="testConnection">
          {{ testing ? 'Testing…' : 'Test connection' }}
        </UiButton>
        <p v-if="dirty && isStored" class="settings-note">Save the changed keys before testing.</p>
        <UiBanner v-if="testResult" :tone="testResult.ok ? 'safe' : 'limit'">
          {{ testResult.message }}
        </UiBanner>
      </UiStack>
    </UiCard>

    <UiCard>
      <p class="heading">What these keys allow</p>
      <UiStack :gap="2" class="mt-2">
        <p class="settings-body">
          These keys grant <strong>read and write access to the entire patient database</strong>,
          not just to sedation notes. Anyone who can unlock this tablet can use them.
        </p>
        <p class="settings-body">
          Keep a screen lock on the device. If it is lost or replaced, generate new keys in Open
          Dental so the old ones stop working.
        </p>
        <p class="settings-body">
          The keys are stored only in this browser on this device. They are never sent anywhere
          except to Open Dental itself, and they are not in the app's code.
        </p>
      </UiStack>
    </UiCard>
  </main>
</template>

<style scoped>
/* `.phase-view` is a per-view scoped rule, not a global one — each standalone
   screen declares its own. Without this the page renders full-bleed while
   every other screen is a centred 760px column. */
.phase-view {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-4) var(--sp-7);
  max-width: 760px;
  margin-inline: auto;
}
.settings-section {
  font-size: var(--type-title3, 1.125rem);
  font-weight: 650;
  margin: var(--sp-4) 0 0;
}
.settings-section:first-of-type {
  margin-top: 0;
}
.settings-group {
  font-size: var(--type-footnote);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-secondary);
  margin: var(--sp-2) 0 calc(var(--sp-2) * -1);
}
.settings-note {
  font-size: var(--type-footnote);
  color: var(--color-text-secondary);
}
.settings-body {
  font-size: var(--type-body);
  color: var(--color-text-secondary);
  line-height: 1.5;
}
</style>
