import { expect, test } from '@playwright/test';
import { openCalendar } from './helpers';

const MAX_TASK_ROW_HEIGHT_PX = 72;
const ROUNDING_PX = 1;

// INVARIANT: compact column checks cover each visited theme
for (const theme of ['light', 'dark'] as const) {
  test(`T63: task checkboxes and names stay separate at 1280, ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: theme });
    await openCalendar(page);
    await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
    const rows = page.getByRole('region', { name: /^Tasks \(/ }).getByRole('listitem');
    await expect(rows).toHaveCount(4);
    // INVARIANT: every visited row keeps its checkbox fully before its task name
    for (const row of await rows.all()) {
      const selection = await row.getByRole('checkbox').boundingBox();
      const name = await row.locator('.task-name').boundingBox();
      expect(selection).not.toBeNull();
      expect(name).not.toBeNull();
      expect((selection?.x ?? 0) + (selection?.width ?? 0)).toBeLessThanOrEqual(name?.x ?? 0);
    }
    // POST: no sample task checkbox overlaps the task name
  });

  test(`T63: four tasks and the whole barred region fit, ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await openCalendar(page);
    await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
    const tasks = page.getByRole('region', { name: /^Tasks \(/ });
    const rows = tasks.getByRole('listitem');
    await expect(rows).toHaveCount(4);
    // INVARIANT: every visited task row is visible, compact and bounded by its column
    for (const row of await rows.all()) {
      await expect(row).toBeInViewport({ ratio: 1 });
      expect((await row.boundingBox())?.height).toBeLessThanOrEqual(MAX_TASK_ROW_HEIGHT_PX);
    }
    // POST: all four task rows fit without scrolling
    const barred = page.getByRole('region', { name: /^Barred slots \(/ });
    await expect(barred).toBeInViewport({ ratio: 1 });
    await expect(barred.getByText('Lunch · 13:00–14:00 · Mon–Fri', { exact: true })).toBeVisible();
    await expect(barred.getByRole('button', { name: 'Kept (0)', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await barred.getByRole('button', { name: 'Edit barred slot Lunch', exact: true }).click();
    const label = await barred.getByLabel('Label', { exact: true }).boundingBox();
    const from = await barred.getByLabel('From', { exact: true }).boundingBox();
    const to = await barred.getByLabel('To', { exact: true }).boundingBox();
    expect(label).not.toBeNull();
    expect(from?.y).toBe(label?.y);
    expect(to?.y).toBe(label?.y);
    const fits = await barred.evaluate(
      (region, rounding) =>
        [...region.querySelectorAll('input')].every(
          (input) => input.scrollWidth <= input.clientWidth + rounding,
        ),
      ROUNDING_PX,
    );
    expect(fits).toBe(true);
  });
}
// POST: both themes fit the sample and keep label/from/to on one editor line
