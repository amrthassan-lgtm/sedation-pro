# Sedation Pro

Clinical IV sedation companion app for iOS and Android, built as a
Capacitor + Vue 3 hybrid app.

**Live preview:** <https://amrthassan-lgtm.github.io/sedation-pro/> —
auto-deployed by `.github/workflows/deploy-pages.yml` on every push to the
active development branch. Open on iPhone Safari to test (Add to Home
Screen for an app-like icon).

> **Status: Phase 0 + 1 + 2 + 3 done; Phase 4 next.** Engine is the source
> of truth for the drug formulary, OSA-diazepam interlock, Malamed
> combined-percent rule, half-life metabolism, phase gating, release
> eligibility, dismissal safety, and dose ceilings. Shell mounts the sticky
> bar, nav drawer, undo toast, and four phase routes — Phase 1 form is
> wired; Phase 2/3/4 are placeholders waiting on the next sprint.

## Quick start

```sh
pnpm install --frozen-lockfile
pnpm dev          # run apps/mobile in a browser
pnpm typecheck
pnpm test
pnpm build
```

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the full workflow,
including how to add the Capacitor `ios/` and `android/` native shells on a
developer machine.

The full plan is in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Workspace layout

| Path                    | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `apps/mobile/`          | Vue 3 + Vite + Capacitor 6 mobile shell        |
| `packages/clinical/`    | Pure-TS clinical logic (drugs, dosing, gating) |
| `packages/ui/`          | Shared UI primitives (Phase 2)                 |
| `packages/persistence/` | Storage adapter (Phase 5)                      |
| `tools/store-assets/`   | App Store / Play Store screenshots + metadata  |

## License

Proprietary. See [`LICENSE`](LICENSE).
