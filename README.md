# Sedation Pro

A chairside companion for moderate IV sedation in a dental office. It walks
the sedation team through a case from the pre-sedation assessment to
discharge, keeps a timed record of every dose and vital sign, and produces a
signed clinical note. Emergency protocols and the crash-cart inventory are a
tap away at any point.

**Live app:** <https://amrthassan-lgtm.github.io/sedation-pro/>

It is a web app (installable PWA), not an App Store or Play Store app. The
practice adds it to the home screen of a Samsung tablet; it then opens full
screen, works offline, and updates itself whenever a change is published.

## What it does

- **Phase 1 · Assessment.** Patient details, vitals, medical and airway
  history, ASA and Mallampati, with automatic BMI and blood-pressure staging,
  safety alerts (OSA, ASA III/IV, age, diabetes) and a required-fields gate
  before sedation can start.
- **Phase 2 · Oral sedation.** Pre-op anxiolytic doses with weight-based
  ceilings.
- **Phase 3 · IV sedation.** One-tap dose logging with Versed and Fentanyl
  timers, cumulative ceilings, local-anesthetic load (Malamed), reversal
  agents, and a drug dock that follows the clinician down the page.
- **Phase 4 · Recovery.** Discharge checklist, release gate (observation
  wait, longer after reversal), provider signature.
- **Clinical note.** Narrative plus a chronological record of every event;
  print, share as PDF, or file it straight into the Open Dental chart.
- **Emergency protocols.** 34 protocols reviewed against AHA 2025 and current
  specialty guidance, with drug draw-up volumes, syringe sizes, mix steps,
  live stock status, and links between related protocols.
- **Drug inventory.** The crash-cart and sedation-cart stock with expiry
  tracking, full-course checks per protocol, and what is on order.

## Privacy and data

- **Patient data stays on the device.** Case data lives in the browser's
  storage on the tablet. Nothing is sent anywhere unless the clinician
  presses **Send to chart**, which talks only to the practice's Open Dental
  server.
- **No secrets in this repository.** The Open Dental keys are typed into
  Settings on the tablet and stored only there. Test files use obvious
  placeholders (`DEVKEY-AAA/CUSTKEY-BBB`).
- **This repository is public.** It must never contain patient information,
  passwords, keys, or licence and permit numbers.

## Sending a note to Open Dental

The clinical note can be filed straight into the patient's Open Dental chart:
the note text goes in as a chart note, and the PDF goes into the Images
module. Set the practice's API keys once, on the tablet, under **Settings →
Open Dental Connection**. Without keys the feature stays switched off.

**The first time you open one of these PDFs, Open Dental will say the
document "has been previously deleted." Click it again and it opens
normally.** Open Dental holds an uploaded file in its database until someone
first opens it, and that first open produces the warning.

- **Entries cannot be removed from the app.** Neither a chart note nor an
  uploaded document can be deleted through the API, only from inside Open
  Dental. The app asks you to confirm the patient's name and date of birth
  first, for that reason.
- **If one half fails, retry only that half.** The app tracks the note text
  and the PDF separately and offers to retry just the one that did not land.

## For developers

```sh
pnpm install --frozen-lockfile
pnpm dev          # run the app in a browser
pnpm typecheck
pnpm test
pnpm build
```

Every push to `main` is checked (format, typecheck, tests, build) and then
deployed to GitHub Pages. See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)
for the full workflow and [`CLAUDE.md`](CLAUDE.md) for the conventions and
design rules.

| Path                    | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `apps/mobile/`          | The app: Vue 3 + Vite, installable PWA                    |
| `packages/clinical/`    | Clinical rules, formulary and protocols (pure TypeScript) |
| `packages/ui/`          | Shared UI components and design tokens                    |
| `packages/persistence/` | Storage adapter (placeholder)                             |

## License

Proprietary. See [`LICENSE`](LICENSE).
