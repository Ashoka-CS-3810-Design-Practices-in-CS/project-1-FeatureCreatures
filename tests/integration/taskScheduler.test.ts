import type { Engine } from '@/engine';
import type { Result } from '@/shared/result';
import type {
  BarredSlot,
  MutationResult,
  SlotSearchResult,
  Task,
  TaskInput,
  UserCriterion,
} from '@/shared/types';
import { ev, flexEv, iv, settings, task } from '../helpers/builders';
import { capture, makeEngine } from '../helpers/engine';
import { t } from '../helpers/time';
import { halfHourSlots } from '../helpers/slots';

const MONDAY_HOURS: [string, string] = ['Mon 09:00', 'Mon 18:00'];
const WEEK: [string, string] = ['Mon 09:00', 'Fri 18:00'];

// PRE:  result is any Result
// POST: returns its value; throws with the error code otherwise, so the failing step is obvious
function expectOk<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

// PRE:  result is a search result
// POST: returns the slots of its options, in rank order
const slotsOf = (result: SlotSearchResult) => result.options.map((option) => option.slot);

// PRE:  current is a task
// POST: returns current's TaskInput fields with overrides applied
function taskInput(current: Task, overrides: Partial<TaskInput> = {}): TaskInput {
  const { name, description, categoryId, priority, durationMin, window, useWorkingHours } = current;
  return {
    name,
    description,
    categoryId,
    priority,
    durationMin,
    window,
    useWorkingHours,
    ...overrides,
  };
}

// PRE:  engine holds task taskId, unscheduled
// POST: schedules it at the top option of findSlots and returns the mutation result
async function scheduleTop(
  engine: Engine,
  taskId: string,
  criterion?: UserCriterion,
): Promise<MutationResult> {
  const found = expectOk(engine.findSlots({ taskId, criterion }));
  const top = found.options[0];
  if (top === undefined) {
    throw new Error('no option');
  }
  return expectOk(
    await engine.scheduleTask({ taskId, slot: top.slot, baseVersion: found.baseVersion }),
  );
}

describe('findSlots (FR5)', () => {
  it('T6: merge → complement → filter', async () => {
    const { engine } = await makeEngine({
      events: [
        ev('E1', 'Mon 09:00', 'Mon 10:00'),
        ev('E2', 'Mon 10:30', 'Mon 12:00'),
        ev('E3', 'Mon 13:00', 'Mon 14:00'),
      ],
      tasks: [task('T', 90, MONDAY_HOURS)],
    });

    const found = expectOk(engine.findSlots({ taskId: 'T', criterion: 'earliest' }));

    expect(found.freeGaps.map(({ start, end }) => ({ start, end }))).toEqual([
      iv('Mon 10:00', 'Mon 10:30'),
      iv('Mon 12:00', 'Mon 13:00'),
      iv('Mon 14:00', 'Mon 18:00'),
    ]);
    expect(found.fittingCount).toBe(1);
    expect(found.options).toHaveLength(6);
    expect(found.options[0]).toMatchObject({
      slot: iv('Mon 14:00', 'Mon 15:30'),
      gapMin: 240,
      leftoverMin: 150,
      gap: {
        before: { kind: 'event', eventId: 'E3', at: t('Mon 14:00') },
        after: { kind: 'edge', reason: 'workEnd', at: t('Mon 18:00') },
      },
    });
  });

  it('T7: overlapping busy time is not double-counted', async () => {
    const { engine } = await makeEngine({
      events: [ev('X', 'Mon 09:00', 'Mon 11:00'), ev('Y', 'Mon 10:00', 'Mon 12:00')],
      tasks: [task('T', 60, ['Mon 09:00', 'Mon 13:00'])],
    });

    const conflicts = engine.snapshot().conflicts;
    expect(conflicts.map(({ key, overlap, minutes }) => ({ key, overlap, minutes }))).toEqual([
      { key: 'X|Y', overlap: iv('Mon 10:00', 'Mon 11:00'), minutes: 60 },
    ]);
    const found = expectOk(engine.findSlots({ taskId: 'T' }));
    expect(found.freeGaps.map(({ start, end }) => ({ start, end }))).toEqual([
      iv('Mon 12:00', 'Mon 13:00'),
    ]);
    expect(found.options).toHaveLength(1);
    expect(found.options[0]).toMatchObject({
      slot: iv('Mon 12:00', 'Mon 13:00'),
      leftoverMin: 0,
      gap: { before: { kind: 'event', eventId: 'Y', at: t('Mon 12:00') } },
    });
  });

  it('T8: a task longer than its window is TaskLongerThanWindow (ER2)', async () => {
    const { engine } = await makeEngine({ tasks: [task('T', 600, MONDAY_HOURS)] });

    expect(engine.findSlots({ taskId: 'T' })).toEqual({
      ok: false,
      error: { code: 'TaskLongerThanWindow', durationMin: 600, longestStretchMin: 540 },
    });
  });

  it('T9: no fitting gap is NoSlotFound with the largest gap (ER3)', async () => {
    const { engine } = await makeEngine({
      events: [ev('A', 'Mon 09:00', 'Mon 12:00'), ev('B', 'Mon 12:15', 'Mon 18:00')],
      tasks: [task('T', 30, MONDAY_HOURS)],
    });

    expect(engine.findSlots({ taskId: 'T' })).toEqual({
      ok: false,
      error: {
        code: 'NoSlotFound',
        durationMin: 30,
        largestGapMin: 15,
        largestGap: iv('Mon 12:00', 'Mon 12:15'),
        bufferMin: 0,
      },
    });
  });

  it('T10: earliest and bestFit really differ', async () => {
    const { engine } = await makeEngine({
      events: [ev('X', 'Mon 14:00', 'Mon 15:00')],
      tasks: [task('T', 90, ['Mon 10:00', 'Mon 16:40'])],
    });

    const earliest = expectOk(engine.findSlots({ taskId: 'T', criterion: 'earliest' }));
    const bestFit = expectOk(engine.findSlots({ taskId: 'T', criterion: 'bestFit' }));

    expect(earliest.freeGaps.map((gap) => gap.end - gap.start)).toEqual([240, 100]);
    const morning = halfHourSlots('Mon 10:00', 'Mon 12:30', 90);
    const afternoon = [iv('Mon 15:00', 'Mon 16:30'), iv('Mon 15:10', 'Mon 16:40')];
    expect(earliest.options.map(({ slot, leftoverMin }) => ({ slot, leftoverMin }))).toEqual([
      ...morning.map((slot) => ({ slot, leftoverMin: 150 })),
      ...afternoon.map((slot) => ({ slot, leftoverMin: 10 })),
    ]);
    expect(slotsOf(bestFit)).toEqual([...afternoon, ...morning]);
    expect(earliest.freeGaps[0]?.before).toMatchObject({ kind: 'edge', reason: 'windowStart' });
    expect(earliest.freeGaps[1]?.after).toMatchObject({ kind: 'edge', reason: 'windowEnd' });
  });

  it('T11: the buffer applies from settings and as an override (FR11)', async () => {
    const events = [ev('E', 'Mon 10:00', 'Mon 11:00')];
    const tasks = [task('T', 60, ['Mon 09:00', 'Mon 12:00'])];
    const noSlot = {
      ok: false,
      error: {
        code: 'NoSlotFound',
        durationMin: 60,
        largestGapMin: 45,
        largestGap: iv('Mon 09:00', 'Mon 09:45'),
        bufferMin: 15,
      },
    };

    const plain = await makeEngine({ events, tasks });
    expect(slotsOf(expectOk(plain.engine.findSlots({ taskId: 'T' })))).toEqual([
      iv('Mon 09:00', 'Mon 10:00'),
      iv('Mon 11:00', 'Mon 12:00'),
    ]);
    const buffered = await makeEngine({ events, tasks, settings: settings({ bufferMin: 15 }) });
    expect(buffered.engine.findSlots({ taskId: 'T' })).toEqual(noSlot);
    expect(plain.engine.findSlots({ taskId: 'T', bufferMin: 15 })).toEqual(noSlot);
  });

  it('T18: priorityAware maps High / Medium / Low to earliest / bestFit / leastLoaded', async () => {
    const events = [
      ev('Mon', 'Mon 09:00', 'Mon 13:00'),
      ev('Tue1', 'Tue 09:00', 'Tue 10:00'),
      ev('Tue2', 'Tue 11:00', 'Tue 18:00'),
      ev('Wed', 'Wed 09:00', 'Wed 10:00'),
    ];
    const window: [string, string] = ['Mon 09:00', 'Wed 18:00'];
    const { engine } = await makeEngine({
      events,
      tasks: [
        task('H', 60, window, { priority: 'high' }),
        task('M', 60, window, { priority: 'medium' }),
        task('L', 60, window, { priority: 'low' }),
      ],
    });
    const starts = (taskId: string) =>
      expectOk(engine.findSlots({ taskId, criterion: 'priorityAware' })).options.map(
        ({ slot, effectiveCriterion, dayLoadMin }) => ({
          start: slot.start,
          effectiveCriterion,
          dayLoadMin,
        }),
      );
    const mon = halfHourSlots('Mon 13:00', 'Mon 17:00', 60).map((slot) => ({
      start: slot.start,
      dayLoadMin: 240,
    }));
    const tue = [{ start: t('Tue 10:00'), dayLoadMin: 480 }];
    const wed = halfHourSlots('Wed 10:00', 'Wed 17:00', 60).map((slot) => ({
      start: slot.start,
      dayLoadMin: 60,
    }));
    // PRE:  slots are expected starts/loads; effectiveCriterion is the expected mapped strategy
    // POST: returns the exact expected option metadata in slots' order
    const as = (effectiveCriterion: string, slots: typeof mon) =>
      slots.map((slot) => ({ ...slot, effectiveCriterion }));

    expect(starts('H')).toEqual(as('earliest', [...mon, ...tue, ...wed]));
    expect(starts('M')).toEqual(as('bestFit', [...tue, ...mon, ...wed]));
    expect(starts('L')).toEqual(as('leastLoaded', [...wed, ...mon, ...tue]));
  });

  // AUDIT A05: day loads used only the events inside the search window, so a window starting at
  // Mon 17:00 saw Monday as empty although it is booked 09:00–17:00.
  it('T18 partial days: day loads count the whole working day, not just the window', async () => {
    const { engine } = await makeEngine({
      events: [ev('Busy', 'Mon 09:00', 'Mon 17:00')],
      tasks: [task('L', 60, ['Mon 17:00', 'Tue 10:00'], { priority: 'low' })],
    });

    const options = expectOk(engine.findSlots({ taskId: 'L', criterion: 'priorityAware' })).options;

    expect(options.map(({ slot, dayLoadMin }) => ({ start: slot.start, dayLoadMin }))).toEqual([
      { start: t('Tue 09:00'), dayLoadMin: 0 },
      { start: t('Mon 17:00'), dayLoadMin: 480 },
    ]);
  });

  it('T19: barred slots shape the search but never block manual events', async () => {
    const lunch: BarredSlot = {
      id: 'lunch',
      label: 'Lunch',
      startMin: 13 * 60,
      endMin: 14 * 60,
      days: [1, 2, 3, 4, 5],
    };
    const window: [string, string] = ['Mon 12:00', 'Mon 15:00'];
    const { engine } = await makeEngine({
      settings: settings({ barredSlots: [lunch] }),
      tasks: [task('Long', 90, window), task('Short', 60, window)],
    });

    expect(engine.findSlots({ taskId: 'Long' })).toEqual({
      ok: false,
      error: { code: 'TaskLongerThanWindow', durationMin: 90, longestStretchMin: 60 },
    });
    const short = expectOk(engine.findSlots({ taskId: 'Short' }));
    expect(slotsOf(short)).toEqual([iv('Mon 12:00', 'Mon 13:00'), iv('Mon 14:00', 'Mon 15:00')]);
    expect(short.options[0]?.gap.after).toEqual({
      kind: 'barred',
      label: 'Lunch',
      at: t('Mon 13:00'),
    });
    expect(short.options[1]?.gap.before).toEqual({
      kind: 'barred',
      label: 'Lunch',
      at: t('Mon 14:00'),
    });
    const manual = await engine.createEvent({
      title: 'Lunch talk',
      description: '',
      categoryId: 'meeting',
      priority: 'medium',
      start: t('Mon 13:00'),
      end: t('Mon 13:30'),
      flexible: false,
      flexWindow: null,
    });
    expect(manual.ok).toBe(true);
  });

  it('T28 (a, b): the search starts at now rounded up to 5 minutes', async () => {
    const { engine } = await makeEngine({
      now: 'Mon 12:07',
      tasks: [task('Day', 60, MONDAY_HOURS), task('Morning', 60, ['Mon 09:00', 'Mon 11:00'])],
    });

    const day = expectOk(engine.findSlots({ taskId: 'Day' }));
    expect(day.options[0]?.slot).toEqual(iv('Mon 12:10', 'Mon 13:10'));
    expect(day.options[0]?.gap).toMatchObject({
      ...iv('Mon 12:10', 'Mon 18:00'),
      before: { kind: 'edge', reason: 'now', at: t('Mon 12:10') },
    });
    expect(engine.findSlots({ taskId: 'Morning' })).toEqual({
      ok: false,
      error: { code: 'TaskLongerThanWindow', durationMin: 60, longestStretchMin: 0 },
    });
  });

  it('rejects an unknown task, a scheduled task and a bad buffer override', async () => {
    const { engine } = await makeEngine({
      events: [flexEv('E', 'Mon 10:00', 'Mon 11:00', WEEK, { title: 'S', taskId: 'S' })],
      tasks: [
        task('S', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' }),
        task('U', 60, WEEK),
      ],
    });

    expect(engine.findSlots({ taskId: 'nope' })).toEqual({
      ok: false,
      error: { code: 'NotFound', entity: 'task', id: 'nope' },
    });
    expect(engine.findSlots({ taskId: 'S' })).toEqual({
      ok: false,
      error: {
        code: 'InvalidInput',
        issues: [{ path: 'status', message: 'Task is already scheduled.' }],
      },
    });
    const badBuffer = engine.findSlots({ taskId: 'U', bufferMin: 121 });
    expect(badBuffer.ok ? null : badBuffer.error.code).toBe('InvalidInput');
  });
});

describe('scheduling and sync (FR8, FR9, BR-9)', () => {
  it('T16: schedule, edit either side, unschedule by deleting the event, then delete the task', async () => {
    const report = task('R', 90, WEEK, { name: 'Write report', priority: 'high' });
    const { engine } = await makeEngine({ tasks: [report] });
    const taskR = () => engine.snapshot().tasks.find((candidate) => candidate.id === 'R');

    // (1) schedule at Mon 14:00–15:30
    const scheduled = expectOk(
      await engine.scheduleTask({
        taskId: 'R',
        slot: iv('Mon 14:00', 'Mon 15:30'),
        baseVersion: engine.snapshot().version,
      }),
    );
    expect(scheduled.label).toBe('Schedule "Write report"');
    expect(scheduled.snapshot.events[0]).toMatchObject({
      id: 'id-1',
      taskId: 'R',
      flexible: true,
      flexWindow: iv(...WEEK),
      priority: 'high',
    });
    expect(taskR()).toMatchObject({ status: 'scheduled', scheduledEventId: 'id-1' });

    // (2) edit the event: title "Final report", end 16:00
    const event = scheduled.snapshot.events[0];
    if (event === undefined) throw new Error('no event');
    const edited = expectOk(
      await engine.updateEvent('id-1', {
        title: 'Final report',
        description: event.description,
        categoryId: event.categoryId,
        priority: event.priority,
        start: event.start,
        end: t('Mon 16:00'),
        flexible: event.flexible,
        flexWindow: event.flexWindow,
      }),
    );
    expect(edited.snapshot.undoLabel).toBe('Edit "Final report"');
    expect(taskR()).toMatchObject({ name: 'Final report', durationMin: 120 });

    // (3) edit the task: duration 60, start kept
    const current = taskR();
    if (current === undefined) throw new Error('no task');
    const shortened = expectOk(
      await engine.updateTask('R', taskInput(current, { durationMin: 60 })),
    );
    expect(shortened.snapshot.undoLabel).toBe('Edit task "Final report"');
    expect(shortened.snapshot.events[0]).toMatchObject(iv('Mon 14:00', 'Mon 15:00'));

    // (4) delete the event: the task stays, unscheduled
    const deleted = expectOk(await engine.deleteEvent('id-1'));
    expect(deleted.snapshot.undoLabel).toBe('Delete "Final report"');
    expect(deleted.snapshot.events).toEqual([]);
    expect(taskR()).toMatchObject({ status: 'unscheduled', scheduledEventId: null });

    // (5) schedule again at Tue 09:00–10:00 (60 min since step 3), then delete the task
    expectOk(
      await engine.scheduleTask({
        taskId: 'R',
        slot: iv('Tue 09:00', 'Tue 10:00'),
        baseVersion: engine.snapshot().version,
      }),
    );
    const removed = expectOk(await engine.deleteTask('R'));
    expect(removed.snapshot.undoLabel).toBe('Delete task "Final report"');
    expect(removed.snapshot).toMatchObject({ events: [], tasks: [], version: 6 });
  });

  it('T17: the queue order, scheduling in turn, and the skip variant', async () => {
    const window: [string, string] = ['Mon 09:00', 'Mon 12:00'];
    const tasks = [
      task('L1', 60, window, { priority: 'low' }),
      task('H1', 60, window, { priority: 'high' }),
      task('M1', 60, window, { priority: 'medium' }),
    ];
    const all = await makeEngine({ tasks });
    const skip = await makeEngine({ tasks });

    expect(all.engine.orderForScheduling(['L1', 'H1', 'M1'])).toEqual(['H1', 'M1', 'L1']);
    const placed = [];
    // INVARIANT: placed holds the slots of the tasks scheduled so far, in queue order
    for (const taskId of ['H1', 'M1', 'L1']) {
      const result = await scheduleTop(all.engine, taskId, 'earliest');
      placed.push(result.snapshot.events.find((event) => event.taskId === taskId));
    }
    // POST: every queued task is scheduled
    expect(placed.map((event) => event && { start: event.start, end: event.end })).toEqual([
      iv('Mon 09:00', 'Mon 10:00'),
      iv('Mon 10:00', 'Mon 11:00'),
      iv('Mon 11:00', 'Mon 12:00'),
    ]);
    expect(all.engine.orderForScheduling(['H1', 'L1'])).toEqual([]);

    await scheduleTop(skip.engine, 'H1', 'earliest');
    const low = await scheduleTop(skip.engine, 'L1', 'earliest');
    expect(low.snapshot.events.find((event) => event.taskId === 'L1')).toMatchObject(
      iv('Mon 10:00', 'Mon 11:00'),
    );
  });

  it('T27 (scheduling): a schedule against an old version is StaleResult and changes nothing', async () => {
    const { engine, repo } = await makeEngine({ tasks: [task('T', 60, MONDAY_HOURS)] });
    const found = expectOk(engine.findSlots({ taskId: 'T' }));
    expectOk(
      await engine.createEvent({
        title: 'Elsewhere',
        description: '',
        categoryId: 'meeting',
        priority: 'medium',
        start: t('Tue 10:00'),
        end: t('Tue 11:00'),
        flexible: false,
        flexWindow: null,
      }),
    );
    const before = await capture(engine, repo);

    const stale = await engine.scheduleTask({
      taskId: 'T',
      slot: found.options[0]?.slot ?? iv('Mon 09:00', 'Mon 10:00'),
      baseVersion: found.baseVersion,
    });

    expect(stale).toEqual({ ok: false, error: { code: 'StaleResult' } });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('scheduleTask rejects a wrong-length slot, an unknown task and a scheduled task', async () => {
    const { engine, repo } = await makeEngine({ tasks: [task('T', 60, MONDAY_HOURS)] });
    const before = await capture(engine, repo);
    const at = (taskId: string, from: string, to: string) =>
      engine.scheduleTask({ taskId, slot: iv(from, to), baseVersion: engine.snapshot().version });

    const wrongLength = await at('T', 'Mon 09:00', 'Mon 09:30');
    expect(wrongLength.ok ? null : wrongLength.error).toMatchObject({
      code: 'InvalidTime',
      issues: [{ path: 'slot' }],
    });
    const unknown = await at('nope', 'Mon 09:00', 'Mon 10:00');
    expect(unknown.ok ? null : unknown.error.code).toBe('NotFound');
    expect(await capture(engine, repo)).toEqual(before);

    expectOk(await at('T', 'Mon 09:00', 'Mon 10:00'));
    const again = await at('T', 'Mon 11:00', 'Mon 12:00');
    expect(again.ok ? null : again.error.code).toBe('InvalidInput');
  });

  // AUDIT A06: a fractional slot passed the length check, was saved, and the next start failed
  // with "Saved data is damaged."
  it('scheduleTask rejects slot endpoints that are not supported integer minutes', async () => {
    const { engine, repo } = await makeEngine({ tasks: [task('T', 60, MONDAY_HOURS)] });
    const before = await capture(engine, repo);
    const baseVersion = engine.snapshot().version;
    const halfMinute = 0.5;
    const fractional = { start: t('Mon 09:00') + halfMinute, end: t('Mon 10:00') + halfMinute };
    const beyond = { start: Number.MAX_SAFE_INTEGER - 60, end: Number.MAX_SAFE_INTEGER };

    const fractionalResult = await engine.scheduleTask({
      taskId: 'T',
      slot: fractional,
      baseVersion,
    });
    const beyondResult = await engine.scheduleTask({ taskId: 'T', slot: beyond, baseVersion });

    expect(fractionalResult.ok ? null : fractionalResult.error).toMatchObject({
      code: 'InvalidInput',
      issues: [{ path: 'slot.start' }, { path: 'slot.end' }],
    });
    expect(beyondResult.ok ? null : beyondResult.error).toMatchObject({
      code: 'InvalidTime',
      issues: [{ path: 'slot.start' }, { path: 'slot.end' }],
    });
    expect(await capture(engine, repo)).toEqual(before);
  });
});

describe('elapsed time makes a result stale (ER7, AUDIT A07)', () => {
  it('scheduleTask refuses an offered slot whose start has passed', async () => {
    const { engine, repo, setNow } = await makeEngine({
      now: 'Mon 08:00',
      tasks: [task('T', 60, MONDAY_HOURS)],
    });
    const found = expectOk(engine.findSlots({ taskId: 'T', criterion: 'earliest' }));
    const slot = found.options[0]?.slot ?? iv('Mon 09:00', 'Mon 10:00');
    expect(slot).toEqual(iv('Mon 09:00', 'Mon 10:00'));
    setNow('Mon 09:30');
    const before = await capture(engine, repo);

    const result = await engine.scheduleTask({ taskId: 'T', slot, baseVersion: found.baseVersion });

    expect(result).toEqual({ ok: false, error: { code: 'StaleResult' } });
    expect(await capture(engine, repo)).toEqual(before);
  });
});

describe('task CRUD', () => {
  it('createTask stores an unscheduled task', async () => {
    const { engine } = await makeEngine({ now: 'Mon 08:00' });

    const created = expectOk(
      await engine.createTask(taskInput(task('x', 45, WEEK, { name: 'Read chapter' }))),
    );

    expect(created.label).toBe('Create task "Read chapter"');
    expect(created.snapshot.tasks[0]).toMatchObject({
      id: 'id-1',
      status: 'unscheduled',
      scheduledEventId: null,
      createdAt: t('Mon 08:00'),
    });
  });

  it.each([
    [
      'duration 0',
      { durationMin: 0 },
      'InvalidInput',
      'durationMin',
      'Duration must be at least 5 minutes.',
    ],
    [
      'duration −5',
      { durationMin: -5 },
      'InvalidInput',
      'durationMin',
      'Duration must be at least 5 minutes.',
    ],
    [
      'duration NaN',
      { durationMin: Number.NaN },
      'InvalidInput',
      'durationMin',
      'Duration must be a number.',
    ],
    [
      'duration 1441',
      { durationMin: 1441 },
      'InvalidInput',
      'durationMin',
      'Duration can be at most 24 hours.',
    ],
    [
      'duration 2.5',
      { durationMin: 2.5 },
      'InvalidInput',
      'durationMin',
      'Duration must be a whole number of minutes.',
    ],
    [
      'window end ≤ start',
      { window: iv('Mon 12:00', 'Mon 12:00') },
      'InvalidTime',
      'window.end',
      undefined,
    ],
    ['name "  "', { name: '  ' }, 'InvalidInput', 'name', undefined],
  ])('T31: %s fails and changes nothing', async (_case, overrides, code, path, message) => {
    const { engine, repo } = await makeEngine();
    const before = await capture(engine, repo);

    const result = await engine.createTask(taskInput(task('x', 60, WEEK), overrides));

    expect(result.ok ? null : result.error.code).toBe(code);
    expect(result.ok ? null : result.error).toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining(message ? { path, message } : { path }),
      ]),
    });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('updateTask on an unscheduled task changes only the task', async () => {
    const original = task('T', 60, WEEK);
    const { engine } = await makeEngine({ tasks: [original] });

    const updated = expectOk(
      await engine.updateTask('T', taskInput(original, { durationMin: 30 })),
    );

    expect(updated).toMatchObject({
      label: 'Edit task "T"',
      changedEventIds: [],
      suggestion: null,
    });
    expect(updated.snapshot.tasks[0]?.durationMin).toBe(30);
  });

  it('updateTask rejects a window shorter than the scheduled event, changing nothing', async () => {
    const linked = task('T', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' });
    const { engine, repo } = await makeEngine({
      events: [flexEv('E', 'Mon 10:00', 'Mon 11:00', WEEK, { title: 'T', taskId: 'T' })],
      tasks: [linked],
    });
    const before = await capture(engine, repo);

    const result = await engine.updateTask(
      'T',
      taskInput(linked, { window: iv('Mon 10:00', 'Mon 10:30') }),
    );

    expect(result.ok ? null : result.error).toMatchObject({
      code: 'InvalidTime',
      issues: [{ path: 'flexWindow' }],
    });
    expect(await capture(engine, repo)).toEqual(before);
  });

  it('unscheduleTask removes the event, and is a no-op for an unscheduled task', async () => {
    const { engine } = await makeEngine({
      events: [flexEv('E', 'Mon 10:00', 'Mon 11:00', WEEK, { title: 'S', taskId: 'S' })],
      tasks: [
        task('S', 60, WEEK, { status: 'scheduled', scheduledEventId: 'E' }),
        task('U', 60, WEEK),
      ],
    });

    const unscheduled = expectOk(await engine.unscheduleTask('S'));
    expect(unscheduled.label).toBe('Unschedule "S"');
    expect(unscheduled.snapshot.events).toEqual([]);
    expect(unscheduled.snapshot.tasks[0]).toMatchObject({
      status: 'unscheduled',
      scheduledEventId: null,
    });

    const noOp = expectOk(await engine.unscheduleTask('U'));
    expect(noOp.label).toBe('');
    expect(noOp.snapshot).toEqual(unscheduled.snapshot);
  });

  it('task methods report NotFound for an unknown id', async () => {
    const { engine } = await makeEngine();
    const notFound = { ok: false, error: { code: 'NotFound', entity: 'task', id: 'nope' } };

    expect(await engine.updateTask('nope', taskInput(task('x', 60, WEEK)))).toEqual(notFound);
    expect(await engine.deleteTask('nope')).toEqual(notFound);
    expect(await engine.unscheduleTask('nope')).toEqual(notFound);
  });
});
