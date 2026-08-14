import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';

import type { ClinicalNote } from './useClinicalNote';
import { dispositionLine } from './clinicalNoteText';
import { winAnsi } from './pdfText';
import { invertedSignaturePng } from './signatureInvert';

/**
 * Render a ClinicalNote as a PDF.
 *
 * Companion to `clinicalNoteToText`: same note in, same shape out, no I/O and
 * no store access, so it is unit-testable rather than only exercised through
 * the send flow. The layout mirrors `ClinicalNoteView.vue`'s print view —
 * practice header, meta grid, disposition, narrative, section blocks,
 * chronological record, signature block — because the printed page and the
 * uploaded document should be recognisably the same record.
 *
 * Letter, 0.5in margins. Every string passes through `winAnsi()`: the base-14
 * fonts throw on characters the note genuinely contains (`SpO₂`, `≥6h`,
 * trend arrows). See `pdfText.ts`.
 */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
const FOOTER_RESERVE = 28;

const INK = rgb(0.12, 0.16, 0.21);
const MUTED = rgb(0.42, 0.45, 0.5);
const ACCENT = rgb(0.01, 0.41, 0.63);
const RULE = rgb(0.85, 0.88, 0.91);
const FINAL_GREEN = rgb(0.08, 0.5, 0.24);
const PRELIM_AMBER = rgb(0.7, 0.33, 0.04);

/** Chronology column offsets from the left margin. */
const COL_EVENT = 62;
const COL_DETAIL = 210;

export async function clinicalNoteToPdf(note: ClinicalNote): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const sigBytes = await invertedSignaturePng(note.signatures.providerDataUrl);
  const sig: PDFImage | null = sigBytes ? await pdf.embedPng(sigBytes) : null;

  pdf.setTitle(winAnsi(`Sedation note - ${note.header.patient}`));
  pdf.setAuthor(winAnsi(note.header.provider));
  pdf.setSubject('Moderate IV Sedation - Clinical Record');
  pdf.setProducer('Sedation Pro');
  // pdf-lib stamps "now" by default, which would make the bytes differ on
  // every render of an identical note and make a byte-equality test
  // meaningless. The note carries its own generation time in the footer.
  const stamp = new Date(0);
  pdf.setCreationDate(stamp);
  pdf.setModificationDate(stamp);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const bottom = MARGIN + FOOTER_RESERVE;

  /** Break to a new page when `need` points wouldn't fit above the footer. */
  function room(need: number): void {
    if (y - need > bottom) return;
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const out: string[] = [];
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const test = line ? `${line} ${word}` : word;
        if (line !== '' && font.widthOfTextAtSize(test, size) > maxW) {
          out.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      out.push(line);
    }
    return out;
  }

  function text(
    raw: string,
    opts: {
      font?: PDFFont;
      size?: number;
      color?: ReturnType<typeof rgb>;
      x?: number;
      maxW?: number;
    } = {},
  ): void {
    const font = opts.font ?? reg;
    const size = opts.size ?? 10;
    const x = opts.x ?? MARGIN;
    const maxW = opts.maxW ?? PAGE_W - MARGIN * 2;
    for (const line of wrap(winAnsi(raw), font, size, maxW)) {
      room(size * 1.35);
      page.drawText(line, { x, y: y - size, size, font, color: opts.color ?? INK });
      y -= size * 1.35;
    }
  }

  function heading(label: string): void {
    room(30);
    y -= 8;
    page.drawText(winAnsi(label.toUpperCase()), {
      x: MARGIN,
      y: y - 9,
      size: 9,
      font: bold,
      color: ACCENT,
    });
    y -= 13;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.6,
      color: RULE,
    });
    y -= 8;
  }

  // ---- Letterhead ---------------------------------------------------------

  page.drawText(winAnsi(note.header.practice.toUpperCase()), {
    x: MARGIN,
    y: y - 15,
    size: 15,
    font: bold,
    color: ACCENT,
  });
  y -= 20;
  page.drawText(winAnsi('Moderate IV Sedation  ·  Clinical Record'), {
    x: MARGIN,
    y: y - 10,
    size: 9.5,
    font: reg,
    color: MUTED,
  });
  y -= 18;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1.6,
    color: ACCENT,
  });
  y -= 14;

  // ---- Meta grid ----------------------------------------------------------

  const meta: ReadonlyArray<readonly [string, string]> = [
    ['Patient', note.header.patient],
    ['MRN', note.header.mrn],
    ['Date of service', note.header.date],
    ['Provider', note.header.provider],
    ['Dental assistant', note.header.assistants],
    ['Procedure', note.header.procedure],
  ];
  const colW = (PAGE_W - MARGIN * 2) / 2;
  for (let i = 0; i < meta.length; i += 2) {
    room(16);
    for (let c = 0; c < 2 && i + c < meta.length; c++) {
      const cell = meta[i + c];
      if (cell === undefined) continue;
      const x = MARGIN + c * colW;
      page.drawText(winAnsi(cell[0].toUpperCase()), {
        x,
        y: y - 7,
        size: 6.8,
        font: bold,
        color: MUTED,
      });
      page.drawText(winAnsi(cell[1] || '—'), { x, y: y - 17, size: 10, font: reg, color: INK });
    }
    y -= 24;
  }

  // Kind-aware: an assessment-only case must not be described as a released
  // sedation patient. Shared with the text export so they cannot drift.
  room(18);
  page.drawText('DISPOSITION', { x: MARGIN, y: y - 7, size: 6.8, font: bold, color: MUTED });
  page.drawText(winAnsi(dispositionLine(note.disposition)), {
    x: MARGIN,
    y: y - 17,
    size: 10,
    font: bold,
    color: note.disposition.released ? FINAL_GREEN : PRELIM_AMBER,
  });
  y -= 26;

  // ---- Narrative ----------------------------------------------------------

  if (note.narrative.length > 0) {
    heading('Clinical Narrative');
    for (const paragraph of note.narrative) {
      text(paragraph, { size: 10.5 });
      y -= 10.5 * 0.54;
    }
  }

  // ---- Label/value sections ----------------------------------------------

  for (const section of note.sections) {
    heading(section.heading);
    for (const [label, value] of section.rows) {
      room(14);
      page.drawText(winAnsi(label), { x: MARGIN, y: y - 9, size: 9, font: bold, color: MUTED });
      const vx = MARGIN + 150;
      for (const line of wrap(winAnsi(value || '—'), reg, 9.5, PAGE_W - MARGIN - vx)) {
        room(12);
        page.drawText(line, { x: vx, y: y - 9, size: 9.5, font: reg, color: INK });
        y -= 12;
      }
      y -= 2;
    }
  }

  // ---- Chronological record ----------------------------------------------

  if (note.chronology.length > 0) {
    heading('Chronological Record');
    room(16);
    const headers: ReadonlyArray<readonly [string, number]> = [
      ['TIME', 0],
      ['EVENT', COL_EVENT],
      ['DETAILS', COL_DETAIL],
    ];
    for (const [label, dx] of headers) {
      page.drawText(label, { x: MARGIN + dx, y: y - 8, size: 6.8, font: bold, color: MUTED });
    }
    y -= 12;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.6,
      color: RULE,
    });
    y -= 4;

    for (const row of note.chronology) {
      const detail = wrap(
        winAnsi(row.detail || ''),
        reg,
        8.5,
        PAGE_W - MARGIN - (MARGIN + COL_DETAIL),
      );
      room(Math.max(12, detail.length * 11) + 4);
      const top = y;
      page.drawText(winAnsi(row.time), {
        x: MARGIN,
        y: top - 8,
        size: 8.5,
        font: mono,
        color: MUTED,
      });
      page.drawText(winAnsi(row.event), {
        x: MARGIN + COL_EVENT,
        y: top - 8,
        size: 8.5,
        font: bold,
        color: INK,
      });
      let dy = top;
      for (const line of detail) {
        page.drawText(line, {
          x: MARGIN + COL_DETAIL,
          y: dy - 8,
          size: 8.5,
          font: reg,
          color: INK,
        });
        dy -= 11;
      }
      y = Math.min(top - 12, dy) - 3;
      page.drawLine({
        start: { x: MARGIN, y: y + 2 },
        end: { x: PAGE_W - MARGIN, y: y + 2 },
        thickness: 0.3,
        color: RULE,
      });
    }
  }

  // ---- Signature block ----------------------------------------------------

  heading('Signature');
  room(90);
  const sigTop = y;

  page.drawText('PROVIDER', { x: MARGIN, y: sigTop - 8, size: 6.8, font: bold, color: MUTED });
  if (sig !== null) {
    const w = 190;
    const h = Math.min((sig.height / sig.width) * w, 52);
    page.drawImage(sig, { x: MARGIN, y: sigTop - 16 - h, width: w, height: h });
  } else {
    page.drawText(winAnsi('— unsigned —'), {
      x: MARGIN,
      y: sigTop - 40,
      size: 9,
      font: reg,
      color: MUTED,
    });
  }
  page.drawLine({
    start: { x: MARGIN, y: sigTop - 72 },
    end: { x: MARGIN + 210, y: sigTop - 72 },
    thickness: 0.8,
    color: INK,
  });
  page.drawText(winAnsi(note.header.provider), {
    x: MARGIN,
    y: sigTop - 84,
    size: 9,
    font: reg,
    color: INK,
  });

  const cx = MARGIN + 260;
  page.drawText('RESPONSIBLE COMPANION', {
    x: cx,
    y: sigTop - 8,
    size: 6.8,
    font: bold,
    color: MUTED,
  });
  page.drawText('Signed on printed post-op form', {
    x: cx,
    y: sigTop - 40,
    size: 9,
    font: reg,
    color: MUTED,
  });
  page.drawLine({
    start: { x: cx, y: sigTop - 72 },
    end: { x: cx + 210, y: sigTop - 72 },
    thickness: 0.8,
    color: INK,
  });
  page.drawText(winAnsi(note.signatures.companion || '—'), {
    x: cx,
    y: sigTop - 84,
    size: 9,
    font: reg,
    color: INK,
  });

  // ---- Footer on every page ----------------------------------------------

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(
      winAnsi(
        `Generated ${note.generatedAt}  ·  Sedation Pro  ·  Page ${i + 1} of ${pages.length}`,
      ),
      { x: MARGIN, y: MARGIN - 8, size: 7.5, font: reg, color: MUTED },
    );
  });

  return pdf.save();
}
