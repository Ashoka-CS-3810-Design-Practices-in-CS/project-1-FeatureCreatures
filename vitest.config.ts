import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['**/*.dst.test.ts', 'node_modules', 'e2e'],
    benchmark: { include: ['bench/**/*.bench.ts'] },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.tsx', 'src/**/*.test.*', 'src/data/samples/**', 'src/ui/styles/**'],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
        statements: 70,
        'src/engine/algorithms/**': { lines: 90, branches: 90, functions: 90, statements: 90 },
      },
    },
  },
});
