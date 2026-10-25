import { ev, flexEv } from '../../../tests/helpers/builders';
import { chooseTarget } from './target';

// Each case is built so that the named rule is the first that differs, while every later rule
// points at the other event, so only the right rule can produce the expected id.
describe('chooseTarget (BR-10)', () => {
  it.each([
    [
      '1 flexible over fixed',
      flexEv('A', 'Mon 09:00', 'Mon 12:00', ['Mon 08:00', 'Mon 18:00'], { priority: 'high' }),
      ev('B', 'Mon 10:00', 'Mon 11:00', { priority: 'low' }),
      'A',
    ],
    [
      '2 lower priority',
      ev('A', 'Mon 09:00', 'Mon 12:00', { priority: 'low' }),
      ev('B', 'Mon 10:00', 'Mon 11:00', { priority: 'high' }),
      'A',
    ],
    [
      '3 shorter duration',
      ev('A', 'Mon 10:00', 'Mon 11:00'),
      ev('B', 'Mon 10:30', 'Mon 12:00'),
      'A',
    ],
    ['4 later start', ev('A', 'Mon 10:30', 'Mon 11:30'), ev('B', 'Mon 10:00', 'Mon 11:00'), 'A'],
    ['5 larger id', ev('B', 'Mon 10:00', 'Mon 11:00'), ev('A', 'Mon 10:00', 'Mon 11:00'), 'B'],
  ])('rule %s decides, in either argument order', (_rule, first, second, expected) => {
    expect(chooseTarget(first, second)).toBe(expected);
    expect(chooseTarget(second, first)).toBe(expected);
  });
});
