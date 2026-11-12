import { expect, type Page } from '@playwright/test';

const BASE_TIME = new Date('2026-11-02T08:00:00');
const MONDAY_COLUMN = '.fc-timegrid-col[data-date="2026-11-02"]';
export const DRAG_STEPS = 12;

// The toolbar button that opens each dialog, and the dialog's accessible name.
export const TOOLBAR_DIALOGS = [
  { button: '+ Event', title: 'New event' },
  { button: '+ Task', title: 'New task' },
  { button: 'Replan', title: 'Replan' },
  { button: 'Settings', title: 'Settings' },
  { button: 'Keyboard shortcuts', title: 'Keyboard shortcuts' },
];
export const GRAB_OFFSET_PX = 2;

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

// PRE:  the calendar is open with no modal dialog
// POST: adds the default-weekday Lunch barred slot at 13:00–14:00 through Settings
export async function addLunchBarredSlot(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByRole('button', { name: 'Add barred slot', exact: true }).click();
  const slot = settings.getByRole('group', { name: 'Barred slot 1', exact: true });
  await slot.getByLabel('Label', { exact: true }).fill('Lunch');
  await slot.getByLabel('From', { exact: true }).fill('13:00');
  await slot.getByLabel('To', { exact: true }).fill('14:00');
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(settings).toHaveCount(0);
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

// PRE:  time is a visible time-grid row's HH:mm:ss value
// POST: returns that row's top edge; throws if it has no rendered geometry
export async function rowTop(page: Page, time: string): Promise<number> {
  const bounds = await page.locator(`.fc-timegrid-slot[data-time="${time}"]`).first().boundingBox();
  if (bounds === null) {
    throw new Error(`No time-grid row rendered for ${time}`);
  }
  return bounds.y;
}

// PRE:  the week view is showing the base week
// POST: returns the horizontal centre of Monday's time-grid column
async function mondayCenterX(page: Page): Promise<number> {
  const bounds = await page.locator(MONDAY_COLUMN).boundingBox();
  if (bounds === null) {
    throw new Error('Monday has no rendered time-grid column');
  }
  return bounds.x + bounds.width / 2;
}

// PRE:  the week view shows the base week; time is a visible, empty Monday row (HH:mm:ss)
// POST: clicks just inside the top of that row
export async function clickTime(page: Page, time: string): Promise<void> {
  await page.mouse.click(await mondayCenterX(page), (await rowTop(page, time)) + GRAB_OFFSET_PX);
}

// PRE:  the week view shows the base week; from < to are visible Monday rows (HH:mm:ss) with
//       empty time between them
// POST: drags with the mouse from the top of row from to just above row to (selecting from–to)
export async function dragSelect(page: Page, from: string, to: string): Promise<void> {
  const centerX = await mondayCenterX(page);
  await page.mouse.move(centerX, (await rowTop(page, from)) + GRAB_OFFSET_PX);
  await page.mouse.down();
  await page.mouse.move(centerX, (await rowTop(page, to)) - GRAB_OFFSET_PX, { steps: DRAG_STEPS });
  await page.mouse.up();
}
