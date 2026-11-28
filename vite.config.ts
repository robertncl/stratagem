import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // the lazily loaded 3D model chunk (three.js) is about 580 kB
    chunkSizeWarningLimit: 700,
    // two pages: the game and its guide
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), guide: resolve(import.meta.dirname, 'guide.html') } },
  },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
