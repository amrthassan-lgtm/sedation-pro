# CLAUDE.md

Future Claude sessions: read this first.

## What this repo is

**Sedation Pro** is a Vue 3 web app (installable PWA) for moderate IV
sedation in dental practices, deployed to GitHub Pages and run from the home
screen of the practice's Samsung tablet. There is no App Store / Play Store
build: the owner chose to stay a web app (Nov 2026), and the Capacitor
native-shell setup was removed. It's the production rebuild of a
single-file legacy app; this repo is a workspace monorepo with a pure-TS
clinical engine and a Vue 3 UI.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the nine-phase plan.

## Current status

- **Phase 0 — Foundation scaffold:** done.
- **Phase 1 — Clinical engine:** done (`@sedation-pro/clinical` v0.1.0).
- **Phase 2 onward:** see roadmap.

## Workspace layout

```
apps/
  mobile/                  Vue 3 + Vite web app (PWA)
packages/
  clinical/                Pure-TS clinical engine (formulary + rules)
  ui/                      Vue UI primitives (Phase 2)
  persistence/             Storage adapter (Phase 5)
tools/
  store-assets/            App Store / Play Store screenshots + metadata
.github/workflows/         CI (format · typecheck · test · build)
docs/                      DEVELOPMENT.md, ROADMAP.md
```

## Conventions

- **Strict TypeScript everywhere.** `noUnusedLocals`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
  `noUncheckedIndexedAccess`, `isolatedModules`. Use `import type` for
  type-only imports.
- **Formulary is data, not constants.** Every clinical-engine function takes
  a `Formulary` parameter that defaults to `DEFAULT_FORMULARY`. Practices
  ship their own drugs, ceilings, and wait windows without touching code.
- **Tests are the spec.** The legacy app is no longer the source of truth
  for the clinical rules — the Vitest cases in `packages/clinical` are.
  Coverage floor is 80% (currently 99%). Bump the floor over time, never
  drop it.
- **Pure functions in `@sedation-pro/clinical`.** No I/O, no `Date.now()`
  inside the engine — callers pass `now: Millis` explicitly. Keeps tests
  deterministic and the engine portable.
- **Universal clinical math stays fixed.** Half-life decay, Malamed
  combined-percent, OSA-diazepam interlock, AHA BP stages, CDC BMI ranges
  are anchored to clinical standards, not practice preference. Per-practice
  drug data lives in the formulary; per-practice algorithm changes do not.
- **No comments that restate the code.** Comments should explain _why_, not
  _what_. Prefer well-named exports.

## Design bar

**Premium iOS look, always.** This is a standing instruction from the owner,
not a per-task preference. Every new surface is held to it: grouped inset
lists with hairline separators on the card's own surface, destructive and
reordering controls behind an `Edit` toggle rather than a button on every
row, 44px minimum tap targets, and a resting state that reads before it
invites action.

- **Buttons are always buttons, in one family (owner, Nov 2026).** No
  outlines and no blue: blue already means links, Fentanyl and the airway
  category. `UiButton` tone `nav` (solid grey) for anything that moves
  between screens; tone `key` (white fill, dark label) for the one main way
  forward on a screen; `compact` (48 px) in toolbars and navigation rows;
  clinical actions keep the default 56 px. Small inline actions are 44 px
  pills: grey, or white for the main one. Red stays reserved for Emergency
  and CALL 911; green for Print and success. `PicklistEditor.vue` and `InventoryView.vue` are the reference rows.

- **Never invent a CSS custom property.** The token vocabulary lives in
  `packages/ui/src/styles/tokens.css` — read it, don't guess from memory. An
  undefined `var(--whatever)` resolves to nothing and fails **silently**:
  format, typecheck, tests and build all stay green while the screen is
  wrong. Real names are `--r-sm|md|lg|xl|pill` (not `--radius-*`),
  `--color-surface-subtle|elevated|overlay` (there is no `--sunken`),
  `--sp-1..8`, `--type-caption|footnote|body|heading|title|display`.
- **Dark is the only theme.** The light palette and the theme toggle were
  removed on purpose (owner, Nov 2026): the app lives under operatory
  lighting and nobody used light. Do not add a second palette back. Check
  computed values in a real browser rather than assuming a token resolves.
- **Drive it in a browser before claiming it works.** Repeated experience in
  this repo: a dead button, a control that unmounts mid-tap, a guard that
  never fires, an unstyled row — none were visible to the suite, typecheck
  or build. Only a live drive caught them.

## Common commands

Run from the repo root:

```sh
pnpm install --frozen-lockfile
pnpm dev          # apps/mobile in browser
pnpm typecheck    # tsc/vue-tsc across all packages
pnpm test         # Vitest across all packages, with coverage in @sedation-pro/clinical
pnpm build        # apps/mobile production bundle
pnpm format       # Prettier (write)
pnpm format:check # Prettier (verify, used by CI)
```

Target a single workspace:

```sh
pnpm --filter @sedation-pro/clinical test
pnpm --filter @sedation-pro/mobile dev
```

## Things to know before changing files

- **`@sedation-pro/clinical`** is consumed by both `apps/mobile` and (later)
  `packages/persistence`. Any export change is a contract change — add tests
  first, then change the export.
- **Emergency drug inventory data** lives at
  `apps/mobile/src/data/emergency-inventory.ts` and is the owner-editable
  source of truth for the practice's crash-cart stock — the owner updates
  it through Claude sessions ("labetalol arrived, lot X, expires May-28")
  or GitHub edits; every deploy updates all devices. Rules: expirations
  are month-precision pharma convention (end of labeled month);
  `protocolDrugNames` is an opt-in link to protocol callout names (absence
  renders nothing — never map the infiltration lidocaines to 'Cardiac
  Lidocaine'); `useInventoryStatus.test.ts` carries a gap-list tripwire
  that fails when protocol edits add new drug callouts, on purpose.
- **Do not touch the legacy `sedation-app` GitHub repo.** It's the only
  copy of the original single-file app now (the local `tools/legacy-source/`
  copy was removed, Nov 2026) and is read-only reference. Changes go in
  this repo (`sedation-pro`).

## Branching and commits

- Develop on the branch the session is checked out on. The agent harness
  authorises pushes to that branch only.
- Commit messages: detailed subject + body. Body explains the _why_ and
  notes which quality gates were verified.

## When in doubt

- Read [`docs/ROADMAP.md`](docs/ROADMAP.md) to see which phase is current
  and what its exit gates are.
- Read [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the developer
  workflow (Node/pnpm versions, scripts).
- Read `packages/clinical/src/**/*.test.ts` for the executable spec of the
  clinical rules. If you're unsure about a clinical behaviour, the answer
  is in the tests.
