import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  clickTime,
  collectPageErrors,
  createConflict,
  createEvent,
  DRAG_STEPS,
  dragSelect,
  GRAB_OFFSET_PX,
  openCalendar,
  rowTop,
} from './helpers';

const EXPECTED_REPORT_SLOT = 'Mon 2 Nov 09:00–10:30';

// PRE:  target locates the event or resize handle to drag; deltaY is a pixel distance
// POST: waits for its visible geometry and completes a real pointer drag by deltaY
async function dragVertically(
  page: Page,
  target: Locator,
  deltaY: number,
  grabAtY?: number,
): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  if (bounds === null) {
    throw new Error('The drag target has no rendered geometry');
  }
  const centerX = bounds.x + bounds.width / 2;
  const centerY = grabAtY ?? bounds.y + Math.min(GRAB_OFFSET_PX, bounds.height / 2);
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY + deltaY, { steps: DRAG_STEPS });
  await page.mouse.up();
}

test('E1: creating overlapping events flags both blocks and explains the 30-minute conflict', async ({
  page,
}) => {
  await createConflict(page);
  const first = page.getByRole('button', { name: /^A, Mon 2 Nov 10:00–11:30/ });
  const second = page.getByRole('button', { name: /^B, Mon 2 Nov 11:00–12:00/ });
  await expect(first).toContainText('Conflict');
  await expect(second).toContainText('Conflict');
  await expect(page.getByText('Mon 2 Nov 11:00–11:30 (30 min)', { exact: true })).toBeVisible();
});

test('E2: dragging and resizing resolves the conflict and persists after reload', async ({
  page,
}) => {
  await createConflict(page);
  const event = page
    .locator('.fc-timegrid-event.ev')
    .filter({ has: page.getByText('B', { exact: true }) });
  const moveDistance = (await rowTop(page, '13:00:00')) - (await rowTop(page, '11:00:00'));
  // FullCalendar centers a grabbed event within its initial 30-minute row. Starting at that
  // row's center avoids an offset when its five-minute snap differs from the row duration.
  const rowHeight = (await rowTop(page, '11:30:00')) - (await rowTop(page, '11:00:00'));
  const grabAtY = (await rowTop(page, '11:00:00')) + rowHeight / 2 + GRAB_OFFSET_PX;
  await dragVertically(page, event, moveDistance, grabAtY);
  // B is a meeting, so it is fixed: a manual drag asks first (WI-42).
  const askB = page.getByRole('dialog', { name: 'B is fixed. Move it anyway?' });
  await askB.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByRole('button', { name: /^B, Mon 2 Nov 13:00–14:00/ })).toBeVisible();
  await expect(page.getByText('No conflicts', { exact: true })).toBeVisible();

  const resizeDistance = (await rowTop(page, '14:30:00')) - (await rowTop(page, '14:00:00'));
  // The confirmation took the pointer away; the resize handle only shows while B is hovered.
  await event.hover();
  await dragVertically(page, event.locator('.fc-event-resizer-end'), resizeDistance);
  await askB.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByRole('button', { name: /^B, Mon 2 Nov 13:00–14:30/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /^B, Mon 2 Nov 13:00–14:30/ })).toBeVisible();
  await expect(page.getByText('No conflicts', { exact: true })).toBeVisible();
});

test('E3: scheduling Report applies the offered slot and creates a linked Task event', async ({
  page,
}) => {
  await openCalendar(page);
  await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('all');
  await page.getByRole('button', { name: '+ Task', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New task' });
  await dialog.getByLabel('Name', { exact: true }).fill('Report');
  await dialog.getByLabel('Hours', { exact: true }).fill('1');
  await dialog.getByLabel('Minutes', { exact: true }).fill('30');
  await dialog.getByLabel('Window from', { exact: true }).fill('2026-11-02T09:00');
  await dialog.getByLabel('Window to', { exact: true }).fill('2026-11-06T18:00');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const row = page.locator('.task-row').filter({ has: page.getByText('Report', { exact: true }) });
  await row.getByRole('button', { name: 'Find time', exact: true }).click();
  const picker = page.getByRole('dialog', { name: /^Find time/ });
  const firstOption = picker
    .getByRole('group', { name: 'Available slots' })
    .getByRole('radio')
    .first();
  await expect(firstOption).toBeChecked();
  await expect(firstOption).toHaveAccessibleName(new RegExp(EXPECTED_REPORT_SLOT));
  await picker.getByRole('button', { name: 'Apply selected', exact: true }).click();
  await expect(row).toContainText(`Scheduled ${EXPECTED_REPORT_SLOT}`);
  const placed = page.getByRole('button', {
    name: `Report, ${EXPECTED_REPORT_SLOT}, Medium priority, Task`,
    exact: true,
  });
  await expect(placed).toBeVisible();
  await expect(placed).toContainText('Task');
});

// PRE:  page shows the New event dialog
// POST: checks its Start and End fields, then cancels the dialog
async function expectNewEventTimes(page: Page, start: string, end: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await expect(dialog.getByLabel('Start', { exact: true })).toHaveValue(start);
  await expect(dialog.getByLabel('End', { exact: true })).toHaveValue(end);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('E4: clicking and drag-selecting empty time open New event with those times', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await clickTime(page, '09:00:00');
  await expectNewEventTimes(page, '2026-11-02T09:00', '2026-11-02T09:30');

  await dragSelect(page, '10:00:00', '11:30:00');
  await expectNewEventTimes(page, '2026-11-02T10:00', '2026-11-02T11:30');

  expect(errors).toEqual([]);
});

// PRE:  page shows the base week with the event titled title starting at from (HH:mm:ss) in a
//       30-minute row; to is a later visible row
// POST: drags that event's block by the rows between from and to with a real pointer
async function dragEventBetweenRows(
  page: Page,
  title: string,
  from: string,
  to: string,
): Promise<void> {
  const block = page
    .locator('.fc-timegrid-event.ev')
    .filter({ has: page.getByText(title, { exact: true }) });
  const distance = (await rowTop(page, to)) - (await rowTop(page, from));
  const rowHeight = (await rowTop(page, '11:30:00')) - (await rowTop(page, '11:00:00'));
  const grabAtY = (await rowTop(page, from)) + rowHeight / 2 + GRAB_OFFSET_PX;
  await dragVertically(page, block, distance, grabAtY);
}

test('T43: dragging a fixed event asks first; Keep it leaves it, Move moves it', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  await createEvent(page, 'Seminar', '2026-11-02T10:00', '2026-11-02T11:00');
  const atTen = page.getByRole('button', { name: /^Seminar, Mon 2 Nov 10:00–11:00/ });
  const atTwelve = page.getByRole('button', { name: /^Seminar, Mon 2 Nov 12:00–13:00/ });
  await expect(atTen).toBeVisible();

  await dragEventBetweenRows(page, 'Seminar', '10:00:00', '12:00:00');
  const ask = page.getByRole('dialog', { name: 'Seminar is fixed. Move it anyway?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Keep it', exact: true }).click();
  await expect(ask).toHaveCount(0);
  await expect(atTen).toBeVisible();
  await page.reload();
  await expect(atTen).toBeVisible();

  await dragEventBetweenRows(page, 'Seminar', '10:00:00', '12:00:00');
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(atTwelve).toBeVisible();
  await page.reload();
  await expect(atTwelve).toBeVisible();
  expect(errors).toEqual([]);
});
