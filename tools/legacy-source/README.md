# Legacy source

`index.html` here is the working single-file app from Apex Dental — the source
for the verbatim clinical-logic port in Phase 1 (drug formulary, OSA-diazepam
interlock, Malamed combined-percent rule, half-life metabolism, phase gating,
release eligibility, ACLS reference).

This file is **reference only** — it is not part of `apps/mobile`, has no
build step, and the CI workflow ignores it.

> **Note:** The committed copy was reconstructed from a chat paste and
> contains markdown-rendering artifacts (stray triple-backtick fences inside
> a few HTML blocks, and smart quotes in the nav-drawer JavaScript near the
> bottom of the file). The clinical logic is readable, but the file will not
> run as-is in a browser. Replace with a clean export from the legacy
> `sedation-app` repo before Phase 1 begins.
