import { expect, test } from '@playwright/test';
import { openCalendar, showTasks } from './helpers';

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
];

// INVARIANT: both-picker time checks cover each visited theme
for (const theme of ['light', 'dark'] as const) {
  // INVARIANT: each visited viewport checks the task and alternatives picks in this theme
  for (const viewport of VIEWPORTS) {
    test(`T64: both pickers keep complete time ranges on one line, ${theme} ${viewport.width}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await openCalendar(page);
      await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
      await showTasks(page);
      const report = page
        .getByRole('listitem')
        .filter({ has: page.getByText('Write report', { exact: true }) });
      await report.getByRole('button', { name: 'Find time', exact: true }).click();
      // INVARIANT: each visited picker shows bounded, nonwrapping top-pick ranges
      for (const mode of ['task', 'alternatives']) {
        const dialog = page.getByRole('dialog', {
          name: mode === 'task' ? /^Find time/ : /^Alternatives/,
        });
        const ranges = dialog.locator('.picker-range');
        expect(await ranges.count()).toBeGreaterThan(0);
        // INVARIANT: every visited range has nowrap text and fits its own card
        for (const range of await ranges.all()) {
          await expect(range).toHaveCSS('white-space', 'nowrap');
          expect(
            await range.evaluate((element) => element.scrollWidth <= element.clientWidth),
          ).toBe(true);
          expect(
            await range.evaluate((element) => {
              const card = element.closest('.picker-pick');
              if (card === null) return false;
              const bounds = element.getBoundingClientRect();
              const cardBounds = card.getBoundingClientRect();
              return bounds.left >= cardBounds.left && bounds.right <= cardBounds.right;
            }),
          ).toBe(true);
        }
        // POST: no pick range wraps or paints past its card
        await dialog.press('Escape');
        if (mode === 'task') {
          const drawer = page.getByRole('dialog', { name: 'Tasks', exact: true });
          if (await drawer.isVisible()) await drawer.press('Escape');
          if (viewport.width < 1280)
            await page.getByRole('button', { name: /^Conflicts \(/ }).click();
          await page
            .getByRole('button', {
              name: 'Suggest alternatives for Lecture ↔ Meeting',
              exact: true,
            })
            .click();
        }
      }
      // POST: both task and alternatives pick ranges fit without wrapping
    });
  }
  // POST: both pickers are checked at all three desktop sizes in this theme
}
// POST: all required themes and desktop sizes keep pick ranges on one line
