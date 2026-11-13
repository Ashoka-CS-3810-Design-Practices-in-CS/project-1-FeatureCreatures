import { expect, test } from '@playwright/test';
import { collectPageErrors, openCalendar } from './helpers';

const EVENT_FILLS = { light: 'rgb(54, 54, 49)', dark: 'rgb(235, 230, 217)' };
const ACCENTS = ['Neutral', 'Fern', 'Teal', 'Cyan', 'Indigo', 'Violet', 'Rose', 'Olive'];

// INVARIANT: appearance checks cover every theme visited so far
for (const theme of ['light', 'dark'] as const) {
  // INVARIANT: appearance checks cover every width visited in this theme
  for (const width of [1440, 1280, 1024]) {
    test(`T57: fills, narrow tags, accents and resolved theme persist, ${theme} ${width}`, async ({
      page,
    }) => {
      const errors = collectPageErrors(page);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await openCalendar(page);
      await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
      await expect(page.getByRole('button', { name: /^Seminar,/ })).toHaveCSS(
        'background-color',
        EVENT_FILLS[theme],
      );
      await expect(page.getByRole('button', { name: /^Study,/ })).toHaveCSS(
        'background-color',
        EVENT_FILLS[theme],
      );
      const meeting = page.getByRole('button', { name: /^Meeting,/ });
      await expect(meeting.getByText('[M]', { exact: true })).toBeVisible();
      await expect(meeting.getByText('Flexible', { exact: true })).toBeHidden();
      await expect(meeting).toHaveAttribute('title', /Meeting.*Flexible/);
      await page.getByRole('button', { name: 'List', exact: true }).click();
      const listEvent = page.getByRole('button', { name: /^Seminar,/ });
      await listEvent.hover();
      await expect(listEvent).toHaveCSS('background-color', EVENT_FILLS[theme]);
      await page.getByRole('button', { name: 'Calendar', exact: true }).click();
      await expect(
        page
          .getByRole('button', { name: 'Theme: System', exact: true })
          .getByRole('img', { name: `${theme === 'light' ? 'Light' : 'Dark'} theme` }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      const appearance = page.getByRole('region', { name: 'Appearance', exact: true });
      const accents = appearance.getByRole('radiogroup', { name: 'Accent', exact: true });
      await expect(accents.getByRole('radio')).toHaveCount(ACCENTS.length);
      // INVARIANT: every visited swatch is checked successfully without changing domain data
      for (const name of ACCENTS) {
        const swatch = accents.getByRole('radio', { name, exact: true });
        await swatch.check();
        await expect(swatch).toBeChecked();
      }
      // POST: all eight curated accents can be selected through their native radios
      await accents.getByRole('radio', { name: 'Fern', exact: true }).check();
      await appearance.getByRole('radio', { name: 'Dark', exact: true }).check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await appearance.getByRole('radio', { name: 'System', exact: true }).check();
      await page
        .getByRole('dialog', { name: 'Settings', exact: true })
        .getByRole('button', { name: 'Close', exact: true })
        .click();
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-accent', 'fern');
      await expect(page.getByRole('button', { name: 'Theme: System', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /^Seminar,/ })).toHaveCSS(
        'background-color',
        EVENT_FILLS[theme],
      );
      await page.getByRole('button', { name: 'Theme: System', exact: true }).click();
      await expect(page.locator('html')).toHaveAttribute(
        'data-theme',
        theme === 'light' ? 'dark' : 'light',
      );
      expect(errors).toEqual([]);
    });
  }
  // POST: this theme is checked at all three required widths
}
// POST: both themes cover fills, tags, all accents, System and persisted preferences
