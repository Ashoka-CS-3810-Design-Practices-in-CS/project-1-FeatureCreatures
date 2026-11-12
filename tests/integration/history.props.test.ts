import fc from 'fast-check';
import type { Repository } from '@/data/repository';
import type { Engine } from '@/engine';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR } from '@/shared/constants';
import type { CalendarEvent, Task } from '@/shared/types';
import { ev, task } from '../helpers/builders';
import { makeEngine } from '../helpers/engine';
import { PROP_TIMEOUT_MS, propParams } from '../helpers/props';
import { BASE_MONDAY } from '../helpers/time';

const MAX_COMMANDS = 20;
const WORKING_DAYS = 5;
const FIRST_HOUR = 8;
const LAST_HOUR = 17;
const MIN_EVENT_MIN = 15;
const MAX_EVENT_MIN = 120;
const MIN_TASK_MIN = 15;
const MAX_TASK_MIN = 90;
const MAX_PICK = 100; // reduced modulo the current list length
const WEEK: [string, string] = ['Mon 09:00', 'Fri 18:00'];

const placement = fc.record({
  day: fc.integer({ min: 0, max: WORKING_DAYS - 1 }),
  hour: fc.integer({ min: FIRST_HOUR, max: LAST_HOUR }),
});
const pick = fc.integer({ min: 0, max: MAX_PICK });

const commands = fc.array(
  fc.oneof(
    fc.record({
      kind: fc.constant('create' as const),
      at: placement,
      length: fc.integer({ min: MIN_EVENT_MIN, max: MAX_EVENT_MIN }),
    }),
    fc.record({ kind: fc.constant('move' as const), pick, at: placement }),
    fc.record({ kind: fc.constant('delete' as const), pick }),
    fc.record({
      kind: fc.constant('createTask' as const),
      length: fc.integer({ min: MIN_TASK_MIN, max: MAX_TASK_MIN }),
    }),
    fc.record({ kind: fc.constant('schedule' as const), pick }),
    fc.record({ kind: fc.constant('deleteTask' as const), pick }),
  ),
  { maxLength: MAX_COMMANDS },
);

type Command = typeof commands extends fc.Arbitrary<(infer C)[]> ? C : never;

// PRE:  at names a working day and hour of the base week
// POST: returns that Minute (tests run with TZ=UTC, so plain arithmetic is local time)
function minuteAt(at: { day: number; hour: number }): number {
  return BASE_MONDAY + at.day * MINUTES_PER_DAY + at.hour * MINUTES_PER_HOUR;
}

// PRE:  items is a list; index ≥ 0
// POST: returns items[index mod items.length], or undefined when items is empty
function choose<T>(items: readonly T[], index: number): T | undefined {
  return items.length === 0 ? undefined : items[index % items.length];
}

// PRE:  engine is initialised; command is any generated command
// POST: runs command against engine when it applies (a target exists, a slot is found); otherwise
//       does nothing. Commands that fail validation leave everything unchanged, which is fine here
async function run(engine: Engine, command: Command): Promise<void> {
  const { events, tasks } = engine.snapshot();
  if (command.kind === 'create') {
    const start = minuteAt(command.at);
    await engine.createEvent({
      title: 'Generated',
      description: '',
      categoryId: 'meeting',
      priority: 'medium',
      start,
      end: start + command.length,
      flexible: false,
      flexWindow: null,
    });
  } else if (command.kind === 'move') {
    const target = choose(events, command.pick);
    if (target !== undefined) {
      const start = minuteAt(command.at);
      await engine.moveEvent(target.id, { start, end: start + (target.end - target.start) });
    }
  } else if (command.kind === 'delete') {
    const target = choose(events, command.pick);
    if (target !== undefined) {
      await engine.deleteEvent(target.id);
    }
  } else if (command.kind === 'createTask') {
    const { name, description, categoryId, priority, durationMin, window, useWorkingHours } = task(
      'template',
      command.length,
      WEEK,
    );
    await engine.createTask({
      name,
      description,
      categoryId,
      priority,
      durationMin,
      window,
      useWorkingHours,
    });
  } else if (command.kind === 'schedule') {
    const target = choose(
      tasks.filter((candidate) => candidate.status === 'unscheduled'),
      command.pick,
    );
    const found = target === undefined ? null : engine.findSlots({ taskId: target.id });
    const top = found?.ok ? found.value.options[0] : undefined;
    if (target !== undefined && found?.ok && top !== undefined) {
      await engine.scheduleTask({
        taskId: target.id,
        slot: top.slot,
        baseVersion: found.value.baseVersion,
      });
    }
  } else {
    const target = choose(tasks, command.pick);
    if (target !== undefined) {
      await engine.deleteTask(target.id);
    }
  }
}

// PRE:  records have ids
// POST: returns a copy sorted by id, so stores with different orders compare equal
function byId<T extends { id: string }>(records: readonly T[]): T[] {
  return records.toSorted((first, second) => (first.id < second.id ? -1 : 1));
}

// PRE:  engine and repo belong together
// POST: returns the snapshot's and the repository's events and tasks, normalised for comparison
async function views(engine: Engine, repo: Repository) {
  const snapshot = engine.snapshot();
  const stored = await repo.load();
  return {
    snapshot: { events: byId<CalendarEvent>(snapshot.events), tasks: byId<Task>(snapshot.tasks) },
    stored: { events: byId(stored.events), tasks: byId(stored.tasks) },
  };
}

// PRE:  engine is initialised; step is 'undo' or 'redo'
// POST: repeats step until its stack is empty, checking after each step that the repository still
//       equals the snapshot
async function drain(engine: Engine, repo: Repository, step: 'undo' | 'redo'): Promise<void> {
  const more = () => (step === 'undo' ? engine.snapshot().canUndo : engine.snapshot().canRedo);

  // INVARIANT: the repository equals the snapshot
  while (more()) {
    await (step === 'undo' ? engine.undo() : engine.redo());
    const { snapshot, stored } = await views(engine, repo);
    expect(stored).toEqual(snapshot);
  }
  // POST: the stack is empty and the repository equals the snapshot
}

describe('undo / redo (property)', () => {
  it(
    'T36: undo-all restores the start, redo-all the end, and storage always matches',
    async () => {
      await fc.assert(
        fc.asyncProperty(commands, async (sequence) => {
          const { engine, repo } = await makeEngine({
            events: [ev('Seed', 'Mon 09:00', 'Mon 10:00')],
            tasks: [task('SeedTask', 30, WEEK)],
          });
          const start = (await views(engine, repo)).snapshot;

          // INVARIANT: the commands so far have run and the repository equals the snapshot
          for (const command of sequence) {
            await run(engine, command);
            const { snapshot, stored } = await views(engine, repo);
            expect(stored).toEqual(snapshot);
          }
          // POST: every command has run
          const end = (await views(engine, repo)).snapshot;

          await drain(engine, repo, 'undo');
          expect((await views(engine, repo)).snapshot).toEqual(start);
          await drain(engine, repo, 'redo');
          expect((await views(engine, repo)).snapshot).toEqual(end);
        }),
        propParams(),
      );
    },
    PROP_TIMEOUT_MS,
  );
});
