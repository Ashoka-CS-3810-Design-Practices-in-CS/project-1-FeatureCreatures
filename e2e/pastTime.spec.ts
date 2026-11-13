import { expect, test } from '@playwright/test';
import { createEvent, openCalendar, addLunchBarredSlot, collectPageErrors } from './helpers';

test('T52: time alone moves conflicts to Past and removes barred tags; every day keeps a now guide', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await createEvent(page, 'A', '2026-11-02T13:00', '2026-11-02T13:30');
  await createEvent(page, 'B', '2026-11-02T13:15', '2026-11-02T14:00');
  await addLunchBarredSlot(page);
  await page.clock.fastForward('05:30:00');
  await expect(page.getByRole('heading', { name: 'Conflicts (0)', exact: true })).toBeVisible();
  await expect(
    page.getByText('2 events · 0 tasks · 0 conflicts (1 past)', { exact: true }),
  ).toBeVisible();
  const past = page.getByRole('button', { name: 'Past (1)', exact: true });
  await expect(past).toHaveAttribute('aria-expanded', 'false');
  await past.click();
  const pastList = page.getByRole('list', { name: 'Past conflict list', exact: true });
  await expect(pastList).toContainText('Mon 2 Nov 13:15–13:30 (15 min)');
  await expect(pastList.getByRole('button')).toHaveCount(0);
  const ended = page.getByRole('button', { name: /^A, Mon 2 Nov/ });
  await expect(ended).toHaveClass(/is-past/);
  await expect(ended).not.toHaveAccessibleName(/In Lunch/);
  const running = page.getByRole('button', { name: /^B, Mon 2 Nov/ });
  await expect(running).not.toHaveClass(/is-past/);
  await expect(running).toHaveAccessibleName(/In Lunch/);
  await expect(page.getByRole('heading', { name: 'Barred-slot overlaps (1)' })).toBeVisible();
  // FullCalendar's geometry has no accessible role for its decorative guides.
  await expect(page.locator('.fc-timegrid-col .now-guide')).toHaveCount(7);
  await expect(page.locator('.fc-timegrid-now-indicator-line')).toHaveCount(1);
  await page.clock.fastForward('00:30:00');
  await expect(page.getByRole('heading', { name: 'Barred-slot overlaps (0)' })).toBeVisible();
  await expect(running).toHaveClass(/is-past/);
  expect(errors).toEqual([]);
});
