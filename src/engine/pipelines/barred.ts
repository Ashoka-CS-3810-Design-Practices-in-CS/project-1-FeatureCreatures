import { err, ok, type Result } from '@/shared/result';
import { barredKeepSchema, parseInput } from '@/shared/schemas';
import { commit, unchangedOutcome, type PipelineContext, type PipelineOutcome } from '../state';

export interface BarredKeepRequest {
  eventId: string;
  slotId: string;
  kept: boolean;
}

// PRE:  context is current; request comes from outside
// POST: validates ids/overlap and records one undoable metadata change; repeated values are no-ops;
//       returns typed errors without partial state/storage/history changes
export async function setBarredKept(
  context: PipelineContext,
  request: BarredKeepRequest,
): Promise<Result<PipelineOutcome>> {
  const parsed = parseInput(barredKeepSchema, request);
  if (!parsed.ok) return parsed;
  const { eventId, slotId, kept } = parsed.value;
  const event = context.state.events.find((candidate) => candidate.id === eventId);
  if (event === undefined) return err({ code: 'NotFound', entity: 'event', id: eventId });
  const slot = context.state.settings.barredSlots.find((candidate) => candidate.id === slotId);
  const overlaps = context.state.barredOverlaps.some(
    (warning) => warning.eventId === eventId && warning.slotId === slotId,
  );
  if (slot === undefined || (kept && !overlaps)) {
    return err({
      code: 'InvalidInput',
      issues: [{ path: 'slotId', message: 'Choose a barred slot this event overlaps.' }],
    });
  }
  if (event.keptInBarred.includes(slotId) === kept) return ok(unchangedOutcome(context.state));
  const keptInBarred = kept
    ? [...event.keptInBarred, slotId]
    : event.keptInBarred.filter((id) => id !== slotId);
  const result = await commit(
    context.state,
    {
      label: `${kept ? 'Keep' : 'Stop keeping'} "${event.title}" in ${slot.label}`,
      events: [
        { id: eventId, before: event, after: { ...event, keptInBarred, updatedAt: context.now } },
      ],
      tasks: [],
    },
    'do',
    context.repo,
  );
  return result.ok ? ok({ ...result.value, suggestion: null }) : result;
}
