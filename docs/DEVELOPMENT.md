# Development

This monorepo is managed with **pnpm** workspaces.

## Prerequisites

| Tool    | Version | Notes                                                                    |
| ------- | ------- | ------------------------------------------------------------------------ |
| Node.js | 22 LTS  | Pinned in `.nvmrc`. Use `nvm use` or `fnm use`.                          |
| pnpm    | 10      | Pinned in `package.json` (`packageManager`). Easiest: `corepack enable`. |

## Install

```sh
pnpm install --frozen-lockfile
```

## Scripts (run from repo root)

| Command             | What it does                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Run `apps/mobile` in a browser via Vite.                                                            |
| `pnpm typecheck`    | Run `tsc --noEmit` / `vue-tsc --noEmit` across every workspace.                                     |
| `pnpm test`         | Run Vitest across every workspace. `@sedation-pro/clinical` runs with v8 coverage and an 80% floor. |
| `pnpm build`        | Type-check and build the production `apps/mobile` bundle into `apps/mobile/dist`.                   |
| `pnpm format`       | Format all source with Prettier.                                                                    |
| `pnpm format:check` | Verify formatting (used by CI).                                                                     |

You can target a single workspace with `pnpm --filter <name> <script>`, e.g.
`pnpm --filter @sedation-pro/clinical test`.

## Testing on your iPhone (no Mac required)

The Vite dev server is already configured to bind to your LAN
(`server.host: true` in `apps/mobile/vite.config.ts`). Once it's
running, your iPhone — on the same Wi-Fi as your dev machine — can
open the app in Safari.

**Step-by-step:**

1. On your dev machine, open a terminal and run:

   ```sh
   pnpm dev
   ```

2. Vite prints two URLs in the terminal, like this:

   ```
     VITE v6.4.2  ready in 320 ms

     ➜  Local:   http://localhost:5173/
     ➜  Network: http://192.168.1.42:5173/
   ```

   The `Network` URL has your dev machine's LAN IP — the exact
   numbers will be different on your network.

3. On your iPhone, make sure it's on the **same Wi-Fi network** as
   your dev machine. Then open **Safari** and type the **Network**
   URL into the address bar (e.g. `http://192.168.1.42:5173`).

4. The app loads. Tap through Phase 1 → Phase 2 → Phase 3 → Phase 4
   and use the nav drawer to confirm everything works.

5. **Optional — make it an "app":** in Safari, tap the Share button,
   scroll down, tap **Add to Home Screen**. Sedation Pro now has an
   icon on your home screen and launches full-screen, no Safari UI.

**Troubleshooting:**

- _iPhone can't connect to the URL._ Most often a firewall. On macOS,
  Vite usually just works. On Windows, Windows Defender Firewall may
  block port 5173 — allow Node.js through the firewall when prompted,
  or temporarily disable the firewall to confirm.
- _The address shows but won't load._ Confirm both devices are on the
  same network (not one on guest Wi-Fi, the other on the main SSID).
- _Hot reload doesn't fire on iPhone._ Vite's HMR should work over
  LAN; if it doesn't, refresh manually. Editing files on your dev
  machine still picks up.

**No App Store / Play Store build.** The app ships as a web app (PWA) on
GitHub Pages and is installed to the tablet's home screen. The Capacitor
native-shell setup was removed in Nov 2026 by the owner's choice.

## Workspace layout

```
apps/
  mobile/                  Vue 3 + Vite web app (PWA, the shipped app)
packages/
  clinical/                Pure-TS clinical engine (Phase 1+)
  ui/                      UI primitives (Phase 2)
  persistence/             Storage adapter (Phase 5)
tools/
  store-assets/            App Store / Play Store screenshots + metadata
docs/                      Project docs (development, roadmap)
.github/workflows/         CI (format · typecheck · test · build)
```

## Editor setup

- Recommended extensions: Volar (Vue), TypeScript, Prettier, EditorConfig.
- Format-on-save is encouraged; CI runs `pnpm format:check`.

## Phase status

See [`docs/ROADMAP.md`](ROADMAP.md) for the full nine-phase plan. We are
currently in **Phase 0 — foundation scaffold**.
