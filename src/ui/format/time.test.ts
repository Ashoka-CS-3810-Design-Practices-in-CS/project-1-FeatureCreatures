import { iv } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import {
  fmtDay,
  fmtDuration,
  fmtRange,
  fmtTime,
  fmtViewTitle,
  toClockTime,
  fmtTaskWindow,
  fmtWeekdayTime,
} from './time';

describe('format/time', () => {
  it('T63: compact task dates retain differing months/years and a scheduled start keeps its weekday/time', () => {
    expect(fmtTaskWindow(iv('Mon 09:00', 'Fri 18:00'))).toBe('Mon 2–Fri 6 Nov');
    expect(fmtTaskWindow(iv('2026-11-30 09:00', '2026-12-01 18:00'))).toBe('Mon 30 Nov–Tue 1 Dec');
    expect(fmtTaskWindow(iv('2026-12-31 09:00', '2027-01-01 18:00'))).toBe('Thu 31 Dec–Fri 1 Jan');
    expect(fmtWeekdayTime(t('Tue 14:00'))).toBe('Tue 14:00');
  });
  it.each([
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [600, '10 h'],
    [0, '0 min'],
  ])('fmtDuration(%i) is "%s"', (minutes, text) => {
    expect(fmtDuration(minutes)).toBe(text);
  });

  it('fmtTime and fmtDay use 24-hour time and "EEE d MMM"', () => {
    expect(fmtTime(t('Mon 09:05'))).toBe('09:05');
    expect(fmtDay(t('Tue 18:00'))).toBe('Tue 3 Nov');
  });

  it('fmtRange shows one date, or both dates when the range crosses midnight', () => {
    expect(fmtRange(iv('Tue 11:00', 'Tue 11:30'))).toBe('Tue 3 Nov 11:00–11:30');
    expect(fmtRange(iv('Mon 23:00', 'Tue 01:00'))).toBe('Mon 2 Nov 23:00 – Tue 3 Nov 01:00');
  });

  it('toClockTime formats minutes of the day as HH:mm', () => {
    expect(toClockTime(540)).toBe('09:00');
    expect(toClockTime(1440)).toBe('24:00');
    expect(toClockTime(5)).toBe('00:05');
  });

  it('fmtViewTitle names the shown period for each view', () => {
    expect(fmtViewTitle('timeGridDay', t('Tue 00:00'))).toBe('Tue 3 Nov 2026');
    expect(fmtViewTitle('timeGridWeek', t('Mon 00:00'))).toBe('Week of 2 Nov 2026');
    expect(fmtViewTitle('listWeek', t('Mon 00:00'))).toBe('Week of 2 Nov 2026');
    expect(fmtViewTitle('dayGridMonth', t('2026-11-01 00:00'))).toBe('November 2026');
  });
});
