import { performance } from 'node:perf_hooks';
import { createPerformanceFixture, runPerformanceQuery } from '../helpers/performance';

const MEASURED_RUNS = 11;
const MEDIAN_INDEX = Math.floor(MEASURED_RUNS / 2);
const LIMIT_MS = 100;
const EVENT_COUNT = 5000;

describe('T15 performance', () => {
  it.runIf(process.env.PERF === '1')(
    'sweep plus one facade slot search has an eleven-run median below 100 ms',
    async () => {
      const fixture = await createPerformanceFixture();
      expect(fixture.events).toHaveLength(EVENT_COUNT);
      const measurements = Array.from({ length: MEASURED_RUNS }, () => {
        const started = performance.now();
        const result = runPerformanceQuery(fixture);
        return { elapsedMs: performance.now() - started, result };
      });
      const durations = measurements
        .map((measurement) => measurement.elapsedMs)
        .toSorted((first, second) => first - second);
      const medianMs = durations[MEDIAN_INDEX];
      expect(medianMs).toBeDefined();
      const result = measurements[0]?.result;
      expect(
        result !== undefined && (result.search.ok || result.search.error.code === 'NoSlotFound'),
      ).toBe(true);
      console.info(
        `T15: N=${fixture.events.length}, seed=7, k=${result?.conflictCount}, runs=${MEASURED_RUNS}, median=${medianMs?.toFixed(3)} ms`,
      );
      expect(medianMs).toBeLessThan(LIMIT_MS);
    },
  );
});
