import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/cc-database/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    sourcemap: true,
  },
});