import { expect, test } from '@playwright/test';
import { addLunchBarredSlot, collectPageErrors, createEvent, openCalendar } from './helpers';

test('T50: fixed alternatives opt in to a temporary range, preserve kind, undo and persist', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await createEvent(page, 'Lecture', '2026-11-02T13:00', '2026-11-02T14:00');
  await addLunchBarredSlot(page);
  await page.getByRole('button', { name: 'Suggest alternatives for Lecture in Lunch' }).click();
  const picker = page.getByRole('dialog', { name: /^Alternatives for/ });
  await expect(
    picker.getByText('Lecture is fixed, so no suggestions are made for it.'),
  ).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await picker.getByRole('checkbox', { name: 'Allow moving this event' }).check();
  await picker.getByLabel('From', { exact: true }).fill('2026-11-05');
  await expect(picker.getByRole('alert')).toContainText('Range end must be after its start.');
  await picker.getByLabel('To', { exact: true }).fill('2026-11-05');
  await picker.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(picker).toHaveCount(0);
  const placed = page.getByRole('button', { name: /^Lecture, Thu 5 Nov 09:00–10:00,.*Fixed/ });
  await expect(placed).toBeVisible();
  await placed.click();
  const edit = page.getByRole('dialog', { name: 'Edit event' });
  await expect(
    edit.getByRole('radio', { name: 'Fixed — the planner leaves it alone' }),
  ).toBeChecked();
  await expect(edit.getByLabel('Window start', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Lecture, Mon 2 Nov 13:00–14:00/ })).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.reload();
  await expect(placed).toBeVisible();
  expect(errors).toEqual([]);
});
