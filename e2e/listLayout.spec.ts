import { expect, test, type Page } from '@playwright/test';
import { openCalendar } from './helpers';

const PHONE = { width: 420, height: 900 };
const ALIGN_TOLERANCE_PX = 2;
const OPAQUE_ALPHA = 1;

// PRE:  page shows the calendar
// POST: loads the sample week and switches to List view
async function openSampleList(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.fc-list-event').first()).toBeVisible();
}

test('T45: at 420 px no List row or day header is wider than the list (#13)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await openCalendar(page);
  await openSampleList(page);

  const overflow = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.fc-list');
    if (list === null) return ['no list'];
    const limit = list.clientWidth;
    return [...document.querySelectorAll<HTMLElement>('.fc-list-day, .fc-list-event')]
      .filter((row) => row.getBoundingClientRect().width > limit + 0.5 || row.scrollWidth > limit)
      .map((row) => `${row.className}: ${row.getBoundingClientRect().width} > ${limit}`);
  });

  expect(overflow).toEqual([]);
});

// INVARIANT: the sticky-header test is registered for every colour scheme visited so far
for (const colorScheme of ['light', 'dark'] as const) {
  test(`T45: the sticky day header paints above conflict outlines, opaque (${colorScheme}) (#12)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await openCalendar(page);
    await openSampleList(page);

    const header = await page
      .locator('.fc-list-day')
      .first()
      .evaluate((row) => {
        const cell = row.querySelector('th') ?? row;
        const style = getComputedStyle(cell);
        const alpha = style.backgroundColor.startsWith('rgba')
          ? Number(style.backgroundColor.split(',').at(-1)?.replace(')', ''))
          : 1;
        return { zIndex: style.zIndex, position: style.position, alpha };
      });

    expect(header.position).toBe('sticky');
    expect(header.zIndex).not.toBe('auto');
    expect(Number(header.zIndex)).toBeGreaterThan(0);
    expect(header.alpha).toBe(OPAQUE_ALPHA);
  });
}
// POST: the check runs in both themes

test('T45: time, dot, title and tags of each List row share one centre line (#12)', async ({
  page,
}) => {
  await openCalendar(page);
  await openSampleList(page);

  const offsets = await page.locator('.fc-list-event').evaluateAll((rows) =>
    rows.map((row) => {
      const centre = (selector: string) => {
        const box = row.querySelector(selector)?.getBoundingClientRect();
        return box === undefined ? Number.NaN : box.top + box.height / 2;
      };
      const title = centre('.event-title');
      return {
        time: Math.abs(centre('.fc-list-event-time') - title),
        dot: Math.abs(centre('.fc-list-event-dot') - title),
        tag: Math.abs(centre('.tag') - title),
      };
    }),
  );

  expect(offsets.length).toBeGreaterThan(0);
  // INVARIANT: every visited row's parts sit within ALIGN_TOLERANCE_PX of its title's centre
  for (const offset of offsets) {
    expect(offset.time).toBeLessThanOrEqual(ALIGN_TOLERANCE_PX);
    expect(offset.dot).toBeLessThanOrEqual(ALIGN_TOLERANCE_PX);
    expect(offset.tag).toBeLessThanOrEqual(ALIGN_TOLERANCE_PX);
  }
  // POST: every List row is aligned
});
