import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // the lazily loaded 3D model chunk (three.js) is about 580 kB
  build: { target: 'es2022', chunkSizeWarningLimit: 700 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
