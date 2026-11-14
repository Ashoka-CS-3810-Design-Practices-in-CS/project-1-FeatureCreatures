import { expect, test } from '@playwright/test';
import { showTasks, useConfiguredFont } from './helpers';

test('T61: Saturday samples navigate to a live week with a conflict and task slots', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install({ time: new Date('2026-11-07T08:00:00') });
  await page.goto('/');
  await useConfiguredFont(page);
  await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Week of 9 Nov 2026', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Loaded sample: Sparse week (week of 9 Nov).', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Upcoming (1)', { exact: true })).toBeVisible();
  await showTasks(page);
  const report = page
    .getByRole('listitem')
    .filter({ has: page.getByText('Write report', { exact: true }) });
  await report.getByRole('button', { name: 'Find time', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: /Find time/ })
      .getByRole('radio')
      .first(),
  ).toBeVisible();
});
