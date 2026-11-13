import { expect, test } from '@playwright/test';
import { addLunchBarredSlot, createEvent, openCalendar } from './helpers';

const NARROW_VIEWPORT = { width: 900, height: 900 };

test('T38: settings warns separately, View opens the drawer, and alternatives clears a barred warning', async ({
  page,
}) => {
  await openCalendar(page);
  await createEvent(page, 'Lunch event', '2026-11-02T13:00', '2026-11-02T14:00');
  await addLunchBarredSlot(page);
  await expect(page.getByText('1 event overlaps barred slots', { exact: true })).toBeVisible();
  const block = page.getByRole('button', { name: /^Lunch event,.*In Lunch, Appointment$/ });
  await expect(block.getByText('In Lunch', { exact: true })).toBeHidden();
  await expect(block.getByText('In Lunch', { exact: true }).locator('..')).toBeVisible();
  await expect(block).toHaveAccessibleName(/In Lunch/);
  await expect(block).toHaveAttribute('title', /In Lunch/);
  await expect(page.getByRole('heading', { name: 'Conflicts (0)', exact: true })).toBeVisible();
  await page.setViewportSize(NARROW_VIEWPORT);
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Conflicts', exact: true });
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
  await picker.getByRole('checkbox', { name: 'Allow moving this event' }).check();
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
