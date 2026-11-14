import { expect, test, type Locator } from '@playwright/test';
import { collectPageErrors, createEvent, openCalendar, useWideFont } from './helpers';

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
];
const COMPACT_MIN_WIDTH_PX = 90;
const FULL_MIN_WIDTH_PX = 150;
const COMPACT_TIME_MIN_HEIGHT_PX = 80;
const HOUR_HEIGHT_PX = 60;
const SHORT_TITLE_LIMIT = 20;
const GEOMETRY_TOLERANCE_PX = 1;
const MIN_INNER_PADDING_PX = 4;

// PRE: locator identifies one element in the rendered calendar
// POST: returns its bounds, failing the test if it has no visible box
async function boundsOf(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) throw new Error('Expected a visible calendar element.');
  return bounds;
}

// PRE: child identifies one visible element inside block
// POST: asserts that all four edges of child lie inside block, allowing subpixel rounding
async function expectInside(child: Locator, block: Locator): Promise<void> {
  const childBounds = await boundsOf(child);
  const blockBounds = await boundsOf(block);
  expect(childBounds).not.toBeNull();
  expect(blockBounds).not.toBeNull();
  expect(childBounds.x).toBeGreaterThanOrEqual(blockBounds.x - GEOMETRY_TOLERANCE_PX);
  expect(childBounds.y).toBeGreaterThanOrEqual(blockBounds.y - GEOMETRY_TOLERANCE_PX);
  expect(childBounds.x + childBounds.width).toBeLessThanOrEqual(
    blockBounds.x + blockBounds.width + GEOMETRY_TOLERANCE_PX,
  );
  expect(childBounds.y + childBounds.height).toBeLessThanOrEqual(
    blockBounds.y + blockBounds.height + GEOMETRY_TOLERANCE_PX,
  );
}

// PRE: block is a normal-height sample time-grid event
// POST: verifies its tier's readable metadata, full priority text and bounded visible tags
async function expectReadableBlock(block: Locator): Promise<void> {
  const bounds = await boundsOf(block);
  expect(bounds).not.toBeNull();
  const priority = block.getByText(/^\[[HML]\]$/);
  await expect(priority).toBeVisible();
  await expectInside(priority, block);
  expect(await priority.evaluate((tag) => tag.scrollWidth <= tag.clientWidth)).toBe(true);
  const title = block.locator('strong');
  const titleBounds = await boundsOf(title);
  expect(titleBounds.x - bounds.x).toBeGreaterThanOrEqual(MIN_INNER_PADDING_PX);
  if (bounds.width >= COMPACT_MIN_WIDTH_PX) {
    if (bounds.width >= FULL_MIN_WIDTH_PX || bounds.height >= COMPACT_TIME_MIN_HEIGHT_PX) {
      await expect(block.locator('.event-time')).toBeVisible();
      await expectInside(block.locator('.event-time'), block);
    } else {
      await expect(block.locator('.event-time')).toBeHidden();
    }
    const category = block.getByLabel(/^Category:/);
    await expect(category).toBeVisible();
    await expectInside(category, block);
    await expect(category).toHaveAttribute('title', /\S+/);
    const textFits = await title.evaluate((element, limit) => {
      if ((element.textContent ?? '').length > limit) return true;
      return (
        element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth
      );
    }, SHORT_TITLE_LIMIT);
    expect(textFits, (await title.textContent()) ?? '').toBe(true);
  } else {
    await expect(block.locator('.event-time')).toBeHidden();
    await expect(block.getByLabel(/^Category:/)).toBeHidden();
  }
  const tags = block.locator('.tag');
  // INVARIANT: all visited visible tags lie fully within this event's bounds
  for (const tag of await tags.all()) {
    if (await tag.isVisible()) await expectInside(tag, block);
  }
  // POST: no visible tag crosses an event edge
  await expect(block).toHaveAttribute('title', (await block.getAttribute('aria-label')) ?? '');
}

// INVARIANT: readability checks cover every visited font in all themes and viewports
for (const font of ['default', 'wide'] as const) {
  // INVARIANT: readability checks cover all themes visited so far for this font
  for (const theme of ['light', 'dark'] as const) {
    // INVARIANT: checks cover every visited viewport in this theme
    for (const viewport of VIEWPORTS) {
      test(`T59: readable event tiers and short blocks, ${font} font ${theme} ${viewport.width}`, async ({
        page,
      }) => {
        const errors = collectPageErrors(page);
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme });
        await openCalendar(page);
        if (font === 'wide') await useWideFont(page);
        await page.getByRole('button', { name: 'Load sample week', exact: true }).click();
        const blocks = page.locator('.fc-timegrid-event.ev');
        await expect(blocks).toHaveCount(8);
        // INVARIANT: every visited >=1-hour sample block satisfies its content tier
        for (const block of await blocks.all()) {
          expect((await boundsOf(block)).height).toBeGreaterThanOrEqual(HOUR_HEIGHT_PX);
          const title = await block.locator('strong').textContent();
          if (title !== 'Lecture' && title !== 'Meeting') {
            expect((await boundsOf(block.locator('.event-content'))).width).toBeGreaterThanOrEqual(
              COMPACT_MIN_WIDTH_PX,
            );
          }
          await expectReadableBlock(block);
        }
        // POST: all eight sample events keep bounded priority/tier metadata
        await page.getByRole('button', { name: 'Day', exact: true }).click();
        const full = page.getByRole('button', { name: /^Algorithms lecture,/ });
        expect((await boundsOf(full)).width).toBeGreaterThanOrEqual(FULL_MIN_WIDTH_PX);
        await expectReadableBlock(full);
        await expect(full.getByText('Class', { exact: true })).toBeVisible();
        await expect(full.getByText('Fixed', { exact: true })).toBeVisible();
        await createEvent(page, 'Short block', '2026-11-02T11:00', '2026-11-02T11:30');
        const short = page.getByRole('button', { name: /^Short block,/ });
        const title = short.getByText('Short block', { exact: true });
        const time = short.getByText('11:00–11:30', { exact: true });
        await expectInside(title, short);
        await expectInside(time, short);
        expect((await boundsOf(title)).y).toBe((await boundsOf(time)).y);
        expect(errors).toEqual([]);
      });
    }
    // POST: this theme is checked at all three required sizes
  }
  // POST: both themes cover narrow/compact/full/short event presentation for this font
}
// POST: default and wide fonts cover every tier in both themes at all three sizes
