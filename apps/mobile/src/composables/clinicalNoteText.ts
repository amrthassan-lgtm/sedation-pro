import type { ClinicalNote } from './useClinicalNote';

const WIDTH = 52;

/**
 * Serialize a ClinicalNote into plain text for the clipboard-copy button and
 * the Web Share text payload.
 *
 * The printed / shared PDF stays the formal medicolegal artifact — this is
 * the paste-into-EHR / paste-into-email companion, so it favours a clean
 * monospace-friendly layout over visual fidelity. Pure (string in → string
 * out, deterministic for a given note) so it's unit-tested rather than only
 * exercised through the rendered component.
 */
export function clinicalNoteToText(note: ClinicalNote): string {
  const lines: string[] = [];
  const major = '='.repeat(WIDTH);
  const minor = '-'.repeat(WIDTH);

  lines.push('APEX DENTAL — Moderate IV Sedation · Clinical Record');
  lines.push(major);
  lines.push(`Patient:          ${note.header.patient}`);
  lines.push(`MRN:              ${note.header.mrn}`);
  lines.push(`Date of service:  ${note.header.date}`);
  lines.push(`Provider:         ${note.header.provider}`);
  lines.push(`Dental assistant: ${note.header.assistants}`);
  lines.push(`Procedure:        ${note.header.procedure}`);

  if (note.narrative.length > 0) {
    lines.push('');
    lines.push('CLINICAL NARRATIVE');
    lines.push(minor);
    for (const paragraph of note.narrative) lines.push(paragraph);
  }

  for (const section of note.sections) {
    lines.push('');
    lines.push(section.heading.toUpperCase());
    lines.push(minor);
    for (const [label, value] of section.rows) {
      lines.push(`${label}: ${value}`);
    }
  }

  if (note.chronology.length > 0) {
    lines.push('');
    lines.push('CHRONOLOGICAL RECORD');
    lines.push(minor);
    for (const row of note.chronology) {
      const detail = row.detail ? `  —  ${row.detail}` : '';
      lines.push(`${row.time}  ${row.event}${detail}`);
    }
  }

  lines.push('');
  lines.push('SIGNATURES');
  lines.push(minor);
  const providerState = note.signatures.providerDataUrl
    ? `signed${note.signatures.signedAt ? ` · ${note.signatures.signedAt}` : ''}`
    : 'NOT SIGNED';
  lines.push(`Provider: ${providerState}`);
  lines.push(`Responsible companion: ${note.signatures.companion || '—'}`);

  lines.push('');
  lines.push(major);
  lines.push(`Generated ${note.generatedAt} · Sedation Pro v0.1`);

  return lines.join('\n');
}
