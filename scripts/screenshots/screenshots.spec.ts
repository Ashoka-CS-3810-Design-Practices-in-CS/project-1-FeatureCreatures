import { expect, test, type Page } from '@playwright/test';
import {
  addLunchBarredSlot,
  createEvent,
  createTask,
  importLegacyBarredSlots,
  openReplan,
  openNewTask,
  showTasks,
  showPlanning,
  closeDrawers,
} from '../../e2e/helpers';

// Design-review screenshots (WI-34), linked from README.md. Not part of `npm run e2e`: run
// `npm run screenshots` and look at docs/screenshots/ after any visual change.

const OUTPUT_DIR = 'docs/screenshots';
const VIEWPORT_HEIGHT = 900;
const WIDE_WIDTH = 1440;
const MEDIUM_DESKTOP_WIDTH = 1280;
const NARROW_DESKTOP_WIDTH = 1024;
const DRAWER_WIDTH = 900;
const TALL_HEIGHT = 1400; // shows the whole side column, conflicts included
const WEEK_WIDTHS = [WIDE_WIDTH, MEDIUM_DESKTOP_WIDTH, NARROW_DESKTOP_WIDTH];
const THEMES = ['light', 'dark'] as const;
const TOAST_WAIT_MS = 10_000;
// Late Monday morning of TEST_PLAN's base week: "today" and the now line sit inside the grid, and
// Tuesday's conflict is still ahead, so Replan has a move to show.
const CLOCK_TIME = new Date('2026-11-02T11:15:00');

type Theme = (typeof THEMES)[number];

// PRE:  page has a fresh browser context; theme is the OS colour scheme to emulate; width > 0
// POST: opens the empty calendar in the base week at that width, with the "System" theme following
//       theme and motion reduced so captures are stable
async function openApp(page: Page, theme: Theme, width: number, now = CLOCK_TIME): Promise<void> {
  await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.clock.install({ time: now });
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
    test(`five regions ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await loadSampleWeek(page);
      await capture(page, `layout-${theme}-${width}`);
      if (width < MEDIUM_DESKTOP_WIDTH) {
        await showTasks(page);
        await capture(page, `layout-tasks-drawer-${theme}-${width}`);
        await closeDrawers(page);
        await showPlanning(page);
        const drawer = page.getByRole('dialog', { name: 'Conflicts', exact: true });
        await expect.poll(() => drawer.evaluate((dialog) => dialog.scrollTop)).toBe(0);
        await expect(
          drawer.getByRole('heading', { name: 'Conflicts', exact: true }),
        ).toBeInViewport({ ratio: 1 });
        await capture(page, `layout-planning-drawer-${theme}-${width}`);
      }
    });

    test(`replan strategies ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width, new Date('2026-11-02T08:00:00'));
      await createEvent(page, 'Lunch event', '2026-11-02T13:00', '2026-11-02T14:00');
      await createEvent(page, 'Move', '2026-11-03T14:00', '2026-11-03T15:00', {
        start: '2026-11-02T09:00',
        end: '2026-11-04T18:00',
      });
      await addLunchBarredSlot(page);
      await showPlanning(page);
      await openReplan(page);
      const dialog = page.getByRole('dialog', { name: 'Replan', exact: true });
      await dialog
        .getByRole('combobox', { name: 'Strategy', exact: true })
        .selectOption('frontLoad');
      await dialog.getByRole('button', { name: 'Compute plans', exact: true }).click();
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: TOAST_WAIT_MS });
      await capture(page, `replan-strategies-${theme}-${width}`);
      await dialog.getByRole('button', { name: 'Details', exact: true }).click();
      await dialog.getByRole('button', { name: 'Not moved by Replan (1)', exact: true }).click();
      await page.setViewportSize({ width, height: TALL_HEIGHT });
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      await capture(page, `replan-strategies-details-${theme}-${width}`);
    });

    test(`appearance ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await loadSampleWeek(page);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const appearance = page.getByRole('region', { name: 'Appearance', exact: true });
      await appearance.screenshot({
        path: `${OUTPUT_DIR}/appearance-${theme}-${width}.png`,
        animations: 'disabled',
      });
      await appearance.getByRole('radio', { name: 'Fern', exact: true }).check();
      await page
        .getByRole('dialog', { name: 'Settings', exact: true })
        .getByRole('button', { name: 'Close', exact: true })
        .click();
      await capture(page, `accent-fern-${theme}-${width}`);
    });

    test(`polished Month and List ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await loadSampleWeek(page);
      await page.getByRole('button', { name: 'Month', exact: true }).click();
      await capture(page, `month-${theme}-${width}`);
      await page.getByRole('button', { name: 'List', exact: true }).click();
      await capture(page, `list-${theme}-${width}`);
    });

    test(`done tasks ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await createTask(page, 'Report', '2026-11-02T09:00', '2026-11-02T11:00');
      await createTask(page, 'Read', '2026-11-02T09:00', '2026-11-02T10:00');
      await createTask(page, 'Later', '2026-11-02T09:00', '2026-11-02T10:01');
      await showTasks(page);
      await page.getByRole('button', { name: 'Mark Report done', exact: true }).click();
      await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('all');
      await page.setViewportSize({ width, height: TALL_HEIGHT });
      await page.getByRole('region', { name: /^Tasks \(/ }).evaluate((panel) => {
        panel.scrollTop = 0;
      });
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: TOAST_WAIT_MS });
      await capture(page, `done-tasks-${theme}-${width}`);
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await page.getByRole('button', { name: 'Tasks menu', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Mark done before…', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Mark done before…', exact: true });
      await dialog.getByLabel('Before', { exact: true }).fill('2026-11-02T10:00');
      await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
      await capture(page, `done-before-${theme}-${width}`);
    });

    test(`barred region ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await createEvent(page, 'Lunch event', '2026-11-02T13:00', '2026-11-02T14:00');
      await addLunchBarredSlot(page);
      await showPlanning(page);
      const region = page.getByRole('region', { name: /^Barred slots \(/ });
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: TOAST_WAIT_MS });
      await region.screenshot({
        path: `${OUTPUT_DIR}/barred-slots-${theme}-${width}.png`,
        animations: 'disabled',
      });
      await region.getByRole('button', { name: /^Keep here: Lunch event in Lunch/ }).click();
      await region.getByRole('button', { name: 'Kept (1)', exact: true }).click();
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: TOAST_WAIT_MS });
      await region.screenshot({
        path: `${OUTPUT_DIR}/barred-kept-${theme}-${width}.png`,
        animations: 'disabled',
      });
      await closeDrawers(page);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
      await settings.getByRole('switch', { name: 'Use working hours' }).uncheck();
      await capture(page, `working-hours-off-${theme}-${width}`);
      await settings.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(settings).toHaveCount(0);
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: TOAST_WAIT_MS });
      await capture(page, `working-time-off-${theme}-${width}`);
    });

    test(`legacy barred labels ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await importLegacyBarredSlots(page);
      await showPlanning(page);
      await expect(
        page.getByText('Lunch and TT overlap on Mon–Fri. Edit one of them.', { exact: true }),
      ).toBeVisible();
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: TOAST_WAIT_MS });
      await capture(page, `barred-legacy-${theme}-${width}`);
    });

    test(`past time ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width, new Date('2026-11-04T13:30:00'));
      await createEvent(page, 'Past lecture', '2026-11-02T09:00', '2026-11-02T10:00');
      await createEvent(page, 'Past meeting', '2026-11-02T09:30', '2026-11-02T10:00');
      await createEvent(page, 'Running seminar', '2026-11-04T13:00', '2026-11-04T14:00');
      await createEvent(page, 'Current review', '2026-11-04T13:15', '2026-11-04T14:30');
      await addLunchBarredSlot(page);
      await showPlanning(page);
      await expect(
        page.getByText('4 events · 0 tasks · 1 conflict (1 past)', { exact: true }),
      ).toBeVisible();
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: TOAST_WAIT_MS });
      await capture(page, `past-time-${theme}-${width}`);
      await page.getByRole('button', { name: 'Past (1)', exact: true }).click();
      await capture(page, `past-time-expanded-${theme}-${width}`);
    });

    test(`week ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await loadSampleWeek(page);
      await capture(page, `week-${theme}-${width}`);
    });

    test(`fixed alternatives ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await createEvent(page, 'Lecture', '2026-11-02T13:00', '2026-11-02T14:00');
      await addLunchBarredSlot(page);
      await showPlanning(page);
      await page.getByRole('button', { name: 'Suggest alternatives for Lecture in Lunch' }).click();
      const picker = page.getByRole('dialog', { name: /^Alternatives for/ });
      await expect(picker.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
      await capture(page, `fixed-alternatives-off-${theme}-${width}`);
      await picker.getByRole('checkbox', { name: 'Allow moving this event' }).check();
      await expect(picker.getByLabel('From', { exact: true })).toBeVisible();
      await expect(picker.getByRole('button', { name: 'Apply', exact: true })).toBeEnabled();
      await capture(page, `fixed-alternatives-on-${theme}-${width}`);
      await picker.getByRole('button', { name: 'Details', exact: true }).click();
      await picker.evaluate((dialog) => {
        dialog.scrollTop = dialog.scrollHeight;
      });
      await capture(page, `fixed-alternatives-details-${theme}-${width}`);
    });

    test(`task suggestions ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await loadSampleWeek(page);
      await showTasks(page);
      const row = page
        .getByRole('listitem')
        .filter({ has: page.getByText('Write report', { exact: true }) });
      await row.getByRole('button', { name: 'Find time', exact: true }).click();
      const picker = page.getByRole('dialog', { name: /^Find time/ });
      await expect(picker.getByRole('region', { name: 'Top picks' })).toBeVisible();
      await capture(page, `task-suggestions-${theme}-${width}`);
      await picker.getByRole('button', { name: 'Details', exact: true }).click();
      await picker.evaluate((dialog) => {
        dialog.scrollTop = dialog.scrollHeight;
      });
      await capture(page, `task-suggestions-details-${theme}-${width}`);
    });
  }
  // POST: this theme's week is captured at every width

  // INVARIANT: dialog captures are registered for every visited width in this theme
  for (const width of [...WEEK_WIDTHS, DRAWER_WIDTH]) {
    test(`categories ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
      await settings.getByRole('button', { name: 'New category…', exact: true }).click();
      await settings.getByLabel('Category name', { exact: true }).fill('Research');
      await settings
        .getByRole('button', { name: 'Create category', exact: true })
        .scrollIntoViewIfNeeded();
      await capture(page, `categories-${theme}-${width}`);
    });

    test(`event dialog ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await page.getByRole('button', { name: '+ Event', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'New event' });
      await dialog.getByLabel('Title', { exact: true }).fill('Study session');
      await dialog.getByRole('radio', { name: /Flexible/ }).check();
      await capture(page, `event-dialog-${theme}-${width}`);
    });

    // WI-46: the redesigned Settings panel with two barred slots, then scrolled to its Data section.
    test(`settings ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
      await capture(page, `settings-${theme}-${width}`);
      await settings
        .getByRole('button', { name: 'Clear all data', exact: true })
        .scrollIntoViewIfNeeded();
      await capture(page, `settings-data-${theme}-${width}`);
    });

    test(`task dialog ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await openNewTask(page);
      await page.getByRole('dialog', { name: 'New task' }).getByLabel('Name').fill('Write report');
      await capture(page, `task-dialog-${theme}-${width}`);
    });
  }
  // POST: event and task forms have captures at desktop and drawer widths in this theme

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
    await openReplan(page);
    const dialog = page.getByRole('dialog', { name: 'Replan', exact: true });
    await dialog.getByRole('button', { name: 'Compute plans', exact: true }).click();
    await expect(dialog.getByRole('region', { name: 'Balanced week' })).toBeVisible();
    await capture(page, `replan-${theme}`);
  });

  // INVARIANT: diagnostic captures are registered at every visited width for this theme
  for (const width of [WIDE_WIDTH, DRAWER_WIDTH]) {
    test(`replan not moved ${theme} ${width}`, async ({ page }) => {
      await openApp(page, theme, width);
      await createEvent(page, 'Class', '2026-11-02T13:00', '2026-11-02T14:00');
      await createEvent(page, 'Meeting', '2026-11-03T13:00', '2026-11-03T14:00');
      await addLunchBarredSlot(page);
      await showPlanning(page);
      await openReplan(page);
      const dialog = page.getByRole('dialog', { name: 'Replan', exact: true });
      await dialog.getByRole('button', { name: 'Compute plans', exact: true }).click();
      await dialog.getByRole('button', { name: 'Details', exact: true }).click();
      await dialog.getByRole('button', { name: 'Not moved by Replan (2)', exact: true }).click();
      await expect(dialog.getByRole('heading', { name: 'Not moved by Replan (2)' })).toHaveCount(1);
      await expect(page.locator('.toast')).toHaveCount(0, { timeout: TOAST_WAIT_MS });
      await capture(page, `replan-not-moved-${theme}-${width}`);
    });
  }
  // POST: fixed-only barred overlaps have captures at desktop and drawer widths in both plans
}
// POST: every scene is registered in both themes

test.describe('barred times in a 12-hour browser locale', () => {
  test.use({ locale: 'en-US' });
  // INVARIANT: the US native-time capture is registered for each visited theme
  for (const theme of THEMES) {
    test(`barred US locale ${theme}`, async ({ page }) => {
      await openApp(page, theme, MEDIUM_DESKTOP_WIDTH);
      await loadSampleWeek(page);
      await page
        .getByRole('region', { name: /^Barred slots \(/ })
        .screenshot({ path: `${OUTPUT_DIR}/barred-us-${theme}-1280.png`, animations: 'disabled' });
    });
  }
  // POST: both themes capture the right column's native US time inputs
});

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
  await page.getByRole('complementary', { name: 'Planning column' }).screenshot({
    path: `${OUTPUT_DIR}/side-panels-light.png`,
    animations: 'disabled',
  });
});

test('drawer light', async ({ page }) => {
  await openApp(page, 'light', DRAWER_WIDTH);
  await loadSampleWeek(page);
  await showPlanning(page);
  await expect(page.getByRole('dialog', { name: 'Conflicts', exact: true })).toBeVisible();
  await capture(page, 'drawer-light-900');
});
