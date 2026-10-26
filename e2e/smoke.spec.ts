import { expect, test, type Page } from '@playwright/test';
import { clickTime, collectPageErrors, dragSelect, openCalendar } from './helpers';

// WI-35: runs on the built app and on the StrictMode dev server (playwright.config.ts), so a
// crash or a dialog that closes itself in either mode fails here.

const TOOLBAR_DIALOGS = [
  { button: '+ Event', title: 'New event' },
  { button: '+ Task', title: 'New task' },
  { button: 'Replan', title: 'Replan' },
  { button: 'Settings', title: 'Settings' },
  { button: 'Keyboard shortcuts', title: 'Keyboard shortcuts' },
];

// PRE:  page shows the New event dialog
// POST: names the event and saves it, waiting until the dialog has gone
async function saveNewEvent(page: Page, title: string, start?: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  if (start !== undefined) {
    await dialog.getByLabel('Start', { exact: true }).fill(start);
  }
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('smoke: the main flows run without any page error', async ({ page }) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);

  // INVARIANT: every visited toolbar button opened its dialog, which stayed open until Esc
  for (const { button, title } of TOOLBAR_DIALOGS) {
    await page.getByRole('button', { name: button, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  // POST: every toolbar dialog opens and closes

  await clickTime(page, '09:00:00');
  await saveNewEvent(page, 'Clicked');
  await dragSelect(page, '11:00:00', '11:30:00');
  await saveNewEvent(page, 'Dragged', '2026-11-02T09:15');
  await expect(page.getByRole('heading', { name: 'Conflicts (1)' })).toBeVisible();

  // Dragged is drawn on top of the block it overlaps, so it is the one a pointer can reach.
  await page.getByRole('button', { name: /^Dragged, Mon 2 Nov 09:15–11:30/ }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit event' });
  await expect(editDialog).toBeVisible();
  await editDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editDialog).toHaveCount(0);

  await page.getByRole('button', { name: /^Suggest alternatives for / }).click();
  const alternatives = page.getByRole('dialog', { name: /^Alternatives for/ });
  await alternatives.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(alternatives).toHaveCount(0);
  await expect(page.getByText('No conflicts', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '+ Task', exact: true }).click();
  const taskDialog = page.getByRole('dialog', { name: 'New task' });
  await taskDialog.getByLabel('Name', { exact: true }).fill('Report');
  await taskDialog.getByLabel('Window from', { exact: true }).fill('2026-11-02T09:00');
  await taskDialog.getByLabel('Window to', { exact: true }).fill('2026-11-06T18:00');
  await taskDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(taskDialog).toHaveCount(0);
  const row = page.locator('.task-row').filter({ has: page.getByText('Report', { exact: true }) });
  await row.getByRole('button', { name: 'Find time', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Find time/ });
  await picker.getByRole('button', { name: 'Apply selected', exact: true }).click();
  await expect(picker).toHaveCount(0);

  await page.getByRole('button', { name: 'Replan', exact: true }).click();
  const replan = page.getByRole('dialog', { name: 'Replan', exact: true });
  await replan.getByRole('button', { name: 'Compute plans', exact: true }).click();
  // The scheduled Report task is the one flexible event, so both plan cards appear.
  await expect(replan.getByRole('region', { name: 'Minimal change' })).toBeVisible();
  await expect(replan.getByRole('region', { name: 'Balanced week' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(replan).toHaveCount(0);

  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
