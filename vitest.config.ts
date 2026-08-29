import { defineConfig } from 'vitest/config'

// Getrennt von vite.config.ts, weil Vite 8 und das von Vitest mitgebrachte
// Vite sich in den Plugin-Typen beißen. Vitest nimmt automatisch diese Datei.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
  },
  esbuild: { jsx: 'automatic' },
})
