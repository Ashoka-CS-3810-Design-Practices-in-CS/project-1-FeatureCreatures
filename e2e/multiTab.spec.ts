import { expect, test, type Page } from '@playwright/test';
import { collectPageErrors, openCalendar } from './helpers';

const SEMINAR = /^Seminar, Thu 5 Nov 10:00–12:00/;

// PRE:  page shows the sample week
// POST: deletes Seminar through its dialog and the confirmation
async function deleteSeminar(page: Page): Promise<void> {
  await page.getByRole('button', { name: SEMINAR }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit event' });
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete event?' });
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: SEMINAR })).toHaveCount(0);
}

test('T41: a delete in one tab reaches the other tab and a reload never brings it back (#14)', async ({
  context,
}) => {
  const tabOne = await context.newPage();
  const tabTwo = await context.newPage();
  const errorsOne = collectPageErrors(tabOne);
  const errorsTwo = collectPageErrors(tabTwo);
  const pageErrors = () => [...errorsOne, ...errorsTwo];
  await openCalendar(tabOne);
  await tabOne.getByRole('button', { name: 'Load sample week', exact: true }).click();
  await expect(tabOne.getByRole('button', { name: SEMINAR })).toBeVisible();
  await openCalendar(tabTwo);
  await tabTwo.getByRole('button', { name: SEMINAR }).click();
  const editInTabTwo = tabTwo.getByRole('dialog', { name: 'Edit event' });
  await expect(editInTabTwo).toBeVisible();

  await deleteSeminar(tabOne);

  await expect(tabTwo.getByText('Calendar updated in another tab.', { exact: true })).toBeVisible();
  await expect(editInTabTwo).toHaveCount(0);
  await expect(tabTwo.getByRole('button', { name: SEMINAR })).toHaveCount(0);
  await tabTwo.getByRole('button', { name: /^Tutorial, Fri 6 Nov 09:30–10:30/ }).click();
  await tabTwo
    .getByRole('dialog', { name: 'Edit event' })
    .getByLabel('Title', { exact: true })
    .fill('Tutorial (moved)');
  await tabTwo.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    tabOne.getByRole('button', { name: /^Tutorial \(moved\), Fri 6 Nov/ }),
  ).toBeVisible();

  await tabOne.reload();
  await tabTwo.reload();
  // INVARIANT: every tab checked so far shows the renamed Tutorial and no Seminar after its reload
  for (const tab of [tabOne, tabTwo]) {
    await expect(tab.getByRole('button', { name: /^Tutorial \(moved\), Fri 6 Nov/ })).toBeVisible();
    await expect(tab.getByRole('button', { name: SEMINAR })).toHaveCount(0);
  }
  // POST: both tabs read the same stored data: Seminar stays deleted, the other tab's edit kept
  expect(pageErrors()).toEqual([]);
});
