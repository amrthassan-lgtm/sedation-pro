/**
 * Rasterize the single source-of-truth logo into the PNG icons the web
 * manifest and iOS need. Android's PWA installability requires raster
 * 192/512 icons (SVG alone is not sufficient — see docs/ROADMAP.md and the
 * Chromium installability spec); iOS prefers a real apple-touch PNG.
 *
 * The outputs are git-ignored build artifacts. This script runs on every
 * `pnpm dev` and `pnpm build`, so the PNGs are reproduced from
 * `public/logo-source.svg` every time and cannot drift from it. To change
 * the logo, edit ONLY that SVG.
 *
 * Fail-fast: any rasterization error exits non-zero so a broken logo
 * source breaks the build loudly instead of silently shipping stale icons.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');
const SOURCE = join(publicDir, 'logo-source.svg');

/** [output filename, square pixel size]. The source is composed
 * maskable-safe, so the same render serves both `any` and `maskable`. */
const TARGETS = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon-180.png', 180],
];

async function main() {
  const svg = await readFile(SOURCE);
  for (const [name, size] of TARGETS) {
    const png = await sharp(svg, { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await writeFile(join(publicDir, name), png);
    process.stdout.write(`  icons: ${name} (${size}×${size}, ${png.length} B)\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`icon generation failed: ${err?.message ?? err}\n`);
  process.exit(1);
});
