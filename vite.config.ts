import { defineConfig } from 'vitest/config';

// GitHub Pages serves the project from /kalibrierungsanlage-iii/. The same base is used
// for the dev server and `vite preview`, so every environment behaves like Pages.
// All asset URLs are emitted relative to this base; nothing is hardcoded to "/".
export default defineConfig(() => ({
  base: '/kalibrierungsanlage-iii/',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
  preview: {
    // `vite preview` mirrors the production base path.
    port: 4173,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));
