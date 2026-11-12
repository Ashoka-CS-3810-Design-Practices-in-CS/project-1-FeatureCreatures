import { ev, settings } from '../../../tests/helpers/builders';
import { makeEngine } from '../../../tests/helpers/engine';
import { FailingRepository } from '../../../tests/helpers/failingRepository';
import { storeFor } from '../../../tests/helpers/render';

const LUNCH = { id: 'lunch', label: 'Lunch', startMin: 780, endMin: 840, days: [1] as const };

describe('T38 settings warning feedback', () => {
  it('counts distinct newly warned events and does not repeat unchanged or removed warnings', async () => {
    const { engine } = await makeEngine({ events: [ev('A', 'Mon 13:00', 'Mon 14:00')] });
    const store = storeFor(engine);
    // Two different slots over one event (identical slots are rejected since WI-43).
    const changed = settings({
      barredSlots: [LUNCH, { ...LUNCH, id: 'break', label: 'Break', startMin: 810 }],
    });
    await store.getState().actions.updateSettings(changed);
    expect(store.getState().snapshot.barredOverlaps).toHaveLength(2);
    expect(
      store
        .getState()
        .toasts.filter((toast) => toast.tone === 'info')
        .map((toast) => toast.text),
    ).toEqual(['1 event overlaps barred slots']);
    await store.getState().actions.updateSettings(changed);
    await store.getState().actions.updateSettings(settings());
    expect(store.getState().toasts.filter((toast) => toast.tone === 'info')).toHaveLength(1);
  });

  it('does not warn when settings storage fails', async () => {
    const repo = new FailingRepository();
    const { engine } = await makeEngine({ repo, events: [ev('A', 'Mon 13:00', 'Mon 14:00')] });
    const store = storeFor(engine);
    repo.failNextSaveSettings();
    await store.getState().actions.updateSettings(settings({ barredSlots: [LUNCH] }));
    expect(store.getState().snapshot.barredOverlaps).toEqual([]);
    expect(store.getState().toasts.filter((toast) => toast.tone === 'info')).toEqual([]);
  });
});
