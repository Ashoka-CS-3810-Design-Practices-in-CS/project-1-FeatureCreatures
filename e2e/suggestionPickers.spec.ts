import { expect, test } from '@playwright/test';
import {
  addLunchBarredSlot,
  collectPageErrors,
  createEvent,
  openCalendar,
  openNewTask,
} from './helpers';

test('T51: task picks, expansion, keyboard chips and Details apply the chosen time and persist', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await openNewTask(page);
  const form = page.getByRole('dialog', { name: 'New task' });
  await form.getByLabel('Name', { exact: true }).fill('Report');
  await form.getByLabel('Hours', { exact: true }).fill('1');
  await form.getByLabel('Minutes', { exact: true }).fill('0');
  await form.getByLabel('Window from', { exact: true }).fill('2026-11-02T09:00');
  await form.getByLabel('Window to', { exact: true }).fill('2026-11-02T18:00');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Find time', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Find time/ });
  const slots = picker.getByRole('group', { name: 'Available slots' });
  const picks = picker.getByRole('region', { name: 'Top picks' });
  await expect(picks.getByRole('radio', { name: /Earliest.*09:00–10:00/ })).toBeChecked();
  await expect(picker.getByLabel('Buffer (min)')).toHaveCount(0);
  const days = picker.getByRole('region', { name: 'All options by day' });
  await expect(days.getByRole('radio')).toHaveCount(8);
  await days.getByRole('button', { name: 'Show 8 more' }).click();
  await expect(days.getByRole('radio')).toHaveCount(16);
  const chip = days.getByRole('radio', { name: '14:30–15:30', exact: true });
  await chip.focus();
  await chip.press('Space');
  await chip.press('ArrowRight');
  await expect(days.getByRole('radio', { name: '15:00–16:00', exact: true })).toBeChecked();
  await expect(slots.getByRole('radio', { checked: true })).toHaveCount(1);
  await picker.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(picker.getByLabel('Buffer (min)')).toHaveValue('0');
  await expect(picker.getByText('Selected: Mon 2 Nov 15:00–16:00', { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Apply selected', exact: true }).click();
  const placed = page.getByRole('button', { name: /^Report, Mon 2 Nov 15:00–16:00,.*Task/ });
  await expect(placed).toBeVisible();
  await page.reload();
  await expect(placed).toBeVisible();
  expect(errors).toEqual([]);
});

test('T51: fixed alternatives share picks and day chips, apply a chip, preserve kind and undo', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await createEvent(page, 'Lecture', '2026-11-02T13:00', '2026-11-02T14:00');
  await addLunchBarredSlot(page);
  await page.getByRole('button', { name: 'Suggest alternatives for Lecture in Lunch' }).click();
  const picker = page.getByRole('dialog', { name: /^Alternatives for/ });
  await picker.getByRole('checkbox', { name: 'Allow moving this event' }).check();
  const picks = picker.getByRole('region', { name: 'Top picks' });
  await expect(picks.getByRole('radio', { name: /Closest.*12:00–13:00/ })).toBeChecked();
  await expect(picker.getByRole('button', { name: 'Details' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const days = picker.getByRole('region', { name: 'All options by day' });
  await days
    .getByRole('group', { name: 'Mon 2 Nov', exact: true })
    .getByRole('radio', { name: '11:30–12:30', exact: true })
    .check();
  await expect(
    picker.getByRole('group', { name: 'Available slots' }).getByRole('radio', { checked: true }),
  ).toHaveCount(1);
  await picker.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /^Lecture, Mon 2 Nov 11:30–12:30,.*Fixed/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Lecture, Mon 2 Nov 13:00–14:00/ })).toBeVisible();
  expect(errors).toEqual([]);
});
