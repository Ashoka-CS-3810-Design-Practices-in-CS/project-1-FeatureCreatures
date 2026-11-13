import { expect, test, type Page } from '@playwright/test';
import { collectPageErrors, createEvent, openCalendar } from './helpers';

// PRE: calendar is open in the base week with no modal
// POST: creates a valid Tuesday flexible event whose window includes Monday
async function createMovable(page: Page): Promise<void> {
  await createEvent(page, 'Move', '2026-11-03T14:00', '2026-11-03T15:00', {
    start: '2026-11-02T09:00',
    end: '2026-11-04T18:00',
  });
}

test('T55: all Replan strategies compute, Front-load applies atomically, persists and undoes', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await createMovable(page);
  await page.getByRole('button', { name: 'Replan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Replan', exact: true });
  // INVARIANT: every visited strategy computes alongside the unchanged zero-move Minimal plan
  for (const strategy of [
    'Balanced week',
    'Cluster by category',
    'Vary categories',
    'Fewer fragments',
    'Front-load',
  ]) {
    await dialog
      .getByRole('combobox', { name: 'Strategy', exact: true })
      .selectOption({ label: strategy });
    await dialog.getByRole('button', { name: 'Compute plans', exact: true }).click();
    await expect(dialog.getByRole('region', { name: 'Minimal change', exact: true })).toContainText(
      '0 moves · conflicts 0 → 0',
    );
    await expect(dialog.getByRole('region', { name: strategy, exact: true })).toBeVisible();
  }
  // POST: every strategy computes safely and Front-load is the shown second plan
  const second = dialog.getByRole('region', { name: 'Front-load', exact: true });
  await expect(second).toContainText('Tue 3 Nov 14:00 → Mon 2 Nov 09:00');
  await expect(second).not.toContainText('Total shift:');
  await dialog.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(second).toContainText('Total shift: 29 h');
  await expect(dialog.getByLabel('Buffer (min)', { exact: true })).toBeVisible();
  await second.getByRole('button', { name: 'Apply Front-load', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const moved = page.getByRole('button', { name: /^Move, Mon 2 Nov 09:00–10:00/ });
  await expect(moved).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Move, Tue 3 Nov 14:00–15:00/ })).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(moved).toBeVisible();
  await page.reload();
  await expect(moved).toBeVisible();
  expect(errors).toEqual([]);
});

// INVARIANT: a layout test exists for every theme visited so far
for (const theme of ['light', 'dark'] as const) {
  // INVARIANT: tests cover every visited desktop width in this theme
  for (const width of [1440, 1280, 1024]) {
    test(`T55: Replan inputs share one row, ${theme} ${width}`, async ({ page }) => {
      const errors = collectPageErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await openCalendar(page);
      await page.getByRole('button', { name: 'Replan', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Replan', exact: true });
      const controls = [
        dialog.getByLabel('From', { exact: true }),
        dialog.getByLabel('To', { exact: true }),
        dialog.getByRole('combobox', { name: 'Strategy', exact: true }),
        dialog.getByRole('button', { name: 'Compute plans', exact: true }),
      ];
      const bounds = await Promise.all(controls.map((control) => control.boundingBox()));
      const bottoms = bounds.map((box) => {
        expect(box).not.toBeNull();
        return (box?.y ?? 0) + (box?.height ?? 0);
      });
      expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(2);
      await expect(dialog.getByLabel('Buffer (min)', { exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Details', exact: true }).click();
      await expect(dialog.getByLabel('Buffer (min)', { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
  // POST: every desktop width is covered for this theme
}
// POST: both themes have all three desktop-width checks
