import { iv } from '../../../tests/helpers/builders';
import {
  alternativeAppliedText,
  conflictText,
  createdText,
  deletedText,
  historyText,
  movedText,
  moveToLabel,
  sampleLoadedText,
  updatedText,
} from './explain';

describe('format/explain (toast sentences)', () => {
  it('describes event changes', () => {
    expect(createdText('Gym')).toBe('Event created: "Gym".');
    expect(updatedText('Gym')).toBe('Saved "Gym".');
    expect(movedText('Gym', iv('Tue 14:00', 'Tue 15:00'))).toBe(
      'Moved "Gym" to Tue 3 Nov 14:00–15:00.',
    );
    expect(deletedText('Gym')).toBe('Deleted "Gym".');
  });

  it('builds the ER4 warning and its Move to label (PROJECT_SCHEMA ER4)', () => {
    expect(conflictText('Lecture', iv('Mon 11:00', 'Mon 11:30'), 30)).toBe(
      'Saved with a conflict: overlaps "Lecture" 11:00–11:30 (30 min).',
    );
    expect(moveToLabel(iv('Mon 12:00', 'Mon 13:00'))).toBe('Move to Mon 2 Nov 12:00–13:00');
  });

  it('describes alternatives, history and samples', () => {
    expect(alternativeAppliedText(iv('Mon 12:00', 'Mon 13:00'), true)).toBe(
      'Moved to Mon 2 Nov 12:00–13:00 — conflict resolved.',
    );
    expect(alternativeAppliedText(iv('Mon 12:00', 'Mon 13:00'), false)).toBe(
      'Moved to Mon 2 Nov 12:00–13:00.',
    );
    expect(historyText('Undid', 'Delete "Gym"')).toBe('Undid: Delete "Gym"');
    expect(historyText('Undid', '')).toBe('Nothing to undo.');
    expect(historyText('Redid', '')).toBe('Nothing to redo.');
    expect(sampleLoadedText('Sparse week')).toBe('Loaded sample: Sparse week.');
  });
});
