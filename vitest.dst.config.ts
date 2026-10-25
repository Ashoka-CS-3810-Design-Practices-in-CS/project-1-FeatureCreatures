import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config';

// Spread instead of mergeConfig: mergeConfig concatenates arrays, which would keep the base
// include list and the exclusion of *.dst.test.ts.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['**/*.dst.test.ts'],
    exclude: ['node_modules', 'e2e'],
  },
});
