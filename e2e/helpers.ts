import { expect, type Page } from '@playwright/test';
import { DEFAULT_SETTINGS, EXPORT_FORMAT, LEGACY_EXPORT_VERSION } from '../src/shared/constants';

const BASE_TIME = new Date('2026-11-02T08:00:00');
const MONDAY_COLUMN = '.fc-timegrid-col[data-date="2026-11-02"]';

// PRE: calendar is open without another modal, or the requested drawer is already open
// POST: exposes the Tasks region by opening its drawer only when it is hidden
export async function showTasks(page: Page): Promise<void> {
  if (!(await page.getByRole('button', { name: '+ Task', exact: true }).isVisible())) {
    await page.getByRole('button', { name: /^Tasks \(\d+\)$/ }).click();
  }
}

// PRE: calendar is open without another modal, or the right drawer is already open
// POST: exposes Replan and Barred slots by opening the right drawer only when hidden
export async function showPlanning(page: Page): Promise<void> {
  if (!(await page.getByRole('button', { name: 'Plan…', exact: true }).isVisible())) {
    await page.getByRole('button', { name: /^Conflicts \(\d+\)$/ }).click();
  }
}

// PRE: no nested item dialog is open
// POST: closes any visible panel drawer through its accessible Close action
export async function closeDrawers(page: Page): Promise<void> {
  // INVARIANT: each visited drawer is closed; at most one drawer is visible
  for (const name of ['Tasks', 'Conflicts']) {
    const drawer = page.getByRole('dialog', { name, exact: true });
    if (await drawer.isVisible())
      await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  }
  // POST: neither panel drawer is open
}

// PRE: calendar is open without a nested item dialog
// POST: opens Replan from its sole region action, exposing its drawer when needed
export async function openReplan(page: Page): Promise<void> {
  await showPlanning(page);
  await page.getByRole('button', { name: 'Plan…', exact: true }).click();
}

// PRE: calendar is open without a nested item dialog
// POST: opens the new-task dialog from its sole Tasks region action
export async function openNewTask(page: Page): Promise<void> {
  await showTasks(page);
  await page.getByRole('button', { name: '+ Task', exact: true }).click();
}

// PRE:  calendar is open with no modal
// POST: imports a v1 calendar whose older Lunch/TT rows overlap on Mon–Fri, retaining both
export async function importLegacyBarredSlots(page: Page): Promise<void> {
  const file = {
    format: EXPORT_FORMAT,
    version: LEGACY_EXPORT_VERSION,
    exportedAt: BASE_TIME.toISOString(),
    events: [],
    tasks: [],
    settings: {
      workDays: DEFAULT_SETTINGS.workDays,
      workStartMin: DEFAULT_SETTINGS.workStartMin,
      workEndMin: DEFAULT_SETTINGS.workEndMin,
      bufferMin: DEFAULT_SETTINGS.bufferMin,
      defaultCriterion: DEFAULT_SETTINGS.defaultCriterion,
      barredSlots: [
        { id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1, 2, 3, 4, 5] },
        { id: 'tt', label: 'TT', startMin: 810, endMin: 870, days: [1, 2, 3, 4, 5] },
      ],
    },
  };
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.getByLabel('Import JSON', { exact: true }).setInputFiles({
    name: 'legacy-bars.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  const confirm = page.getByRole('dialog', { name: 'Import calendar?', exact: true });
  await confirm.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(settings).toHaveCount(0);
}
// PRE: calendar is open with no modal; from/to are valid datetime-local values with to > from
// POST: creates a one-hour task through the form with the given window and waits for Save to finish
export async function createTask(
  page: Page,
  name: string,
  from: string,
  to: string,
): Promise<void> {
  await openNewTask(page);
  const form = page.getByRole('dialog', { name: 'New task', exact: true });
  await form.getByLabel('Name', { exact: true }).fill(name);
  await form.getByLabel('Window from', { exact: true }).fill(from);
  await form.getByLabel('Window to', { exact: true }).fill(to);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toHaveCount(0);
  const drawer = page.getByRole('dialog', { name: 'Tasks', exact: true });
  if (await drawer.isVisible())
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
}

export const DRAG_STEPS = 12;

// The toolbar button that opens each dialog, and the dialog's accessible name.
export const TOOLBAR_DIALOGS = [
  { button: '+ Event', title: 'New event' },
  { button: '+ Task', title: 'New task' },
  { button: 'Plan…', title: 'Replan' },
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
//       window, when supplied, is a valid flexible window containing the event duration
// POST: creates the named fixed event (or flexible event with window) and waits for Save to finish
export async function createEvent(
  page: Page,
  title: string,
  start: string,
  end: string,
  window?: { start: string; end: string },
): Promise<void> {
  await page.getByRole('button', { name: '+ Event', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  await dialog.getByLabel('Start', { exact: true }).fill(start);
  await dialog.getByLabel('End', { exact: true }).fill(end);
  if (window !== undefined) {
    await dialog.getByRole('radio', { name: /Flexible/ }).check();
    await dialog.getByLabel('Window start', { exact: true }).fill(window.start);
    await dialog.getByLabel('Window end', { exact: true }).fill(window.end);
  }
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
}

// PRE:  the calendar is open with no modal dialog
// POST: adds Lunch 13:00–14:00 through its region, temporarily opening the panels drawer if needed
export async function addLunchBarredSlot(page: Page): Promise<void> {
  const region = page.getByRole('region', { name: /^Barred slots \(/ });
  const openedDrawer = !(await region.isVisible());
  if (openedDrawer) await showPlanning(page);
  await region.getByRole('button', { name: 'Add barred slot', exact: true }).click();
  const slot = region.getByRole('group', { name: 'Barred slot 1', exact: true });
  await slot.getByLabel('Label', { exact: true }).fill('Lunch');
  await slot.getByLabel('From', { exact: true }).fill('13:00');
  await slot.getByLabel('To', { exact: true }).fill('14:00');
  await region.getByRole('button', { name: 'Save barred slots', exact: true }).click();
  await expect(region.getByRole('button', { name: 'Save barred slots', exact: true })).toHaveCount(
    0,
  );
  if (openedDrawer) {
    const drawer = page.getByRole('dialog', { name: 'Conflicts', exact: true });
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(drawer).toHaveCount(0);
  }
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
