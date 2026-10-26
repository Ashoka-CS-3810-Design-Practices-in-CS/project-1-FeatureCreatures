import { expect, type Page } from '@playwright/test';

const BASE_TIME = new Date('2026-11-02T08:00:00');

// PRE:  page has a fresh browser context
// POST: opens the empty calendar with the clock in TEST_PLAN's base week
export async function openCalendar(page: Page): Promise<void> {
  await page.clock.install({ time: BASE_TIME });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Week of 2 Nov 2026' })).toBeVisible();
}

// PRE:  calendar is open; start/end are valid datetime-local strings with end > start
// POST: creates the named event through the dialog and waits for Save to finish
export async function createEvent(
  page: Page,
  title: string,
  start: string,
  end: string,
): Promise<void> {
  await page.getByRole('button', { name: '+ Event', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  await dialog.getByLabel('Start', { exact: true }).fill(start);
  await dialog.getByLabel('End', { exact: true }).fill(end);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
}

// PRE:  page has fresh storage and no installed clock
// POST: creates E1's A/B conflict through the UI in a new base-week calendar
export async function createConflict(page: Page): Promise<void> {
  await openCalendar(page);
  await createEvent(page, 'A', '2026-11-02T10:00', '2026-11-02T11:30');
  await createEvent(page, 'B', '2026-11-02T11:00', '2026-11-02T12:00');
  await expect(page.getByRole('heading', { name: 'Conflicts (1)' })).toBeVisible();
}

// PRE:  page has not navigated yet
// POST: returns a list that collects every uncaught page error and console error from now on;
//       the error boundary catches render crashes, so console errors must count as failures too
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  });
  return errors;
}
