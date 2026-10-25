// Keyboard shortcuts (B4, PROJECT_SCHEMA §7.6, TECH_SPEC §11.5): one keydown listener on window.
// shortcutFor decides which command a key press means; the hook runs it.

import type { CalendarApi } from '@fullcalendar/core';
import type FullCalendar from '@fullcalendar/react';
import { useEffect, type RefObject } from 'react';
import { useAppStore, type AppActions, type ViewType } from '../store/appStore';

export interface KeyPress {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export type ShortcutCommand =
  | { kind: 'newEvent' }
  | { kind: 'newTask' }
  | { kind: 'today' }
  | { kind: 'prev' }
  | { kind: 'next' }
  | { kind: 'view'; view: ViewType }
  | { kind: 'replan' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'help' }
  | { kind: 'close' };

// Plain keys (no Ctrl/Cmd); letters are matched in lower case, so Shift does not matter for them.
const PLAIN_KEY_COMMANDS: Record<string, ShortcutCommand> = {
  t: { kind: 'today' },
  arrowleft: { kind: 'prev' },
  arrowright: { kind: 'next' },
  d: { kind: 'view', view: 'timeGridDay' },
  w: { kind: 'view', view: 'timeGridWeek' },
  m: { kind: 'view', view: 'dayGridMonth' },
  l: { kind: 'view', view: 'listWeek' },
  r: { kind: 'replan' },
  '?': { kind: 'help' },
};
const TEXT_FIELD_SELECTOR = 'input, textarea, select, [contenteditable]';

// PRE:  press is a Ctrl/Cmd key press
// POST: returns undo for Z, redo for Shift+Z or Ctrl+Y, and null for every other combination (so
//       the browser keeps its own shortcuts)
function modifiedShortcut(press: KeyPress): ShortcutCommand | null {
  const key = press.key.toLowerCase();
  if (key === 'z') {
    return press.shiftKey ? { kind: 'redo' } : { kind: 'undo' };
  }
  if (key === 'y' && press.ctrlKey && !press.shiftKey) {
    return { kind: 'redo' };
  }
  return null;
}

// PRE:  press is a keydown; inTextField says focus is in an input, textarea, select or
//       contenteditable; modalOpen says a dialog or the picker is open
// POST: returns the §7.6 command press means, or null: Esc closes an open dialog; every other
//       shortcut is off in a text field and while a dialog is open; Alt combinations are ignored
export function shortcutFor(
  press: KeyPress,
  inTextField: boolean,
  modalOpen: boolean,
): ShortcutCommand | null {
  if (press.key === 'Escape') {
    return modalOpen ? { kind: 'close' } : null;
  }
  if (inTextField || modalOpen || press.altKey) {
    return null;
  }
  if (press.ctrlKey || press.metaKey) {
    return modifiedShortcut(press);
  }
  const key = press.key.toLowerCase();
  if (key === 'n') {
    return press.shiftKey ? { kind: 'newTask' } : { kind: 'newEvent' };
  }
  return PLAIN_KEY_COMMANDS[key] ?? null;
}

// PRE:  target is a keydown's target
// POST: returns whether it is a text field, where typed keys belong to the field
function isTextField(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches(TEXT_FIELD_SELECTOR);
}

// PRE:  command came from shortcutFor; actions are the store's; calendar is FullCalendar's API (null
//       before it renders); dialogOpen says a dialog (not only the picker) is open
// POST: runs the command: opens a dialog, undoes / redoes, moves or switches the calendar, or
//       closes the top dialog (a dialog sits above the picker)
function runShortcut(
  command: ShortcutCommand,
  actions: AppActions,
  calendar: CalendarApi | null,
  dialogOpen: boolean,
): void {
  switch (command.kind) {
    case 'newEvent':
      actions.openDialog({ kind: 'event', mode: 'create', defaults: {} });
      return;
    case 'newTask':
      actions.openDialog({ kind: 'task', mode: 'create' });
      return;
    case 'replan':
      actions.openDialog({ kind: 'replan' });
      return;
    case 'help':
      actions.openDialog({ kind: 'shortcuts' });
      return;
    case 'undo':
      void actions.undo();
      return;
    case 'redo':
      void actions.redo();
      return;
    case 'today':
      calendar?.today();
      return;
    case 'prev':
      calendar?.prev();
      return;
    case 'next':
      calendar?.next();
      return;
    case 'view':
      calendar?.changeView(command.view);
      return;
    case 'close':
      if (dialogOpen) {
        actions.closeDialog();
      } else {
        actions.pickerStop();
      }
      return;
  }
}

// PRE:  called in a component under StoreProvider (App); calendarRef points at the FullCalendar
//       component that CalendarView renders
// POST: while mounted, a keydown on window runs its shortcut (and the browser's default for that
//       key is prevented); keys that are not shortcuts are left alone
export function useShortcuts(calendarRef: RefObject<FullCalendar | null>): void {
  const dialogOpen = useAppStore((state) => state.dialog !== null);
  const pickerOpen = useAppStore((state) => state.picker !== null);
  const busy = useAppStore((state) => state.busy !== null);
  const actions = useAppStore((state) => state.actions);

  useEffect(() => {
    // PRE:  event is a keydown on window
    // POST: runs the shortcut it means, if any, instead of the browser's default
    function onKeyDown(event: KeyboardEvent): void {
      const nativeModalOpen = document.querySelector('dialog[open]') !== null;
      // Native Esc closes only the top dialog, including the drawer; a loading dialog cancels it.
      if (busy || (event.key === 'Escape' && nativeModalOpen)) {
        return;
      }
      const command = shortcutFor(
        event,
        isTextField(event.target),
        dialogOpen || pickerOpen || nativeModalOpen,
      );
      if (command === null) {
        return;
      }
      event.preventDefault();
      runShortcut(command, actions, calendarRef.current?.getApi() ?? null, dialogOpen);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, calendarRef, dialogOpen, pickerOpen, busy]);
}
