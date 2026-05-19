import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site at `<user>.github.io/sedation-pro/`, so a
// production build for Pages needs that path prefix. Local dev (`pnpm dev`)
// and any other host (Vercel, Netlify, custom domain) keep the default '/'.
const base = process.env.GITHUB_PAGES === '1' ? '/sedation-pro/' : '/';

export default defineConfig({
  base,
  plugins: [
    vue(),
    // Service worker so Android Chrome installs a real WebAPK (own icon, no
    // Chrome badge) instead of a bookmark shortcut, and so the app runs
    // offline chairside. `autoUpdate`: a new deploy's clinical code replaces
    // the cached version on the next launch — deliberate for a medical app,
    // a clinician must never be stranded on a stale dosing engine, and there
    // is no "later" update prompt to dismiss. The hand-curated
    // `public/manifest.webmanifest` stays the source of truth, so the plugin
    // only owns the service worker, not the manifest.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      includeAssets: [
        'manifest.webmanifest',
        'logo-source.svg',
        'apple-touch-icon-180.png',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
      ],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
        // SPA history routing — serve the app shell for deep links offline.
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: true,
  },
  server: {
    port: 5173,
    host: true,
  },
});
