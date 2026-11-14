# PROJECT_SCHEMA.md — Interactive Calendar and Intelligent Time Planner

**Doc 1 of 3.** This file defines *what* we build: the scope, the vocabulary, the domain model, the requirements, the business rules, and the UX.
**Doc 2:** `TECH_SPEC.md` defines *how* to build it: the stack, architecture, file layout, contracts, algorithms, the build plan, and deployment.
**Doc 3:** `TEST_PLAN.md` defines *how we prove it works*: the test catalogue, oracles, benchmarks, CI, and the single live-site smoke test (§7).

---

## 0. Read me first

### 0.1 Who this is for

These three files are the single source of truth for the project. Humans, Codex agents and Claude Code agents should all be able to read them cold and start working.

They supersede Assignments 1–3 (A1, A2, A3) wherever those documents disagree. Every intentional deviation is logged in §9.

### 0.2 Precedence when documents disagree

For Round 2 (WI-47–59), [AUDIT_2.md](extras/AUDIT_2.md) is binding on the redesign decisions. Update these three main docs, with change-log entries, in the WI that implements each decision. The session state and baseline are in [PROGRESS.md](progress/PROGRESS.md).

1. `PROJECT_SCHEMA.md` (this file) wins on behaviour: what the user sees, and what counts as correct.
2. `TECH_SPEC.md` wins on structure: names, files, types, and algorithms.
3. `TEST_PLAN.md` wins on exact expected values for concrete inputs. If a test disagrees with a rule here, treat that as a doc bug: fix the doc in the same PR.
4. Code never silently wins. If the code must differ from a doc, update the doc in the same PR and add a line to that doc's change log.

### 0.3 Identifier conventions (used across all three docs)

| Prefix | Meaning | Defined in |
|---|---|---|
| `FR` | Functional requirement (FR1–FR7 kept from A1, FR8–FR11 added) | §4 |
| `B` | Bonus feature | §4.3 |
| `ER` | Error condition (ER1–ER4 kept from A1, ER5–ER8 added) | §5 |
| `BR` | Business rule (exact semantics) | §6 |
| `W` | User workflow | §7.3 |
| `NFR` | Non-functional requirement | §8 |
| `T` | Test case (T1–T15 kept from A3) | TEST_PLAN |
| `WI` | Work item in the build plan | TECH_SPEC §14 |
| `S` | Current manual smoke-test section | TEST_PLAN §7 |
| `D` | Historical demonstration script | docs/extras/MANUAL_VERIFICATION_HISTORY.md |

---

## 1. Product summary

This is a single-user, browser-based calendar.

- **Events.** Users create, edit, drag, resize and delete events.
- **Conflicts.** Every overlap is detected automatically with an interval sweep and explained: which events, the overlapping interval, and how many minutes.
- **Tasks.** Tasks are flexible to-dos with a duration, priority and allowable window. They live in a side panel until the app finds and explains free slots for them. One task is offered at a time, even when several are selected.
- **Replan.** A *Replan* feature proposes two alternative rearrangements of the flexible events in a date range. Both respect priorities, working hours, barred slots such as lunch, and a buffer between events.
- **Nothing silent.** Nothing is changed without the user choosing an option.

The app is a static site (Vite + React + TypeScript) hosted on Vercel. All data lives in the user's browser (IndexedDB via Dexie), and there is no backend.

---

## 2. Scope

### 2.1 Core features (must ship)

| Area | Features | Requirement IDs |
|---|---|---|
| Event lifecycle | Create, edit, move (drag), resize, delete; categories; priorities; fixed vs. flexible events | FR1, FR2, FR3 |
| Conflict detection | Automatic after every change; all pairs; overlap interval + minutes; visual highlighting (icon + label + colour) | FR4 |
| Conflict resolution | For a conflict, suggest alternative slots for the better event to move, ranked by closeness to the original time; one-click apply | FR7 |
| Priority system | High / Medium / Low on events and tasks; task sorting/status filters; priority/category filters on the calendar; tags visible on both | FR6 |
| Task management | Create, edit, delete, schedule, unschedule, mark done and reopen; bulk completion with preview. Scheduled tasks have linked events kept in sync both ways. | FR8 |
| Best-time finder | For one task: free gaps in its window, filtered by duration, ranked by a selectable criterion, each option explained. Gives a clear reason when nothing fits. | FR5 |
| Scheduling queue | Select several tasks, then the app offers options for one task at a time in priority order. The user applies or skips each, and every search sees the earlier placements. | FR9 |
| Replan | Minimal change plus a selected strategy for flexible events; preview with metrics; apply as one step | FR10 |
| Settings | Optional working hours, default buffer/ranking, categories and appearance; barred slots edited in their own region | FR11 |
| Error handling | Typed errors, inline messages, nothing partially saved | ER1–ER8 |
| Sample data | "Load sample calendar" presets so a grader opening the hosted URL sees something immediately | part of B2 |

### 2.2 Bonus features (in scope, built after core is tested)

| ID | Feature |
|---|---|
| B1 | Undo / redo of every data change (except settings and import), at most 50 steps, in memory only |
| B2 | JSON export / import (replace-all) of categories, events, tasks and settings, plus built-in sample calendars |
| B3 | Dark mode (System / Light / Dark) |
| B4 | Keyboard shortcuts with a help overlay |

These optional features from the project description are also covered by the core design at no extra cost:

- drag-and-drop scheduling
- configurable working hours
- break and lunch constraints (barred slots)
- comparison of multiple scheduling strategies (criterion switcher and two replan plans)
- schedule quality metrics (replan metrics)

### 2.3 Out of scope (explicitly not built)

- Recurring events
- Multiple calendars
- Accounts, multi-user use, sharing, or server sync
- ICS import/export
- Task dependencies and multi-level prerequisites (planned future work; not implemented this round)
- Multiple categories per item, or events/tasks without a category (Round 2)
- Splitting a task across several gaps
- Jointly optimal multi-task scheduling (dynamic programming)
- Interval tree or BST store
- Calendar animations of algorithms
- Productivity statistics
- A tested phone layout (best effort only)
- Offline-first sync across devices
- Per-day working hours and resizing from an event's start edge (not planned)

---

## 3. Glossary and domain model

### 3.1 Glossary

| Term | Meaning |
|---|---|
| **Minute** | An integer number of minutes since the Unix epoch (UTC). All stored times are Minutes. |
| **Interval** | `{start, end}` in Minutes, **half-open** `[start, end)`, with `end > start`. |
| **Event** | An Interval with title, description, category, priority, fixed/flexible flag, optional flex window, optional link to a task. Appears on the timeline. |
| **Fixed event** | The planner leaves it alone. Replan never moves it; alternatives require Allow moving this event and a temporary range. An unlocked manual drag/resize asks an action-specific question (BR-17). Dialog edits remain available. |
| **Calendar lock** | A session-only control disabling timeline creation/move/resize gestures; locked time-grid dragging pans it. Event clicks and deliberate actions remain available (BR-17). |
| **Flexible event** | An event the app may propose to move, but only inside its **flex window**. |
| **Flex window** | An Interval within which a flexible event may be placed. |
| **Task** | A to-do with name, duration, priority and an **allowable window**. It has no time until scheduled, and is shown only in the task panel. |
| **Category** | A stored name and colour referenced by an event/task's required `categoryId`. Five defaults are seeded. |
| **Done task** | A completed task with `doneAt`, no linked event and no occupied calendar time. Mark done frees its scheduled time; Reopen returns it to unscheduled (BR-18). |
| **Scheduled task** | A task linked to exactly one event (created when the user applies a slot). The event is flexible and its flex window equals the task window. |
| **Local day** | A calendar day in the browser's time zone, from local midnight to the next local midnight. It can be 23 or 25 hours long around daylight-saving changes. |
| **Working hours / working days** | From settings, e.g. Mon–Fri 09:00–18:00 local time. |
| **Barred slot** | A recurring daily period where nothing may be *placed* by the app, e.g. "Lunch" 13:00–14:00 Mon–Fri. Existing events inside it are still allowed. |
| **Kept in a barred slot** | An explicit event/slot exception, undoable and cleared by time/day changes, that suppresses that barred warning and Replan reason (BR-15). |
| **Buffer** | A number of minutes kept free on both sides of every existing event when the app searches for slots. |
| **Search window** | The Interval the app searches for a given request (the task window, the flex window, or the replan range). |
| **Allowed segments** | The search window intersected with working days and hours, minus barred slots, and clipped to start no earlier than now (rounded up to 5 minutes). They are sorted and disjoint. |
| **Busy block** | A maximal merged interval of existing events, each expanded by the buffer. |
| **Free gap** | A maximal sub-interval of an allowed segment that does not touch any busy block. |
| **Candidate / option** | A concrete slot `[s, s + duration)` inside one free gap, with an explanation. |
| **Criterion** | The rule used to rank options: `earliest`, `bestFit`, `priorityAware`, `nearest`, `leastLoaded`. |
| **Conflict** | An unordered pair of events whose intervals overlap, plus the overlap interval and its length in minutes. |
| **Day load** | Event minutes clipped to the day's working hours, or the whole local day when working hours are globally off. Overlapping events are summed, not unioned. |
| **Plan** | A proposed set of moves produced by Replan, with metrics. |
| **Snapshot** | The read-only state the engine hands to the UI after every command. |
| **Version** | An integer that increases by one on every successful data change. Used to detect stale options and plans. |

### 3.2 Entities

The TypeScript definitions live in `TECH_SPEC.md` §5. This table lists the fields and their constraints.

#### Event (`CalendarEvent`)

| Field | Type | Constraint |
|---|---|---|
| `id` | string (UUID) | Unique, assigned by the engine |
| `title` | string | 1–100 characters after trimming |
| `description` | string | 0–1000 characters (may be empty) |
| `categoryId` | string | Required; references an existing Category |
| `keptInBarred` | string[] | Barred-slot ids explicitly kept by the user; initially `[]` (Keep here behaviour in WI-53) |
| `priority` | `high \| medium \| low` | Required |
| `start`, `end` | Minute | `end > start`; `end − start ≤ 1440` (24 h); may cross midnight |
| `flexible` | boolean | Required |
| `flexWindow` | Interval \| null | Required iff `flexible`. Must satisfy `end > start` and length ≥ event duration. It does **not** have to contain the event's current interval. |
| `taskId` | string \| null | Set only for scheduled-task events |
| `createdAt`, `updatedAt` | Minute | Assigned by the engine |

New events start Fixed for every category (D-11, C-01). Selecting or creating a category never changes the user's scheduling choice.

The default flex window is the event's local day, from working start to working end. When global working hours are off, or the event does not overlap its day's working hours (for example at night) or falls on a non-working day, the default is that whole local day, 00:00–24:00, so the window is never empty by default (D-10; WI-41, reports #4 and #9). This only fills the form of a new event or one without a window; stored events are never changed.

#### Task

| Field | Type | Constraint |
|---|---|---|
| `id` | string (UUID) | Unique |
| `name` | string | 1–100 characters after trimming |
| `description` | string | 0–1000 characters |
| `categoryId` | string | Required; references an existing Category |
| `priority` | Priority | Required |
| `durationMin` | integer | 5 ≤ d ≤ 1440 |
| `window` | Interval | `end > start` (the allowable scheduling window) |
| `useWorkingHours` | boolean | Default `true`. If `false`, working days and hours are ignored for this task, but barred slots still apply. |
| `status` | `unscheduled \| scheduled \| done` | Managed by the engine |
| `doneAt` | Minute \| null | Non-null exactly when `status = done` |
| `scheduledEventId` | string \| null | Non-null iff `status = scheduled` |
| `createdAt`, `updatedAt` | Minute | Assigned by the engine |

#### Settings (one record)

| Field | Type | Default | Constraint |
|---|---|---|---|
| `useWorkingHours` | boolean | `true` | Global working-time switch; search/UI behaviour added in WI-53 |
| `workDays` | weekday[] (0 = Sun … 6 = Sat) | `[1,2,3,4,5]` | At least one day |
| `workStartMin` | minutes after local midnight | `540` (09:00) | 0–1439 |
| `workEndMin` | minutes after local midnight | `1080` (18:00) | `> workStartMin`, ≤ 1440 |
| `bufferMin` | integer | `0` | 0–120 |
| `barredSlots` | `{id, label, startMin, endMin, days}[]` | `[]` | `endMin > startMin`; label 1–40 characters; no positive time overlap on shared weekdays; touching is allowed; duplicate/overlap messages name the earlier label and times (D-09/D-20) |
| `defaultCriterion` | `earliest \| bestFit \| priorityAware` | `earliest` | — |

UI-only preferences (theme, accent, last view and Calendar/List) are stored in `localStorage`, not in Settings or exported calendar data.

#### Category (BR-16, WI-49)

`{id, name, colour, createdAt}`: non-empty engine-assigned id; trimmed name 1–40 characters, unique ignoring case; six-digit hex colour, unique per category; integer Minute `createdAt`. Each event/task must reference an existing category, including on commands, imports and stored-data validation. A done task has no `scheduledEventId`, so existing link invariants still apply.

Dexie v3 keeps every v1/v2 event, task, settings row and stored revision. Legacy enum categories map to the five seeded ids (the old enum strings), with empty kept ids, null completion times and working hours enabled. Overlapping legacy barred slots, including duplicates, are preserved and remain readable. New settings edits retain the current validation rules; the legacy-overlap editing UI arrives in WI-53.

Exports now use format version 2 and include categories. Import accepts versions 1 and 2, validates shapes and category/task/event references, and maps v1 data to v3 before replacement. The retained v1 test fixture proves compatibility; all six sample exports use v2.

#### Derived (never stored)

These are computed by the engine: Conflict, BarredOverlap, SlotOption, SlotSearchResult, ReplanPlan, Snapshot. BarredOverlap records are separate from event-pair conflicts and never stored/exported.

---

## 4. Functional requirements

Each requirement lists its acceptance criteria. The tests that prove it are in `TEST_PLAN.md` §3.

### 4.1 Core

**FR1 — Create event.**
- **Input:** title, category, priority, start, end, description, flexible, flex window.
- **Behaviour:** the engine validates the input (ER1). It then stores the event in the sorted event array and persists it, re-runs conflict detection, and returns the new snapshot.
- **Acceptance:**
  - The event appears on the timeline at the right place.
  - Any conflicts it causes are shown immediately (FR4), and the ER4 warning appears.
  - Invalid input changes nothing.

**FR2 — Edit / move / resize event.**
- **Input:** a new value for any field (dialog), or new start/end (drag or resize).
- **Behaviour:** the same validation, then the event is updated and conflicts are re-run.
- **Acceptance:**
  - Stale conflicts disappear and new ones appear in the same render.
  - A drag that the engine rejects snaps back.
  - If the event is linked to a task, the task's mirrored fields follow (BR-9).
  - **Calendar lock and fixed confirmations:** BR-17 governs timeline gestures. A fixed move asks for the destination (Move / Keep it); a fixed resize asks for the new duration and times (Change / Keep it). Keep it, Esc and close revert without writing. Flexible gestures ask nothing. Dialog edits, Apply, history and Replan never ask.
  - The **Fixed** tag's tooltip/description is "Fixed: the planner leaves it alone. You can edit its times, unlock the calendar to drag it with confirmation, or allow moving it in the suggestion picker."

**FR3 — Delete event.**
- **Behaviour:** after confirmation, the event is removed and conflicts are re-run.
- **Acceptance:**
  - Conflicts involving the event disappear.
  - If the event was a scheduled task, the task returns to `unscheduled`. The task itself is not deleted (BR-9).

**FR4 — Conflict detection.**
- **Trigger:** automatic after every data change, over all events.
- **Output:** every conflicting pair, with its overlap interval and minutes (BR-3).
- **Acceptance:**
  - The detector is sound and complete. It never misses an overlap and never reports a false one.
  - Back-to-back events do not conflict.
  - Both events in a pair are highlighted with an icon, the word "Conflict" and a colour.
  - The conflict panel groups pairs into Upcoming and a collapsed Past group, with overlap interval and minutes. Badges count upcoming only; status includes the past count (BR-19).

**FR5 — Best-time finder (single task).**
- **Input:** a task, a criterion (default from settings), and a buffer (default from settings).
- **Behaviour:**
  1. Compute the allowed segments (BR-5).
  2. Run the pre-check for ER2.
  3. Compute the busy blocks and free gaps (BR-6).
  4. Keep the gaps of at least the task's duration.
  5. Generate and rank all fitting D-06 candidates (BR-7), each retaining its explanation (BR-8). Show named picks and time chips by day.
- **Acceptance:**
  - Every option is free, inside the window, inside working hours (when `useWorkingHours`), outside barred slots, and exactly the task's duration.
  - Details shows how many gaps were considered and how many fit, the window/buffer and the selected slot's gap, boundaries, leftover and day load. It starts closed each time.
  - If nothing fits, the user gets ER3, including the largest gap found.

**FR6 — Priority sort and category filter.**
- **Task panel:**
  - Sort by priority (High → Medium → Low, then window end ascending, then name) or by window end (ascending, then priority, then name).
  - **Show:** Open (unscheduled + scheduled, default), Unscheduled, Scheduled, Done or All. The internal priority subset remains available to selectors, but the Tasks UI has no duplicate priority checkboxes (D-14).
- **Calendar toolbar:** priority and category chips combine; Reset filters and List's Show all restore both. Categories are shown by default, including newly created categories. Task rows and conflict detection ignore the calendar filters.
- **Acceptance:**
  - Sorting and filtering never change stored data.
  - Conflicts are still computed on all events. A hidden event still appears in the conflict panel, tagged "(hidden by filter)".
  - The status line above the calendar counts the events the filter shows, plus "(N hidden by filter)" when it hides any, e.g. "5 events (3 hidden by filter) · 4 tasks · 1 conflict"; the conflict count still covers every event (WI-44, report #10).
  - When filters hide every event of List's range, List says "All events in this range are hidden by the priority filter" for priority-only filtering, or "All events in this range are hidden by the calendar filters" when category filtering is active. **Show all** restores both priority and category filters. A range with no events keeps "No events to display".
  - List layout (WI-44, reports #12, #13): the sticky day header stays above conflict and tag outlines with an opaque background in both themes; each row's time, dot, title and tags share one centre line; rows and day headers wrap rather than overflow on a narrow screen (phone layout stays best effort).

**FR7 — Conflict resolution (alternatives).**
- **Input:** a conflict (from the panel or a flagged event).
- **Behaviour:**
  1. Choose which event to move by the target rule (BR-10). The user can switch to the other event.
  2. A flexible target searches within its flex window. A fixed target initially shows no options. Allow moving this event enables a temporary From/To range (inclusive dates), prefilled from its day through the next day, never before now; the user may edit it, including outside the former three-day window. Consent/range are dialog state and are never stored on the event. Reopening or switching targets resets consent.
  3. **Search hours** (WI-41, reports #3, #4, #9): the picker offers *Working hours only* or *Any time*. It defaults to *Any time* when the target does not overlap its day's working hours or is on a non-working day, and to *Working hours only* otherwise; switching re-runs the search, and the choice is kept when the user switches the target. Barred slots apply either way.
  4. Generate all D-06 candidates, ranked by `nearest` to the original start. Show distinct Closest, Same day and Lightest day picks, plus time chips by day (BR-7).
  5. Apply moves the target event (as FR2).
  6. The **Move** radios keep the conflict's order (its first event, then its second) whichever one is selected (WI-45, report #5).
  7. With a fixed target and consent off, the picker says "<title> is fixed, so no suggestions are made for it." Apply is disabled. Invalid opted-in ranges give InvalidTime. The fixed/flexible kind is preserved by Apply; BR-10's target order is unchanged.
  8. When no minute of the window can be used, the picker names the cause instead of the generic ER2 text: "Its window is entirely in the past.", "Its window has no working hours. Choose "Any time" to search outside them." or "Its window is fully barred: every free minute in it is inside a barred slot."
- **Acceptance:**
  - The conflict disappears after applying.
  - Any new conflicts caused elsewhere are reported immediately.

**FR8 — Task management.**
- **Actions:** create, edit, delete, unschedule, mark done and reopen tasks; preview/apply bulk completion (BR-18).
- **Scheduling:** applying an option creates a linked flexible event and marks the task scheduled (BR-9).
- **Acceptance:**
  - A task and its event never disagree on name/title, priority or duration.
  - Deleting a scheduled task deletes its event too, after a confirmation that says so.

**FR9 — Scheduling queue (several tasks, one at a time).**
- **Input:** 1 or more unscheduled tasks selected in the task panel, then *Find time*.
- **Behaviour:**
  1. The engine orders the tasks (BR-11).
  2. The picker shows "Task i of N" with the options for the current task only.
  3. The user can *Apply* an option (schedules it and moves to the next task), *Skip* (the task stays unscheduled), or *Stop* (scheduled tasks remain).
  4. Each search runs against the calendar as it is at that moment, so it includes earlier placements.
- **Acceptance:**
  - Tasks are never scheduled without the user explicitly applying an option.
  - A task with ER2 or ER3 shows its message, with a *Skip* option.

**FR10 — Replan.**
- **Input:** a date range (default: the visible week), the second plan's Strategy (default Balanced week), and an optional buffer override behind Details (default from settings).
- **Behaviour:** the engine computes exactly two plans for the flexible events in the range (BR-12):
  - **Minimal change** — fix problems while moving as little as possible.
  - The selected **Strategy** — Balanced week, Cluster by category, Vary categories, Front-load or Fewer fragments (BR-12).
- Each plan lists:
  - its moves (from → to, with the reason)
  - the events it could not place
  - its metrics: moved count, total shift, conflicts before → after, day-load spread before → after
- **Dialog:** From, To, Strategy and Compute plans share one row. Each card starts with its move count and conflicts before → after. Compact move rows group by destination day, with event name, priority/category tags, start → start and a short reason chip. Details starts off per dialog and reveals full metrics, long explanations and Buffer. **Not moved by Replan (N)** appears once below both cards, collapsed: the union of per-plan residual conflicts/barred overlaps/unplaced events, deduplicated by event id. Each row has its reason chip and **Suggest alternatives**; an issue present in only one plan names that plan. Details includes the combined barred labels and conflicting titles. The engine retains independent per-plan diagnostics.
- The user can apply one plan as a single step, or cancel.
- **Acceptance:**
  - Fixed events are never moved.
  - Events that have already started are never moved.
  - Moved events never overlap each other or static events, and respect the buffer.
  - If there are no flexible events in the range, the dialog says so.
  - Remaining problems are shown even with no movable events. A plan with zero moves and remaining problems says "No moves in this plan — N events still need attention." (singular as appropriate), never a bare "No changes needed". Problems resolved by that plan are omitted.

**FR11 — Settings.**
- **Editable:** Use working hours, working days and hours, default buffer, barred slots (add, edit, remove), default criterion, Categories (BR-16).
- **Behaviour:** changes apply immediately to every later search. Barred slots are shown as labelled background blocks. Use working hours is on by default; while off, its retained days/hours are disabled, task/search-hour choices are hidden and non-working shading disappears. Switching back on restores the saved rules (D-10).
- **Acceptance:** invalid times/buffer and overlapping barred edits are rejected inline. Each later overlapping slot names its first earlier overlap and common weekdays (BR-15). Current-format invalid imports are ER6; older stored data and v1 imports retain legacy overlaps.

### 4.2 Error handling (cross-cutting)

Every engine command returns either success or a typed error (§5). Errors never throw into the UI and never leave partial data.

### 4.3 Bonus

**B1 — Undo / redo.**
- **Coverage:** every data-changing command (event/task/category CRUD, schedule, unschedule, completion/reopen/bulk completion, Keep here/Stop keeping, alternatives apply and replan apply) is one undo step.
- **Not covered:** settings changes and imports. An import clears the history.
- **Limits:** at most 50 steps. A new change clears the redo stack. The history is lost on page reload.
- **UI:** toolbar buttons, Ctrl/Cmd+Z, and Ctrl/Cmd+Shift+Z (or Ctrl+Y). The toast says what was undone, e.g. "Undid: Move "Gym"".

**B2 — Export / import / samples.**
- **Export:** downloads `calendar-export-YYYY-MM-DD.json`, version 2 including categories (format in TECH_SPEC §9.4); version 1 imports remain supported.
- **Import:** validates the whole file first (ER6), asks for confirmation ("This replaces all your events, tasks and settings"), then replaces everything.
- **Sample calendars:** the "Load sample calendar" menu loads presets dated relative to the current week:
  - sparse week
  - back-to-back
  - overlap cluster
  - fully booked day
  - midnight crossing
  - stress (5,000 events)
- **First run:** an empty calendar shows a "Load sample week" button.

**B3 — Appearance.** The app-bar toggle shows a sun for resolved Light and a moon for resolved Dark, and switches directly between Light and Dark. Settings → Appearance also offers System, which follows OS changes. Appearance offers Neutral (the active theme's dark grey/cream default) plus seven curated accents. Theme and accent persist in `localStorage` and are not exported. All colours come from CSS tokens. Text contrast is at least 4.5:1 and non-text contrast at least 3:1 in both themes.

**B4 — Keyboard shortcuts.** See §7.6. Shortcuts are ignored while focus is in a text field. The toolbar button labelled Keyboard shortcuts and the `?` key open the same help overlay.

---

## 5. Error conditions

| ID | Condition | Detection | Engine error | What the user sees | Outcome |
|---|---|---|---|---|---|
| ER1 | Invalid event or task time. End ≤ start, missing date/time, a flex window or task window with end ≤ start, a flex window shorter than the event, an event over 24 h, or any date outside the years 1970–9999 ("Dates must be between the years 1970 and 9999.", AUDIT A02; this also applies to imports and saved data). | Zod schema in the form (UI) and again in the engine | `InvalidTime` (time-ordering rules) or `InvalidInput` (missing or malformed fields, non-numeric or out-of-range duration) | Inline message next to the field; the dialog stays open with input kept | Cancelled; nothing stored |
| ER2 | The task can never fit: its duration is longer than the longest allowed segment in its window, before any events are considered | Pre-check in FR5 | `TaskLongerThanWindow {durationMin, longestStretchMin}` | Picker message. Example: "Write report needs 10 h, but the longest stretch available in its window is 9 h. Shorten the task or widen the window." If the longest stretch is 0: "Its window has no available time (it may be in the past, outside working days/hours, or fully barred)." | Cancelled; no search run |
| ER3 | The window is valid, but no free gap is long enough | After the gap scan | `NoSlotFound {durationMin, largestGapMin, largestGap}` | "No free slot of 30 min in this window. The largest free gap is 15 min (Mon 2 Nov 12:00–12:15). Try shortening the task, widening the window, or reducing the buffer (0 min)." | Cancelled; in a queue, *Skip* is offered |
| ER4 | A create, edit or move causes a new conflict | The conflict sweep after the change | *Not an error.* Success with `introducedConflicts` non-empty and a `suggestion` | Warning toast: "Saved with a conflict: overlaps "Lecture" 11:00–11:30 (30 min)." It offers two buttons: **Move to Tue 12:00–13:00** (the top nearest alternative) and **View conflict**. If anything changed after the warning, *Move to* is stale (ER7): it does not move the event and opens fresh alternatives instead. | Allowed with warning (never blocked) |
| ER5 | Storage failure (IndexedDB write rejected or quota exceeded) | The repository promise rejects | `StorageError` | Error toast: "Couldn't save your change. Nothing was changed." with a **Retry** button. A dragged event snaps back. | Rolled back (the in-memory state is not committed) |
| ER6 | Invalid import file (not JSON, wrong format or version, an invalid record, duplicate IDs, a broken task ↔ event link or a scheduled task whose event does not mirror it per BR-9) | Zod validation of the whole file | `InvalidImport {issues}` | "That file isn't a valid calendar export: events[3].end — End time must be after the start time." | Cancelled; existing data untouched |
| ER7 | A stale option or plan: the calendar changed between computing the options and applying them, or time passed so that an offered slot, a planned move's target or a planned event now starts before "now" (AUDIT A07) | Version check; start ≥ now rounded up to 5 min when applying | `StaleResult` | "The calendar changed since these options were computed. Refreshing…" The options are recomputed automatically. | Cancelled, then refreshed |
| ER8 | Another tab of the app, open on the same browser data, saved a change after this tab last loaded (peer report #14, WI-40) | Every write names the stored revision it was based on; the repository refuses it in the same transaction when the stored revision differs | `ConcurrentModification` | Warning toast: "This changed in another tab — your view has been refreshed. Nothing was overwritten." The tab reloads the stored data first (history cleared). | Cancelled; nothing stored; view refreshed |
| — | A referenced ID no longer exists | Lookup | `NotFound {entity, id}` | "That item no longer exists." | Cancelled |
| — | Delete a category referenced by events or tasks, including done tasks | Reference counts | `CategoryInUse {eventCount, taskCount}` | "Used by 3 events and 1 task. Change their category or delete them first." | Cancelled; no reassignment |
| — | IndexedDB is unavailable (e.g. a locked-down private window) | Opening the DB fails at startup | — | Persistent banner: "Storage unavailable: changes will be lost when you close this tab." The app runs on the in-memory repository. | Degraded mode |

ER4 is our decision: allow with a warning, as in A1. It keeps the user in control.

**Several tabs (WI-40).** Each tab keeps its own copy of the data in memory. After a tab stores a change it tells the other tabs, which reload the stored data and show the info toast "Calendar updated in another tab." Reloading clears their undo/redo history (it described data that has since been replaced), makes open options and plans stale (ER7), and closes an edit dialog whose event or task was deleted. ER8 covers a write that races that message. In degraded mode (no IndexedDB) tabs share nothing, so nothing is announced.

---

## 6. Business rules (exact semantics)

These rules are normative. The algorithms in TECH_SPEC §8 implement them exactly.

**BR-1 Time representation.**
- All stored times are integer Minutes (UTC epoch minutes).
- Conversions to and from local wall-clock time happen only in `src/shared/time.ts` and the UI.
- Display uses the browser's time zone, 24-hour `HH:mm`, and weeks starting on Monday.

**BR-2 Half-open intervals.**
- `[start, end)`.
- Two intervals overlap iff `a.start < b.end && b.start < a.end`.
- Touching intervals (`a.end == b.start`) do not overlap.

**BR-3 Conflicts.**
- Every pair of distinct events that overlap is one conflict.
- The overlap is `[max(starts), min(ends))` and `minutes = min(ends) − max(starts)`.
- Category, priority and fixed/flexible do not matter for detection.
- The conflict key is `"<smallerId>|<largerId>"`.
- Conflicts are listed by overlap start, then by key.

**BR-4 Events are capped at 24 h.** This makes "which events can intersect this window" a bounded binary-search slice (TECH_SPEC §8.2).

**BR-5 Allowed segments.**
- **Inputs:** the search window, plus — when the request respects working hours — the working days and hours.
- **Steps:**
  1. For each local day that intersects the search window, take that day's working interval (if it is a working day), from local `workStart` to local `workEnd`.
  2. Intersect it with the search window.
  3. Subtract that day's barred slots.
  4. Clip everything to start no earlier than `notBefore`, which is now rounded up to the next multiple of 5 minutes.
- **When working hours don't apply** (global `settings.useWorkingHours = false`, or the request opts out): segments are the search window minus barred slots, clipped at `notBefore`. Adjacent local days do not split those free stretches, so candidates may cross midnight. Barred slots still apply on their own weekdays.
- **Usage:** when the global switch is on, task searches use `task.useWorkingHours`, alternatives use the picker's *Search hours* choice, and Replan respects working hours. When globally off, all three act as Any time; day loads cover whole local days and default flex windows cover the whole local day. Stored working days/hours and task preferences are retained for switching back on (D-10).
- **Edge labels:** each segment edge records why it is there (window start/end, working start/end, barred slot "Lunch", now). These labels are used in explanations.

**BR-6 Busy blocks and free gaps.**
- **Busy blocks:** every event that intersects the search window is expanded to `[start − buffer, end + buffer)`. These expanded intervals are merged, and touching ones are merged too.
- **Exclusions:** when searching for a new place for an existing event (alternatives or replan), that event itself is excluded.
- **Free gaps:** the parts of the allowed segments not covered by any busy block.
- **Fit:** a gap fits a duration `d` iff `gap.length ≥ d`.
- **Buffer scope:** the buffer is applied only around events, never at segment edges.

**BR-7 Ranking criteria and picker candidates (D-06).**
- **Picker candidates:** each fitting gap yields starts at `gap.start`, `gap.end − d`, every multiple of `SUGGESTION_STEP_MIN = 30` between them, and the clamped original start for alternatives. Deduplicate starts; each option retains all BR-8 metadata. Return every candidate in criterion order, without a five-option limit. Ties use earlier start, then earlier gap.
- **Replan:** keeps `rankOptions` unchanged: one clamped-original candidate per fitting gap, at most `MAX_OPTIONS = 5` in rank order.

| Criterion | Sort key (ascending) | Shown to the user as |
|---|---|---|
| `earliest` | slot start | "Earliest slot that fits" |
| `bestFit` | leftover = gap length − d | "Tightest fit: leaves N min unused in this gap" |
| `leastLoaded` | day load of the slot's local day (before placing), then \|slot start − original start\| when an original start exists | "Lightest day: N min already booked" |
| `nearest` | \|slot start − original start\| | "Closest to the original time (N min earlier/later)" |
| `priorityAware` | maps to `earliest` (High), `bestFit` (Medium), `leastLoaded` (Low) | "Priority-aware: High priority → earliest slot" (etc.) |

The sort keys above remain the engine contract; their former repeated criterion sentences are no longer printed on every picker row. The user chooses `earliest`, `bestFit` or `priorityAware` in the task picker. `nearest` ranks alternatives. `leastLoaded` is used inside `priorityAware` and by the Balanced replan.

**Picker presentation:** Find time names Earliest, Tightest fit and Lightest day picks. Rank by preselects the corresponding slot (`priorityAware`: High → Earliest, Medium → Tightest fit, Low → Lightest day). Alternatives names Closest (minimum shift), Same day (minimum shift on the original local day), and Lightest day (minimum load, then shift). Earlier starts break ties. Each pick has a slot and short reason; omit later picks naming an already represented slot, and omit Same day when none exists. Remaining slots are grouped by local start day in date/time order, independent of Rank by. Show eight chips per day with Show N more to expand. One native radio group spans picks and chips, with exactly one selected slot; each slot appears once. Cross-midnight chips include both dates to avoid ambiguity. Details is per dialog, initially off and never saved; it reveals BR-8 data and the buffer override. Empty-result explanations stay visible while Details is closed.

The A1 definition of priority-aware ("place higher-priority tasks first") becomes the queue order in BR-11.

**BR-8 Explanations.** Every option carries:
- the slot
- the free gap it came from, and its length
- the leftover minutes
- what bounds the gap on each side: the neighbouring event's title and end/start (noting the buffer), or a segment-edge reason
- the day load
- the criterion, and its effective criterion for `priorityAware`
- the distance from the original start, for `nearest`

Every search result also carries:
- the search window and buffer used
- the number of allowed segments
- all free gaps, including those too short
- how many of them fit

**BR-9 Task ↔ event synchronisation.**
- **Scheduling** a task at slot `S` creates an event:
  - `title = task.name`, with `description`, `categoryId` and `priority` copied from the task
  - `start/end = S`
  - `flexible = true`, `flexWindow = task.window`, `taskId = task.id`
  - The task gets `status = scheduled` and `scheduledEventId = event.id`.
- **Mirrored fields** (kept equal both ways): name ↔ title, priority ↔ priority, `durationMin` ↔ `end − start`, window ↔ flexWindow.
  - Editing the task's duration keeps the event's start and moves its end.
  - Resizing the event updates the task's duration.
- **Deletion and unscheduling:**
  - Deleting a scheduled task's event (or unscheduling the task) sets the task back to `unscheduled` with `scheduledEventId = null`.
  - Deleting a scheduled task deletes its event.
  - Marking a scheduled task done deletes its event before completing the task, in that same atomic change (BR-18).
  - Each of these is one atomic change and one undo step.

**BR-10 Alternatives target rule.**
- Of the two events in a conflict, the one to move is chosen by the first rule that differs between them:
  1. Prefer the flexible one over the fixed one.
  2. Prefer the lower priority.
  3. Prefer the shorter duration.
  4. Prefer the later start.
  5. Prefer the larger ID.
- The UI shows the chosen target and a toggle to move the other event instead.

**BR-11 Scheduling queue order.**
- Selected tasks are ordered by:
  1. priority (High first)
  2. window end, earliest first (deadline-like)
  3. duration, longer first (harder to place)
  4. name
  5. ID
- Only `unscheduled` tasks are queued. Others are dropped from the selection, with a note.

**BR-12 Replan.**
- **Range:** `[from, to)`, with `from` at a local midnight and `to` at a local midnight, between 1 and 14 days long.
- **Movable events:** flexible, `start ≥ notBefore`, and intersecting the range.
- **Static events:** every other event that intersects the range. These are never moved.
- **UX diagnostics (no change to placement rules):** after projecting each plan, list unchanged events with conflicts/barred overlaps whose overlap intersects the range and ends after raw now, plus its unplaced events. Entirely past problem overlaps (end ≤ now) are omitted even when an involved event is still running. Classify in order: fixed → "Fixed event"; flexible with `start ≤ now < end` → "Already started"; unplaced with move reason `outsideFlexWindow` → "Outside its flex window"; otherwise → "No free slot". Unplaced events have no fitting allowed free gap within `flexWindow ∩ range` with the buffer. Reasons describe the current request and can differ after changing the range/settings. Every entry offers the existing per-event Suggest alternatives action; applying alternatives still needs consent (BR-14).
- **Order:** movable events are processed one at a time, by priority (High first), then duration (longest first), then start, then ID. Each placed event becomes busy for the events after it. If an event cannot be placed, it stays where it is and is listed as unplaced, and it remains busy for every other movable event, including those processed before it (no placed event may land on it).
- **Allowed region:** for each movable event, the allowed segments of `flexWindow ∩ range`, respecting working hours only when globally enabled (BR-5).
- **Minimal change:**
  - An event *stays* if its current interval lies entirely inside one free gap (with the buffer applied against everything already busy).
  - Otherwise it moves to the `nearest` candidate.
  - Its move reason is the first that applies, in this order:
    1. outside flex window
    2. outside working hours when globally enabled
    3. in an unkept barred slot
    4. conflicts with an event
    5. inside the buffer of an event
- **Balanced week:**
  - Every movable event goes to the `leastLoaded` candidate. Day loads are computed from what is busy at that moment, starting from the static events only. Ties go to the `nearest` candidate.
  - An event whose chosen slot equals its current interval is not a move.
  - The move reason is `balance` (from day load → to day load), unless one of the Minimal-change reasons applies.
- **Metrics:**
  - `moved`, the number of moves
  - `totalShiftMin`, the sum of |new start − old start|
  - `conflictsBefore` and `conflictsAfter`, counting conflicts whose overlap intersects the range
  - `loadSpreadBeforeMin` and `loadSpreadAfterMin`, the maximum minus the minimum day load over the working days in the range
  - `unplaced`
- **Applying a plan** moves all of its events in one atomic change and one undo step, after the version check (ER7).

**BR-12 strategy extension (WI-55, D-15).** The first plan remains Minimal change. The second plan defaults to Balanced week (day load, distance, start), with Cluster by category (negative same-category minutes, distance, start), Vary categories (same-category minutes, day load, distance, start), Front-load (earliest start) and Fewer fragments (gap leftover, start). All use the same processing order, busy updates, safety checks and metrics. Category minutes follow the day-load definition and current occupied set; category identity, not name, is compared. Existing Minimal-change invalidity reasons take precedence, otherwise a move names the chosen strategy. Equal intervals are not moves. The selector does not affect the first plan; every applied plan is still one atomic undo step.

**BR-13 Priorities.** The order is `high > medium > low`. The shorthand tags are `[H]`, `[M]` and `[L]`. Priority is always shown as both a text tag and a colour.

**BR-14 Nothing changes without consent.** Searches, alternatives and replan plans are read-only queries. Only *Apply* buttons and direct edits change data.

**BR-15 Barred-slot overlap warnings (WI-32).**
- An event overlaps a barred slot on each local day it touches iff their absolute, half-open intervals overlap. Touching boundaries produce no warning. A slot applies on its own configured weekdays even when that day is not a working day.
- Every overlap is a derived `{eventId, slotId, label, overlap, minutes}` record, with `overlap = [max(starts), min(ends))` and `minutes = overlap.end − overlap.start`. Slot IDs distinguish equal labels. Existing events remain allowed inside barred slots.
- These warnings are separate from BR-3 event-pair conflicts: the sweep, conflict counts and replan metrics do not include them. They are recomputed after data changes and settings changes, and are never persisted or exported.
- Event blocks show a text tag `In <label>` for each distinct ongoing/future overlapping label. A second panel section, **Barred-slot overlaps (N)**, lists those records with event title, label, range, minutes and **Suggest alternatives** for that event (no other-event toggle). Entirely past overlaps are neither tagged nor listed (BR-19); derived snapshot records retain history.
- Each barred-overlap row also shows **Fixed** or **Flexible**. Flexible events can be replanned only when not already started and a free placement exists within the range and flex window (BR-12).
- When saving settings introduces ongoing/future overlap records, an info toast counts distinct events among those new records: `2 events overlap barred slots` (singular: `1 event overlaps barred slots`). Entirely past records do not count. **View** opens the panels drawer when needed and focuses/scrolls the barred-overlap section. An unchanged save or a save only removing overlaps produces no overlap toast.
- **Keep here / Stop keeping:** one undoable metadata change stores/removes that slot ID in `event.keptInBarred`. Kept rows/tags are suppressed and shown in a collapsed Kept group. A kept slot does not cause a barred Replan move or diagnostic; other reasons still apply. Time-changing data commands clear keeps; Undo restores their before-images. Slot deletion or changed times/days clears affected keeps atomically with settings, including stale history images; renaming or reordering weekdays preserves them. Settings changes remain non-undoable.
- **Slot overlap validation:** new/edited barred content rejects any positive time overlap on a shared weekday, at the later slot's Days field, naming the first earlier overlap: `Overlaps "Lunch" (13:00–14:00) on Mon, Tue.` Exact duplicates (same day set and times, regardless of label/day order) say `Same days and times as "Lunch" (13:00–14:00).` No message numbers the slots. Touching and disjoint weekdays are allowed. Stored data/Dexie upgrades and v1 imports preserve older overlaps. Unrelated settings saves may keep those rows; every barred edit must resolve them. The Barred slots region explains old overlaps and offers editing; labels stack on the calendar. Current-format imports use current validation.

---

**BR-18 Done tasks (D-07).** Mark done deletes a scheduled task's linked event and sets status done with doneAt equal to completion time. Unscheduled tasks have no event to remove. This is one atomic change and one undo step. Repeated completion is a no-op. Reopen clears doneAt, sets unscheduled and creates no event, one undo step. Done tasks must be reopened before finding or scheduling time. Done rows have a ✓ Done tag, struck title, muted text and Reopen/Edit/Delete actions; the default Open filter excludes done. The Tasks menu offers Mark done before…: choose date/time T, preview and count scheduled tasks with event.end ≤ T and unscheduled tasks with window.end ≤ T, excluding done; Apply completes that set in one atomic change/undo step. A changed snapshot requires a fresh preview. Preview never writes.

**BR-16 Categories (D-11).** Every event/task has one existing category id. Settings → Categories supports create, rename, recolour and delete, one atomic undo step each. Name is trimmed, 1–40 characters and unique ignoring case. Renaming/recolouring updates all referring tags immediately without rewriting items. Deleting is blocked while any event or task refers to the category, including done tasks; the last unused category may be deleted. Both item dialogs end the category select with New category… and a small inline name/colour editor, preserving the item draft. With no categories they require creating one before saving. New items use the last category chosen in this session if it still exists, otherwise the first listed category. No category controls whether an event is flexible.

Twelve curated colours include the five seeds. Free colours are normalised six-digit hex, at least `MIN_CATEGORY_COLOUR_DISTANCE = 0.04` apart in OKLab from other categories and reserved fills, conflict/priority colours. A dot has at least 3:1 contrast on its tag in both themes; its name uses normal text at least 4.5:1. Deleting/recolouring frees a swatch. Imports and stored-data validation enforce the same colour safety. Calendar blocks, accessible names/tooltips and task rows resolve the category by id. Multi-category and category-less items remain out of scope.

**BR-17 Calendar lock and manual confirmations (D-03/D-04).** Calendar lock is an icon plus Locked/Unlocked, accessible name Calendar lock and aria-pressed; K toggles it. At a page load it is on if stored events exist and off when empty. It is not persisted, exported, undoable or automatically changed when events are later added/removed in the session. While locked, no event can be dragged/resized and no timeline click/drag creates an event; time-grid dragging scrolls horizontally/vertically. Clicking an event still edits it. + Event, N, dialog edits, Apply, Replan and undo/redo keep working. An unlocked fixed move asks `"Class" is fixed. Move it to Fri 13 Nov 10:00–11:00?` with Move/Keep it. A resize asks `"Class" is fixed. Change it to 1 h 30 min (10:00–11:30)?` with Change/Keep it. Keep it, Esc and close revert with no write/history. Fixed manual mutation commands still ask when invoked directly; the lock prevents the timeline gesture from invoking them. Flexible events ask nothing.

**BR-19 Past time (D-08).** Past means `end ≤ now`, using raw current Minute. For conflicts and barred warnings, use the overlap's end, independently of either event's end. Ongoing overlaps count as upcoming; searches remain clipped at rounded now (BR-5). Conflicts show Upcoming (N) and a collapsed Past (N) group. Past rows retain names, overlap and minutes without Suggest. Region badges and the status line count upcoming only, independent of calendar filters; status appends `(N past)` when nonzero. Past barred overlaps have no tag, row or settings-toast count. Replan diagnostics follow BR-12. Calendar past days and ended events use muted tokens with text contrast ≥ 4.5:1; running events retain active styling. Every time-grid day has a faint guide at the current local clock time, with a stronger line on today. Presentation updates each minute and on returning to the page, without changing detection, storage, revisions, undo or metrics.

## 7. UX specification

**D-14 layout (WI-56).** The app bar contains name and Undo/Redo/Theme/Help/Settings. Desktop >=1280 uses independent scrolling Tasks, Calendar and Planning columns. Calendar owns navigation/period/view on row one and presentation/filters/reset/lock/+ Event on row two; filters scroll horizontally when needed, with one primary event creation control. Tasks (N) owns its primary + Task (no New task duplicate), compact Show/Sort/menu row, no duplicate priority checkboxes, and Find time (N) only for a nonempty selection. Calendar filters do not hide tasks. The right column has sibling Conflicts (upcoming/past), Replan (visible default range, strategy and Plan…), and Barred slots (N) (editor/overlaps/Kept). Below 1280, counted Tasks and Conflicts app-bar buttons open separate mutually exclusive native drawers; closing restores the trigger. All five regions still have exactly one copy.

### 7.1 Screens and views

1. **Main screen** (Figure 1):
   - A slim app bar with utility actions; calendar navigation and controls stay in its own region.
   - The calendar in the centre, with Day, Week (the default), Month and List views.
   - Tasks on the left; sibling Conflicts, Replan and Barred slots on the right. Each column scrolls independently.
   - Below 1280 px, Tasks and the right column become separate drawers opened by counted app-bar buttons.
   - Task rows show duration and both window dates, with the full time range in the tooltip. Row actions share one line at desktop column widths; no space is reserved for a removed priority ribbon.
2. **Event dialog** (create and edit): Title, Priority, Category, Start/End on one row, Fixed/Flexible scheduling radios, flex window (shown when flexible), Description. Priority uses a fieldset with a legend and native High / Medium / Low radios, each with its [H]/[M]/[L] tag and priority colour; arrow keys change the selected option. The flex window is its own full-width group below End, without overlap or clipping at desktop and drawer widths in either theme. It has Save and Cancel buttons, plus Delete when editing.
3. **Task dialog** (create and edit): Name, Duration (h/min on one row), Priority, Category, Window from/to on one row, Scheduling hours, Description. Scheduling hours offers "Working hours only" (default) and "Any time"; it is hidden while global working hours are off without overwriting that preference. Barred slots apply either way. Buttons are Save, Cancel, and applicable Find time, Mark done/Reopen, Unschedule and Delete actions.
4. **Slot picker:**
   - **Task mode:** the header shows the task name, duration, priority and "Task i of N", then Rank by. Named top picks precede all other options as time chips by day. Details reveals the task window, search summary/window/buffer and the selected slot's explanation. Apply selected and Skip retain queue behaviour. Stop, Esc and Close cancel a single-task picker quietly; queues of two or more retain their summary. Scheduled tasks remain stored.
   - **Alternatives mode:** the header shows the target/length, Move radios, fixed opt-in/temporary range and Search hours. The same picks/day chips/Details layout uses the alternatives picks in BR-7. Apply and Cancel retain their behaviour.
5. **Replan dialog:** range from/to (default the visible week; from Month, whose grid exceeds 14 days, the first full week of the month, AUDIT A10), Strategy and a *Compute plans* button on one row. Details reveals Buffer and full metrics/explanations. Compact cards group moves by day, with one collapsed Not moved list below them. Changing the range, strategy or buffer removes the cards until *Compute plans* runs again, so a plan is only applied for the inputs shown (AUDIT A08). Cancel closes the dialog.
6. **Settings dialog:**
   - Five headed sections: **Working time** (Use working hours switch, retained working days/hours disabled while off), **Scheduling defaults** (default buffer, default ranking), **Categories** (BR-16), **Appearance** (B3) and **Data**. Settings Save / Cancel stay in their sticky footer; category changes save independently as undo steps and Appearance preferences apply immediately. The dialog has the × of §7.7.
   - A **Data** section: Export JSON, a styled **Import JSON** button opening the file chooser, Load sample calendar (menu), Clear all data (with confirmation).
7. **Confirm dialog:** used for delete, import and clear.
8. **Shortcut help overlay:** lists the shortcuts in §7.6.
9. **Barred slots region (D-09):** inline label/from–to/day-chip/remove rows, Add barred slot (focuses its label), and Save/Cancel while edits are pending. Fixed-width time inputs remain readable in 12-hour locales. Saving touches only barred content; errors stay on their rows and Cancel restores saved slots. Older overlaps show an actionable banner; positively overlapping calendar backgrounds group their labels in a vertical stack. Upcoming unkept overlaps retain Suggest alternatives and add Keep here; kept records live under a collapsed Kept (N) group with Stop keeping. Past overlaps stay out of both groups.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Interactive Calendar                                          Undo  Redo  Theme  ?  Settings │
├──────────────────────┬──────────────────────────────────────────────┬────────────────────────┤
│ Tasks (4)    [+ Task]│ < Today >  Week of 9 Nov  [Day|Week|Month]   │ Conflicts (1)          │
│ [Show v][Sort v][...]│ [Calendar|List]  [H][M][L]  (o)Class ...     │ ! Lecture <> Meeting   │
│                      │ [Lock: on]                        [+ Event]  │   Tue 11:00 - 30 min   │
│ [ ] Write report     │ +----------------------------------------+   │   [Suggest]            │
│     [H] (o)Assignment│ |                                        |   │ > Past (2)             │
│     1 h 30 - Mon-Fri │ |               week grid                |   ├────────────────────────┤
│ [ ] Read ch. 4       │ |                                        |   │ Replan                 │
│     [M] (o)Study     │ |                                        |   │ This week  [Plan...]   │
│ ...                  │ |                                        |   ├────────────────────────┤
│ [Find time (2)]      │ +----------------------------------------+   │ Barred slots (2)       │
│                      │ 8 events - 1 conflict (2 past)               │ Lunch 13-14 Mon-Fri    │
│                      │                                              │ Overlaps (1) - Kept (0)│
└──────────────────────┴──────────────────────────────────────────────┴────────────────────────┘
```

*Figure 1. ░ marks a barred slot, drawn as a shaded background event with its label. Conflicts show the ⚠ icon, the word "Conflict" and a danger outline. Priority shows as an [H]/[M]/[L] tag plus a colour.*

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Find time: "Write report" (1 h 30 min, High) - Task 1 of 2               │
│ Rank by: (o) Earliest fit  ( ) Best fit  ( ) Priority-aware              │
│ Top picks: (o) Earliest - Wed 4 Nov 14:00-15:30                          │
│            ( ) Tightest fit - Thu 5 Nov 09:00-10:30                      │
│ All options by day                                                       │
│ Wed 4 Nov: ( )14:30-16:00 ( )15:00-16:30 ( )15:30-17:00 ...              │
│ Thu 5 Nov: ( )09:15-10:45                                                │
│ [Details >] summary, window, buffer and selected gap when expanded       │
│ [Apply selected]  [Skip]  [Stop]                                         │
└──────────────────────────────────────────────────────────────────────────┘
```

*Figure 2. Shared picker layout. Alternatives uses Closest / Same day / Lightest day, Move radios and optional fixed-event consent/range; short reasons describe shift or day load. There is no Skip or Stop.*

### 7.2 Controls

- Toolbar buttons as in Figure 1.
- A `?` icon button labelled **Keyboard shortcuts** sits next to the theme and settings buttons and opens the same help as the `?` key (WI-33).
- The calendar supports:
  - click-drag on empty time to create an event (with times pre-filled); a plain click on empty time pre-fills one 30-minute row (WI-35)
  - click an event to edit it
  - drag to move and drag the bottom edge to resize, snapping to 5 minutes
- Task rows have a checkbox, a *Find time* button and a context menu (Edit, Unschedule, Delete).
- Upcoming conflict rows have a *Suggest alternatives* button; past rows are read-only under the collapsed Past group (BR-19).
- Every drag and resize action is also available through the event dialog, for keyboard users.

### 7.3 Workflows

| ID | Workflow | Steps → result |
|---|---|---|
| W1 | Create an event, see a conflict | + Event (or drag on empty time) → fill in the form → Save. The event appears. If it overlaps another, both are flagged, the panel lists the overlap, and the ER4 toast offers *Move to …*. |
| W2 | Move or resize | Unlock the calendar, then drag/resize. Fixed events ask the BR-17 destination/duration question; Move/Change commits, Keep it/Esc/close reverts. Engine rejection also reverts. Flexible events commit without a confirmation. |
| W3 | Resolve a conflict | Conflict panel → *Suggest alternatives* → picker (alternatives mode) → choose → Apply. The conflict disappears and a success toast appears. |
| W4 | Schedule one task | + Task → Save → *Find time* → review the options → Apply. The task is marked Scheduled and the event appears on the timeline. |
| W5 | Schedule several tasks | Tick the tasks → *Find time (N)* → the picker shows Task 1 of N → Apply or Skip → it moves on to the next task automatically → a summary toast: "Scheduled 2 of 3 tasks (1 skipped)". |
| W6 | Replan a week | Replan region → Plan… → (adjust the range, strategy and optional Details buffer) → Compute plans → compare the two cards → *Apply this plan*. The moved events are briefly emphasised and the toast reads "Plan applied: 2 events moved". |
| W7 | Configure | ⚙ → edit working hours/buffer → Save; Barred slots region → edit rows → Save. The shading updates, and later searches use the new rules. |
| W8 | Undo a mistake | ↶ or Ctrl+Z → the toast reads "Undid: Delete "Gym"" → ↷ redoes it. |
| W9 | Back up or restore | ⚙ → Data → Export (file downloads), or Import → confirm → everything is replaced. |
| W10 | First visit (grader) | Empty calendar → *Load sample week* → a populated week with conflicts and tasks ready to demo. |

### 7.4 Feedback

| Situation | Feedback |
|---|---|
| Success | A non-blocking toast for 4 s. Examples: "Event created", "Moved "Gym" to Tue 14:00–15:00", "Task scheduled for Wed 14:00–15:30", "Plan applied: 2 events moved". The changed events are emphasised for 1.5 s. |
| Validation errors | Inline under the field; the dialog stays open and the input is kept. |
| ER2 / ER3 | An explanatory block inside the picker (never an empty list), with suggestions, followed by what is left of the window and what splits it (WI-45, report #7): "Available: 12:30–13:00, 14:00–14:30 — Lunch 13:00–14:00 is barred." For ER2 the stretches are the allowed segments; for ER3 they are the free gaps, and events read e.g. '"Meeting" 10:00–11:00 is booked'. At most 6 stretches are listed ("… and N more"). Times only on one day, otherwise with the date. |
| ER4 | A warning toast with *Move to …* and *View conflict* (8 s; it stays while hovered or focused). |
| ER5 | An error toast with *Retry* (it stays until dismissed). |
| ER7 | A brief info toast, then the options are recomputed automatically. |
| ER8 | The view is reloaded first, then a warning toast (8 s) says nothing was overwritten; no Retry, because the command was based on the old view. |
| Another tab saved a change | The view reloads and an info toast reads "Calendar updated in another tab."; undo/redo are cleared. |
| Long operations | Loading a sample or importing more than 1,000 records shows a spinner overlay. Every other operation is instant. |

| Unexpected crash | A full page saying **Something went wrong** with **Reload** and **Export data**, never a blank page (WI-35). Saved changes are kept in the browser. |

All toasts are announced through an ARIA live region. Errors use `assertive`; everything else uses `polite`.

### 7.5 Visual language (tokens; exact values in TECH_SPEC §11.4)

- App-written dates use `Mon 2 Nov` or `Mon 2 Nov 2026`, including List day headings; times use 24-hour `HH:mm` and ranges `HH:mm–HH:mm`. Native date/time fields follow the browser locale. Month numbers outside the active month retain at least 4.5:1 contrast without ancestor opacity dimming.
- **Event fills:** one neutral dark-grey fill with light text in Light, and one cream fill with dark text in Dark. Fill contrast against the empty grid is at least 3:1; text on it is at least 4.5:1. Past blocks retain that fill with muted readable ink and regular title weight; past-day shading remains separate.
- **Priority colours:** High = red family, Medium = amber, Low = slate blue. Each always comes with an [H]/[M]/[L] tag.
- **Conflict:** a 2 px dashed outline in the danger colour, a ⚠ icon and the text "Conflict N min".
- **Tags** carry their own contrasted backgrounds. Priority tags use their priority colours, category tags use a coloured dot and normal text, and Fixed/Flexible/Task/In-label tags use grey icons plus text. Task rows reuse the priority/category tags without ribbons. Narrow blocks show title, priority and icons; the complete information stays in the accessible name and tooltip.
- **Barred slots** are hatched background blocks with their label. Non-working hours/days have a distinct dotted shading while the global switch is on. Pattern contrast is ≥ 3:1 in both themes; normal text/background contrast remains ≥ 4.5:1.
- Events overlapping barred slots carry `In Lunch` (or the configured label) text tags; these warnings have their own panel section and do not change conflict counts.
- **Accent:** Neutral plus Fern, Teal, Cyan, Indigo, Violet, Rose and Olive. It marks each region's primary action, selected segments, focus rings, today and checked chips. The seven non-neutral accents and all category colours exclude reserved event fills, danger red and the three priority colours; Neutral intentionally matches the event fill.

### 7.6 Keyboard shortcuts (B4)

| Key | Action |
|---|---|
| `N` | New event |
| `Shift+N` | New task |
| `T` | Go to today |
| `←` / `→` | Previous / next period |
| `D` / `W` / `M` | Calendar in Day / Week / Month |
| `L` | Toggle Calendar / List; List always shows a week |
| `K` | Toggle Calendar lock |
| `R` | Open Replan |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z`, `Ctrl+Y` | Redo |
| `?` | Shortcut help |
| `Esc` | Close the top dialog |

Shortcuts are disabled while focus is in an `input`, `textarea`, `select` or `[contenteditable]`, and while a dialog is open (except `Esc`).

### 7.7 Accessibility

- **Not colour alone:** conflicts and priorities always carry text.
- **Contrast:** WCAG AA (4.5:1 for body text) in both themes. Click targets are at least 32 px.
- **Dialogs:** use the native `<dialog>` element with `showModal()`, which gives focus trapping and `Esc` handling. Focus returns to the trigger on close. Every dismissible dialog also shows a visible **×** button named "Close" in its top-right corner that acts exactly like Cancel / Esc (WI-45, report #11); it comes last in the focus order, so opening a dialog still focuses its first field. The loading overlay has none.
- **Keyboard:** everything is operable by keyboard. Move and resize are available through the dialog.
- **Screen readers:**
  - The List view is a plain text agenda.
  - Options are a labelled radio group.
  - Results are announced through the live region.

---

## 8. Non-functional requirements

| ID | Requirement | Target / how it is checked |
|---|---|---|
| NFR1 | Responsiveness | Engine queries are synchronous and in memory. On the 5,000-event stress calendar, conflict detection plus one free-gap search has a median under 100 ms (T15). Drags feel instant. |
| NFR2 | Algorithmic efficiency | Conflict sweep O(N log N + k), plus O(k log k) to order the output; slot search O(log N + n + s + m log m) on the pre-sorted store; replan O(c·(n + s + m log m)). No O(N²) code paths except the test oracle (TECH_SPEC §10). |
| NFR3 | Correctness | The sweep and gap search match brute-force oracles on random inputs (T12, T33). Coverage is at least 90% of lines and branches in `src/engine/algorithms`, and at least 70% overall. |
| NFR4 | Reliability | No command leaves partial data. A storage failure rolls back (ER5). An invalid import changes nothing (ER6). A tab with an out-of-date view never overwrites another tab's saved change (ER8). |
| NFR5 | Modularity | Algorithms are pure, with no imports from React, Dexie, the UI or date-fns. Layer boundaries are enforced by ESLint (TECH_SPEC §3.2). |
| NFR6 | Maintainability | TypeScript strict mode, no `any`, typed commands and results, conventional commits, a CI gate on every PR. |
| NFR7 | Portability | Runs in current Chrome, Edge, Firefox and Safari. Hosted as a static site. No backend. |
| NFR8 | Accessibility | §7.7. |
| NFR9 | Security and privacy | No data leaves the browser. Imported text is treated as data, and React escapes it. No `dangerouslySetInnerHTML`. |

---

## 9. Deviations from the submitted assignments

| # | A1/A2/A3 said | We now do | Why |
|---|---|---|---|
| 1 | SQLite as the store (A2); SQLite-WASM risk R1 (A3) | **IndexedDB via Dexie** behind a `Repository` interface. An in-memory repository is used for tests and as the fallback. | SQLite was chosen for a locally run app. The app is now a hosted static site, where IndexedDB is the native, zero-setup store. A3's R1 mitigation (the repository interface) is what makes the swap trivial. |
| 2 | Locally run app (A1, A3 A1 assumption) | A static site on Vercel. Still single-user, with data per browser. | The course requires a hosted URL. |
| 3 | Sweep with a running maximum end (A1, A2) | Sweep with an array-backed min-heap of open intervals, O(N log N + k) (plus O(k log k) to sort the output for display) | A running maximum misses pairs (A3 T3 refinement). |
| 4 | BST as a planned upgrade (A2) | Arrays only. The BST and interval tree are recorded as a rejected or deferred decision. | Not needed at realistic sizes; reduces risk. |
| 5 | Priority-aware = "place higher-priority tasks first" (A1) | Priority-aware maps the task's priority to a criterion (BR-7). "Higher priority first" becomes the queue order (BR-11). | Makes the criterion meaningful for single-task finding (A3 A4). |
| 6 | Multi-task scheduling vague; A3 A4 says one task at a time | Sequential queue: one task at a time, the user applies each (FR9) | Keeps greedy results explainable; no joint optimisation. |
| 7 | Replan pipeline named but unspecified (A2, A3) | Fully specified lean range replan with two plans (BR-12) | Needed concrete semantics. |
| 8 | Busy-block cache with per-window invalidation (A1 §5.4.6, A3 §4.5) | No cache. Recompute on each request, and run a global conflict sweep after each change. | The cost is tiny (NFR1), and it removes a whole class of stale-cache bugs. |
| 9 | Load only the visible window from the database (A3 §4.1) | Load everything into a sorted in-memory array at startup; window queries use binary search. | Simpler; at most a few thousand records. |
| 10 | Conflict clusters in the panel (A3 §4.3) | A flat list sorted by time. Above 50 pairs it shows the first 50 plus "and N more". | Simpler; clusters are not needed at realistic sizes. |
| 11 | Error names `InvalidTime`, `TaskLongerThanWindow`, `NoSlotFound` | These are kept, plus `InvalidInput`, `NotFound`, `StorageError`, `InvalidImport`, `StaleResult`, `ConcurrentModification`. | Covers ER5–ER8 and malformed input. |
| 12 | date-fns confined to the UI boundary (A3 R3) | date-fns is allowed only in `src/shared/time.ts` and `src/ui/**`. Algorithms never import it. | Local-day expansion (working hours, DST) must happen before the pure algorithms run. |
| 13 | Property tests: 10,000 sets per run (A3 T12) | 1,000 runs with a fixed seed in CI; 10,000 runs with a random seed before each milestone | Keeps CI fast while keeping A3's stated practice. |
| 14 | Undo/redo and import/export listed as not promised (A3 L4) | Both are in scope as bonuses B1 and B2. | The team chose them as quick wins. |
| 15 | FR1–FR7 (A1) | FR8–FR11 added (task management, queue, replan, settings) | They were implied by A2/A3 but never written as requirements. |
| 16 | Team name "Team Three" (A1) vs. "Feature Creatures" (A2, A3) | Feature Creatures | Latest name. |

---

## 10. Change log

| Date | Change |
|---|---|
| 2026-10-25 | v1.0: unified from A1–A3. |
| 2026-10-26 | v1.1 (WI-32/33): BR-15 defines independent barred-slot warnings, settings feedback and alternatives; §7 adds text tags, a separate panel section and the accessible toolbar shortcuts button. |
| 2026-10-26 | v1.2 (WI-31): final derived-model/help-entry sync; WI-32/33 retain independent warning/conflict semantics. Divyam's reported rehearsal evidence and remaining human release steps are recorded in TEST_PLAN/PROGRESS. |
| 2026-10-26 | v1.3 (WI-35): §7.2 a plain click on empty time pre-fills a 30-minute event; §7.4 an unexpected crash shows Something went wrong with Reload / Export data. |
| 2026-10-26 | v1.4 (WI-36, `docs/extras/AUDIT.md`): BR-12 an unplaced event is busy for every other movable event (A01); ER1 dates must be in 1970–9999 (A02); ER4 a stale Move to opens fresh alternatives (A03); ER6 includes BR-9 mirror mismatches (A04); ER7 includes results overtaken by time (A07); §7.1 Replan inputs drop computed plans (A08) and Month defaults to its first full week (A10). |
| 2026-10-26 | v1.5 (WI-37): §7.1 specifies shared tagged/coloured priority radios, task scheduling-hours radios and a full-width flex-window group below End. UI only; schemas and engine unchanged. |
| 2026-10-26 | v1.6 (WI-38): FR10/BR-12 define per-plan remaining-problem explanations and alternatives, including zero movable events; BR-15 adds Fixed/Flexible row tags. Placement rules unchanged. |
| 2026-11-12 | v1.7 (WI-40, peer report #14): ER8 `ConcurrentModification` — a write from a tab whose view is out of date is refused and that tab reloads; other tabs reload after every stored change with "Calendar updated in another tab." (§5, §7.4, NFR4, §9 row 11). Single-tab behaviour unchanged. |
| 2026-11-12 | v1.8 (WI-41, peer reports #3, #4, #9): FR7 adds the Search hours choice with its default, the fixed-target note and named empty-window causes; BR-5 alternatives no longer always respect working hours; §3.2 the default flex window is the whole local day outside working hours or on a non-working day. |
| 2026-11-12 | v1.9 (WI-42, peer report #1): glossary *Fixed event*, FR2 and W2 — a manual drag or resize of a fixed event asks "<title> is fixed. Move it anyway?" (Move / Keep it); other paths never ask; the Fixed tag gets a tooltip and accessible description. |
| 2026-11-12 | v1.10 (WI-43, peer report #6): §3.2 Settings and FR11 — two barred slots with the same days, start and end are rejected ("Duplicate of barred slot N."), in the dialog and on import. |
| 2026-11-12 | v1.11 (WI-44, peer reports #10, #12, #13): FR6 — the status line counts shown events plus those hidden by the filter; List explains an all-hidden range with Show all; List header, alignment and narrow wrapping. Conflicts still on all events. |
| 2026-11-12 | v1.12 (WI-45, peer reports #5, #7, #11): FR7 Move radios keep the conflict order; §7.4 ER2/ER3 list the available stretches and what splits them (no behaviour change); §7.7 every dismissible dialog has a × named Close. |
| 2026-11-12 | v1.13 (WI-46): §7.1 Settings is laid out in four headed sections with compact barred-slot rows and day chips. UI only; validation unchanged beyond WI-43. |
| 2026-11-12 | v1.14 (WI-47, D-18): documentation reorganised under `progress/` and `extras/`; §0.2 links the relocated progress file and binding Round 2 design. Product behaviour changes in the later implementing WIs. |
| 2026-11-12 | v1.15 (WI-48, D-17): §3.2 category entities/references, kept ids, done status/completion time and the global working-time field; BR-9 copies `categoryId`. Dexie v3 preserves old rows/revision/overlaps; exports v2 include categories, imports accept v1/v2. UI and commands for the new fields follow in WI-49/53/54. |
| 2026-11-12 | v1.16 (WI-49, D-11/C-01): BR-16 specifies category CRUD/history, blocked deletion, shared colour validation, inline creation, tags, category filters and session defaults. FR6/FR11 include the controls; new events start Fixed regardless of category. T49 replaces category-based flexibility expectations. |
| 2026-11-12 | v1.17 (WI-50, D-01–D-05): fixed/flexible scheduling radios; explicit fixed-search consent and temporary range; action-specific move/resize confirmations; session Calendar lock and grab-to-pan; separate persisted Calendar/List toggle and last Calendar view. FR2/FR7, glossary, BR-17, workflows and shortcuts updated; prior default three-day search removed. |
| 2026-11-13 | WI-50 verification: releasing a locked-grid pan outside the calendar ends it, including before pointer capture; returning to the grid after release must not scroll it. T50 covers the regression. |
| 2026-11-13 | v1.18 (WI-51, D-06/C-03/C-04): FR5/FR7, BR-7/BR-8 presentation and Figure 2 use complete half-hour/boundary/original candidates, distinct named picks, chronological day chips with eight-slot expansion, one selection and initially hidden Details. Replan's one-per-gap/MAX_OPTIONS contract is unchanged. |
| 2026-11-13 | v1.19 (WI-52 engine checkpoint, D-08): BR-12 diagnostics omit entirely past problem overlaps and reserve Already started for currently running events, using raw now independently of rounded placement notBefore. Placement, metrics, detection and storage are unchanged. Remaining UI past-time behavior is still in progress. |
| 2026-11-13 | v1.20 (WI-52, D-08): BR-19/FR4 and BR-15 define raw-now Upcoming/Past grouping, upcoming-only counts/actions/barred feedback, muted accessible past days/events and cross-day now guides; presentation time refreshes without domain writes. |
| 2026-11-13 | v1.21 (WI-53 D-10 engine checkpoint): BR-5, day loads and default flex windows obey the global working-time switch. Off means whole local days with barred slots retained, including cross-midnight placement; task/working-time preferences stay stored. UI and D-09 remain in progress. |
| 2026-11-13 | v1.22 (WI-53 D-10 UI checkpoint): FR11/UX expose Use working hours, disabled retained preferences, hidden effective task/search-hour choices and shading removal. D-09 and stronger enabled-hours shading remain in progress. |
| 2026-11-13 | v1.23 (WI-53 D-09 engine checkpoint): BR-15 defines identified slot warnings, undoable Keep here, automatic event/settings/history clearing, shared-day overlap rejection and legacy preservation. UI region/editor/grouping and remaining shading are still in progress. |
| 2026-11-13 | v1.24 (WI-53 D-09/D-10): barred editing moves into its region, Settings retains four sections, Kept groups suppress current tags/warnings and restore through Stop keeping/history; legacy banners/stacked labels and contrasted enabled non-working dots are specified. |
| 2026-11-13 | v1.25 (WI-54 D-07 engine checkpoint): BR-18 completion/unschedule atomicity, Reopen, inclusive bulk cutoff/preview, stale guard and default-hidden done tasks. |
| 2026-11-13 | v1.26 (WI-55 D-15 engine checkpoint): BR-12 exact strategy sort keys, category-minute/busy updates, preserved Minimal change/default Balanced, reason precedence and unchanged safety/undo. UI remains in progress. |
| 2026-11-13 | v1.27 (WI-55 D-15 UI): FR10 compact inputs/cards/day groups, named strategy, Details, and one collapsed diagnostics union. Issues unresolved in only one plan name that plan; full problem labels remain behind Details. |
| 2026-11-13 | v1.28 (WI-56 D-20): Settings/BR-15 named duplicate and overlap errors include the first earlier slot label and 24-hour times instead of a number. Schema/import/editor errors share the same text; legacy banner unchanged. |
| 2026-11-13 | v1.29 (WI-56 D-14 checkpoint): app-bar/calendar/task control ownership, three independently scrolling columns, separate counted drawers below 1280 and sibling Conflicts/Replan/Barred regions. |
| 2026-11-13 | v1.30 (WI-56 D-21): Figure 1 now uses the planner-approved D-14 layout; Figure 2 uses ASCII and aligned box lines. Updated old main-screen/drawer/Replan/queue descriptions to match D-14/D-15. |
| 2026-11-13 | WI-56 final layout review: compact task rows show both window dates with a full-time tooltip and aligned actions. Keyboard order follows Show/Sort/menu, and drawers reopen at their titles. |
| 2026-11-14 | v1.31 (WI-57 D-12/D-13): neutral event fills and independent readable tags, compact icons on narrow blocks, shared task priority tags; persisted neutral-plus-seven accent choices and System/Light/Dark in Appearance; resolved sun/moon toggle switches Light/Dark. Past events retain the neutral fill with muted ink/weight. |
| 2026-11-14 | v1.32 (WI-58 D-16): explicit shared field order and paired event/task times, compact List dates/ranges, styled Import JSON, quiet single-task cancellation, readable out-of-month numbers and tighter short-block icon layout. Settings's main-screen description now includes its D-13 Appearance section. Native date/time locale remains a known limitation. |
| 2026-11-14 | v1.33 (WI-59 D-19/D-21): TEST_PLAN §7 is the single live-site acceptance run; old demos/rehearsals are archived. Reconciled scope/core summaries, task Show filters, category-aware Show all, completion/history/export coverage and planned future prerequisites with already-implemented Round 2 rules. No behavior change. Figures 1/2 pass the text-diagram audit. |
| 2026-11-14 | Finish documentation review: FR6 records both existing List empty-filter messages (priority-only versus active category filtering) and their shared Show all action. Behavior remains the tested D-11/D-14 implementation. |
