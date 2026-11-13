import { DEFAULT_CATEGORIES } from '@/shared/constants';
import { createState } from '@/engine/state';
import { fromMinute } from '@/shared/time';
import type { BarredSlot, CalendarEvent, Settings, Snapshot } from '@/shared/types';
import { ev, flexEv, iv, settings } from '../../../../tests/helpers/builders';
import { t } from '../../../../tests/helpers/time';
import { toFullCalendar } from './toFullCalendar';

// PRE:  events have distinct ids
// POST: returns the snapshot the engine would expose for them
function snapshotOf(events: CalendarEvent[], withSettings: Settings = settings()): Snapshot {
  const state = createState({
    categories: [...DEFAULT_CATEGORIES],
    events,
    tasks: [],
    settings: withSettings,
  });
  return { ...state, canUndo: false, canRedo: false, undoLabel: null, redoLabel: null };
}

const ALL: ('high' | 'medium' | 'low')[] = ['high', 'medium', 'low'];

describe('toFullCalendar', () => {
  it('T53: merges legacy overlapping backgrounds and stacks all labels without changing settings', () => {
    const rules = settings({
      barredSlots: [
        { id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1] },
        { id: 'tt', label: 'TT', startMin: 810, endMin: 870, days: [1] },
      ],
    });
    const before = structuredClone(rules);
    const entries = toFullCalendar(
      snapshotOf([], rules),
      ALL,
      iv('Mon 00:00', 'Tue 00:00'),
      [],
      t('Mon 08:00'),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      title: 'Lunch · TT',
      start: fromMinute(t('Mon 13:00')),
      end: fromMinute(t('Mon 14:30')),
      extendedProps: { stackedLabels: ['Lunch', 'TT'] },
    });
    expect(rules).toEqual(before);
  });
  it('maps events with priority, conflict and emphasis classes and the EventContent props', () => {
    const snapshot = snapshotOf([
      ev('A', 'Mon 10:00', 'Mon 11:30', { priority: 'high' }),
      ev('B', 'Mon 11:00', 'Mon 12:00'),
      flexEv('C', 'Mon 14:00', 'Mon 15:00', ['Mon 09:00', 'Mon 18:00'], {
        taskId: 'T',
        priority: 'low',
      }),
    ]);

    const [first, second, third] = toFullCalendar(snapshot, ALL, null, ['C'], t('Mon 08:00'));

    expect(first).toMatchObject({
      id: 'A',
      title: 'A',
      start: fromMinute(t('Mon 10:00')),
      classNames: ['ev', 'prio-high', 'is-conflict'],
      extendedProps: { priority: 'high', flexible: false, isTask: false, conflictMinutes: 30 },
    });
    expect(second?.classNames).toEqual(['ev', 'prio-medium', 'is-conflict']);
    expect(third).toMatchObject({
      classNames: ['ev', 'prio-low', 'is-emphasised'],
      extendedProps: { flexible: true, isTask: true, conflictMinutes: 0 },
    });
  });

  it('keeps only the priorities in the filter', () => {
    const snapshot = snapshotOf([
      ev('H', 'Mon 10:00', 'Mon 11:00', { priority: 'high' }),
      ev('M', 'Mon 12:00', 'Mon 13:00'),
    ]);

    expect(
      toFullCalendar(snapshot, ['high'], null, [], t('Mon 08:00')).map((entry) => entry.id),
    ).toEqual(['H']);
  });

  it('adds a labelled background block per barred slot per visible day', () => {
    const lunch: BarredSlot = { id: 'l', label: 'Lunch', startMin: 780, endMin: 840, days: [1, 2] };
    const snapshot = snapshotOf([], settings({ barredSlots: [lunch] }));

    const entries = toFullCalendar(snapshot, ALL, iv('Mon 00:00', 'Wed 00:00'), [], t('Mon 08:00'));

    expect(
      entries.map(({ title, display, classNames }) => ({ title, display, classNames })),
    ).toEqual([
      { title: 'Lunch', display: 'background', classNames: ['barred'] },
      { title: 'Lunch', display: 'background', classNames: ['barred'] },
    ]);
    expect(entries[1]?.start).toEqual(fromMinute(t('Tue 13:00')));
  });
});
