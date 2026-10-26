import { defineConfig, devices } from '@playwright/test';

const PREVIEW_URL = 'http://localhost:4173';
// Not Vite's default 5173, so a developer's own `npm run dev` is never reused by mistake.
const DEV_URL = 'http://localhost:5174';

export default defineConfig({
  testDir: 'e2e',
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: PREVIEW_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      // The dev server renders in StrictMode (double mount), which the production build never
      // does; WI-35's dialogs closed themselves only there.
      command: 'npm run dev -- --port 5174 --strictPort',
      url: DEV_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], baseURL: PREVIEW_URL } },
    {
      name: 'chromium-dev',
      testMatch: 'smoke.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: DEV_URL },
    },
  ],
});
