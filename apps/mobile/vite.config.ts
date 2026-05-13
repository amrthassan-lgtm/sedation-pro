import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// GitHub Pages serves the site at `<user>.github.io/sedation-pro/`, so a
// production build for Pages needs that path prefix. Local dev (`pnpm dev`)
// and any other host (Vercel, Netlify, custom domain) keep the default '/'.
const base = process.env.GITHUB_PAGES === '1' ? '/sedation-pro/' : '/';

export default defineConfig({
  base,
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
    port: 5173,
    host: true,
  },
});
