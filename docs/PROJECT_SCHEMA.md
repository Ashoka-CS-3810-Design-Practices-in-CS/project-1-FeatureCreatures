# PROJECT_SCHEMA.md — Interactive Calendar and Intelligent Time Planner

**Doc 1 of 3.** This file defines *what* we build: the scope, the vocabulary, the domain model, the requirements, the business rules, and the UX.
**Doc 2:** `TECH_SPEC.md` defines *how* to build it: the stack, architecture, file layout, contracts, algorithms, the build plan, and deployment.
**Doc 3:** `TEST_PLAN.md` defines *how we prove it works*: the test catalogue, oracles, benchmarks, CI, and demo scripts.

---

## 0. Read me first

### 0.1 Who this is for

These three files are the single source of truth for the project. Humans, Codex agents and Claude Code agents should all be able to read them cold and start working.

They supersede Assignments 1–3 (A1, A2, A3) wherever those documents disagree. Every intentional deviation is logged in §9.

### 0.2 Precedence when documents disagree

1. `PROJECT_SCHEMA.md` (this file) wins on behaviour: what the user sees, and what counts as correct.
2. `TECH_SPEC.md` wins on structure: names, files, types, and algorithms.
3. `TEST_PLAN.md` wins on exact expected values for concrete inputs. If a test disagrees with a rule here, treat that as a doc bug: fix the doc in the same PR.
4. Code never silently wins. If the code must differ from a doc, update the doc in the same PR and add a line to that doc's change log.

### 0.3 Identifier conventions (used across all three docs)

| Prefix | Meaning | Defined in |
|---|---|---|
| `FR` | Functional requirement (FR1–FR7 kept from A1, FR8–FR11 added) | §4 |
| `B` | Bonus feature | §4.3 |
| `ER` | Error condition (ER1–ER4 kept from A1, ER5–ER7 added) | §5 |
| `BR` | Business rule (exact semantics) | §6 |
| `W` | User workflow | §7.3 |
| `NFR` | Non-functional requirement | §8 |
| `T` | Test case (T1–T15 kept from A3) | TEST_PLAN |
| `WI` | Work item in the build plan | TECH_SPEC §14 |
| `D` | Demonstration script | TEST_PLAN |

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
| Priority system | High / Medium / Low on events and tasks; sort and filter in task panel; filter on calendar; visible on both | FR6 |
| Task management | Create, edit and delete tasks. Scheduled tasks become linked events, kept in sync both ways. | FR8 |
| Best-time finder | For one task: free gaps in its window, filtered by duration, ranked by a selectable criterion, each option explained. Gives a clear reason when nothing fits. | FR5 |
| Scheduling queue | Select several tasks, then the app offers options for one task at a time in priority order. The user applies or skips each, and every search sees the earlier placements. | FR9 |
| Replan | For a date range: two alternative plans (Minimal change, Balanced week) for flexible events; preview with metrics; apply as one step | FR10 |
| Settings | Working days and hours, default buffer, barred slots (e.g. lunch), default ranking criterion | FR11 |
| Error handling | Typed errors, inline messages, nothing partially saved | ER1–ER7 |
| Sample data | "Load sample calendar" presets so a grader opening the hosted URL sees something immediately | part of B2 |

### 2.2 Bonus features (in scope, built after core is tested)

| ID | Feature |
|---|---|
| B1 | Undo / redo of every data change (except settings and import), at most 50 steps, in memory only |
| B2 | JSON export / import (replace-all) of events, tasks and settings, plus built-in sample calendars |
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
- Task dependencies
- Splitting a task across several gaps
- Jointly optimal multi-task scheduling (dynamic programming)
- Interval tree or BST store
- Calendar animations of algorithms
- Productivity statistics
- A tested phone layout (best effort only)
- Offline-first sync across devices

---

## 3. Glossary and domain model

### 3.1 Glossary

| Term | Meaning |
|---|---|
| **Minute** | An integer number of minutes since the Unix epoch (UTC). All stored times are Minutes. |
| **Interval** | `{start, end}` in Minutes, **half-open** `[start, end)`, with `end > start`. |
| **Event** | An Interval with title, description, category, priority, fixed/flexible flag, optional flex window, optional link to a task. Appears on the timeline. |
| **Fixed event** | An event the app never proposes to move automatically (e.g. a class). The user may still move it by hand. |
| **Flexible event** | An event the app may propose to move, but only inside its **flex window**. |
| **Flex window** | An Interval within which a flexible event may be placed. |
| **Task** | A to-do with name, duration, priority and an **allowable window**. It has no time until scheduled, and is shown only in the task panel. |
| **Scheduled task** | A task linked to exactly one event (created when the user applies a slot). The event is flexible and its flex window equals the task window. |
| **Local day** | A calendar day in the browser's time zone, from local midnight to the next local midnight. It can be 23 or 25 hours long around daylight-saving changes. |
| **Working hours / working days** | From settings, e.g. Mon–Fri 09:00–18:00 local time. |
| **Barred slot** | A recurring daily period where nothing may be *placed* by the app, e.g. "Lunch" 13:00–14:00 Mon–Fri. Existing events inside it are still allowed. |
| **Buffer** | A number of minutes kept free on both sides of every existing event when the app searches for slots. |
| **Search window** | The Interval the app searches for a given request (the task window, the flex window, or the replan range). |
| **Allowed segments** | The search window intersected with working days and hours, minus barred slots, and clipped to start no earlier than now (rounded up to 5 minutes). They are sorted and disjoint. |
| **Busy block** | A maximal merged interval of existing events, each expanded by the buffer. |
| **Free gap** | A maximal sub-interval of an allowed segment that does not touch any busy block. |
| **Candidate / option** | A concrete slot `[s, s + duration)` inside one free gap, with an explanation. |
| **Criterion** | The rule used to rank options: `earliest`, `bestFit`, `priorityAware`, `nearest`, `leastLoaded`. |
| **Conflict** | An unordered pair of events whose intervals overlap, plus the overlap interval and its length in minutes. |
| **Day load** | The total minutes of events on a working day, clipped to that day's working hours. Overlapping events are summed, not unioned. |
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
| `category` | `meeting \| class \| appointment \| assignment \| personal` | Required |
| `priority` | `high \| medium \| low` | Required |
| `start`, `end` | Minute | `end > start`; `end − start ≤ 1440` (24 h); may cross midnight |
| `flexible` | boolean | Required |
| `flexWindow` | Interval \| null | Required iff `flexible`. Must satisfy `end > start` and length ≥ event duration. It does **not** have to contain the event's current interval. |
| `taskId` | string \| null | Set only for scheduled-task events |
| `createdAt`, `updatedAt` | Minute | Assigned by the engine |

The event dialog picks a default `flexible` value from the category. The user can change it.

- **Fixed by default:** class, meeting, appointment.
- **Flexible by default:** assignment, personal.

The default flex window is the event's local day, from working start to working end.

#### Task

| Field | Type | Constraint |
|---|---|---|
| `id` | string (UUID) | Unique |
| `name` | string | 1–100 characters after trimming |
| `description` | string | 0–1000 characters |
| `category` | Category | Default `assignment` |
| `priority` | Priority | Required |
| `durationMin` | integer | 5 ≤ d ≤ 1440 |
| `window` | Interval | `end > start` (the allowable scheduling window) |
| `useWorkingHours` | boolean | Default `true`. If `false`, working days and hours are ignored for this task, but barred slots still apply. |
| `status` | `unscheduled \| scheduled` | Managed by the engine |
| `scheduledEventId` | string \| null | Non-null iff `status = scheduled` |
| `createdAt`, `updatedAt` | Minute | Assigned by the engine |

#### Settings (one record)

| Field | Type | Default | Constraint |
|---|---|---|---|
| `workDays` | weekday[] (0 = Sun … 6 = Sat) | `[1,2,3,4,5]` | At least one day |
| `workStartMin` | minutes after local midnight | `540` (09:00) | 0–1439 |
| `workEndMin` | minutes after local midnight | `1080` (18:00) | `> workStartMin`, ≤ 1440 |
| `bufferMin` | integer | `0` | 0–120 |
| `barredSlots` | `{id, label, startMin, endMin, days}[]` | `[]` | `endMin > startMin`; label 1–40 characters |
| `defaultCriterion` | `earliest \| bestFit \| priorityAware` | `earliest` | — |

UI-only preferences (theme and last view) are stored in `localStorage`, not in Settings.

#### Derived (never stored)

These are computed by the engine on demand: Conflict, SlotOption, SlotSearchResult, ReplanPlan, Snapshot.

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
  - The conflict panel lists each pair with its overlap interval and minutes.

**FR5 — Best-time finder (single task).**
- **Input:** a task, a criterion (default from settings), and a buffer (default from settings).
- **Behaviour:**
  1. Compute the allowed segments (BR-5).
  2. Run the pre-check for ER2.
  3. Compute the busy blocks and free gaps (BR-6).
  4. Keep the gaps of at least the task's duration.
  5. Rank them (BR-7) and return the top 5 options, each with an explanation (BR-8).
- **Acceptance:**
  - Every option is free, inside the window, inside working hours (when `useWorkingHours`), outside barred slots, and exactly the task's duration.
  - The picker also shows how many gaps were considered and how many fit.
  - If nothing fits, the user gets ER3, including the largest gap found.

**FR6 — Priority sort and filter.**
- **Task panel:**
  - Sort by priority (High → Medium → Low, then window end ascending, then name) or by window end (ascending, then priority, then name).
  - Filter by any subset of priorities and by status (unscheduled, scheduled, all).
- **Calendar toolbar:** a filter that shows only events of the chosen priorities.
- **Acceptance:**
  - Sorting and filtering never change stored data.
  - Conflicts are still computed on all events. A hidden event still appears in the conflict panel, tagged "(hidden by filter)".

**FR7 — Conflict resolution (alternatives).**
- **Input:** a conflict (from the panel or a flagged event).
- **Behaviour:**
  1. Choose which event to move by the target rule (BR-10). The user can switch to the other event.
  2. Search for slots for the target's duration. A flexible target is searched within its flex window. A fixed target is searched from the start of the local day before to the end of the local day after its own day (3 local days).
  3. Rank by `nearest` to the original start and return the top 5 with explanations.
  4. Apply moves the target event (as FR2).
- **Acceptance:**
  - The conflict disappears after applying.
  - Any new conflicts caused elsewhere are reported immediately.

**FR8 — Task management.**
- **Actions:** create, edit, delete, and unschedule tasks.
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
- **Input:** a date range (default: the visible week) and a buffer (default from settings).
- **Behaviour:** the engine computes exactly two plans for the flexible events in the range (BR-12):
  - **Minimal change** — fix problems while moving as little as possible.
  - **Balanced week** — spread load evenly across working days.
- Each plan lists:
  - its moves (from → to, with the reason)
  - the events it could not place
  - its metrics: moved count, total shift, conflicts before → after, day-load spread before → after
- The user can apply one plan as a single step, or cancel.
- **Acceptance:**
  - Fixed events are never moved.
  - Events that have already started are never moved.
  - Moved events never overlap each other or static events, and respect the buffer.
  - If there are no flexible events in the range, the dialog says so.

**FR11 — Settings.**
- **Editable:** working days and hours, default buffer, barred slots (add, edit, remove), default criterion.
- **Behaviour:** changes apply immediately to every later search. Barred slots are shown on the calendar as shaded background blocks with their label, and non-working hours are shaded.
- **Acceptance:** invalid settings (end ≤ start, buffer out of range) are rejected inline.

### 4.2 Error handling (cross-cutting)

Every engine command returns either success or a typed error (§5). Errors never throw into the UI and never leave partial data.

### 4.3 Bonus

**B1 — Undo / redo.**
- **Coverage:** every data-changing command (event and task CRUD, schedule, unschedule, alternatives apply, replan apply) is one undo step.
- **Not covered:** settings changes and imports. An import clears the history.
- **Limits:** at most 50 steps. A new change clears the redo stack. The history is lost on page reload.
- **UI:** toolbar buttons, Ctrl/Cmd+Z, and Ctrl/Cmd+Shift+Z (or Ctrl+Y). The toast says what was undone, e.g. "Undid: Move "Gym"".

**B2 — Export / import / samples.**
- **Export:** downloads `calendar-export-YYYY-MM-DD.json` (format in TECH_SPEC §9.4).
- **Import:** validates the whole file first (ER6), asks for confirmation ("This replaces all your events, tasks and settings"), then replaces everything.
- **Sample calendars:** the "Load sample calendar" menu loads presets dated relative to the current week:
  - sparse week
  - back-to-back
  - overlap cluster
  - fully booked day
  - midnight crossing
  - stress (5,000 events)
- **First run:** an empty calendar shows a "Load sample week" button.

**B3 — Dark mode.** The toolbar toggle cycles System → Light → Dark. The choice persists in `localStorage`. All colours come from CSS tokens. Contrast is at least 4.5:1 in both themes.

**B4 — Keyboard shortcuts.** See §7.6. Shortcuts are ignored while focus is in a text field. `?` opens the help overlay.

---

## 5. Error conditions

| ID | Condition | Detection | Engine error | What the user sees | Outcome |
|---|---|---|---|---|---|
| ER1 | Invalid event or task time. End ≤ start, missing date/time, a flex window or task window with end ≤ start, a flex window shorter than the event, or an event over 24 h. | Zod schema in the form (UI) and again in the engine | `InvalidTime` (time-ordering rules) or `InvalidInput` (missing or malformed fields, non-numeric or out-of-range duration) | Inline message next to the field; the dialog stays open with input kept | Cancelled; nothing stored |
| ER2 | The task can never fit: its duration is longer than the longest allowed segment in its window, before any events are considered | Pre-check in FR5 | `TaskLongerThanWindow {durationMin, longestStretchMin}` | Picker message. Example: "Write report needs 10 h, but the longest stretch available in its window is 9 h. Shorten the task or widen the window." If the longest stretch is 0: "Its window has no available time (it may be in the past, outside working days/hours, or fully barred)." | Cancelled; no search run |
| ER3 | The window is valid, but no free gap is long enough | After the gap scan | `NoSlotFound {durationMin, largestGapMin, largestGap}` | "No free slot of 30 min in this window. The largest free gap is 15 min (Mon 2 Nov 12:00–12:15). Try shortening the task, widening the window, or reducing the buffer (0 min)." | Cancelled; in a queue, *Skip* is offered |
| ER4 | A create, edit or move causes a new conflict | The conflict sweep after the change | *Not an error.* Success with `introducedConflicts` non-empty and a `suggestion` | Warning toast: "Saved with a conflict: overlaps "Lecture" 11:00–11:30 (30 min)." It offers two buttons: **Move to Tue 12:00–13:00** (the top nearest alternative) and **View conflict**. | Allowed with warning (never blocked) |
| ER5 | Storage failure (IndexedDB write rejected or quota exceeded) | The repository promise rejects | `StorageError` | Error toast: "Couldn't save your change. Nothing was changed." with a **Retry** button. A dragged event snaps back. | Rolled back (the in-memory state is not committed) |
| ER6 | Invalid import file (not JSON, wrong format or version, an invalid record, duplicate IDs) | Zod validation of the whole file | `InvalidImport {issues}` | "That file isn't a valid calendar export: events[3].end — End time must be after the start time." | Cancelled; existing data untouched |
| ER7 | A stale option or plan: the calendar changed between computing the options and applying them | Version check | `StaleResult` | "The calendar changed since these options were computed. Refreshing…" The options are recomputed automatically. | Cancelled, then refreshed |
| — | A referenced ID no longer exists | Lookup | `NotFound {entity, id}` | "That item no longer exists." | Cancelled |
| — | IndexedDB is unavailable (e.g. a locked-down private window) | Opening the DB fails at startup | — | Persistent banner: "Storage unavailable: changes will be lost when you close this tab." The app runs on the in-memory repository. | Degraded mode |

ER4 is our decision: allow with a warning, as in A1. It keeps the user in control.

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

**BR-15 Barred-slot overlap warnings (WI-32).**
- An event overlaps a barred slot on each local day it touches iff their absolute, half-open intervals overlap. Touching boundaries produce no warning. A slot applies on its own configured weekdays even when that day is not a working day.
- Every overlap is a derived `{eventId, label, overlap, minutes}` record, with `overlap = [max(starts), min(ends))` and `minutes = overlap.end − overlap.start`. Existing events remain allowed inside barred slots.
- These warnings are separate from BR-3 event-pair conflicts: the sweep, conflict counts and replan metrics do not include them. They are recomputed after data changes and settings changes, and are never persisted or exported.
- Event blocks show a text tag `In <label>` for each distinct overlapping label. A second panel section, **Barred-slot overlaps (N)**, lists every record with event title, label, range, minutes and **Suggest alternatives** for that event (no other-event toggle).
- When saving settings introduces overlap records, an info toast counts distinct events among the new records: `2 events overlap barred slots` (singular: `1 event overlaps barred slots`). **View** opens the panels drawer when needed and focuses/scrolls the barred-overlap section. An unchanged save or a save only removing overlaps produces no overlap toast.

**BR-5 Allowed segments.**
- **Inputs:** the search window, plus — when the request respects working hours — the working days and hours.
- **Steps:**
  1. For each local day that intersects the search window, take that day's working interval (if it is a working day), from local `workStart` to local `workEnd`.
  2. Intersect it with the search window.
  3. Subtract that day's barred slots.
  4. Clip everything to start no earlier than `notBefore`, which is now rounded up to the next multiple of 5 minutes.
- **When working hours don't apply** (`useWorkingHours = false`): the segments are the search window minus barred slots, clipped at `notBefore`.
- **Usage:** task searches use `task.useWorkingHours`. Alternatives and Replan always respect working hours.
- **Edge labels:** each segment edge records why it is there (window start/end, working start/end, barred slot "Lunch", now). These labels are used in explanations.

**BR-6 Busy blocks and free gaps.**
- **Busy blocks:** every event that intersects the search window is expanded to `[start − buffer, end + buffer)`. These expanded intervals are merged, and touching ones are merged too.
- **Exclusions:** when searching for a new place for an existing event (alternatives or replan), that event itself is excluded.
- **Free gaps:** the parts of the allowed segments not covered by any busy block.
- **Fit:** a gap fits a duration `d` iff `gap.length ≥ d`.
- **Buffer scope:** the buffer is applied only around events, never at segment edges.

**BR-7 Ranking criteria.**
- **Candidates:** each fitting gap yields exactly one candidate. When the request has an original start (alternatives and Replan), the candidate start is `clamp(originalStart, gap.start, gap.end − d)`, i.e. as close to the original time as that gap allows. Otherwise (task searches) it is `gap.start`.
- **Order:** at most 5 options are returned, in rank order. Ties are always broken by earlier slot start, then by earlier gap.

| Criterion | Sort key (ascending) | Shown to the user as |
|---|---|---|
| `earliest` | slot start | "Earliest slot that fits" |
| `bestFit` | leftover = gap length − d | "Tightest fit: leaves N min unused in this gap" |
| `leastLoaded` | day load of the slot's local day (before placing), then \|slot start − original start\| when an original start exists | "Lightest day: N min already booked" |
| `nearest` | \|slot start − original start\| | "Closest to the original time (N min earlier/later)" |
| `priorityAware` | maps to `earliest` (High), `bestFit` (Medium), `leastLoaded` (Low) | "Priority-aware: High priority → earliest slot" (etc.) |

The user can choose `earliest`, `bestFit` or `priorityAware` in the task picker. `nearest` is used for alternatives. `leastLoaded` is used inside `priorityAware` and by the Balanced replan.

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
  - `title = task.name`, with `description`, `category` and `priority` copied from the task
  - `start/end = S`
  - `flexible = true`, `flexWindow = task.window`, `taskId = task.id`
  - The task gets `status = scheduled` and `scheduledEventId = event.id`.
- **Mirrored fields** (kept equal both ways): name ↔ title, priority ↔ priority, `durationMin` ↔ `end − start`, window ↔ flexWindow.
  - Editing the task's duration keeps the event's start and moves its end.
  - Resizing the event updates the task's duration.
- **Deletion and unscheduling:**
  - Deleting a scheduled task's event (or unscheduling the task) sets the task back to `unscheduled` with `scheduledEventId = null`.
  - Deleting a scheduled task deletes its event.
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
- **Order:** movable events are processed one at a time, by priority (High first), then duration (longest first), then start, then ID. Each placed event becomes busy for the events after it. If an event cannot be placed, it stays where it is and is listed as unplaced (and remains busy).
- **Allowed region:** for each movable event, the allowed segments of `flexWindow ∩ range`, respecting working hours (BR-5).
- **Minimal change:**
  - An event *stays* if its current interval lies entirely inside one free gap (with the buffer applied against everything already busy).
  - Otherwise it moves to the `nearest` candidate.
  - Its move reason is the first that applies, in this order:
    1. outside flex window
    2. outside working hours
    3. in a barred slot
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

**BR-13 Priorities.** The order is `high > medium > low`. The shorthand tags are `[H]`, `[M]` and `[L]`. Priority is always shown as both a text tag and a colour.

**BR-14 Nothing changes without consent.** Searches, alternatives and replan plans are read-only queries. Only *Apply* buttons and direct edits change data.

---

## 7. UX specification

### 7.1 Screens and views

1. **Main screen** (Figure 1):
   - A toolbar on top.
   - The calendar in the centre, with Day, Week (the default), Month and List views.
   - On the right, the task panel above the conflict panel.
   - Below 1024 px, the right column collapses into a drawer opened from the toolbar.
2. **Event dialog** (create and edit): title, category, priority, start, end, flexible toggle, flex window (shown when flexible), description. It has Save and Cancel buttons, plus Delete when editing.
3. **Task dialog** (create and edit): name, duration (h and min), priority, category, window from/to, "Only during working hours" toggle, description. It has Save and Cancel buttons, plus Delete, Unschedule and Find time when editing.
4. **Slot picker:**
   - **Task mode:** the header shows the task name, duration, priority and "Task i of N". It contains the criterion selector, a buffer override, a summary line, ranked options with explanations, and the Apply, Skip and Stop buttons.
   - **Alternatives mode:** the header shows the target and a toggle for which event to move. The criterion is fixed to "Closest to original time". There are Apply and Cancel buttons.
5. **Replan dialog:** range from/to (default the visible week), a buffer override, and a *Compute plans* button. Below them are two plan cards side by side (stacked when narrow). Each card shows its metrics and list of moves, with an *Apply this plan* button. Cancel closes the dialog.
6. **Settings dialog:**
   - Working days and hours, default buffer, barred slots table, default criterion.
   - A **Data** section: Export JSON, Import JSON, Load sample calendar (menu), Clear all data (with confirmation).
7. **Confirm dialog:** used for delete, import and clear.
8. **Shortcut help overlay:** lists the shortcuts in §7.6.

```text
[◀] [Today] [▶]  Week of 2 Nov 2026   [Day|Week|Month|List]  Priority: [H][M][L]   [+ Event] [+ Task] [Replan] [↶][↷] [◐] [?] [⚙]

┌───────┬──────────────────┬──────────────────┬──────────────────┐   ┌──────────────────────────────────┐
│       │ Mon 2            │ Tue 3            │ Wed 4            │   │ Tasks   Sort: Priority ▼  [H M L] │
├───────┼──────────────────┼──────────────────┼──────────────────┤   │ ☐ Write report · 1 h 30 · [H]    │
│ 09:00 │ Class [M] Fixed  │                  │                  │   │ ☐ Read ch. 4 · 45 min · [M]      │
│       │ 09:00–10:00      │                  │                  │   │ ☑ Gym · 1 h · [L] · Scheduled     │
├───────┼──────────────────┼──────────────────┼──────────────────┤   │    [Find time for 1 selected]    │
│ 10:00 │                  │ Lecture [H] Fixed│ Lab [L]          │   └──────────────────────────────────┘
│ 11:00 │                  │ Meeting [M]      │                  │   ┌──────────────────────────────────┐
│       │                  │ ⚠ Conflict 30 min│                  │   │ Conflicts (1)                    │
├───────┼──────────────────┼──────────────────┼──────────────────┤   │ ⚠ Lecture ↔ Meeting              │
│ 13:00 │░░ Lunch ░░░░░░░░░│░░ Lunch ░░░░░░░░░│░░ Lunch ░░░░░░░░░│   │   Tue 11:00–11:30 (30 min)       │
│       │                  │                  │                  │   │   [Suggest alternatives]         │
└───────┴──────────────────┴──────────────────┴──────────────────┘   └──────────────────────────────────┘
```

*Figure 1. ░ marks a barred slot, drawn as a shaded background event with its label. Conflicts show the ⚠ icon, the word "Conflict" and a danger outline. Priority shows as an [H]/[M]/[L] tag plus a colour.*

```text
┌ Find time — "Write report" (1 h 30 min, High) — Task 1 of 2 ───────────────────────────────┐
│ Window: Mon 2 Nov 09:00 → Fri 6 Nov 18:00 · working hours only · Buffer [15] min            │
│ Rank by: (●) Earliest fit  ( ) Best fit  ( ) Priority-aware                                │
│ 4 free gaps in window (30 min, 1 h, 1 h 45, 4 h) — 2 fit 1 h 30 min                         │
│                                                                                            │
│ (●) 1. Wed 4 Nov 14:00–15:30  Earliest slot that fits.                                     │
│        Gap 14:00–18:00 (4 h): after "Lab" ends 13:45 + 15 min buffer → working hours end.  │
│        Leaves 2 h 30 min unused. Day load 2 h.                                             │
│ ( ) 2. Thu 5 Nov 09:00–10:30  Gap 09:00–10:45 (1 h 45): working hours start →             │
│        15 min buffer before "Seminar" 11:00. Leaves 15 min unused. Day load 3 h.           │
│                                                                                            │
│                                   [Apply selected]  [Skip]  [Stop]                         │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

*Figure 2. The slot picker in task mode. In alternatives mode the header reads "Alternatives for "Meeting" (1 h) — Move: (●) Meeting ( ) Lecture", there is no Skip or Stop, and each option states its distance from the original time.*

### 7.2 Controls

- Toolbar buttons as in Figure 1.
- A `?` icon button labelled **Keyboard shortcuts** sits next to the theme and settings buttons and opens the same help as the `?` key (WI-33).
- The calendar supports:
  - click-drag on empty time to create an event (with times pre-filled)
  - click an event to edit it
  - drag to move and drag the bottom edge to resize, snapping to 5 minutes
- Task rows have a checkbox, a *Find time* button and a context menu (Edit, Unschedule, Delete).
- Conflict rows have a *Suggest alternatives* button.
- Every drag and resize action is also available through the event dialog, for keyboard users.

### 7.3 Workflows

| ID | Workflow | Steps → result |
|---|---|---|
| W1 | Create an event, see a conflict | + Event (or drag on empty time) → fill in the form → Save. The event appears. If it overlaps another, both are flagged, the panel lists the overlap, and the ER4 toast offers *Move to …*. |
| W2 | Move or resize | Drag or resize the event. On drop the engine commits. Conflicts update. If the engine rejects the change (ER5), the event snaps back. |
| W3 | Resolve a conflict | Conflict panel → *Suggest alternatives* → picker (alternatives mode) → choose → Apply. The conflict disappears and a success toast appears. |
| W4 | Schedule one task | + Task → Save → *Find time* → review the options → Apply. The task is marked Scheduled and the event appears on the timeline. |
| W5 | Schedule several tasks | Tick the tasks → *Find time for N selected* → the picker shows Task 1 of N → Apply or Skip → it moves on to the next task automatically → a summary toast: "Scheduled 2 of 3 tasks (1 skipped)". |
| W6 | Replan a week | Replan → (adjust the range and buffer) → Compute plans → compare the two cards → *Apply this plan*. The moved events are briefly emphasised and the toast reads "Plan applied: 2 events moved". |
| W7 | Configure | ⚙ → edit working hours, buffer, barred slots → Save. The shading updates, and later searches use the new rules. |
| W8 | Undo a mistake | ↶ or Ctrl+Z → the toast reads "Undid: Delete "Gym"" → ↷ redoes it. |
| W9 | Back up or restore | ⚙ → Data → Export (file downloads), or Import → confirm → everything is replaced. |
| W10 | First visit (grader) | Empty calendar → *Load sample week* → a populated week with conflicts and tasks ready to demo. |

### 7.4 Feedback

| Situation | Feedback |
|---|---|
| Success | A non-blocking toast for 4 s. Examples: "Event created", "Moved "Gym" to Tue 14:00–15:00", "Task scheduled for Wed 14:00–15:30", "Plan applied: 2 events moved". The changed events are emphasised for 1.5 s. |
| Validation errors | Inline under the field; the dialog stays open and the input is kept. |
| ER2 / ER3 | An explanatory block inside the picker (never an empty list), with suggestions. |
| ER4 | A warning toast with *Move to …* and *View conflict* (8 s; it stays while hovered or focused). |
| ER5 | An error toast with *Retry* (it stays until dismissed). |
| ER7 | A brief info toast, then the options are recomputed automatically. |
| Long operations | Loading a sample or importing more than 1,000 records shows a spinner overlay. Every other operation is instant. |

All toasts are announced through an ARIA live region. Errors use `assertive`; everything else uses `polite`.

### 7.5 Visual language (tokens; exact values in TECH_SPEC §11.4)

- **Priority colours:** High = red family, Medium = amber, Low = slate blue. Each always comes with an [H]/[M]/[L] tag.
- **Conflict:** a 2 px dashed outline in the danger colour, a ⚠ icon and the text "Conflict N min".
- **Fixed events** show a small "Fixed" tag. **Scheduled-task events** show a "Task" tag.
- **Barred slots** are hatched background blocks with their label. Non-working hours are lightly shaded.
- Events overlapping barred slots carry `In Lunch` (or the configured label) text tags; these warnings have their own panel section and do not change conflict counts.

### 7.6 Keyboard shortcuts (B4)

| Key | Action |
|---|---|
| `N` | New event |
| `Shift+N` | New task |
| `T` | Go to today |
| `←` / `→` | Previous / next period |
| `D` / `W` / `M` / `L` | Day / Week / Month / List view |
| `R` | Open Replan |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z`, `Ctrl+Y` | Redo |
| `?` | Shortcut help |
| `Esc` | Close the top dialog |

Shortcuts are disabled while focus is in an `input`, `textarea`, `select` or `[contenteditable]`, and while a dialog is open (except `Esc`).

### 7.7 Accessibility

- **Not colour alone:** conflicts and priorities always carry text.
- **Contrast:** WCAG AA (4.5:1 for body text) in both themes. Click targets are at least 32 px.
- **Dialogs:** use the native `<dialog>` element with `showModal()`, which gives focus trapping and `Esc` handling. Focus returns to the trigger on close.
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
| NFR4 | Reliability | No command leaves partial data. A storage failure rolls back (ER5). An invalid import changes nothing (ER6). |
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
| 11 | Error names `InvalidTime`, `TaskLongerThanWindow`, `NoSlotFound` | These are kept, plus `InvalidInput`, `NotFound`, `StorageError`, `InvalidImport`, `StaleResult`. | Covers ER5–ER7 and malformed input. |
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
