import { defineConfig } from 'vitest/config';

// GitHub Pages serves the project from /kalibrierungsanlage-iii/.
// All asset URLs are emitted relative to this base; nothing is hardcoded to "/".
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/kalibrierungsanlage-iii/' : '/',
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
