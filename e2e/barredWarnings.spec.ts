import { expect, test } from '@playwright/test';
import { createEvent, openCalendar } from './helpers';

const NARROW_VIEWPORT = { width: 900, height: 900 };

test('T38: settings warns separately, View opens the drawer, and alternatives clears a barred warning', async ({
  page,
}) => {
  await openCalendar(page);
  await createEvent(page, 'Lunch event', '2026-11-02T13:00', '2026-11-02T14:00');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('button', { name: 'Add barred slot', exact: true }).click();
  const slot = settings.getByRole('group', { name: 'Barred slot 1', exact: true });
  await slot.getByLabel('Label', { exact: true }).fill('Lunch');
  await slot.getByLabel('From', { exact: true }).fill('13:00');
  await slot.getByLabel('To', { exact: true }).fill('14:00');
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(page.getByText('1 event overlaps barred slots', { exact: true })).toBeVisible();
  const block = page.getByRole('button', { name: /^Lunch event,.*In Lunch$/ });
  await expect(block.getByText('In Lunch', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Conflicts (0)', exact: true })).toBeVisible();
  await page.setViewportSize(NARROW_VIEWPORT);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Tasks and conflicts', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Barred-slot overlaps (1)' })).toBeFocused();
  const warnings = drawer.getByRole('region', { name: 'Barred-slot overlaps (1)' });
  await expect(warnings).toContainText('Mon 2 Nov 13:00–14:00 (1 h)');
  await warnings
    .getByRole('button', { name: 'Suggest alternatives for Lunch event in Lunch' })
    .click();
  const picker = page.getByRole('dialog', { name: /^Alternatives for/ });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('group', { name: 'Move', exact: true })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(drawer.getByRole('heading', { name: 'Barred-slot overlaps (0)' })).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Conflicts (0)' })).toBeVisible();
});

test('sparseWeek Thesis draft shows the 10 h versus 4 h ER2 explanation', async ({ page }) => {
  await openCalendar(page);
  await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
  const row = page
    .locator('.task-row')
    .filter({ has: page.getByText('Thesis draft', { exact: true }) });
  await row.getByRole('button', { name: 'Find time', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Find time/ });
  await expect(picker.getByRole('alert')).toHaveText(
    'This needs 10 h, but the longest stretch available in its window is 4 h. Shorten the task or widen the window.',
  );
});
