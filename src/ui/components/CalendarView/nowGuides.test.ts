import { fromMinute } from '@/shared/time';
import { iv } from '../../../../tests/helpers/builders';
import { t } from '../../../../tests/helpers/time';
import { nowGuideEntries } from './nowGuides';

describe('T52: cross-day now guides', () => {
  it('has no guides before the visible range is known', () => {
    expect(nowGuideEntries(null, t('Mon 13:07'))).toEqual([]);
  });

  it('puts one unlabelled decorative guide at the current local clock time per visible day', () => {
    const entries = nowGuideEntries(iv('Mon 00:00', 'Thu 00:00'), t('Tue 13:07'));
    expect(
      entries.map(({ start, end, display, title, classNames }) => ({
        start,
        end,
        display,
        title,
        classNames,
      })),
    ).toEqual(
      ['Mon', 'Tue', 'Wed'].map((day) => ({
        start: fromMinute(t(`${day} 13:07`)),
        end: fromMinute(t(`${day} 13:08`)),
        display: 'background',
        title: '',
        classNames: ['now-guide'],
      })),
    );
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });
});
