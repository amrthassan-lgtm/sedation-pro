<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useClinicalNote } from '@/composables/useClinicalNote';
import { clinicalNoteToText } from '@/composables/clinicalNoteText';
import { UiButton } from '@sedation-pro/ui';

const router = useRouter();
const note = useClinicalNote();
// Single-source logo (same asset as the favicon / PWA icon). BASE_URL so it
// resolves under the GitHub Pages subpath and a custom-domain root alike.
const logoSrc = `${import.meta.env.BASE_URL}logo-source.svg`;

function goBack() {
  void router.back();
}

function printNote() {
  if (typeof window !== 'undefined') {
    window.print();
  }
}

// "Copy note" → plain text to clipboard. Works on every browser incl.
// desktop, no Web Share dependency. Pairs with the printed/shared PDF: PDF
// is the formal record, this is the paste-into-EHR / paste-into-email copy.
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

async function copyNote() {
  const text = clinicalNoteToText(note.value);
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      throw new Error('clipboard unavailable');
    }
    await navigator.clipboard.writeText(text);
    copyState.value = 'copied';
  } catch {
    copyState.value = 'failed';
  }
  if (copyResetTimer !== null) clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    copyState.value = 'idle';
    copyResetTimer = null;
  }, 2500);
}

const copyLabel = computed(() =>
  copyState.value === 'copied'
    ? '✓ Copied'
    : copyState.value === 'failed'
      ? 'Copy failed'
      : 'Copy text',
);

const supportsShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

async function shareNote() {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;
  // Share the serialized note text itself — not a dead SPA URL. The
  // recipient gets the actual record in the message body (Mail, Notes,
  // Messages, etc.). The PDF, when needed, goes via Print → Save as PDF.
  const payload: ShareData = {
    title: `Sedation note · ${note.value.header.patient}`,
    text: clinicalNoteToText(note.value),
  };
  try {
    await navigator.share(payload);
  } catch {
    // User cancelled or share failed — no-op.
  }
}
</script>

<template>
  <main class="note-view">
    <header class="toolbar no-print">
      <UiButton tone="neutral" @click="goBack">← Back</UiButton>
      <h1 class="toolbar-title">Clinical Note</h1>
      <div class="toolbar-actions">
        <UiButton tone="neutral" @click="copyNote">{{ copyLabel }}</UiButton>
        <UiButton v-if="supportsShare" tone="primary" @click="shareNote">Share</UiButton>
        <UiButton tone="success" @click="printNote">Print</UiButton>
      </div>
    </header>

    <article class="note-paper">
      <header class="note-header">
        <div class="note-brand">
          <img class="brand-logo" :src="logoSrc" alt="" width="44" height="44" />
          <div class="note-brand-text">
            <p class="brand-mark">APEX DENTAL</p>
            <p class="brand-sub">Moderate IV Sedation · Clinical Record</p>
          </div>
        </div>
        <dl class="note-meta">
          <dt>Patient</dt>
          <dd>
            <strong>{{ note.header.patient }}</strong>
          </dd>
          <dt>MRN</dt>
          <dd>{{ note.header.mrn }}</dd>
          <dt>Date of service</dt>
          <dd>{{ note.header.date }}</dd>
          <dt>Provider</dt>
          <dd>{{ note.header.provider }}</dd>
          <dt>Dental assistant</dt>
          <dd>{{ note.header.assistants }}</dd>
          <dt>Procedure</dt>
          <dd>{{ note.header.procedure }}</dd>
          <dt>Disposition</dt>
          <dd>
            <strong v-if="note.disposition.released" class="note-final">
              Final — patient released {{ note.disposition.at }}
            </strong>
            <strong v-else class="note-prelim">Preliminary — patient not yet released</strong>
          </dd>
        </dl>
      </header>

      <section v-if="note.narrative.length > 0" class="note-section narrative">
        <h2>Clinical Narrative</h2>
        <p v-for="(paragraph, idx) in note.narrative" :key="idx" class="narrative-p">
          {{ paragraph }}
        </p>
      </section>

      <section v-for="section in note.sections" :key="section.heading" class="note-section">
        <h2>{{ section.heading }}</h2>
        <dl class="note-grid">
          <template v-for="(row, index) in section.rows" :key="`${section.heading}-${index}`">
            <dt>{{ row[0] }}</dt>
            <dd>{{ row[1] }}</dd>
          </template>
        </dl>
      </section>

      <section v-if="note.chronology.length > 0" class="note-section">
        <h2>Chronological Record</h2>
        <table class="note-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in note.chronology" :key="idx">
              <td class="time">{{ row.time }}</td>
              <td class="event">{{ row.event }}</td>
              <td class="details">{{ row.detail }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="note-section signatures">
        <h2>Signature</h2>
        <div class="sig-grid">
          <div class="sig-block">
            <p class="sig-label">Provider</p>
            <img
              v-if="note.signatures.providerDataUrl"
              :src="note.signatures.providerDataUrl"
              alt="Provider signature"
              class="sig-img"
            />
            <div v-else class="sig-empty">— unsigned —</div>
            <p class="sig-name">{{ note.header.provider }}</p>
          </div>
          <div class="sig-block">
            <p class="sig-label">Responsible companion</p>
            <div class="sig-empty">Signed on printed post-op form</div>
            <p class="sig-name">{{ note.signatures.companion }}</p>
          </div>
        </div>
      </section>

      <footer class="note-footer">Generated {{ note.generatedAt }} · Sedation Pro v0.1</footer>
    </article>
  </main>
</template>

<style scoped>
.note-view {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-4) var(--sp-7);
  max-width: 880px;
  margin-inline: auto;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.toolbar-title {
  flex: 1;
  margin: 0;
  font-size: var(--type-title);
  font-weight: var(--weight-bold);
  letter-spacing: var(--tracking-tight);
}
.toolbar-actions {
  display: flex;
  gap: var(--sp-2);
}

/* The "paper" — light surface with dark ink so the printed page reads as
   a real chart entry, not a dark-mode screenshot. */
.note-paper {
  background: #fafaf7;
  color: #1f2937;
  border-radius: var(--r-lg);
  padding: var(--sp-6) var(--sp-5);
  box-shadow:
    0 2px 12px rgba(0, 0, 0, 0.18),
    0 12px 28px rgba(0, 0, 0, 0.18);
  font-family: 'Georgia', 'Iowan Old Style', 'Times New Roman', Georgia, serif;
  font-size: 11pt;
  line-height: 1.55;
}

.note-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-4);
  border-bottom: 2px solid #0369a1;
  padding-bottom: var(--sp-4);
  margin-bottom: var(--sp-4);
}
.note-brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}
.brand-logo {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  flex-shrink: 0;
}
.note-brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.brand-mark {
  margin: 0;
  font-family: var(--font-system);
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: #0369a1;
}
.brand-sub {
  margin: 0;
  font-size: 9.5pt;
  color: #6b7280;
}
.note-meta {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  font-size: 9.5pt;
  font-family: var(--font-system);
}
.note-meta dt {
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 8pt;
}
.note-meta dd {
  margin: 0;
  color: #1f2937;
}
/* Paper-palette status colours (this view is a printed-document theme,
   not the app tokens): final = clinical green, preliminary = amber. */
.note-final {
  color: #15803d;
}
.note-prelim {
  color: #b45309;
}

.note-section {
  margin-top: var(--sp-4);
}
.note-section h2 {
  font-family: var(--font-system);
  font-size: 10pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #0369a1;
  border-bottom: 1px solid #bae6fd;
  padding-bottom: 4px;
  margin: 0 0 var(--sp-2);
}
.narrative-p {
  margin: 0 0 var(--sp-3);
  text-align: justify;
  text-justify: inter-word;
  color: #1f2937;
  font-size: 11pt;
  line-height: 1.65;
}
.narrative-p:last-child {
  margin-bottom: 0;
}
.note-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
  margin: 0;
  font-size: 10.5pt;
}
.note-grid dt {
  color: #6b7280;
  font-family: var(--font-system);
  font-size: 9pt;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.note-grid dd {
  margin: 0;
  color: #111827;
}

.note-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-system);
  font-size: 9.5pt;
}
.note-table th {
  text-align: left;
  font-size: 8pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #6b7280;
  border-bottom: 1px solid #d1d5db;
  padding: 6px 8px;
}
.note-table td {
  padding: 6px 8px;
  vertical-align: top;
  border-bottom: 1px solid #f3f4f6;
}
.note-table .time {
  font-family: 'Courier New', monospace;
  color: #6b7280;
  white-space: nowrap;
  width: 72px;
}
.note-table .event {
  width: 220px;
  font-weight: 600;
}
.note-table .details {
  color: #374151;
}

.signatures .sig-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-5);
}
.sig-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sig-label {
  margin: 0;
  font-family: var(--font-system);
  font-size: 8pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6b7280;
}
.sig-img {
  display: block;
  height: 64px;
  max-width: 100%;
  border-bottom: 1px solid #111827;
  /*
   * The signature pad draws in white ink on a transparent canvas. Inverting
   * the image flips white → black so the ink reads on the light paper while
   * the transparent background stays transparent. No explicit `background`
   * here — it would invert to black and swallow the ink.
   */
  filter: invert(1);
  -webkit-filter: invert(1);
}
.sig-empty {
  height: 64px;
  display: flex;
  align-items: flex-end;
  padding-bottom: 4px;
  border-bottom: 1px solid #111827;
  color: #9ca3af;
  font-family: var(--font-system);
  font-style: italic;
  font-size: 9pt;
}
.sig-name {
  margin: 0;
  font-family: var(--font-system);
  font-size: 9pt;
  color: #374151;
}

.note-footer {
  margin-top: var(--sp-6);
  padding-top: var(--sp-3);
  border-top: 1px solid #e5e7eb;
  font-family: var(--font-system);
  font-size: 8.5pt;
  color: #9ca3af;
  text-align: center;
}

@media print {
  .no-print {
    display: none !important;
  }
  .note-view {
    padding: 0;
    max-width: none;
  }
  .note-paper {
    box-shadow: none;
    border-radius: 0;
    padding: 0.5in;
  }
  @page {
    margin: 0.5in;
    size: letter;
  }
}
</style>
