import { expect, test } from '@playwright/test';
import {
  addLunchBarredSlot,
  createEvent,
  openCalendar,
  collectPageErrors,
  importLegacyBarredSlots,
} from './helpers';

test('T53: Keep here persists across reload and Stop keeping is undoable in the separate barred region', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await createEvent(page, 'Lunch event', '2026-11-02T13:00', '2026-11-02T14:00');
  await addLunchBarredSlot(page);
  const region = page.getByRole('region', { name: /^Barred slots \(/ });
  const block = page.getByRole('button', { name: /^Lunch event, Mon 2 Nov/ });
  await expect(block).toHaveAccessibleName(/In Lunch/);
  await region.getByRole('button', { name: /^Keep here: Lunch event in Lunch/ }).click();
  await expect(
    region.getByRole('heading', { name: 'Barred-slot overlaps (0)', exact: true }),
  ).toBeVisible();
  await expect(block).not.toHaveAccessibleName(/In Lunch/);
  await expect(region.getByRole('button', { name: 'Kept (1)', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.reload();
  await expect(region.getByRole('button', { name: 'Kept (1)', exact: true })).toBeVisible();
  await expect(block).not.toHaveAccessibleName(/In Lunch/);
  await region.getByRole('button', { name: 'Kept (1)', exact: true }).click();
  await region.getByRole('button', { name: /^Stop keeping: Lunch event in Lunch/ }).click();
  await expect(block).toHaveAccessibleName(/In Lunch/);
  await page.getByRole('button', { name: /^Undo/ }).click();
  await expect(block).not.toHaveAccessibleName(/In Lunch/);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings.getByRole('button', { name: 'Add barred slot', exact: true })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});

test('T53: older imported overlaps have a repair banner and labels stack without colliding', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await importLegacyBarredSlots(page);
  await expect(
    page.getByText('Lunch and TT overlap on Mon–Fri. Edit one of them.', { exact: true }),
  ).toBeVisible();
  // Decorative FullCalendar backgrounds expose geometry, not control roles.
  const background = page.locator('.fc-bg-event.barred').first();
  const lunch = await background.getByText('Lunch', { exact: true }).boundingBox();
  const tt = await background.getByText('TT', { exact: true }).boundingBox();
  expect(lunch).not.toBeNull();
  expect(tt).not.toBeNull();
  if (lunch === null || tt === null) throw new Error('Legacy labels have no visible geometry');
  expect(tt.y).toBeGreaterThanOrEqual(lunch.y + lunch.height);
  const region = page.getByRole('region', { name: /^Barred slots \(/ });
  const second = region.getByRole('group', { name: 'Barred slot 2', exact: true });
  await second.getByLabel('From', { exact: true }).fill('14:00');
  await region.getByRole('button', { name: 'Save barred slots', exact: true }).click();
  await expect(region.getByRole('button', { name: 'Save barred slots', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText('Lunch and TT overlap on Mon–Fri. Edit one of them.', { exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
