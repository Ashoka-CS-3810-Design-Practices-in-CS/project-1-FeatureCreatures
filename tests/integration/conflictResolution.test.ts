import { ev, flexEv, iv } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import { t } from '../helpers/time';

const lecture = ev('Lecture', 'Mon 10:00', 'Mon 12:00', { priority: 'high' });
const meeting = flexEv('Meeting', 'Mon 11:00', 'Mon 12:00', ['Mon 09:00', 'Mon 18:00']);

describe('Conflict Resolution (T20, FR7, BR-10)', () => {
  it('targets the flexible event and offers its nearest free slots', async () => {
    const { engine } = await makeEngine({ events: [lecture, meeting] });

    expect(engine.snapshot().conflicts.map(({ key, targetId }) => ({ key, targetId }))).toEqual([
      { key: 'Lecture|Meeting', targetId: 'Meeting' },
    ]);
    const found = engine.suggestAlternatives({ eventId: 'Meeting', otherEventId: 'Lecture' });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.subject).toEqual({
      kind: 'event',
      eventId: 'Meeting',
      title: 'Meeting',
      otherEventId: 'Lecture',
    });
    expect(found.value.options.map(({ slot, distanceMin }) => ({ slot, distanceMin }))).toEqual([
      { slot: iv('Mon 12:00', 'Mon 13:00'), distanceMin: 60 },
      { slot: iv('Mon 09:00', 'Mon 10:00'), distanceMin: 120 },
    ]);
  });

  it('applying the top option resolves the conflict', async () => {
    const { engine, repo } = await makeEngine({ events: [lecture, meeting] });
    const found = engine.suggestAlternatives({ eventId: 'Meeting' });
    if (!found.ok) throw new Error('no alternatives');
    const top = found.value.options[0];
    if (top === undefined) throw new Error('no option');

    const applied = await engine.applyAlternative({
      eventId: 'Meeting',
      slot: top.slot,
      baseVersion: found.value.baseVersion,
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.label).toBe('Move "Meeting"');
    expect(applied.value.snapshot.conflicts).toEqual([]);
    expect(applied.value.resolvedConflicts).toHaveLength(1);
    expect((await repo.load()).events.find((event) => event.id === 'Meeting')).toMatchObject(
      iv('Mon 12:00', 'Mon 13:00'),
    );
  });

  it('D-02: opting into a fixed event searches its explicitly supplied temporary range', async () => {
    const { engine } = await makeEngine({ events: [lecture, meeting] });

    const found = engine.suggestAlternatives({
      eventId: 'Lecture',
      otherEventId: 'Meeting',
      allowMoving: true,
      range: { start: t('2026-11-01 00:00'), end: t('Wed 00:00') },
    });

    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.searchWindow).toEqual({
      start: t('2026-11-01 00:00'),
      end: t('Wed 00:00'),
    });
    expect(found.value.options.map(({ slot, distanceMin }) => ({ slot, distanceMin }))).toEqual([
      { slot: iv('Mon 09:00', 'Mon 11:00'), distanceMin: 60 },
      { slot: iv('Mon 12:00', 'Mon 14:00'), distanceMin: 120 },
      { slot: iv('Tue 09:00', 'Tue 11:00'), distanceMin: 1380 },
    ]);
  });

  it('applyAlternative rejects a stale result, a wrong-length slot and an unknown event', async () => {
    const { engine, repo } = await makeEngine({ events: [lecture, meeting] });
    const version = engine.snapshot().version;
    const before = await capture(engine, repo);

    expect(
      await engine.applyAlternative({
        eventId: 'Meeting',
        slot: iv('Mon 12:00', 'Mon 13:00'),
        baseVersion: version - 1,
      }),
    ).toEqual({ ok: false, error: { code: 'StaleResult' } });
    const wrongLength = await engine.applyAlternative({
      eventId: 'Meeting',
      slot: iv('Mon 12:00', 'Mon 12:30'),
      baseVersion: version,
    });
    expect(wrongLength.ok ? null : wrongLength.error).toMatchObject({
      code: 'InvalidTime',
      issues: [{ path: 'slot' }],
    });
    expect(
      await engine.applyAlternative({
        eventId: 'nope',
        slot: iv('Mon 12:00', 'Mon 13:00'),
        baseVersion: version,
      }),
    ).toEqual({ ok: false, error: { code: 'NotFound', entity: 'event', id: 'nope' } });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('applyAlternative rejects slot endpoints that are not integer minutes (AUDIT A06)', async () => {
    const { engine, repo } = await makeEngine({ events: [lecture, meeting] });
    const before = await capture(engine, repo);
    const halfMinute = 0.5;

    const result = await engine.applyAlternative({
      eventId: 'Meeting',
      slot: { start: t('Mon 12:00') + halfMinute, end: t('Mon 13:00') + halfMinute },
      baseVersion: engine.snapshot().version,
    });

    expect(result.ok ? null : result.error).toMatchObject({
      code: 'InvalidInput',
      issues: [{ path: 'slot.start' }, { path: 'slot.end' }],
    });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('applyAlternative refuses an option whose start has passed (ER7, AUDIT A07)', async () => {
    const { engine, repo, setNow } = await makeEngine({
      now: 'Mon 08:00',
      events: [lecture, meeting],
    });
    const version = engine.snapshot().version;
    setNow('Mon 12:30');
    const before = await capture(engine, repo);

    const result = await engine.applyAlternative({
      eventId: 'Meeting',
      slot: iv('Mon 12:00', 'Mon 13:00'),
      baseVersion: version,
    });

    expect(result).toEqual({ ok: false, error: { code: 'StaleResult' } });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('suggestAlternatives rejects an unknown event and a bad buffer override', async () => {
    const { engine } = await makeEngine({ events: [lecture] });

    expect(engine.suggestAlternatives({ eventId: 'nope' })).toEqual({
      ok: false,
      error: { code: 'NotFound', entity: 'event', id: 'nope' },
    });
    const badBuffer = engine.suggestAlternatives({ eventId: 'Lecture', bufferMin: -1 });
    expect(badBuffer.ok ? null : badBuffer.error.code).toBe('InvalidInput');
  });
});
