import { expect, test, type Page } from '@playwright/test';

const BASE_TIME = new Date('2026-11-02T08:00:00');
const VIEWPORT_HEIGHT = 900;
const DESKTOP_WIDTHS = [1280, 1024];
const NARROW_WIDTH = 900;
const MIN_TARGET_SIZE = 32;

// PRE:  page has fresh storage
// POST: loads the sparse sample in the base week and waits until its loading overlay closes
async function loadSample(page: Page): Promise<void> {
  await page.clock.install({ time: BASE_TIME });
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
  await expect(page.locator('.status-line')).toHaveText('8 events · 4 tasks · 1 conflict');
  await expect(page.getByRole('dialog', { name: 'Loading calendar' })).toBeHidden();
}

test('desktop layout, click targets, responsive drawer and nested dialog focus', async ({
  page,
}) => {
  await loadSample(page);

  // INVARIANT: each visited desktop width has one side column and no page overflow
  for (const width of DESKTOP_WIDTHS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await expect(page.getByRole('complementary', { name: 'Tasks and conflicts' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Tasks and conflicts', exact: true }),
    ).toBeHidden();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  // POST: both required desktop widths preserve the side column without horizontal overflow

  const undersized = await page
    .locator('button:visible, label:has(input[type="checkbox"]):visible')
    .evaluateAll(
      (elements, minSize) =>
        elements
          .filter((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.width < minSize || bounds.height < minSize;
          })
          .map((element) => element.textContent),
      MIN_TARGET_SIZE,
    );
  expect(undersized).toEqual([]);
  await page.setViewportSize({ width: NARROW_WIDTH, height: VIEWPORT_HEIGHT });
  const trigger = page.getByRole('button', { name: 'Tasks and conflicts', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Tasks and conflicts' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Close panels' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('dialog')?.id)).toBe(
    'side-panels',
  );
  await drawer.getByRole('button', { name: 'New task', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'New task' })).toBeHidden();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'New task', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('List event names are complete and keyboard editing can move and resize an event', async ({
  page,
}) => {
  await loadSample(page);
  await page.getByRole('button', { name: 'List', exact: true }).click();
  const lecture = page.getByRole('button', {
    name: 'Lecture, Tue 3 Nov 10:00–11:30, High priority, Fixed, Conflict 30 min',
    exact: true,
  });
  await lecture.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Edit event' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Start', { exact: true }).fill('2026-11-03T14:00');
  await dialog.getByLabel('End', { exact: true }).fill('2026-11-03T16:00');
  await dialog.getByRole('button', { name: 'Save', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const moved = page.getByRole('button', {
    name: 'Lecture, Tue 3 Nov 14:00–16:00, High priority, Fixed',
    exact: true,
  });
  await expect(moved).toBeVisible();
  await expect(moved).toBeFocused();
  await expect(page.getByText('No conflicts', { exact: true })).toBeVisible();
});
