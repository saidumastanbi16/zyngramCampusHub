import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: frontendRoot,
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    proxy: { '/api': 'http://localhost:3001' }
  },
  build: {
    outDir: resolve(frontendRoot, 'dist')
  }
});