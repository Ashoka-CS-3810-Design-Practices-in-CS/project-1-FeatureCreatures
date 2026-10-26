import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// Its own port, and never an already-running server, so the captures always come from a fresh build
// of the working tree (a preview left open on the e2e port would serve an older dist).
const SCREENSHOT_PORT = 4174;
const SCREENSHOT_URL = `http://localhost:${SCREENSHOT_PORT}`;

// The design-review screenshots reuse the e2e browser settings from their own folder, so
// `npm run e2e` never runs them.
export default defineConfig({
  ...baseConfig,
  testDir: 'scripts/screenshots',
  webServer: {
    command: `npm run build && npm run preview -- --port ${SCREENSHOT_PORT} --strictPort`,
    url: SCREENSHOT_URL,
    reuseExistingServer: false,
  },
  use: { ...baseConfig.use, baseURL: SCREENSHOT_URL },
});
