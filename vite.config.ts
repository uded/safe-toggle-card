import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/safe-toggle-card.ts',
      formats: ['es'],
      fileName: () => 'safe-toggle-card.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    // HACS serves a single file: keep the lazily imported editor inside it.
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['test/**/*.test.ts'],
  },
});
