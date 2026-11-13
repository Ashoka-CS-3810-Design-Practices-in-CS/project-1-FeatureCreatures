import { expect, test, type Locator } from '@playwright/test';
import { collectPageErrors, openCalendar } from './helpers';

const DESKTOP_BREAKPOINT_PX = 1280;
const COLUMN_ALIGNMENT_TOLERANCE_PX = 1;

// PRE: region identifies one visible region
// POST: returns the bounds of its nearest vertically scrollable ancestor, or null if none exists
async function scrollColumnBounds(
  region: Locator,
): Promise<{ left: number; right: number } | null> {
  return region.evaluate((element) => {
    let ancestor: Element | null = element;
    // INVARIANT: ancestor is in the region's ancestor chain; no visited element scrolls vertically
    while (ancestor !== null) {
      const overflow = getComputedStyle(ancestor).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') {
        const bounds = ancestor.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right };
      }
      ancestor = ancestor.parentElement;
    }
    // POST: no ancestor supplies this column's independent vertical scrolling
    return null;
  });
}

// INVARIANT: layout checks are registered for every theme visited so far
for (const theme of ['light', 'dark'] as const) {
  // INVARIANT: checks cover every visited desktop width in this theme
  for (const width of [1440, 1280, 1024]) {
    test(`T56: five regions and independent columns/drawers, ${theme} ${width}`, async ({
      page,
    }) => {
      const errors = collectPageErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await openCalendar(page);
      await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
      const appBar = page.getByRole('banner');
      const calendar = page.getByRole('region', { name: 'Calendar', exact: true });
      const tasks = page.getByRole('region', { name: /^Tasks \(/ });
      const conflicts = page.getByRole('region', { name: /^Conflicts \(/ });
      const replan = page.getByRole('region', { name: 'Replan', exact: true });
      const barred = page.getByRole('region', { name: /^Barred slots \(/ });
      await expect(calendar).toBeVisible();
      await expect(appBar.getByRole('button', { name: '+ Event', exact: true })).toHaveCount(0);
      await expect(appBar.getByRole('button', { name: '+ Task', exact: true })).toHaveCount(0);
      await expect(calendar.getByRole('button', { name: '+ Event', exact: true })).toHaveCount(1);
      if (width >= DESKTOP_BREAKPOINT_PX) {
        await expect(tasks).toBeVisible();
        await expect(conflicts).toBeVisible();
        await expect(replan).toBeVisible();
        await expect(barred).toBeVisible();
        const [taskColumn, calendarColumn, rightColumn] = await Promise.all([
          scrollColumnBounds(tasks),
          scrollColumnBounds(calendar),
          scrollColumnBounds(conflicts),
        ]);
        expect(taskColumn).not.toBeNull();
        expect(calendarColumn).not.toBeNull();
        expect(rightColumn).not.toBeNull();
        expect(taskColumn?.right).toBeLessThanOrEqual(
          (calendarColumn?.left ?? 0) + COLUMN_ALIGNMENT_TOLERANCE_PX,
        );
        expect(calendarColumn?.right).toBeLessThanOrEqual(
          (rightColumn?.left ?? 0) + COLUMN_ALIGNMENT_TOLERANCE_PX,
        );
        await expect(tasks.getByRole('button', { name: '+ Task', exact: true })).toHaveCount(1);
        const firstTask = tasks.getByRole('listitem').first();
        const doneBounds = await firstTask
          .getByRole('button', { name: /^Mark .+ done$/ })
          .boundingBox();
        const findBounds = await firstTask
          .getByRole('button', { name: 'Find time', exact: true })
          .boundingBox();
        const editBounds = await firstTask.getByRole('button', { name: /^Edit / }).boundingBox();
        expect(doneBounds).not.toBeNull();
        expect(findBounds?.y).toBe(doneBounds?.y);
        expect(editBounds?.y).toBe(doneBounds?.y);
      } else {
        await expect(tasks).toBeHidden();
        await expect(conflicts).toBeHidden();
        const taskTrigger = appBar.getByRole('button', { name: /^Tasks \(\d+\)$/ });
        await taskTrigger.click();
        const taskDrawer = page.getByRole('dialog', { name: /^Tasks/ });
        await expect(taskDrawer.getByRole('region', { name: /^Tasks \(/ })).toHaveCount(1);
        await taskDrawer.getByRole('button', { name: '+ Task', exact: true }).focus();
        await page.keyboard.press('Tab');
        await expect(taskDrawer.getByRole('combobox', { name: 'Show', exact: true })).toBeFocused();
        await taskDrawer.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(taskTrigger).toBeFocused();
        const conflictTrigger = appBar.getByRole('button', { name: /^Conflicts \(\d+\)$/ });
        await conflictTrigger.click();
        const rightDrawer = page.getByRole('dialog', { name: /^Conflicts/ });
        await expect.poll(() => rightDrawer.evaluate((dialog) => dialog.scrollTop)).toBe(0);
        await expect(
          rightDrawer.getByRole('region', { name: 'Replan', exact: true }),
        ).toBeVisible();
        await expect(rightDrawer.getByRole('region', { name: /^Barred slots \(/ })).toBeVisible();
        await rightDrawer.press('Escape');
        await expect(rightDrawer).toHaveCount(0);
        await expect(conflictTrigger).toBeFocused();
      }
      expect(errors).toEqual([]);
    });
  }
  // POST: every desktop width is covered for this theme
}
// POST: both themes cover the two desktop widths and the 1024px drawers
