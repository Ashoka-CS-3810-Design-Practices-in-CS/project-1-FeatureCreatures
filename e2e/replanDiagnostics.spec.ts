import { expect, test } from '@playwright/test';
import { addLunchBarredSlot, createEvent, openCalendar } from './helpers';

test('T40: Replan explains fixed Lunch overlaps while moving flexible events and reuses alternatives', async ({
  page,
}) => {
  await openCalendar(page);
  await createEvent(page, 'Class', '2026-11-02T13:00', '2026-11-02T14:00');
  await page.getByRole('button', { name: '+ Event', exact: true }).click();
  const event = page.getByRole('dialog', { name: 'New event' });
  await event.getByLabel('Title', { exact: true }).fill('Study');
  await event.getByLabel('Start', { exact: true }).fill('2026-11-02T13:00');
  await event.getByLabel('End', { exact: true }).fill('2026-11-02T14:00');
  await event.getByRole('checkbox', { name: /Flexible/ }).check();
  await event.getByLabel('Window start', { exact: true }).fill('2026-11-02T09:00');
  await event.getByLabel('Window end', { exact: true }).fill('2026-11-02T18:00');
  await event.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(event).toBeHidden();
  await addLunchBarredSlot(page);
  const warnings = page.getByRole('region', { name: 'Barred-slot overlaps (2)' });
  await expect(warnings.getByText('Fixed', { exact: true })).toBeVisible();
  await expect(warnings.getByText('Flexible', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Replan', exact: true }).click();
  const replan = page.getByRole('dialog', { name: 'Replan', exact: true });
  await replan.getByRole('button', { name: 'Compute plans', exact: true }).click();
  const minimal = replan.getByRole('region', { name: 'Minimal change' });
  await expect(minimal).toContainText('Moved: 1');
  await expect(minimal).toContainText('Lunch');
  await expect(minimal.getByRole('heading', { name: 'Not moved by Replan' })).toBeVisible();
  await expect(minimal.getByRole('list', { name: 'Minimal change not moved' })).toContainText(
    '"Class" — Fixed event',
  );
  await expect(minimal).toContainText('Overlaps Lunch.');
  await minimal
    .getByRole('button', { name: 'Suggest alternatives for Class', exact: true })
    .click();
  await expect(replan).toHaveCount(0);
  const picker = page.getByRole('dialog', { name: /^Alternatives for/ });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('group', { name: 'Move', exact: true })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(picker).toHaveCount(0);
  const remaining = page.getByRole('region', { name: 'Barred-slot overlaps (1)' });
  await expect(remaining).toContainText('Study');
  await expect(remaining.getByText('Fixed', { exact: true })).toHaveCount(0);
});
