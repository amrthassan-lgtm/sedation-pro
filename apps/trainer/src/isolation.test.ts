import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Simulation } from '@/engine/engine';
import { gradeRun } from '@/engine/grade';
import { SCENARIOS } from '@/scenarios';
import { addRecord, saveSettings, setLastRun, settings } from '@/session';

/**
 * The trainer is served from the same origin as the clinical app, so it can
 * technically reach a live case's storage. These tests are the wall.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const ROOT = process.cwd();
const SRC = resolve(ROOT, 'src');
const read = (path: string) => ({ path, text: readFileSync(path, 'utf8') });

/** The code that ships: every source file that is not a test. */
const files = walk(SRC)
  .filter((p) => /\.(ts|vue)$/.test(p) && !p.endsWith('.test.ts'))
  .map(read);
/** Everything else that reaches the browser. */
const shipped = [
  ...files,
  ...walk(SRC)
    .filter((p) => p.endsWith('.css'))
    .map(read),
  read(resolve(ROOT, 'index.html')),
];
const name = (path: string): string => relative(ROOT, path);

/** Packages the trainer may import. Anything else has to be argued for here. */
const ALLOWED_PACKAGES = ['vue', 'vue-router', '@sedation-pro/clinical', '@sedation-pro/ui'];

function specifiers(text: string): string[] {
  const found = [
    ...text.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g),
    ...text.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ...text.matchAll(/\bimport\(\s*['"`]([^'"`]+)['"`]/g),
  ];
  return found.flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
}

describe('the trainer keeps to itself', () => {
  it('found the source files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('every import stays inside the trainer or names an allowed package', () => {
    for (const f of files) {
      for (const spec of specifiers(f.text)) {
        if (spec.startsWith('@/')) continue;
        if (spec.startsWith('.')) {
          // Where it lands, not how it is spelled: `../../../mobile/src/...` names no forbidden word.
          const target = resolve(dirname(f.path), spec);
          expect(target.startsWith(SRC), `${name(f.path)} imports ${spec}`).toBe(true);
          continue;
        }
        const allowed = ALLOWED_PACKAGES.some((pkg) => spec === pkg || spec.startsWith(`${pkg}/`));
        expect(allowed, `${name(f.path)} imports ${spec}`).toBe(true);
      }
    }
  });

  it('never loads a module by a computed path', () => {
    for (const f of files) {
      expect(f.text, name(f.path)).not.toMatch(/\bimport\(\s*[^'"`\s)]/);
      expect(f.text, name(f.path)).not.toMatch(/\bimport\(\s*`[^`]*\$\{/);
      expect(f.text, name(f.path)).not.toContain('import.meta.glob');
    }
  });

  it('only one file touches anything the browser keeps, and only under its own prefix', () => {
    const keeps = /storage|indexeddb|cookie|\bcaches\b|serviceworker/i;
    const touching = files.filter((f) => keeps.test(f.text));
    expect(touching.map((f) => name(f.path))).toEqual(['src/session.ts']);
    const session = touching[0]!.text;
    expect(session).toContain("const PREFIX = 'sedation-trainer:'");
    // Every key is built from the prefix; no literal key of any other shape.
    expect(session.match(/_KEY = `\$\{PREFIX\}/g)?.length).toBe(3);
    expect(session).not.toMatch(/_KEY = '/);
    // The raw helpers stay private, so no other file can write a key of its own.
    expect(session).not.toMatch(/export (async )?function (read|write)\b/);
    for (const call of session.matchAll(/Storage\.(?:get|set|remove)Item\(([^,)]+)/g)) {
      expect(['key', 'LAST_RUN_KEY'], call[0]).toContain(call[1]?.trim());
    }
  });

  it('never names a clinical-app storage key or package', () => {
    for (const f of shipped) {
      expect(f.text, name(f.path)).not.toContain('sedation-pro:');
      expect(f.text, name(f.path)).not.toContain('@sedation-pro/mobile');
      expect(f.text, name(f.path)).not.toContain('@sedation-pro/persistence');
    }
  });

  it('makes no network request of its own and loads nothing from another site', () => {
    for (const f of shipped) {
      expect(f.text, name(f.path)).not.toMatch(
        /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|new Image\(/,
      );
      const urls = [...f.text.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
      // XML namespaces are names, not addresses.
      expect(
        urls.filter((u) => !u.startsWith('http://www.w3.org/')),
        name(f.path),
      ).toEqual([]);
    }
  });

  it('has no service worker of its own, so it can never cache or answer for the clinical app', () => {
    const pkg = readFileSync(resolve(ROOT, 'package.json'), 'utf8');
    expect(pkg).not.toContain('vite-plugin-pwa');
    expect(pkg).not.toContain('workbox');
  });

  it('has no field that could hold a real patient: the only inputs are two searches and the plunger', () => {
    const inputs = files.flatMap((f) =>
      [...f.text.matchAll(/v-model(?:\.[a-z]+)*="([^"]*)"/g)].map(
        (m) => `${name(f.path)}: ${m[1]}`,
      ),
    );
    expect(inputs.sort()).toEqual([
      'src/components/ActionDock.vue: query',
      'src/components/BenchSheet.vue: plunger',
      'src/components/DrugTraySheet.vue: query',
    ]);
    for (const f of files) {
      expect(f.text, name(f.path)).not.toMatch(/<textarea|contenteditable/i);
    }
  });
});

describe('what a whole session leaves behind', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('every key written is under the trainer prefix, and nothing goes to the network', () => {
    const network = vi.fn(() => {
      throw new Error('The trainer must not use the network');
    });
    vi.stubGlobal('fetch', network);
    window.localStorage.clear();
    window.sessionStorage.clear();

    settings.coached = !settings.coached;
    settings.takeYourTime = !settings.takeYourTime;
    saveSettings();
    for (const scenario of SCENARIOS) {
      const sim = new Simulation(scenario);
      for (let i = 0; i < 4 * 1800 && !sim.ending; i += 1) sim.tick(0.25);
      const debrief = gradeRun(scenario, sim);
      addRecord(scenario.id, {
        at: 0,
        done: debrief.done,
        of: debrief.of,
        lowestSpo2: debrief.lowestSpo2,
        seconds: debrief.seconds,
        outcome: debrief.ending.outcome,
      });
      setLastRun({
        debrief,
        history: sim.history,
        cuts: sim.cuts,
        log: sim.log,
        previous: null,
        practice: false,
      });
    }

    const keys = [
      ...Array.from({ length: window.localStorage.length }, (_, i) => window.localStorage.key(i)),
      ...Array.from({ length: window.sessionStorage.length }, (_, i) =>
        window.sessionStorage.key(i),
      ),
    ];
    expect(keys.length).toBe(3);
    for (const key of keys) expect(key).toMatch(/^sedation-trainer:/);
    expect(network).not.toHaveBeenCalled();
    // The stored run is an invented patient's vitals and protocol rows: it reads back whole.
    const stored = JSON.parse(window.sessionStorage.getItem('sedation-trainer:last-run:v1')!);
    expect(stored.debrief.rows.length).toBeGreaterThan(5);
  });
});
