import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// The design-review screenshots reuse the e2e server and browser, from their own folder, so
// `npm run e2e` never runs them.
export default defineConfig({ ...baseConfig, testDir: 'scripts/screenshots' });
