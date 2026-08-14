import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { clinicalNoteToPdf } from './clinicalNoteToPdf';
import { sanitizeForWinAnsi, winAnsi, UNMAPPED_REPLACEMENT } from './pdfText';
import { invertRgbPreservingAlpha } from './signatureInvert';
import type { ClinicalNote } from './useClinicalNote';

/**
 * A note shaped like a real one — and deliberately carrying the exact
 * characters the live note builder emits that the PDF base-14 fonts cannot
 * encode:
 *   `SpO₂` (U+2082)  useClinicalNote.ts:262,368,480
 *   `≥6h`  (U+2265)  useClinicalNote.ts:168
 *   ` → `  (U+2192)  useClinicalNote.ts:277
 * Before sanitation existed these threw inside `drawText`, which would have
 * failed the PDF upload on every real case while the plain-ASCII sample note
 * used during API testing passed.
 */
const NOTE: ClinicalNote = {
  header: {
    practice: 'Apex Dental',
    patient: 'Test Patient',
    mrn: '999',
    date: '2026-08-14',
    provider: 'Dr. Test, DMD',
    assistants: 'Assistant',
    procedure: 'Restorative treatment',
  },
  narrative: [
    'Baseline vitals: BP 128/78 · HR 72 · SpO₂ 99%.',
    'Patient tolerated the procedure without incident.',
  ],
  sections: [
    {
      heading: 'Pre-Sedation Assessment',
      rows: [
        ['NPO confirmed', 'Yes (≥6h solids / ≥2h liquids)'],
        ['ASA classification', 'II'],
      ],
    },
    {
      heading: 'Recovery & Discharge',
      rows: [
        ['Discharge vitals', 'HR 74 · BP 122/76 · SpO₂ 98%'],
        ['Glucose trend (mg/dL)', '110 → 96 → 88'],
      ],
    },
  ],
  chronology: [
    { time: '08:42', event: 'Pre-op vitals', detail: 'BP 128/78, SpO₂ 99% RA' },
    { time: '09:01', event: 'Midazolam 2 mg', detail: 'Titrated, patient conversant' },
  ],
  signatures: { providerDataUrl: null, companion: 'Companion (spouse)', signedAt: '10:41' },
  disposition: { kind: 'sedation', released: true, at: '10:40' },
  generatedAt: '2026-08-14 13:30',
};

/**
 * Pull the drawn text back out of the PDF. Content streams are Flate-
 * compressed, so grepping the raw bytes finds nothing — inflate every stream
 * and concatenate. This is what makes the assertions below about what the
 * document *says* real rather than incidental.
 */
function extractDrawnText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  let out = '';
  let idx = 0;
  for (;;) {
    const open = buf.indexOf('stream', idx);
    if (open === -1) break;
    let start = open + 'stream'.length;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const end = buf.indexOf('endstream', start);
    if (end === -1) break;
    const chunk = buf.subarray(start, end);
    try {
      out += inflateSync(chunk).toString('latin1');
    } catch {
      out += chunk.toString('latin1');
    }
    idx = end + 'endstream'.length;
  }
  return decodeShownText(out);
}

/**
 * pdf-lib emits drawn strings as hex-encoded operands (`<48656C6C6F> Tj`),
 * so the decompressed stream still isn't readable prose until the hex is
 * decoded.
 */
function decodeShownText(streamText: string): string {
  let out = '';
  const hexShow = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  for (let m = hexShow.exec(streamText); m !== null; m = hexShow.exec(streamText)) {
    const hex = (m[1] ?? '').replace(/\s+/g, '');
    for (let i = 0; i + 1 < hex.length; i += 2) {
      out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
    }
    out += '\n';
  }
  return out;
}

/** Walk every string the renderer will draw. */
function noteStrings(note: ClinicalNote): string[] {
  return [
    ...Object.values(note.header),
    ...note.narrative,
    ...note.sections.flatMap((s) => [s.heading, ...s.rows.flatMap(([k, v]) => [k, v])]),
    ...note.chronology.flatMap((r) => [r.time, r.event, r.detail]),
    note.signatures.companion,
    note.generatedAt,
  ];
}

describe('pdfText sanitation', () => {
  it('transliterates the characters the note builder actually emits', () => {
    expect(winAnsi('SpO₂ 99%')).toBe('SpO2 99%');
    expect(winAnsi('Yes (≥6h solids / ≥2h liquids)')).toBe('Yes (>=6h solids / >=2h liquids)');
    expect(winAnsi('110 → 96 → 88')).toBe('110 -> 96 -> 88');
  });

  it('leaves cp1252 characters — including the note bullet and em dash — alone', () => {
    const kept = 'HR 74 · BP 122/76 — final · café';
    expect(winAnsi(kept)).toBe(kept);
  });

  it('reports, rather than hides, a character it has no mapping for', () => {
    const result = sanitizeForWinAnsi('vitals 😀 ok');
    expect(result.unmapped).toEqual(['😀']);
    expect(result.text).toBe(`vitals ${UNMAPPED_REPLACEMENT} ok`);
  });

  /**
   * TRIPWIRE. If a future edit introduces a new non-cp1252 character into
   * note content, this fails rather than shipping a chart with `?` in it.
   * The fix is to add an explicit mapping in `pdfText.ts`, not to delete
   * this test.
   */
  it('renders a realistic note with zero unmapped characters', () => {
    const offenders = noteStrings(NOTE)
      .flatMap((s) => sanitizeForWinAnsi(s).unmapped)
      .filter((c, i, all) => all.indexOf(c) === i);
    expect(offenders).toEqual([]);
  });
});

describe('signature inversion', () => {
  it('turns white-on-transparent into black-on-transparent, preserving alpha', () => {
    // two opaque white pixels, one fully transparent
    const data = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0]);
    const opaqueBefore = [...data].filter((_, i) => i % 4 === 3 && data[i] === 255).length;

    invertRgbPreservingAlpha(data);

    expect([...data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...data.slice(4, 8)]).toEqual([0, 0, 0, 255]);
    expect(data[11]).toBe(0);
    const opaqueAfter = [...data].filter((_, i) => i % 4 === 3 && data[i] === 255).length;
    expect(opaqueAfter).toBe(opaqueBefore);
  });

  it('is its own inverse', () => {
    const original = new Uint8ClampedArray([12, 200, 77, 180, 0, 0, 0, 0]);
    const roundTrip = new Uint8ClampedArray(original);
    invertRgbPreservingAlpha(roundTrip);
    invertRgbPreservingAlpha(roundTrip);
    expect([...roundTrip]).toEqual([...original]);
  });
});

describe('clinicalNoteToPdf', () => {
  it('renders a real-shaped note without throwing and emits a valid PDF', async () => {
    const bytes = await clinicalNoteToPdf(NOTE);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('is deterministic — the same note renders the same bytes', async () => {
    const [a, b] = await Promise.all([clinicalNoteToPdf(NOTE), clinicalNoteToPdf(NOTE)]);
    expect(a.length).toBe(b.length);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('does not describe an assessment-only case as a released sedation patient', async () => {
    const assessment: ClinicalNote = {
      ...NOTE,
      disposition: { kind: 'assessment', released: true, at: null },
    };
    const drawn = extractDrawnText(await clinicalNoteToPdf(assessment));
    expect(drawn).toContain('sedation deferred');
    expect(drawn).not.toContain('patient released');

    // ...and the sedation case still says what it should.
    const sedation = extractDrawnText(await clinicalNoteToPdf(NOTE));
    expect(sedation).toContain('patient released');
  });

  it('writes the transliterated text, not the raw characters, into the page', async () => {
    const drawn = extractDrawnText(await clinicalNoteToPdf(NOTE));
    expect(drawn).toContain('SpO2 99%');
    expect(drawn).not.toContain('₂');
  });

  it('paginates a long chronology instead of overflowing one page', async () => {
    const long: ClinicalNote = {
      ...NOTE,
      chronology: Array.from({ length: 90 }, (_, i) => ({
        time: `09:${String(i % 60).padStart(2, '0')}`,
        event: `Event ${i}`,
        detail: 'Vitals stable, airway patent, spontaneous ventilation throughout.',
      })),
    };
    const bytes = await clinicalNoteToPdf(long);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThan(1);
    // The footer is stamped on every page, not just the first.
    const drawn = extractDrawnText(bytes);
    expect(drawn).toContain(`Page ${reloaded.getPageCount()} of ${reloaded.getPageCount()}`);
  });
});
