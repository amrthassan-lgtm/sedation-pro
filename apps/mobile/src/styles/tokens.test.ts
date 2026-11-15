import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * An undefined `var(--whatever)` resolves to nothing and fails silently:
 * format, typecheck, the other tests and the build all stay green while a
 * screen loses its colour or its spacing. This is the check that does not.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const REPO = resolve(process.cwd(), '../..');
/** The clinical app, its primitives, and the engine that hands them colours. */
const files = ['apps/mobile/src', 'packages/ui/src', 'packages/clinical/src']
  .flatMap((dir) => walk(resolve(REPO, dir)))
  .filter((p) => /\.(vue|css|ts)$/.test(p) && !p.endsWith('.test.ts'))
  .map((path) => ({ path: relative(REPO, path), text: readFileSync(path, 'utf8') }));

/** `--name:` in a stylesheet, or `'--name':` in an inline style object. */
const DECLARED = /(?:^|[\s{;'"])(--[a-zA-Z0-9-]*[a-zA-Z0-9])['"]?\s*:/gm;
/** `var(--name`, but not a name built at run time (`var(--skin-${tone})`). */
const USED = /var\(\s*(--[a-zA-Z0-9-]*[a-zA-Z0-9])(?![\w-]|\$\{)/g;

describe('CSS custom properties', () => {
  it('found the stylesheets it guards', () => {
    expect(files.some((f) => f.path.endsWith('packages/ui/src/styles/tokens.css'))).toBe(true);
    expect(files.some((f) => f.path.endsWith('apps/mobile/src/styles/utilities.css'))).toBe(true);
  });

  it('every var() names a property that is declared somewhere', () => {
    const declared = new Set(files.flatMap((f) => [...f.text.matchAll(DECLARED)].map((m) => m[1])));
    const undefinedUses = files.flatMap((f) =>
      [...f.text.matchAll(USED)]
        .map((m) => m[1]!)
        .filter((name) => !declared.has(name))
        .map((name) => `${f.path}: ${name}`),
    );
    expect(undefinedUses).toEqual([]);
  });

  it('would catch a made-up name', () => {
    const text = '.x { color: var(--sunken); padding: var(--sp-4); }';
    const used = [...text.matchAll(USED)].map((m) => m[1]);
    const declared = new Set(files.flatMap((f) => [...f.text.matchAll(DECLARED)].map((m) => m[1])));
    expect(used.filter((n) => !declared.has(n))).toEqual(['--sunken']);
  });
});
