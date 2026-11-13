import { expect, test } from '@playwright/test';
import { createConflict, collectPageErrors } from './helpers';

test('T53: working-hours switch persists, hides task/search choices and removes non-working shading', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await createConflict(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('switch', { name: 'Use working hours' }).uncheck();
  await expect(settings.getByLabel('Working hours from', { exact: true })).toBeDisabled();
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(settings).toHaveCount(0);
  // FullCalendar's decorative business-hour shading has no accessible control.
  await expect(page.locator('.fc-non-business')).toHaveCount(0);
  await page.getByRole('button', { name: 'Suggest alternatives for A ↔ B' }).click();
  const picker = page.getByRole('dialog', { name: /^Alternatives for/ });
  await picker.getByRole('checkbox', { name: 'Allow moving this event' }).check();
  await expect(picker.getByRole('group', { name: 'Search hours', exact: true })).toHaveCount(0);
  await expect(picker.getByRole('region', { name: 'Top picks' })).toBeVisible();
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await page.getByRole('button', { name: '+ Task', exact: true }).click();
  const task = page.getByRole('dialog', { name: 'New task', exact: true });
  await expect(task.getByRole('group', { name: 'Scheduling hours', exact: true })).toHaveCount(0);
  await task.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(task).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.fc-non-business')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(settings.getByRole('switch', { name: 'Use working hours' })).not.toBeChecked();
  await settings.getByRole('switch', { name: 'Use working hours' }).check();
  await expect(settings.getByLabel('Working hours from', { exact: true })).toBeEnabled();
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(settings).toHaveCount(0);
  await expect(page.locator('.fc-non-business').first()).toBeVisible();
  expect(errors).toEqual([]);
});
