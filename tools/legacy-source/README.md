# Legacy source

`index.html` here is the verbatim working single-file app from Apex Dental —
the source of every clinical rule that the new `@sedation-pro/clinical`
engine implements (drug formulary, OSA-diazepam interlock, Malamed
combined-percent rule, half-life metabolism, phase gating, release
eligibility, ACLS reference).

Pulled from
`https://raw.githubusercontent.com/amrthassan-lgtm/sedation-app/main/index.html`
on 2026-05-13.

## How to use it

- **Reference only.** This directory is not part of any build. `apps/mobile`
  must not import from here.
- `.prettierignore` excludes this file so it stays byte-for-byte identical
  to the upstream copy. If you need to refresh it, re-fetch from the legacy
  repo — don't edit it in place.
- When the engine's behaviour is unclear, the tests in
  `packages/clinical/src/**/*.test.ts` are the source of truth, not this
  file. The legacy app is reference for the _intent_; the tests pin the
  contract.

## Refreshing this file

```sh
curl -s -o tools/legacy-source/index.html \
  https://raw.githubusercontent.com/amrthassan-lgtm/sedation-app/main/index.html
git add tools/legacy-source/index.html
git commit -m "chore(legacy-source): refresh from upstream"
```

## Do not

- Do not run `pnpm format` against this file (already ignored).
- Do not link to it from `apps/mobile` or any package.
- Do not modify it locally. If the legacy app changes, refresh from
  upstream so the diff is visible in git history.
