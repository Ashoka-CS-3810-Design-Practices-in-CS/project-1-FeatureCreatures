import { dayFrame, ev, iv } from '../../../tests/helpers/builders';
import { detectBarredOverlaps } from './barred';

describe('T37 barred-slot intersections', () => {
  const monday = dayFrame('Mon', ['09:00', '18:00'], [['Lunch', '13:00', '14:00']]);

  it.each([
    ['13:00', '14:00', 60],
    ['12:30', '13:30', 30],
    ['12:00', '13:00', 0],
    ['14:00', '15:00', 0],
  ])('%s–%s produces %i overlap minutes', (start, end, minutes) => {
    const events = [ev('A', `Mon ${start}`, `Mon ${end}`)];
    const before = structuredClone({ events, frames: [monday] });
    expect(detectBarredOverlaps(events, [monday])).toEqual(
      minutes === 0
        ? []
        : [{ eventId: 'A', label: 'Lunch', overlap: iv('Mon 13:00', `Mon ${end}`), minutes }],
    );
    expect({ events, frames: [monday] }).toEqual(before);
  });

  it('visits both touched local days, ignores work and returns each slot intersection', () => {
    const frames = [
      dayFrame('Sat', null, [['Rest', '23:30', '24:00']]),
      dayFrame('Sun', null, [
        ['Rest', '00:00', '01:00'],
        ['Quiet', '00:15', '00:45'],
      ]),
    ];
    expect(detectBarredOverlaps([ev('Night', 'Sat 23:00', 'Sun 00:30')], frames)).toEqual([
      { eventId: 'Night', label: 'Rest', overlap: iv('Sat 23:30', 'Sun 00:00'), minutes: 30 },
      { eventId: 'Night', label: 'Rest', overlap: iv('Sun 00:00', 'Sun 00:30'), minutes: 30 },
      { eventId: 'Night', label: 'Quiet', overlap: iv('Sun 00:15', 'Sun 00:30'), minutes: 15 },
    ]);
    expect(detectBarredOverlaps([], frames)).toEqual([]);
    expect(
      detectBarredOverlaps([ev('Monday', 'Mon 12:00', 'Mon 13:00')], [dayFrame('Mon', null)]),
    ).toEqual([]);
  });
});
