# Sedation Pro

Clinical IV sedation companion app for iOS and Android, built as a
Capacitor + Vue 3 hybrid app.

> **Status: Phase 0 — foundation scaffold.** No clinical logic is in this
> repository yet. The drug formulary, OSA-diazepam interlock,
> Malamed-combined-percent rule, half-life metabolism, phase gating, release
> eligibility, and ACLS reference will be ported in Phase 1 into the
> `@sedation-pro/clinical` package.

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
