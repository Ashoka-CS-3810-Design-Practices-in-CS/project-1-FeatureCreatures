import { expect, test, type Page } from '@playwright/test';

// Design-review screenshots (WI-34), linked from README.md. Not part of `npm run e2e`: run
// `npm run screenshots` and look at docs/screenshots/ after any visual change.

const OUTPUT_DIR = 'docs/screenshots';
const VIEWPORT_HEIGHT = 900;
const WIDE_WIDTH = 1440;
const NARROW_DESKTOP_WIDTH = 1024;
const DRAWER_WIDTH = 900;
const TALL_HEIGHT = 1400; // shows the whole side column, conflicts included
const WEEK_WIDTHS = [WIDE_WIDTH, NARROW_DESKTOP_WIDTH];
const THEMES = ['light', 'dark'] as const;
const TOAST_WAIT_MS = 10_000;
// Late Monday morning of TEST_PLAN's base week: "today" and the now line sit inside the grid, and
// Tuesday's conflict is still ahead, so Replan has a move to show.
const CLOCK_TIME = new Date('2026-11-02T11:15:00');

type Theme = (typeof THEMES)[number];

// PRE:  page has a fresh browser context; theme is the OS colour scheme to emulate; width > 0
// POST: opens the empty calendar in the base week at that width, with the "System" theme following
//       theme and motion reduced so captures are stable
async function openApp(page: Page, theme: Theme, width: number): Promise<void> {
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.clock.install({ time: CLOCK_TIME });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Week of 2 Nov 2026' })).toBeVisible();
}

// PRE:  the empty calendar is open
// POST: loads the sparse sample week and waits until its overlay and toast are gone
async function loadSampleWeek(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
  await expect(page.locator('.status-line')).toHaveText('8 events · 4 tasks · 1 conflict');
  await expect(page.getByRole('dialog', { name: 'Loading calendar' })).toBeHidden();
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: TOAST_WAIT_MS });
}

// PRE:  name is a file-name-safe identifier
// POST: saves the visible viewport as docs/screenshots/<name>.png
async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUTPUT_DIR}/${name}.png`, animations: 'disabled' });
}

// INVARIANT: a capture test is registered for every theme visited so far
for (const theme of THEMES) {
  // INVARIANT: a week capture is registered for every width visited so far, in this theme
  for (const width of WEEK_WIDTHS) {
    test(`week ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await loadSampleWeek(page);
      await capture(page, `week-${theme}-${width}`);
    });
  }
  // POST: this theme's week is captured at every width

  test(`empty state ${theme}`, async ({ page }) => {
    await openApp(page, theme, WIDE_WIDTH);
    await capture(page, `empty-${theme}`);
  });

  test(`slot picker ${theme}`, async ({ page }) => {
    await openApp(page, theme, WIDE_WIDTH);
    await loadSampleWeek(page);
    const row = page
      .locator('.task-row')
      .filter({ has: page.getByText('Write report', { exact: true }) });
    await row.getByRole('button', { name: 'Find time', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /^Find time/ })).toBeVisible();
    await capture(page, `slot-picker-${theme}`);
  });

  test(`replan ${theme}`, async ({ page }) => {
    await openApp(page, theme, WIDE_WIDTH);
    await loadSampleWeek(page);
    await page.getByRole('button', { name: 'Replan', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Replan', exact: true });
    await dialog.getByRole('button', { name: 'Compute plans', exact: true }).click();
    await expect(dialog.getByRole('region', { name: 'Balanced week' })).toBeVisible();
    await capture(page, `replan-${theme}`);
  });
}
// POST: every scene is registered in both themes

test('month light', async ({ page }) => {
  await openApp(page, 'light', WIDE_WIDTH);
  await loadSampleWeek(page);
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await capture(page, 'month-light');
});

test('list dark', async ({ page }) => {
  await openApp(page, 'dark', WIDE_WIDTH);
  await loadSampleWeek(page);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await capture(page, 'list-dark');
});

test('side panels light', async ({ page }) => {
  await openApp(page, 'light', WIDE_WIDTH);
  await page.setViewportSize({ width: WIDE_WIDTH, height: TALL_HEIGHT });
  await loadSampleWeek(page);
  await page.getByRole('complementary', { name: 'Tasks and conflicts' }).screenshot({
    path: `${OUTPUT_DIR}/side-panels-light.png`,
    animations: 'disabled',
  });
});

test('drawer light', async ({ page }) => {
  await openApp(page, 'light', DRAWER_WIDTH);
  await loadSampleWeek(page);
  await page.getByRole('button', { name: 'Tasks and conflicts', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Tasks and conflicts' })).toBeVisible();
  await capture(page, 'drawer-light-900');
});
