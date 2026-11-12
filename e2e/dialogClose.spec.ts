import { expect, test } from '@playwright/test';
import { collectPageErrors, openCalendar, TOOLBAR_DIALOGS } from './helpers';

test('T46 (#11): the × closes every toolbar dialog like Esc and returns focus', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);

  // INVARIANT: every visited dialog closed through its × and gave focus back to its button
  for (const { button, title } of TOOLBAR_DIALOGS) {
    const trigger = page.getByRole('button', { name: button, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  // POST: every toolbar dialog has a working ×

  expect(errors).toEqual([]);
});
