import { SAMPLES } from '@/data/samples';
import { MINUTES_PER_DAY } from '@/shared/constants';
import { ev } from '../../../tests/helpers/builders';
import { makeEngine } from '../../../tests/helpers/engine';
import { storeFor } from '../../../tests/helpers/render';
import { t } from '../../../tests/helpers/time';

const IMPORT_THRESHOLD = 1000;

describe('loading feedback', () => {
  it.each([IMPORT_THRESHOLD, IMPORT_THRESHOLD + 1])(
    'shows loading only above 1,000 imported records (%i)',
    async (count) => {
      const { engine } = await makeEngine();
      const store = storeFor(engine);
      const events = Array.from({ length: count }, (_, index) => {
        const event = ev(`event-${index}`, 'Mon 10:00', 'Mon 11:00');
        return {
          ...event,
          start: event.start + index * MINUTES_PER_DAY,
          end: event.end + index * MINUTES_PER_DAY,
        };
      });
      const source = { ...SAMPLES.sparseWeek.build(t('Mon 00:00')), events, tasks: [] };

      const importing = store.getState().actions.importData(JSON.stringify(source));

      expect(store.getState().busy).toBe(count > IMPORT_THRESHOLD ? 'Importing calendar…' : null);
      await importing;
      expect(store.getState().busy).toBeNull();
      expect(store.getState().snapshot.events).toHaveLength(count);
    },
  );

  it('clears loading after an import storage failure and offers Retry', async () => {
    const { engine } = await makeEngine();
    vi.spyOn(engine, 'importData').mockResolvedValue({
      ok: false,
      error: { code: 'StorageError', message: 'blocked' },
    });
    const store = storeFor(engine);

    const loading = store.getState().actions.loadSample('sparseWeek');

    expect(store.getState().busy).toBe('Loading sample calendar…');
    await loading;
    expect(store.getState().busy).toBeNull();
    expect(store.getState().snapshot.events).toEqual([]);
    expect(store.getState().toasts[0]).toMatchObject({
      sticky: true,
      actions: [{ label: 'Retry' }],
    });
  });
});
