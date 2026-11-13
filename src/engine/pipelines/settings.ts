import { clearInvalidKeeps, invalidatedBarredIds } from '@/shared/barredSlots';
import { parseSettingsChange } from '@/shared/schemas';
import { err, ok, type Result } from '@/shared/result';
import {
  barredOverlapsFor,
  repositoryError,
  type Change,
  type EngineState,
  type PipelineContext,
} from '../state';

// PRE:  changes are existing history entries; invalidIds are slot identities changed by settings
// POST: removes invalid keeps from before/after images while retaining all unrelated history
function clearHistoryKeeps(changes: readonly Change[], invalidIds: ReadonlySet<string>): Change[] {
  return changes.map((change) => ({
    ...change,
    events: change.events.map((record) => ({
      ...record,
      before: record.before === null ? null : clearInvalidKeeps(record.before, invalidIds),
      after: record.after === null ? null : clearInvalidKeeps(record.after, invalidIds),
    })),
  }));
}

// PRE:  context is current; input comes from outside
// POST: atomically saves valid settings and automatic keep clearing, bumps version/revision once,
//       keeps settings non-undoable and prevents stale keeps returning through history; errors leave all unchanged
export async function updateSettings(
  context: PipelineContext,
  input: unknown,
): Promise<Result<EngineState>> {
  const { state } = context;
  const parsed = parseSettingsChange(input, state.settings);
  if (!parsed.ok) return parsed;
  const invalidIds = invalidatedBarredIds(state.settings.barredSlots, parsed.value.barredSlots);
  const events = state.events.map((event) => {
    const cleared = clearInvalidKeeps(event, invalidIds);
    return cleared === event ? event : { ...cleared, updatedAt: context.now };
  });
  const clearedEvents = events.filter((event, index) => event !== state.events[index]);
  try {
    await context.repo.saveSettings(parsed.value, state.revision, clearedEvents);
  } catch (error) {
    return err(repositoryError(error));
  }
  return ok({
    ...state,
    settings: parsed.value,
    events,
    barredOverlaps: barredOverlapsFor(events, parsed.value),
    undo: clearHistoryKeeps(state.undo, invalidIds),
    redo: clearHistoryKeeps(state.redo, invalidIds),
    version: state.version + 1,
    revision: state.revision + 1,
  });
}
