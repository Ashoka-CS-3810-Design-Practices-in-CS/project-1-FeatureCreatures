import { defineConfig, devices } from '@playwright/test';

const PREVIEW_URL = 'http://localhost:4173';

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: PREVIEW_URL,
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: PREVIEW_URL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
