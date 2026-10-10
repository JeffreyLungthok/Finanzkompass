import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Relative Pfade, damit die Seite auf GitHub Pages auch unter /<repo>/ funktioniert.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts']
  }
});
