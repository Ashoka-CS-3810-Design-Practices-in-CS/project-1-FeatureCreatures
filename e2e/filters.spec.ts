import { expect, test } from '@playwright/test';
import { openCalendar } from './helpers';
import { CATEGORY_PALETTE } from '../src/shared/constants';
import { readFileSync } from 'node:fs';

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
];
const SAMPLE = JSON.parse(readFileSync('docs/samples/sparseWeek.json', 'utf8'));
const CATEGORY_COUNTS = [5, 12];
const ROUNDING_PX = 1;

// INVARIANT: overflow checks cover each visited theme
for (const theme of ['light', 'dark'] as const) {
  // INVARIANT: every visited viewport has a filter geometry/keyboard check in this theme
  for (const viewport of VIEWPORTS) {
    test(`T60: category filters stay inside toolbar, ${theme} ${viewport.width}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await openCalendar(page);
      // INVARIANT: all visited category counts fit the toolbar and retain mouse/keyboard filtering
      for (const count of CATEGORY_COUNTS) {
        const categories = CATEGORY_PALETTE.slice(0, count).map((colour, index) => ({
          id: SAMPLE.categories[index]?.id ?? `extra-${index}`,
          name: SAMPLE.categories[index]?.name ?? `Extra category ${index}`,
          colour,
          createdAt: SAMPLE.categories[0].createdAt,
        }));
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('tab', { name: 'Data', exact: true }).click();
        await page.getByLabel('Import JSON', { exact: true }).setInputFiles({
          name: 'filters.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify({ ...SAMPLE, categories })),
        });
        await page
          .getByRole('dialog', { name: 'Import calendar?', exact: true })
          .getByRole('button', { name: 'Import', exact: true })
          .click();
        const calendar = page.getByRole('region', { name: 'Calendar', exact: true });
        const trigger = calendar.getByRole('button', { name: 'Category filter', exact: true });
        await expect(trigger).toBeVisible();
        await expect(
          calendar.getByRole('button', { name: 'Reset filters', exact: true }),
        ).toHaveCount(0);
        const fits = await calendar.evaluate((region, rounding) => {
          const bounds = region.getBoundingClientRect();
          return [...region.querySelectorAll('.toolbar button, .toolbar [role="group"]')]
            .filter((control) => control.getClientRects().length > 0)
            .every((control) => {
              const box = control.getBoundingClientRect();
              return (
                control.scrollWidth <= control.clientWidth + rounding &&
                box.left >= bounds.left - rounding &&
                box.right <= bounds.right + rounding
              );
            });
        }, ROUNDING_PX);
        expect(fits).toBe(true);
        await trigger.click();
        const checkboxes = calendar.getByRole('checkbox');
        await expect(checkboxes).toHaveCount(count);
        await checkboxes.first().uncheck();
        await expect(trigger).toHaveText(`Categories (${count - 1} of ${count})`);
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(checkboxes.first()).toBeFocused();
        await page.keyboard.press('Space');
        await expect(checkboxes.first()).toBeChecked();
        await page.keyboard.press('Escape');
      }
      // POST: both five and twelve categories fit and filter accessibly
    });
  }
  // POST: all required widths are checked for this theme
}
// POST: both themes cover every viewport and category count
