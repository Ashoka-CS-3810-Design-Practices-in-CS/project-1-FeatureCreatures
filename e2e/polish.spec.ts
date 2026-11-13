import { expect, test, type Locator } from '@playwright/test';
import {
  collectPageErrors,
  openCalendar,
  openNewTask,
  showTasks,
  showPlanning,
  closeDrawers,
} from './helpers';
import { contrastRatio } from '../src/shared/colours';

const POSITION_TOLERANCE_PX = 1;
const MIN_TEXT_CONTRAST = 4.5;
test.use({ locale: 'en-US' });

// PRE: first and second are visible form fields
// POST: asserts they occupy one row in source order without overlapping
async function expectFieldPair(first: Locator, second: Locator): Promise<void> {
  const firstBounds = await first.boundingBox();
  const secondBounds = await second.boundingBox();
  expect(firstBounds).not.toBeNull();
  expect(secondBounds).not.toBeNull();
  expect(Math.abs((firstBounds?.y ?? 0) - (secondBounds?.y ?? 0))).toBeLessThanOrEqual(
    POSITION_TOLERANCE_PX,
  );
  expect((firstBounds?.x ?? 0) + (firstBounds?.width ?? 0)).toBeLessThanOrEqual(
    secondBounds?.x ?? 0,
  );
}

// PRE: rgb is an opaque computed CSS rgb() colour
// POST: returns its six-digit hex representation for the shared contrast calculator
function asHex(rgb: string): string {
  return (
    '#' +
    (rgb.match(/\d+/g) ?? [])
      .map((channel) => Number(channel).toString(16).padStart(2, '0'))
      .join('')
  );
}

// INVARIANT: polish checks cover every visited theme
for (const theme of ['light', 'dark'] as const) {
  // INVARIANT: this theme covers each visited required width
  for (const width of [1440, 1280, 1024]) {
    test(`T58: field pairs, compact dates, readable Month and narrow badges, ${theme} ${width}`, async ({
      page,
    }) => {
      const errors = collectPageErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await openCalendar(page);
      await page.getByRole('button', { name: '+ Event', exact: true }).click();
      const event = page.getByRole('dialog', { name: 'New event', exact: true });
      await expectFieldPair(
        event.getByLabel('Start', { exact: true }),
        event.getByLabel('End', { exact: true }),
      );
      await event.press('Escape');
      await openNewTask(page);
      const task = page.getByRole('dialog', { name: 'New task', exact: true });
      await expectFieldPair(
        task.getByLabel('Hours', { exact: true }),
        task.getByLabel('Minutes', { exact: true }),
      );
      await expectFieldPair(
        task.getByLabel('Window from', { exact: true }),
        task.getByLabel('Window to', { exact: true }),
      );
      await task.press('Escape');
      const tasks = page.getByRole('dialog', { name: 'Tasks', exact: true });
      if (await tasks.isVisible()) await tasks.press('Escape');
      await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
      const meeting = page.getByRole('button', { name: /^Meeting,/ });
      // Decorative warning geometry has no separate accessible control; its event owns the full label.
      const warning = await meeting.evaluate((element) => {
        const badge = element.querySelector('.tag-conflict');
        const bounds = element.getBoundingClientRect();
        const badgeBounds = badge?.getBoundingClientRect();
        return { bottom: badgeBounds?.bottom ?? Number.POSITIVE_INFINITY, limit: bounds.bottom };
      });
      expect(warning.bottom).toBeLessThanOrEqual(warning.limit + POSITION_TOLERANCE_PX);
      await showPlanning(page);
      const barred = page.getByRole('region', { name: /^Barred slots \(/ });
      const from = barred.getByLabel('From', { exact: true }).first();
      await expect(from).toHaveValue('13:00');
      const timeWidth = await from.evaluate((input) => ({
        content: input.scrollWidth,
        available: input.clientWidth,
      }));
      expect(timeWidth.content).toBeLessThanOrEqual(timeWidth.available);
      await closeDrawers(page);
      await page.getByRole('button', { name: 'List', exact: true }).click();
      await expect(
        page.getByRole('columnheader', { name: 'Mon 2 Nov 2026', exact: true }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Month', exact: true }).click();
      // FullCalendar has no semantic role for an out-of-month cell's opacity and painted backgrounds.
      const colours = await page
        .locator('.fc-day-other')
        .first()
        .evaluate((cell) => {
          const number = cell.querySelector('.fc-daygrid-day-number');
          let opacity = 1;
          let ancestor: Element | null = number;
          // INVARIANT: ancestor is inside cell; opacity is the product of the visited descendants' opacity
          while (ancestor !== null && ancestor !== cell.parentElement) {
            opacity *= Number(getComputedStyle(ancestor).opacity);
            ancestor = ancestor.parentElement;
          }
          // POST: opacity includes the number and every containing element through its Month cell
          return {
            foreground: getComputedStyle(number ?? cell).color,
            background: getComputedStyle(cell).backgroundColor,
            opacity,
          };
        });
      expect(colours.opacity).toBe(1);
      expect(
        contrastRatio(asHex(colours.foreground), asHex(colours.background)),
      ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Import JSON', exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
  // POST: this theme covers all three required widths
}
// POST: both themes cover field geometry, app-written dates, Month contrast and short-block badges

test('T58: Escape cancels a single-task picker without a zero-scheduled toast or data mutation', async ({
  page,
}) => {
  await openCalendar(page);
  await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
  await showTasks(page);
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByText('Write report', { exact: true }) });
  await row.getByRole('button', { name: 'Find time', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Find time/ });
  await picker.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(page.getByText('Scheduled 0 of 1 task', { exact: true })).toHaveCount(0);
  await expect(row.getByText('Unscheduled', { exact: true })).toBeVisible();
});
