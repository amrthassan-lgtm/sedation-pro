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

## Sending a note to Open Dental

The clinical note can be filed straight into the patient's Open Dental chart:
the note text goes in as a chart note, and the PDF goes into the Images
module. Set the practice's API keys once, on the tablet, under **Settings →
Open Dental Connection**. Without keys the feature stays switched off and the
app behaves exactly as it did before.

**The first time you open one of these PDFs, Open Dental will say the
document "has been previously deleted." Click it again and it opens
normally.** Nothing has been deleted and nothing is wrong with the file.
Open Dental does not write an uploaded file to disk straight away — it holds
it in the database until someone first opens it, and that first open is what
produces the warning. From then on the document behaves like any other
scanned page in the chart.

Two things worth knowing before you send:

- **Entries cannot be removed from the app.** Neither a chart note nor an
  uploaded document can be deleted through the API — only from inside Open
  Dental. The app asks you to confirm the patient's name and date of birth
  first, for that reason.
- **If one half fails, retry only that half.** The app tracks the note text
  and the PDF separately and will offer to retry just the one that did not
  land. Sending everything again would file a second copy.

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
