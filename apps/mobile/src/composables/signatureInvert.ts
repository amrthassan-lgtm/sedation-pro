/**
 * Signature pixel inversion for the PDF renderer.
 *
 * `UiSignaturePad` draws **white ink on a transparent canvas**, and
 * `ClinicalNoteView.vue` only makes it visible on screen with CSS
 * `filter: invert(1)` (see the `.sig-img` rule there). A PDF has no CSS
 * filters, so embedding `note.signatures.providerDataUrl` unchanged puts
 * white ink on white paper: the provider signature is invisible on the one
 * document that most needs it, and nothing about the file looks wrong until
 * somebody needs the signature to exist.
 *
 * Inverting RGB while preserving alpha reproduces exactly what the CSS
 * filter shows on screen.
 */

/**
 * Invert R/G/B in place, leaving alpha untouched.
 *
 * Kept pure and separate from the canvas so the arithmetic — the part that
 * can be wrong — is unit-testable without a DOM. Alpha is what carries the
 * stroke shape on a transparent pad; touching it would erase the signature
 * rather than recolour it.
 */
export function invertRgbPreservingAlpha(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - (data[i] ?? 0);
    data[i + 1] = 255 - (data[i + 1] ?? 0);
    data[i + 2] = 255 - (data[i + 2] ?? 0);
    // data[i + 3] (alpha) deliberately preserved.
  }
}

/** Decode a `data:...;base64,` URL into raw bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const base64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('signature image failed to decode'));
    img.src = src;
  });
}

/**
 * Turn a signature-pad data URL into inverted PNG bytes ready for
 * `pdf.embedPng`. Returns null for an absent signature — an unsigned note
 * renders an "unsigned" rule instead, it does not fail.
 *
 * Returns null rather than throwing if the canvas is unavailable (test
 * environments without a 2D context): a missing signature image must never
 * take the whole PDF — and therefore the whole send — down with it.
 */
export async function invertedSignaturePng(
  dataUrl: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!dataUrl) return null;
  if (typeof document === 'undefined') return null;

  try {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    if (canvas.width === 0 || canvas.height === 0) return null;

    const ctx = canvas.getContext('2d');
    if (ctx === null) return null;

    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    invertRgbPreservingAlpha(pixels.data);
    ctx.putImageData(pixels, 0, 0);

    return dataUrlToBytes(canvas.toDataURL('image/png'));
  } catch {
    return null;
  }
}
