/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static-deployment friendly: relative asset URLs so the built `dist/` works from any
// sub-path (GitHub Pages project sites, S3 prefixes, Netlify, Vercel, ...).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    // The bundled Stockfish is a single-threaded build, so no COOP/COEP headers are needed.
    // If you swap in a multi-threaded (SharedArrayBuffer) engine build, enable these headers
    // here and configure the same ones on your host.
    // headers: {
    //   'Cross-Origin-Opener-Policy': 'same-origin',
    //   'Cross-Origin-Embedder-Policy': 'require-corp',
    // },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 20000,
  },
});
