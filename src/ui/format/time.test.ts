import { iv } from '../../../tests/helpers/builders';
import { t } from '../../../tests/helpers/time';
import { fmtDay, fmtDuration, fmtRange, fmtTime, toClockTime } from './time';

describe('format/time', () => {
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
});
