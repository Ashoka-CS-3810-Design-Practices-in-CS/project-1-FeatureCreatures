import { expect, test, type Page } from '@playwright/test';
import { collectPageErrors, createTask, openCalendar } from './helpers';

// PRE: calendar is empty in the base week
// POST: creates Report (scheduled 09–10), Read (window ends 10) and Later (window ends 10:01)
export async function createCompletionTasks(page: Page): Promise<void> {
  await createTask(page, 'Report', '2026-11-02T09:00', '2026-11-02T11:00');
  await createTask(page, 'Read', '2026-11-02T09:00', '2026-11-02T10:00');
  await createTask(page, 'Later', '2026-11-02T09:00', '2026-11-02T10:01');
  const row = page.getByRole('listitem').filter({ has: page.getByText('Report', { exact: true }) });
  await row.getByRole('button', { name: 'Find time', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Find time/ });
  await picker.getByRole('button', { name: 'Apply selected', exact: true }).click();
  await expect(picker).toHaveCount(0);
}

test('T54: completion frees scheduled time, undoes atomically, persists, reopens and freshly schedules', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await createCompletionTasks(page);
  const event = page.getByRole('button', { name: /^Report, Mon 2 Nov 09:00–10:00,.*Task/ });
  await expect(event).toBeVisible();
  await page.getByRole('button', { name: 'Mark Report done', exact: true }).click();
  await expect(event).toHaveCount(0);
  await expect(page.getByText('Report', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(event).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(event).toHaveCount(0);
  await page.reload();
  await page.getByLabel('Show', { exact: true }).selectOption('done');
  const row = page.getByRole('listitem').filter({ has: page.getByText('Report', { exact: true }) });
  await expect(row).toContainText('✓ Done');
  await expect(row.locator('strong')).toHaveCSS('text-decoration-line', 'line-through');
  await expect(row.getByRole('button', { name: 'Find time' })).toHaveCount(0);
  await row.getByRole('button', { name: 'Edit Report', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Edit task', exact: true });
  await form.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(event).toHaveCount(0);
  await page.getByLabel('Show', { exact: true }).selectOption('unscheduled');
  await row.getByRole('button', { name: 'Find time', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Find time/ });
  await picker.getByRole('button', { name: 'Apply selected', exact: true }).click();
  await expect(event).toBeVisible();
  await page.reload();
  await expect(event).toBeVisible();
  expect(errors).toEqual([]);
});

test('T54: Tasks menu previews inclusive bulk membership, cancels safely and applies/undoes once', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await createCompletionTasks(page);
  const menu = page.getByRole('button', { name: 'Tasks menu', exact: true });
  await menu.focus();
  await menu.press('Enter');
  const command = page.getByRole('menuitem', { name: 'Mark done before…', exact: true });
  await expect(command).toBeVisible();
  await command.press('Escape');
  await expect(command).toBeHidden();
  await expect(menu).toBeFocused();
  await menu.press('Enter');
  await command.click();
  const dialog = page.getByRole('dialog', { name: 'Mark done before…', exact: true });
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await dialog.getByLabel('Before', { exact: true }).fill('2026-11-02T10:00');
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(dialog).toContainText('2 tasks will be marked done.');
  await expect(dialog.getByRole('listitem')).toHaveText([/Report/, /Read/]);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const event = page.getByRole('button', { name: /^Report, Mon 2 Nov 09:00–10:00,.*Task/ });
  await expect(event).toBeVisible();
  await menu.click();
  await command.click();
  await dialog.getByLabel('Before', { exact: true }).fill('2026-11-02T10:00');
  await dialog.getByRole('button', { name: 'Preview', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(event).toHaveCount(0);
  await page.getByLabel('Show', { exact: true }).selectOption('done');
  await expect(
    page.getByRole('list', { name: 'Task list', exact: true }).getByRole('listitem'),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(event).toBeVisible();
  await expect(page.getByText('No tasks to show.', { exact: true })).toBeVisible();
  await page.getByLabel('Show', { exact: true }).selectOption('open');
  await expect(
    page.getByRole('list', { name: 'Task list', exact: true }).getByRole('listitem'),
  ).toHaveCount(3);
  expect(errors).toEqual([]);
});
