import { expect, test } from '@playwright/test';
import { openCalendar } from './helpers';

const WIDTHS = [1440, 1024, 900];
const VIEWPORT_HEIGHT = 900;
const THEMES = ['light', 'dark'] as const;

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// PRE:  input and dialog are rendered element bounds in the same viewport
// POST: asserts the entire input lies inside the dialog's visible rectangle
function expectInsideDialog(input: Bounds, dialog: Bounds): void {
  expect(input.x).toBeGreaterThanOrEqual(dialog.x);
  expect(input.y).toBeGreaterThanOrEqual(dialog.y);
  expect(input.x + input.width).toBeLessThanOrEqual(dialog.x + dialog.width);
  expect(input.y + input.height).toBeLessThanOrEqual(dialog.y + dialog.height);
}

// INVARIANT: checks are registered for every visited theme and viewport width
for (const theme of THEMES) {
  // INVARIANT: this theme has a geometry and keyboard check for every visited width
  for (const width of WIDTHS) {
    test(`dialog form layout and native radios ${theme} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
      await page.emulateMedia({ colorScheme: theme });
      await openCalendar(page);
      await page.getByRole('button', { name: '+ Event', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'New event' });
      await dialog.getByRole('radio', { name: /Flexible/ }).check();
      const end = await dialog.getByLabel('End', { exact: true }).boundingBox();
      const bounds = await dialog.boundingBox();
      expect(end).not.toBeNull();
      expect(bounds).not.toBeNull();
      if (end === null || bounds === null) throw new Error('Missing dialog or End geometry');
      expectInsideDialog(end, bounds);
      // INVARIANT: every visited flex-window input is below End and inside the dialog
      for (const label of ['Window start', 'Window end']) {
        const field = await dialog.getByLabel(label, { exact: true }).boundingBox();
        expect(field).not.toBeNull();
        if (field === null) throw new Error(`Missing ${label} geometry`);
        expect(field.y).toBeGreaterThanOrEqual(end.y + end.height);
        expectInsideDialog(field, bounds);
      }
      // POST: neither flex-window input intersects End or exceeds the dialog bounds
      const group = dialog.getByRole('group', { name: 'Flex window' });
      const title = await dialog.getByLabel('Title', { exact: true }).boundingBox();
      const flexBounds = await group.boundingBox();
      expect(flexBounds?.width).toBe(title?.width);
      const high = dialog.getByRole('radio', { name: '[H] High' });
      await high.focus();
      await page.keyboard.press('ArrowRight');
      await expect(dialog.getByRole('radio', { name: '[M] Medium' })).toBeChecked();
      await page.keyboard.press('ArrowRight');
      await expect(dialog.getByRole('radio', { name: '[L] Low' })).toBeChecked();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '+ Task', exact: true }).click();
      const task = page.getByRole('dialog', { name: 'New task' });
      await expect(task.getByRole('radio', { name: 'Working hours only' })).toBeChecked();
      await task.getByRole('radio', { name: 'Working hours only' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(task.getByRole('radio', { name: 'Any time' })).toBeChecked();
      await task.getByRole('radio', { name: '[M] Medium' }).focus();
      await page.keyboard.press('ArrowLeft');
      await expect(task.getByRole('radio', { name: '[H] High' })).toBeChecked();
    });
  }
  // POST: all required viewport widths are checked in this theme
}
// POST: both themes cover full-width, non-overlapping flex fields and native arrow-key radios
