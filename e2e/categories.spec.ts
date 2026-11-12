import { expect, test } from '@playwright/test';
import { collectPageErrors, openCalendar } from './helpers';

const THEMES = ['light', 'dark'] as const;

// INVARIANT: all visited themes have a category lifecycle browser regression
for (const theme of THEMES) {
  test(`T49: inline categories, tags, filters and persistence (${theme})`, async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.emulateMedia({ colorScheme: theme });
    await openCalendar(page);
    await page.getByRole('button', { name: '+ Event', exact: true }).click();
    const event = page.getByRole('dialog', { name: 'New event', exact: true });
    await event.getByLabel('Title', { exact: true }).fill('Research meeting');
    await event.getByLabel('Start', { exact: true }).fill('2026-11-02T10:00');
    await event.getByLabel('End', { exact: true }).fill('2026-11-02T11:00');
    await event.getByLabel('Category', { exact: true }).selectOption('__new_category__');
    await event.getByLabel('Category name', { exact: true }).fill('Research');
    await event.getByLabel('Custom colour', { exact: true }).fill('#577d35');
    await event.getByRole('button', { name: 'Create category', exact: true }).click();
    await expect(event.getByLabel('Category', { exact: true })).toHaveValue(/.+/);
    await expect(event.getByLabel('Title', { exact: true })).toHaveValue('Research meeting');
    await event.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(event).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Research meeting,.*Research$/ })).toBeVisible();

    await page.getByRole('button', { name: '+ Task', exact: true }).click();
    const task = page.getByRole('dialog', { name: 'New task', exact: true });
    const chosenCategory = await task.getByLabel('Category', { exact: true }).inputValue();
    await expect(task.getByRole('option', { name: 'Research', exact: true })).toHaveAttribute(
      'value',
      chosenCategory,
    );
    await task.getByLabel('Name', { exact: true }).fill('Read paper');
    await task.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(task).toHaveCount(0);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await settings.getByRole('button', { name: 'Delete Research', exact: true }).click();
    await expect(
      settings.getByText('Used by 1 event and 1 task. Change their category or delete them first.'),
    ).toBeVisible();
    await settings.getByRole('button', { name: 'Edit Research', exact: true }).click();
    await settings.getByLabel('Category name', { exact: true }).fill('Projects');
    await settings.getByLabel('Custom colour', { exact: true }).fill('#7e6ac0');
    await settings.getByRole('button', { name: 'Save category', exact: true }).click();
    await expect(
      settings.getByRole('group', { name: 'Category Projects', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /^Research meeting,.*Projects$/ })).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Task list' }).getByText('Projects', { exact: true }),
    ).toBeVisible();
    const filters = page.getByRole('group', { name: 'Category filter' });
    await filters.getByRole('button', { name: 'Projects', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Research meeting,/ })).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: 'Task list' }).getByText('Read paper', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: /^Research meeting,.*Research$/ })).toBeVisible();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Research meeting,.*Projects$/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
// POST: both themes have the same category lifecycle regression
