import { expect, test } from '@playwright/test';
import {
  clickTime,
  collectPageErrors,
  createEvent,
  DRAG_STEPS,
  dragSelect,
  openCalendar,
  rowTop,
} from './helpers';

const GRID_CENTRE_RATIO = 0.5;
const PAN_POINT_OFFSET_PX = 8;

test('T50: locked timeline suppresses creation and moves, supports grab-to-pan, and keeps event editing', async ({
  page,
}) => {
  const errors = collectPageErrors(page);
  await openCalendar(page);
  const lock = page.getByRole('button', { name: 'Calendar lock' });
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  await createEvent(page, 'Lecture', '2026-11-02T10:00', '2026-11-02T11:00');
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  await lock.click();
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await clickTime(page, '09:00:00');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await dragSelect(page, '12:00:00', '12:30:00');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const block = page.getByRole('button', { name: /^Lecture, Mon 2 Nov 10:00–11:00/ });
  const bounds = await block.boundingBox();
  if (bounds === null) throw new Error('Lecture has no rendered geometry');
  const startY = bounds.y + PAN_POINT_OFFSET_PX;
  await page.mouse.move(bounds.x + bounds.width * GRID_CENTRE_RATIO, startY);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * GRID_CENTRE_RATIO, startY + bounds.height, {
    steps: DRAG_STEPS,
  });
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(block).toBeVisible();

  const grid = await page.getByRole('grid').boundingBox();
  if (grid === null) throw new Error('Calendar has no rendered geometry');
  const beforePan = await rowTop(page, '11:00:00');
  const panEnd = await rowTop(page, '10:00:00');
  const panX = grid.x + grid.width * GRID_CENTRE_RATIO;
  await page.mouse.move(panX, beforePan + PAN_POINT_OFFSET_PX);
  await page.mouse.down();
  await page.mouse.move(panX, panEnd + PAN_POINT_OFFSET_PX, { steps: DRAG_STEPS });
  await page.mouse.up();
  expect(await rowTop(page, '11:00:00')).toBeLessThan(beforePan);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await block.click();
  const edit = page.getByRole('dialog', { name: 'Edit event' });
  await expect(edit.getByLabel('Start', { exact: true })).toHaveValue('2026-11-02T10:00');
  await expect(edit.getByLabel('End', { exact: true })).toHaveValue('2026-11-02T11:00');
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('T50: reload locks existing data; K unlocks; List toggle and deliberate creation still work', async ({
  page,
}) => {
  await openCalendar(page);
  await createEvent(page, 'Lecture', '2026-11-02T10:00', '2026-11-02T11:00');
  await page.reload();
  const lock = page.getByRole('button', { name: 'Calendar lock' });
  await expect(lock).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '+ Event', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New event' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('k');
  await expect(lock).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Day', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
