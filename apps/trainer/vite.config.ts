import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Served beside the clinical app on GitHub Pages, one folder down:
// `<user>.github.io/sedation-pro/trainer/`. Local dev keeps '/'.
const base = process.env.GITHUB_PAGES === '1' ? '/sedation-pro/trainer/' : '/';

// Deliberately no service worker: the trainer is not a chairside tool, so it
// has no offline requirement, and a second worker inside the clinical app's
// scope is one more thing that could shadow the clinical app's own updates.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  base,
  define: { __TRAINER_VERSION__: JSON.stringify(pkg.version) },
  plugins: [vue()],
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
    port: 5174,
    host: true,
  },
});
