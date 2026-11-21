/**
 * The app's own line icons. A screen that names one of these gets a drawing;
 * an emoji in its place is drawn by the device, in the device's style, and a
 * Samsung tablet draws them as colour cartoons.
 */
export const GLYPH_NAMES = [
  'warning',
  'timer',
  'scale',
  'box',
  'hourglass',
  'search',
  'lock',
  'refresh',
  'info',
] as const;

export type GlyphName = (typeof GLYPH_NAMES)[number];

export function isGlyphName(value: string | undefined): value is GlyphName {
  return value !== undefined && (GLYPH_NAMES as ReadonlyArray<string>).includes(value);
}
