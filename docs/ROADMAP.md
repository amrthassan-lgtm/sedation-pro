# Roadmap

Production rebuild of the Apex Dental IV-sedation app as a Capacitor +
Vue 3 hybrid for the App Store and Google Play.

The nine phases below take the project from an empty repo to a submitted
build. Each phase has a single deliverable, an explicit exit gate, and
its scope is small enough to land in one focused session.

## Status

| Phase                                | Status     | Package(s)                              |
| ------------------------------------ | ---------- | --------------------------------------- |
| 0 · Foundation scaffold              | ✅ Done    | repo · `apps/mobile` · `packages/*`     |
| 1 · Clinical engine                  | ✅ Done    | `@sedation-pro/clinical` v0.1.0         |
| 2 · UI primitives                    | ✅ Done    | `@sedation-pro/ui` v0.1.0               |
| 3 · App shell + navigation           | ✅ Done    | `apps/mobile`                           |
| 4 · Assessment + premed screens      | ⏳ Next    | `apps/mobile`                           |
| 5 · Persistence + custom formularies | ⏳ Pending | `@sedation-pro/persistence`             |
| 6 · IV sedation + recovery + note    | ⏳ Pending | `apps/mobile`                           |
| 7 · Native integration               | ⏳ Pending | Capacitor (iOS + Android)               |
| 8 · Store readiness                  | ⏳ Pending | `tools/store-assets/`                   |
| 9 · Submission + launch              | ⏳ Pending | App Store Connect · Google Play Console |

## Phase 0 — Foundation scaffold ✅

**Deliverable.** Empty repo to a working pnpm workspace monorepo with CI,
formatting, typecheck, test, and build all wired up.

**Shipped.**

- pnpm 10 + Node 22 + TS 5.9 strict mode across four workspaces.
- `apps/mobile` (Vue 3.5 + Vite 6 + Pinia + Vue Router + Capacitor 6.2)
  with iOS-style design tokens (`tokens.css`) and base typography
  (`base.css`).
- `packages/clinical`, `packages/ui`, `packages/persistence` placeholders.
- `.github/workflows/ci.yml` — format · typecheck · test · build on push
  and PR.
- `docs/DEVELOPMENT.md`, `LICENSE` (proprietary placeholder).

**Exit gate.** All four `pnpm` scripts green on a clean
`--frozen-lockfile` install. Bundle ~38 KB gzipped.

## Phase 1 — Clinical engine ✅

**Deliverable.** Pure-TS engine implementing every clinical rule the legacy
app encoded, with the formulary modelled as data so practices can ship
their own drugs and ceilings without touching code.

**Shipped.**

- `DEFAULT_FORMULARY` with Apex's drugs (5 IV, 3 oral, 1 bedtime,
  5 local anesthetics), ceilings, and wait windows.
- Dosing math: half-life decay, IV synergy ceiling (benzo reduced 30%
  when any opioid is on board), Malamed combined-percent with active-dose
  decay, oral anxiolytic max-dose calculator.
- Gates: OSA-diazepam interlock, release eligibility (20 min standard,
  120 min after flumazenil), pre-med wait (30 min), drug timers (Versed
  cooling/ramping/ready, Fentanyl cooling/ready), last-exam age-tiered
  cutoffs, Phase 1 required-fields registry.
- Vitals: BMI categories (CDC ranges), BP stages (AHA 2017+), SpO₂ tiers.
- Protocols: nicotine pre-op cessation tiers.
- 94 Vitest cases, 99.21 % statement coverage, 100 % function coverage.

**Exit gate.** Coverage ≥ 80 %, all engine functions accept a `Formulary`
override, no I/O or non-deterministic calls inside the engine.

## Phase 2 — UI primitives (`@sedation-pro/ui`) ✅

**Deliverable.** Headless Vue 3 primitives consumed by `apps/mobile`.
Components take props in, emit events out, and hold no clinical state —
the contract that keeps the Phase 3 nav drawer and sticky bar honest as
projections of a shared store.

**Shipped.**

- Design tokens moved into the package: `@sedation-pro/ui/styles`
  (typography, 4px spacing, motion easings, dark palette, drug-tone
  swatches, `--ph1..ph4` phase tints).
- Layout: `<UiCard>` (phase tint + active/completed), `<UiRow>`,
  `<UiStack>`.
- Action: `<UiButton>` (neutral/primary/success/danger), `<UiDrugButton>`
  (12 drug tones, 3-state idle/locked/logged model).
- Form: `<UiField>`, `<UiTextInput>`, `<UiNumberInput>`, `<UiSelect>`,
  `<UiCheckbox>` (iOS dot + danger variant), `<UiBpInput>`.
- Display: `<UiBanner>`, `<UiDrugSwatch>`, `<UiPercentBar>` (auto-derives
  severity), `<UiStatusPill>`, `<UiTimerPill>` (cooling / ramping /
  ready).
- Vitest + happy-dom + @vue/test-utils smoke suite: every primitive
  mounts, click suppression respected on locked / logged / disabled
  states, percent-bar severity thresholds verified at boundaries.
- `apps/mobile`'s `HomeView` rebuilt as a live demo wiring every
  primitive against the clinical engine.

**Exit gate.** Met. `pnpm typecheck`, `pnpm test`, `pnpm build`, and
`pnpm format:check` all green; production bundle ~46.5 KB gzipped.

**Deferred to Phase 3 / later.** `<UiToast>`, `<UiUndoToast>`,
`<UiModal>`, `<UiBottomSheet>` — these need a store backbone (queue,
focus management) and ship as part of the shell. The 5 syringe SVGs
ship in Phase 6 alongside the drug-tile sub-content they belong to.

## Phase 3 — App shell + navigation ✅

**Deliverable.** The four-phase workflow scaffolding mounted in
`apps/mobile`: sticky progress bar, slide-in nav drawer, undo toast,
router with phase gating. No clinical content yet — just the shell that
hosts it. Every surface reads from the same Pinia stores so the nav and
sticky bar can never drift.

**Shipped.**

- Pinia stores: `useSessionStore` (current phase/step + per-phase
  step memory + drawer state), `useEventLogStore` (chronological log,
  remove-by-id), `useUndoStore` (`stamp()` + `undo()` with 25-entry
  cap), `useToastStore` (single-active toast with auto-dismiss),
  `usePatientStore` (Phase 1 inputs feeding `phase1Completeness`).
- Shell components: `StickyBar` (drawer toggle, live clearance bar in
  Phase 1, undo button, emergency button), `NavDrawer` (avatar,
  patient summary pills, phase entries with lock state), `UndoToast`
  (slide-in with tone-tinted accent).
- Routes: `/phase/1..4`, `/quick-reference` (+ `/:id` detail),
  `/inventory`, `/clinical-note`, `/ui-demo` (dev only), plus root and
  catch-all redirects.
- Phase gating: a `router.beforeEach` guard rewrites attempts to enter
  Phase 2/3/4 back to `/phase/1` while `isPhase1Complete` is false; the
  nav drawer disables those rows from the same source.
- `apps/mobile`'s `App.vue` now mounts the shell once; the active route
  fills the body.
- Tests: `src/stores/shell.test.ts` covers session step memory, undo
  round-trip, undo stack cap, and `phase1Completeness` integration
  including the diabetic-conditional glucose field. 6 tests, all green.

**Exit gate.** Met. All four `pnpm` scripts green; bundle 46.45 KB
gzipped main + per-route code-split chunks.

## Phase 4 — Assessment + premed screens ⏳

**Deliverable.** Phase 1 (pre-sedation assessment) and Phase 2 (oral
premedication) screens, fully wired to the clinical engine.

**Scope.**

- Phase 1 cards: Patient ID · Caregiver · Vitals & Metrics · Medical
  History · Social Screening · Safety Checklist · Bedtime Premedication.
- Live BMI / BP / SpO₂ / nicotine readouts via `@sedation-pro/clinical`.
- Phase 1 required-fields driven by `PHASE1_REQUIRED_FIELDS`. Clearance
  percentage in sticky bar.
- Diazepam button cluster uses `diazepamGate` — blocks on missing OSA,
  shows override modal on documented OSA/CPAP.
- Phase 2: Triazolam · Lorazepam · Hydroxyzine dose buttons with
  max-dose hint from `triazolamMax`/`lorazepamMax` (using entered
  weight). Logs to the event store with timestamp.

**Exit gate.** Filling in mock patient data unlocks Phase 2; a premed tap
logs a stamped event and updates the sticky bar.

## Phase 5 — Persistence + custom formularies ⏳

**Deliverable.** `@sedation-pro/persistence` package — adapter interface,
Capacitor Preferences implementation, and IndexedDB fallback for web
development.

**Scope.**

- `StorageAdapter` interface (get / set / delete / clear, all
  Promise-based).
- Capacitor `Preferences` plugin wrapper.
- Web IndexedDB fallback (via `idb-keyval`) used when Capacitor is
  unavailable.
- Stores: current session (autosave + restore on reload), practice
  profile (provider name, practice name, assistants list), **custom
  formulary** (replaces or extends `DEFAULT_FORMULARY`).
- Schema versioning so a stored session from v0.1.x can migrate forward
  on engine upgrades.
- Custom-formulary editor UI hidden behind a settings screen — full
  editing in Phase 8.

**Exit gate.** Reload preserves a half-filled Phase 1 session; a custom
formulary entry overrides `DEFAULT_FORMULARY` for one engine call.

## Phase 6 — IV sedation + recovery + clinical note ⏳

**Deliverable.** Phase 3 (IV sedation and procedure) plus Phase 4
(recovery, discharge, and clinical note) screens.

**Scope.**

- Phase 3: N₂O on/off, IV start (with pre-med wait chip), initial dose,
  additional doses, sedation level vitals, procedure start, local
  anesthesia. All buttons use `exec()` cooldown + check overlay.
- Drug timer pills powered by `versedTimer` / `fentanylTimer`.
- IV sedation max-dose tracker + Malamed combined-percent card live
  via `ivSedationStatus` / `localCombined`.
- Reversal panel: flumazenil + naloxone with the process boxes the
  legacy app shows on first tap.
- Phase 4: recovery vitals stamp, IV-out countdown chip
  (`releaseEligibility`), discharge checklist, release-patient button
  (with "do not dismiss" guards), clinical note review bottom sheet,
  signature pad, generated clinical note ready to print or share.

**Exit gate.** A full mock session — Phase 1 → release — produces a
clinical note that includes every logged event in chronological order,
with the provider's signature.

## Phase 7 — Native integration ⏳

**Deliverable.** Real iOS and Android builds running on device.

**Scope.**

- `cap add ios` + `cap add android` on developer machines (not in CI).
- Wake-lock plugin (`@capacitor-community/keep-awake` or platform APIs).
- Haptics plugin (`@capacitor/haptics`) — replaces the web
  `navigator.vibrate` patterns from the legacy app.
- Native share for clinical-note export (`@capacitor/share`).
- Safe-area insets handled in CSS (already wired in `base.css`).
- Status bar styling, splash screen, app icon (1024 + 512).
- Permissions plist / manifest entries for the plugins above.

**Exit gate.** App installs from Xcode and Android Studio onto physical
devices; running a mock session keeps the screen awake and produces
haptic feedback on dose taps.

## Phase 8 — Store readiness ⏳

**Deliverable.** App Store Connect and Google Play Console listings
populated, screenshots prepared, privacy and clinical disclaimers
authored, internal audit passed.

**Scope.**

- Real `appId` chosen and replaced (placeholder is
  `com.example.sedationpro` — irreversible after first upload).
- Screenshots at required device sizes (`tools/store-assets/`).
- App Store description, keywords, support URL, marketing URL, privacy
  policy URL.
- App Privacy disclosures (data collection: none by default; sessions
  stored locally only unless the practice opts into export).
- Clinical / medical-device disclaimer: this app is a documentation aid,
  not a medical device; clinical decisions remain the prescriber's
  responsibility.
- Settings screen for practice profile + custom formulary editor.
- Final security review: no PHI in logs, no third-party trackers, all
  storage local, no network calls without explicit user action.

**Exit gate.** TestFlight build delivered to the practice; internal
review sign-off; legal review of disclaimers complete.

## Phase 9 — Submission + launch ⏳

**Deliverable.** App accepted on both stores and a v1.0.0 tagged
release.

**Scope.**

- App Store: submit via Xcode → App Store Connect, respond to review
  notes, hit "Release this version" once approved.
- Google Play: production track release via Play Console, complete the
  data safety form, await review.
- Post-launch: crash reporting (opt-in), version tag, changelog,
  release notes.
- A first practice runs a real (non-clinical) dry run end-to-end with
  staff observation — sign-off before clinical use.

**Exit gate.** Both store listings live, the practice has installed the
production build, a recorded dry-run case completes without engine
errors or undo regrets.

## Out of scope (for v1)

- Multi-tenant cloud sync — sessions stay on-device.
- Telehealth / remote monitoring.
- Pediatric sedation — adult workflow only.
- Non-IV sedation modalities beyond oral premedication.
- Multi-practice EHR integration. Open Dental write-back for this
  practice is built — see the section below.

Each is a candidate for v2 once v1 is live and stable.

## Open Dental note write-back — built, verified against the live API

**Status.** Implemented on `feat/send-to-chart`. Every fact below was tested
against this practice's live Open Dental on 2026-08-14; the earlier
desk-researched design in this section was wrong in three ways that mattered
and has been replaced rather than annotated.

**What it does.** One tap on the clinical note writes two artifacts into the
patient's chart: the note text as a commlog, and the note PDF as a document
in the Images module. That replaces printing the note, scanning it in, and
separately pasting the text.

**Corrections to the original design.**

- **No native shell, relay or proxy is needed.** CORS is fully open on this
  API (`access-control-allow-origin: *`, all headers and methods, confirmed
  on both the preflight and a real authenticated GET), so the PWA calls it
  directly with `fetch()`. The old plan's requirement for secure native
  storage drove a Capacitor dependency that does not exist.
- **MRN maps to `PatNum`, not `ChartNumber`.** `ChartNumber` is empty on this
  practice's records, so `GET /patients?ChartNumber={MRN}` — the original
  step 1 — returns nothing. The practice enters the PatNum into the MRN
  field, so `GET /patients/{PatNum}` resolves directly and there is no
  search-and-disambiguate step to build.
- **The PDF is the other half.** The original design wrote text only. A
  scanned-looking PDF in Images is what the practice actually files.

**Endpoints.**

- `GET /patients/{PatNum}` → 200. Used as the wrong-patient guard: the
  confirmation dialog shows the returned `LName, FName` and `Birthdate`, so
  the provider confirms against the person rather than the number they typed.
- `POST /commlogs` → 201, body
  `{ PatNum, CommType, Mode_, SentOrReceived, Note }`. `CommType` is **711**,
  the "Sedation Note" definition created in Category 27 (`CommLogTypes`) on
  2026-08-14. Practice-specific — never guess or substitute it.
- `POST /documents/Upload` → 201, body
  `{ PatNum, rawBase64, extension: ".pdf", Description, DateCreated,
DocCategory }`. `DocCategory` is **136**, "IV Sedation Consents".
  `GET /documents/{DocNum}` returns metadata only, never file bytes — a
  read-back verification step would always appear to fail.

**Endpoints that silently do nothing.** `PUT /procedurelogs` with a `Note`
returns 200 and writes nothing. `POST /procnotes` does work but is unused —
the practice chose commlog, so there is no procedure lookup to build.

**Auth and limits.** `Authorization: ODFHIR {DeveloperKey}/{CustomerKey}`.
1 request/second on the write-enabled key, so the two writes are sequential
and spaced ~1100 ms. Keys live in this device's localStorage, entered through
the in-app settings screen; they are never in the repo, the bundle or any
committed file.

**Every write is permanent — this is the design constraint.** Commlogs have
no DELETE (removal is UI-only), and `DELETE /documents/{DocNum}` returns
`400 "Could not find folder for patient."` here, because Images are stored
LocalAtoZ where the cloud API cannot reach them. Consequences the
implementation is built around:

- The two artifacts are tracked separately and retried separately. A single
  "retry the send" after a partial failure would re-post a commlog that
  already succeeded and permanently duplicate a clinical note.
- Send state is flushed to storage synchronously on every transition, not on
  a watcher tick. A tablet sleeping between the two calls would otherwise
  lose a `sent` marker that existed only in memory, and the retry would
  double-post.
- The returned `DocNum` is never persisted. Open Dental defers
  materialization: the row is recreated under a new `DocNum` the first time
  someone opens the document, so the number is stale almost immediately. The
  `Description` string is the durable identity.

**Deferred materialization, and the warning staff will see.** An
API-uploaded file is not written to disk immediately — the row holds the PDF
as base64 in its `Note` field with a placeholder `filePath`. The first person
to open it gets a **"document has been previously deleted"** warning, after
which Open Dental writes the real file and it opens normally forever after.
This is expected and benign, and it is documented in `README.md` because an
unexplained warning of that wording on a medicolegal record is worse than the
quirk itself.

**Remaining risk.** PHI now leaves the device, which changes the app's
local-only posture: a BAA with Open Dental is required, and the audit trail of
what was sent and when currently lives only in the per-case send record.
