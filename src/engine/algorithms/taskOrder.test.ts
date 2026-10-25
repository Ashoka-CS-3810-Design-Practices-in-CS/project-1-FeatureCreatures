import { task } from '../../../tests/helpers/builders';
import { compareTasksForQueue } from './taskOrder';

const WINDOW: [string, string] = ['Mon 09:00', 'Fri 18:00'];
const EARLY_WINDOW: [string, string] = ['Mon 09:00', 'Wed 18:00'];

// In each case `first` must be queued before `second`. The named key is the first that differs, and
// every later key would put `second` first, so only that key can produce the order.
describe('compareTasksForQueue (BR-11)', () => {
  it.each([
    [
      '1 higher priority first',
      task('b', 30, WINDOW, { priority: 'high', name: 'Zed' }),
      task('a', 120, EARLY_WINDOW, { priority: 'medium', name: 'Alpha' }),
    ],
    [
      '2 earlier window end first',
      task('b', 30, EARLY_WINDOW, { name: 'Zed' }),
      task('a', 120, WINDOW, { name: 'Alpha' }),
    ],
    [
      '3 longer duration first',
      task('b', 120, WINDOW, { name: 'Zed' }),
      task('a', 30, WINDOW, { name: 'Alpha' }),
    ],
    [
      '4 name order first',
      task('b', 60, WINDOW, { name: 'Alpha' }),
      task('a', 60, WINDOW, { name: 'Zed' }),
    ],
    [
      '5 smaller id first',
      task('a', 60, WINDOW, { name: 'Same' }),
      task('b', 60, WINDOW, { name: 'Same' }),
    ],
  ])('key %s', (_key, first, second) => {
    expect(compareTasksForQueue(first, second)).toBeLessThan(0);
    expect(compareTasksForQueue(second, first)).toBeGreaterThan(0);
  });

  it('returns 0 only for the same task', () => {
    const only = task('a', 60, WINDOW);

    expect(compareTasksForQueue(only, only)).toBe(0);
  });
});
