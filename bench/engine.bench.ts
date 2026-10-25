import { test } from 'vitest';
import { createPerformanceFixture, runPerformanceQuery } from '../tests/helpers/performance';

test('T15: 5,000 events', async ({ bench }) => {
  const fixture = await createPerformanceFixture();
  const initial = runPerformanceQuery(fixture);
  console.info(
    `T15 fixture: N=${fixture.events.length}, seed=7, k=${initial.conflictCount}, first-four-week 60-min task`,
  );
  await bench('full conflict sweep + facade findSlots', () => {
    runPerformanceQuery(fixture);
  }).run();
});
