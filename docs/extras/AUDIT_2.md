# int-calendar audit 2 — UI/UX audit and design decisions for round 2

- **Date:** 2026-11-12
- **Planner:** Claude (planning and design only; Codex and Claude Code agents implement it)
- **Decisions:** Divyam, given in chat on 2026-11-12, one question at a time
- **Audited build:** `main` at `bde1e6f` (WI-01–46, 639 tests). The local `dist/` was byte-identical to a fresh `npm run build`. It was served locally and captured with Playwright at 1440×900, 1024×768 and 900×768 in both themes, with the *Load sample week* data loaded and "now" set to Thu 12 Nov 2026 17:4x IST.
- **Evidence:**
  - `docs/extras/audit-2/*.png` (this audit)
  - `docs/extras/feedback-2026-11-12/01–09` (Divyam's screenshots)

**This file is binding for round 2.** Section 4 holds the decisions. Section 7 gives the work items (WI-47–59), which implement sections 4 and 5 together with the audit fixes in section 3. When this file and the three main docs disagree, the agents update the main docs to match this file, with change-log lines, in the WI that touches the behaviour.

---

## 1. Scope and method

The audit looks for UI and UX problems: things that are redundant, inconsistent, complicated or cluttered. Functional bugs are out of its scope. Every finding was checked against the running build and the code. Peer or user screenshots served only as pointers.

---

## 2. Answers to the three questions

### Q1. What did the two-tab fix (WI-40, peer finding #14) do?

**The revision check.**
- Every repository write checks the stored *revision* and increases it, in the same transaction (TECH_SPEC §9.1).
- Dexie v2 added a `meta` table. A v1 database upgrades with every row kept.
- If another tab wrote first, the write is refused with ER8 `ConcurrentModification` and nothing is stored. The tab then reloads and shows a warning that nothing was overwritten.

**Telling the other tabs.**
- After each accepted write, `EngineDeps.onCommit` posts on a BroadcastChannel (`src/ui/hooks/tabSync.ts`).
- Each other tab then runs `reloadFromOtherTab()`, which calls `engine.reload()`. That call:
  - adopts the stored data;
  - clears undo and redo;
  - bumps the version, so open pickers and plans become stale (ER7);
  - closes a dialog whose record has disappeared;
  - shows the toast "Calendar updated in another tab."
- None of this runs in degraded (memory-only) mode.

### Q2. What heuristic ranks "Suggest alternatives", and is the label misleading?

**The heuristic** is the `nearest` criterion (BR-7, `src/engine/algorithms/rank.ts`):
- The search window is the event's flex window. A fixed event has no window, so it uses three local days instead (see Q3).
- Each **fitting free gap gives exactly one candidate**. Its start is `clamp(originalStart, gap.start, gap.end − d)`, which is as close to the original start as that gap allows.
- Candidates are sorted by |shift|, earlier start first on ties, at most 5.

**In Divyam's Night A screenshot (08)**, the three gaps give 15 min later, 1 h 45 earlier and 16 h 45 later. That is the correct ascending order.

**The label is misleading.** "Closest to the original time" is the name of the criterion, printed on every option. So option 3 claims to be the closest while it is the farthest.

**The deeper problem is one candidate per gap.** The 14 h 30 gap (Thu 22:30 → Fri 13:00) contains many slots far nearer than 16 h 45, such as 22:45 or 23:30. That gap still yields only one candidate, so option 3 comes from a distant gap. The same label repetition happens in Find time: "Earliest slot that fits" appears on every row. Decision D-06 replaces this design.

### Q3. Why does a past conflict between two FIXED events say "Its window is entirely in the past"?

**Confirmed.** `alternativesWindow()` in `src/engine/pipelines/conflictResolution.ts` handles a non-flexible event like this:
- It searches from the local day before the event's day to the end of the day after it, i.e. [day − 1, day + 2): three whole days (`FIXED_SEARCH_DAYS_BEFORE = 1`, `FIXED_SEARCH_DAYS_AFTER = 2`).
- The search is clipped at "now", rounded up to 5 min.
- When that whole range has ended, `emptyWindowCause` returns `past`, and `src/ui/format/errors.ts` shows "Its window is entirely in the past."

**Judgement.** Searching the nearby days is a sensible idea, but the implementation has three problems:
1. The range is invisible.
2. The message calls it "its window", although the user never set one; only flexible events have windows.
3. The cut-off is arbitrary. A conflict from yesterday gets suggestions for today and tomorrow (it offers to move a class that already happened). A conflict from two days ago dead-ends.

Decisions D-02 (a fixed event needs an explicit temporary range) and D-08 (past conflicts) replace this.

---

## 3. UI/UX findings

All findings are fixed in this round, by the WI named in the last column.

| ID | Area | Finding | Evidence | Fixed by |
|---|---|---|---|---|
| U1 | Layout | At 1440×900 the Conflicts panel sits below the task list, out of view. A core feature is invisible on load. | `audit-2/week-dark.png`, `side-bottom.png` | D-14 (WI-56) |
| U2 | Layout | One long toolbar mixes navigation, views, filters, create and Replan. The app actions (↶ ↷ ◐ ? ⚙) are tiny glyphs, and ◐ renders as a sliver. | `feedback/03-top-strip.png` | D-13, D-14 (WI-56, WI-57) |
| U3 | Layout | "+ Task" (toolbar) and "New task" (panel) duplicate each other. "+ Event" and "+ Task" are both filled accent buttons, so the screen has two competing primaries. | `feedback/04` | D-14 |
| U4 | Layout | The priority filter appears twice in two forms: H/M/L circles in the toolbar and checkboxes in the task panel. | `week-*.png` | D-14 |
| U5 | Tasks | Sort, Priorities and Show take three rows (about 150 px) with unstyled native selects. | `feedback/05` | D-14 |
| U6 | Tasks | "Find time for 0 selected" is always shown, even when disabled, and sits between Tasks and Conflicts. | `side-bottom.png` | D-14 |
| U7 | Tasks | Each task row is about 140 px tall. It has a red ribbon plus a grey [H] tag, no category, and shows only "due", not the window start. | `feedback/07` | D-12, D-14 |
| U8 | Calendar | Event fills are coloured by priority, so a red High event reads like a conflict. Categories are invisible on the calendar. | `feedback/06`, `week-*.png` | D-12 (WI-57) |
| U9 | Calendar | Conflicting events are drawn narrow, and the badge eats the title ("Con", "Meet…"). | `week-*.png` | D-12, D-16 (WI-58) |
| U10 | Calendar | In dark mode, non-working hours and weekends are almost the same shade as working hours. | `week-dark.png` | D-10 (WI-53) |
| U11 | Calendar | Overlapping barred slots draw their labels on top of each other (TT over Lunch), and the hatching merges into one band. | `feedback/02` | D-09 (WI-53) |
| U12 | Calendar | Past days and past events look exactly like future ones. | `week-*.png` | D-08 (WI-52) |
| U13 | Pickers | Every option repeats the criterion name, both in alternatives and in Find time. | `feedback/01`, `feedback/08` | D-06 (WI-51) |
| U14 | Pickers | One candidate per gap (Q2). The gap, boundary and day-load details are always shown, and the dialog is verbose. | `feedback/01`, `feedback/08` | D-06 |
| U15 | Replan | From, To and Buffer each take a full row. Both cards repeat the same "Not moved" list word for word, and the metrics are plain text lines. "Already started" appears for an event that ended days ago. The move lists are long, wordy text. | `feedback/09` | D-15 (WI-55) |
| U16 | Dialogs | The event tag says **Fixed**, but the dialog control says **Flexible (the planner may move it)**. Changing the category silently flips Flexible (`flexibleByDefault`), which is a category rule. | `event-dialog.png`, `src/ui/forms/eventForm.ts` | D-01, D-11 (WI-49, WI-58) |
| U17 | Dialogs | The event and task dialogs put Category and Priority in opposite orders. Duration is two stacked full-width fields under an extra heading. | `event-dialog.png`, `task-dialog.png` | D-16 (WI-58) |
| U18 | Dialogs | Date formats disagree. The app writes "Fri 13 Nov 10:30" (24 h), while List day headers read "November 9, 2026". | `view-List.png` | D-16 |
| U19 | Settings | In a 12-hour browser locale, the barred-slot time fields are cut off ("01:0("). Import is an unstyled native file input. | `settings.png` | D-09, D-16 |
| U20 | Pickers | Esc on a single-task Find time shows the toast "Scheduled 0 of 1 task". | observed | D-16 |
| U22 | Responsive | At 1024 px the side column still shows: event titles truncate ("Algorit…", "[M]" cut off) and the toolbar wraps awkwardly. | `w1024.png` | D-14 (drawers below 1280 px) |
| U23 | Month | Out-of-month weekend day numbers ("31") are nearly invisible. | `view-Month.png` | D-16 |
| U24 | Visual | Green does too many jobs: today, primary buttons, selected views, focus rings and checked chips. | all captures | D-13 (WI-57) |
| U25 | Drag | The fixed-event confirmation says "Move it anyway?" even when the user is resizing. | user report | D-03 (WI-50) |

---

## 4. Decisions (binding)

### D-01 Scheduling model: Fixed and Flexible

- **Fixed and Flexible say whether the planner may act on an event on its own.** Categories never influence this (D-11).
- **Flexible.** The event has a flex window. Replan may move it inside its window (BR-12), and alternatives search inside its window.
- **Fixed.** The event has **no window**. Two rules follow:
  - Replan never moves it.
  - The suggestion picker shows no suggestions for it unless that dialog's **"Allow moving this event"** toggle is on (D-02).
- **After you pick a suggestion,** the event keeps its kind: a fixed event stays fixed after you apply a slot for it. Applying a slot yourself is always allowed.
- **Defaults:**
  - A new event defaults to **Fixed** (Claude's call C-01).
  - An event created by scheduling a task stays **Flexible**, with window = task window (BR-9, unchanged).
- **One name.** The event dialog shows one radio pair (D-16): *Fixed — the planner leaves it alone* / *Flexible — the planner may move it within its window*. The calendar tags use the same two words.

### D-02 Suggestions for a fixed event: opt-in, with a temporary range

- **When the chosen target is fixed,** the picker shows "<title> is fixed, so no suggestions are made for it." and an **Allow moving this event** toggle. The toggle is part of the dialog only: it starts off every time and is never stored.
- **When the toggle is on,** the dialog asks for a **temporary search range** (From / To dates) and runs the search inside it.
  - The fields are prefilled with the event's day through the next day, never before now (C-02). The user can change them.
  - The range is not stored. It replaces the hidden 3-day window, which is removed.
- **BR-10's default target is unchanged.** With two fixed events, the target follows rules 2–5, and the user can switch it with the Move radios.
- **The same dialog is used everywhere:** from the conflicts region, barred-slot overlap rows, and Replan's "Not moved" entries.

### D-03 Confirming a drag or resize of a fixed event

- **The confirmation always appears for fixed events,** whether or not the calendar lock (D-04) is on.
- **The wording matches the action:**
  - Move: **'"Class" is fixed. Move it to Fri 13 Nov 10:00–11:00?'**, with buttons **Move** / **Keep it**.
  - Resize (longer or shorter): **'"Class" is fixed. Change it to 1 h 30 min (10:00–11:30)?'**, with buttons **Change** / **Keep it**.
- Keep it, Esc and × revert the change, and nothing is written.
- Dragging or resizing a flexible event asks nothing.
- Edits in a dialog, Apply, undo/redo and Replan never ask.

### D-04 Calendar lock (one toggle on the calendar region)

- **The control.** A visible toggle in the calendar region, with a lock icon and the text *Locked* / *Unlocked*. Its accessible name is "Calendar lock", with `aria-pressed`. Keyboard shortcut: **K**.
- **While ON, timeline gestures do nothing:**
  - no drag-move, no resize and no drag-to-create or click-to-create, for every event, fixed or flexible;
  - clicking an event still opens its dialog;
  - **dragging on the time grid scrolls it** (grab-to-pan), which saves using the scroll wheel and Shift-scroll.
- **Deliberate actions still work:** + Event, N, dialog edits, Apply in the pickers, Replan, undo and redo.
- **Starting state (not persisted):** ON at every page load when the calendar has at least one event, OFF when it is empty, so a new user can drag right away. Within a session it stays where the user puts it.

### D-05 Calendar or List

List is a separate **Calendar ↔ List** toggle, and List always shows one week. Day, Week and Month belong to the Calendar side. Shortcuts:
- **D**, **W** and **M** switch to Calendar in that view.
- **L** toggles between Calendar and List.

### D-06 Suggestion pickers: picks plus options by day (alternatives and Find time)

Both pickers share one layout. It can be a large scrollable dialog.

**1. Header.** The subject, its length and the essentials:
- alternatives: the Move radios, the D-02 toggle and range, and Search hours (hidden when working hours are off, D-10);
- tasks: "Task i of N" and Rank by.

**2. Top picks.** Up to three named cards, never duplicating the same slot. Each card shows its name, the slot and a one-line reason.

| Picker | Pick | Rule | Reason line |
|---|---|---|---|
| Alternatives | Closest | smallest \|shift\| | "15 min later" |
| Alternatives | Same day | smallest \|shift\| on the original start's local day; omitted when it equals Closest or no slot exists that day | "1 h 45 earlier, same day" |
| Alternatives | Lightest day | least-loaded day, then smallest \|shift\| | "Fri has 0 min booked" |
| Find time | Earliest | earliest start | — |
| Find time | Tightest fit | smallest leftover in its gap; this keeps long free blocks intact | — |
| Find time | Lightest day | least-loaded day, then earliest | — |

In Find time, **Rank by** (Earliest, Best fit or Priority-aware; FR5 is kept) decides which pick is preselected. Priority-aware maps by priority, as in BR-7.

**3. All options by day.** Under each local day, in date order, the options are **time chips in time order** (C-03), each showing start–end.
- At most 8 chips per day are shown; "Show N more" expands the rest.
- One radio group spans the picks and the chips, so exactly one slot is selected and it can be reached with the keyboard.

**4. Details toggle.** One per dialog, off by default, not saved. It reveals:
- the summary ("4 free gaps … 3 fit");
- the search window, and Buffer as an override field;
- for the selected slot: its gap, what bounds the gap on each side, the leftover and the day load;
- in Find time, the window line.

All of this explanation stays in the code (BR-8); it is only hidden.

**5. Empty results.** The ER2/ER3 explanation (WI-45) is always visible when nothing fits.

**Candidate generation.** A new pure algorithm builds the candidates for one fitting gap:
- starts: `gap.start`, `gap.end − d`, the clamped original start (alternatives), and every start that is a multiple of `SUGGESTION_STEP_MIN` (30) in between;
- deduplicated;
- each with its gap, leftover, day load and distance.

`rankOptions` and `MAX_OPTIONS` stay as they are for Replan. TEST_PLAN T10/T20/T34 change only where the pickers' contract changes, and they gain new cases for the generator (property: every candidate lies in a fitting gap and has length d).

### D-07 Done tasks

**Status.** Tasks gain the status **done** and a field `doneAt`.

**Mark done** is a ✓ button on the task row and in the task dialog.
- **A scheduled task becomes unscheduled first:** its linked event is deleted, so the time is visibly free. Then the task becomes done.
- All of this is one atomic change and one undo step.
- No pipeline needs special handling for done tasks, because they have no event.

**Reopen** sets the task back to unscheduled (one undo step). The task can then be scheduled again with fresh suggestions.

**Done rows** show a ✓ Done tag, a struck-through title and muted text. Their actions are Reopen, Edit and Delete; there is no Find time. Done tasks are hidden by the default task filter (D-14 lists the filter options).

**Bulk "Mark done before…"** is in the Tasks region menu:
1. The user picks a date and time T.
2. A preview lists every **scheduled task whose event ends ≤ T** and every **unscheduled task whose window ends ≤ T**, with a count.
3. **Apply** marks them all done in one atomic change and one undo step.

### D-08 Past time

**Definition.** "Past" means end ≤ now. For a conflict, that is the end of its overlap.

**Conflicts region.**
- It lists **Upcoming (N)**, plus a collapsed **Past (N)** group.
- Past rows show the events, the overlap and its minutes, but no Suggest button.
- Region badges and the status line count upcoming conflicts only, with "(N past)" in the status line.
- An ongoing conflict counts as upcoming, and its searches start from now.

**Barred-slot overlaps** whose overlap is entirely past are neither tagged nor listed, and the settings toast does not count them.

**Replan's "Not moved" list** leaves out problems that are entirely past. "Already started" is used only for an event that is still running.

**Calendar.**
- Past days and past events are visibly muted, using tested tokens, with text still ≥ 4.5:1.
- A faint now-line crosses every day column; the strong now-line stays on today.

### D-09 Barred slots (soft)

**The rules.** A barred slot is time you would rather keep free. "Keep here" (rule 6) is stored on the event as `keptInBarred`, a list of barred-slot ids.

| # | Situation | Behaviour |
|---|---|---|
| 1 | The planner places time (Find time, alternatives, Replan) | Never into a barred slot (unchanged). |
| 2 | You create, drag or edit an event into a barred slot | Allowed, with no question. The event gets an `In <label>` tag and is listed under Overlaps. |
| 3 | You add or change a slot over existing events | Allowed, and nothing moves. The info toast "N events overlap barred slots" with View (future overlaps only, D-08). |
| 4 | A fixed event inside a slot | Warning only. Replan never moves it. Suggestions only through Allow moving (D-02). |
| 5 | A flexible future event inside a slot | Replan may propose moving it out (reason *barred*), and you still Apply, unless the event is kept (rule 6). |
| 6 | **Keep here** | An action on an overlap row. It stores that slot's id on the event. The tag and the row then disappear into a collapsed **Kept (N)** group, where **Stop keeping** undoes it. While kept, Replan does not move the event for the *barred* reason (other reasons still apply). It is one undo step. It clears itself automatically when the event's start or end changes, or when that slot is deleted or its times or days change. |
| 7 | Past overlaps | Not tagged or listed (D-08). |
| 8 | Conflicts | Barred slots never create conflicts (BR-3 unchanged). |
| 9 | Two slots overlap | **Rejected** when they share at least one weekday and their times overlap; touching is allowed. The message is "Overlaps barred slot N (Lunch) on Mon, Tue." Exact duplicates fall under this rule too. |
| 10 | Older data with overlapping slots | The Dexie upgrade and v1 import keep them as they are. The Barred slots region then shows "Lunch and TT overlap on Mon–Fri. Edit one of them." Saving any barred-slot change requires resolving the overlap. Labels never draw on top of each other: overlapping labels stack. |
| 11 | Working hours off or a non-working day | Slots still apply on their configured weekdays (unchanged). |

**Barred-slot editing moves out of Settings** into the **Barred slots region** (D-14). The region has inline rows (label, from–to, day chips, remove), *Add barred slot*, and Save/Cancel for pending edits. As before, these are settings, so they are not undoable (B1). The time fields have a fixed width, so 12-hour locales never cut them off (U19).

### D-10 Working hours are optional

**Settings gets a "Use working hours" switch.** It is on by default, and existing data migrates with it on.

**When it is off, every day 00:00–24:00 is available:**
- Allowed segments ignore working days and hours everywhere. Barred slots still apply.
- The tasks' Scheduling hours choice and the alternatives' Search hours choice are hidden and act as Any time.
- Replan and day loads use whole local days.
- The default flex window is the whole local day.
- There is no non-working shading.
- The working days and hours are kept, greyed out, for when the switch goes back on.

**When it is on, non-working hours and days are clearly shaded in both themes** (U10). This is a token pair that is tested to be distinguishable.

### D-11 Categories

**Categories have no functional meaning.** Nothing derives a rule from a category: `flexibleByDefault` is removed. The only exceptions are the two Replan strategies the user explicitly chooses (D-15).

**The entity** (`Category`):

| Field | Constraint |
|---|---|
| `id` | assigned by the engine |
| `name` | 1–40 characters after trimming, unique ignoring case |
| `colour` | hex |
| `createdAt` | assigned by the engine |

Events and tasks carry a required `categoryId` that must refer to an existing category.

**Defaults.** A new database, and the migration, seed the five categories from the course brief: Meeting, Class, Appointment, Assignment, Personal. Each gets its own palette colour.

**Create, rename, recolour, delete:**
- In **Settings → Categories**, and inline from the event and task dialogs: the category select ends with *New category…*, which opens a small name-plus-colour form.
- Category changes are data, so each one is one undo step.
- Renaming or recolouring shows everywhere at once, because items refer to the category by id.
- **Deleting is blocked** while any event or task uses the category, with the message "Used by 3 events and 1 task. Change their category or delete them first." Nothing is reassigned automatically.
- Deleting the last category is allowed. The dialogs then ask the user to create one inline before saving (category-less items are out of scope).

**Colours:**
- A **curated palette of 12 swatches** that excludes every reserved colour (D-12).
- **Colours are unique per category.** A swatch frees up when its category is deleted or recoloured.
- **A free picker is available too.** It rejects a colour too close to any reserved colour or any colour already in use, measured as an OKLab distance below a named constant in `constants.ts`.
- Every colour must keep ≥ 3:1 non-text contrast against the tag background in both themes. A category tag is a colour dot plus the name in normal text, so text contrast never depends on the category colour.

**Default category of a new item:** the category last used in this session, otherwise the first in the list.

**Filters.** Category filter chips sit beside H/M/L (D-14).

**Out of scope for this round** (to be recorded in PROJECT_SCHEMA §2.3): multi-category items and category-less items.

### D-12 Event and task appearance; reserved colours

**Event blocks.**
- Every event uses **one neutral, high-contrast fill**: a comfy dark grey in light mode with light text, and a comfy cream in dark mode with dark text.
- The fill is clearly distinct from the empty grid (≥ 3:1 non-text contrast), and the text on it is ≥ 4.5:1.
- The conflict dashed outline and ⚠ badge are kept.

**Tags on a block,** each carrying its own background so it reads on the fill:
- the priority tag [H]/[M]/[L] in its priority colour;
- the category tag (colour dot and name);
- grey icon tags with text for Fixed, Flexible, Task and `In <label>`.

Narrow blocks show the title, the priority tag and icons only. The full information stays in the accessible name and the tooltip (U9).

**Task rows** use the same priority and category tags, with no ribbon.

**Reserved colours** (no category or accent may use them):
1. the event fill of each theme;
2. the danger red of conflicts;
3. the three priority colours (red, amber, slate blue).

### D-13 Accent and theme

**Accent.** Settings → Appearance offers **neutral plus swatches**.
- The default accent is the neutral of the active theme: dark grey in light mode, cream in dark mode.
- About 7 more curated accents are offered. Each is contrast-checked for on-accent text in both themes, and none is a reserved colour.
- The accent is a UI preference in `localStorage`, like the theme, and is not exported.

**Where the accent appears:** one primary button per region, the selected segment of segmented controls, focus rings, the today marker and checked chips.

**Theme toggle.** It shows a **sun when light is active and a moon when dark is active**; under System it shows the resolved theme. Clicking it switches between Light and Dark. *System* stays available in Settings → Appearance (B3).

**Design philosophy:** minimal, sleek and elegant. Thin hairline borders, hierarchy from spacing and weight, no nested cards and no heavy boxes.

### D-14 Layout: five regions in three columns

Five regions in three columns, all visible at desktop widths (layout A, chosen by Divyam).

```text
┌ App bar ── Interactive Calendar ····························· ↶  ↷ │ ☾ │ ? │ ⚙ ┐
├ Tasks (≈300 px) ─┬ Calendar ──────────────────────────────────┬ Right (≈320 px) ─┤
│ Tasks (4)  [+Task]│ ◀ Today ▶  Week of 9 Nov 2026  [Day|Week|Month]│ Conflicts (1)      │
│ [Show ▾][Sort ▾][⋯]│ [Calendar|List]  [H][M][L] [●Class][●Study]…   │  ⚠ Lecture↔Meeting │
│ ☐ Write report     │                         🔒 Locked   [+ Event]  │    Tue 11:00 · 30m │
│   [H] ●Assignment  │ ┌──────────────── week grid ──────────────┐ │    [Suggest]       │
│   1 h 30 · Mon–Fri │ │                                          │ │  ▸ Past (2)        │
│ …                  │ │                                          │ ├ Replan ───────────┤
│ [Find time (2)]    │ │                                          │ │ This week          │
│                    │ └──────────────────────────────────────────┘ │ [Plan…]            │
│                    │ 8 events · 1 conflict (2 past)              │ ├ Barred slots (2) ─┤
│                    │                                              │ Lunch 13–14 Mon–Fri│
│                    │                                              │ Overlaps (1) · Kept│
└────────────────────┴──────────────────────────────────────────────┴────────────────────┘
```

1. **App bar:** the app name, then Undo, Redo, Theme, Help and Settings, as icon buttons with their existing accessible names and tooltips.
2. **Calendar region:**
   - Row 1: ◀ Today ▶, the period title, and the Day/Week/Month segmented control.
   - Row 2: the Calendar/List toggle, the filters (H/M/L plus category chips and a reset), the lock toggle and **+ Event**, this region's only primary button.
   - A small status line.
3. **Tasks region:**
   - **+ Task** is its only primary button; "New task" is removed.
   - One compact row of controls: **Show** (Open = unscheduled + scheduled by default, Unscheduled, Scheduled, Done, All), **Sort** (Priority / Window end), and a ⋯ menu holding *Mark done before…*.
   - The duplicated priority checkboxes are removed; the calendar filters do not affect the task list.
   - Rows are compact.
   - **Find time (N)** appears only when N ≥ 1.
4. **Conflicts region:** Upcoming, then the collapsed Past group (D-08).
5. **Replan region:** its own section in the right column, not inside Conflicts. It shows the default range (the visible week), the strategy (D-15) and **Plan…**, which opens the Replan dialog.
6. **Barred slots region:** the slot rows (D-09) and the Overlaps list, with Suggest alternatives, Keep here and a collapsed Kept (N) group.

**Every column scrolls on its own,** and each region header shows its count.

**Below 1280 px** (U22), the Tasks column and the right column become drawers, opened from app-bar buttons "Tasks (N)" and "Conflicts (N)". The phone layout stays best effort.

### D-15 Replan: strategies and a simpler dialog

**Movable events (BR-12):** flexible, `start ≥ notBefore`, and intersecting the range (unchanged).
- Fixed events are never moved (unchanged).
- A kept event (D-09 rule 6) is never moved for the *barred* reason.

**The first plan is always Minimal change, unchanged.** In order (High priority first, then longest, then start, then ID), each movable event:
- **stays** if it already lies in one free gap inside its window and the working hours, out of barred slots, and clear of everything busy including the buffer;
- otherwise **moves to the nearest free slot**, with the first reason that applies (outside window → outside working hours → barred → conflict → buffer).

Each placed event counts as busy for the events after it.

**The second plan has a Strategy selector.** The default is **Balanced week** (unchanged). The others:

| Strategy | Candidate sort key (ascending) — everything else follows BR-12 |
|---|---|
| Balanced week | day load, then distance, then start (unchanged) |
| Cluster by category | −(minutes of the same category already on that day), then distance, then start |
| Vary categories | minutes of the same category already on that day, then day load, then distance, then start |
| Front-load | start (the `earliest` criterion) |
| Fewer fragments | leftover in the gap (the `bestFit` criterion), then start |

- Each strategy processes events in BR-12's order, with the same busy-set updates and the same metrics.
- An event whose chosen slot equals its current interval does not count as a move.
- The move reason is the strategy's name, unless a Minimal-change reason applies.
- Every strategy keeps the T35 safety properties: no placement in a conflict, a barred slot, outside the window or inside the buffer. They are property-tested.

**Replan dialog (U15).** The suggestions get the same treatment as the pickers: less text, clean formatting.
- **Inputs on one line:** From, To, the second plan's Strategy, and **Compute plans**. Buffer moves behind Details.
- **Two cards, each showing:**
  - a headline line, e.g. "3 moves · conflicts 2 → 0";
  - the moves as **compact rows grouped by day**: event name, priority and category tags, `10:00 → 14:00` (or a day change such as `Tue 10:00 → Wed 09:00`), and a short reason chip (*conflict*, *barred*, *outside window*, *balance*, *cluster*, …);
  - **Apply this plan**.
- **"Not moved by Replan (N)" appears once,** below both cards, collapsed. Each entry is one line (event, reason chip) with Suggest alternatives.
- **The Details toggle** (per dialog, off by default, not saved) reveals the full metrics (total shift, day-load spread before → after, unplaced), the long move reasons, and Buffer.

### D-16 Dialog and format consistency (U16–U20, U23)

**Event dialog field order:** Title; Priority; Category; Start and End on one row; Scheduling (*Fixed / Flexible* radios, plus the window fields when Flexible); Description.

**Task dialog field order:** Name; Duration (h and min on one row); Priority; Category; Window from and to on one row; Scheduling hours (hidden when working hours are off); Description.

**Buttons:**
- Event dialog: Save, Cancel, Delete.
- Task dialog: Save, Cancel, plus Find time, Mark done or Reopen, Unschedule and Delete where they apply.

**One date and time format** everywhere the app writes it: "Mon 9 Nov" or "Mon 9 Nov 2026", with 24-hour times. This includes FullCalendar's List headers and titles. Native date and time inputs follow the browser locale; that is a known limitation.

**Smaller fixes:**
- Import JSON gets a styled button.
- Esc or Stop on a **single-task** Find time shows no "Scheduled 0 of 1 task" toast. A queue of 2 or more tasks keeps its summary.
- Out-of-month day numbers in Month view are readable (≥ 4.5:1).

### D-17 Data, migration and export

**Dexie version 3,** with no edit to versions 1 or 2:
- a new `categories` table, seeded with the five defaults;
- `events.category` and `tasks.category` (enums) are mapped to the seeded `categoryId`s;
- `events.keptInBarred = []`;
- the task status gains `done`, with `doneAt = null`;
- `settings.useWorkingHours = true`.

An upgrade test with v2 data must prove every row is kept. Stored data written before this round, including overlapping barred slots, must load.

**Export format version 2** contains `categories` plus everything else.
- **Import accepts v1 files:** enum categories map to the seeded defaults, the new fields get their defaults, and overlapping barred slots are kept as in D-09 rule 10.
- Import also accepts v2 files.
- Cross-record checks extend to `categoryId`.
- `docs/samples/*.json` are re-exported as v2, and one v1 fixture is kept for the v1-import test.

**UI preferences** (theme, accent, last view and Calendar/List) stay in `localStorage`. The calendar lock is session state only (D-04).

### D-18 Docs restructure

- `docs/PROJECT_SCHEMA.md`, `docs/TECH_SPEC.md` and `docs/TEST_PLAN.md` stay directly in `docs/`. `docs/samples/` and `docs/screenshots/` stay as they are.
- `docs/PROGRESS.md` moves to **`docs/progress/PROGRESS.md`**.
- Every other doc moves to **`docs/extras/`**: `AUDIT.md`, `BUG_REPORTS.md`, `PROMPTS.md`, this `AUDIT_2.md`, the feedback and audit-2 screenshot folders, and the round-2 prompt.
- Every link and reference is fixed: AGENTS.md (including its docs table and session protocol), CLAUDE.md, README, the three main docs, the extras, the scripts, `.github`, and the skill copies if they mention paths. A grep for the old paths must come back empty.

### D-19 One manual smoke test

- **One manual smoke test** goes in TEST_PLAN §7. It merges and replaces:
  - the demo scripts D1–D5 (§8);
  - the accessibility checklist (§7.1);
  - the UX sanity list (§7.2);
  - the peer-fix smoke checklist in PROGRESS.md.
- It covers every new and changed feature in this file.
- It takes 20–30 minutes on the live site, in both themes, with the accessibility checks woven into the steps.
- TEST_PLAN §9 (release checklist) and README point to it.
- The old production rehearsal record moves to `docs/extras/` as history.

---

## 5. Business-rule and requirement changes (summary for the main docs)

- **Glossary (§3.1):**
  - *Fixed event* and *Flexible event* per D-01;
  - new: *Calendar lock*, *Done task*, *Category* (entity), *Kept in barred slot*;
  - *Barred slot* per D-09;
  - *Working hours* now optional.
- **BR-5:** the `useWorkingHours` switch (D-10). Fixed-event alternatives use the D-02 temporary range; the 3-day window is removed.
- **BR-7:** the pickers use the D-06 candidate generator, picks and by-day layout. Replan keeps `rankOptions`.
- **BR-9:** marking done unschedules first (D-07). Category is copied as `categoryId`.
- **BR-10:** unchanged order. A fixed target gives no suggestions without Allow moving.
- **BR-12:** strategies (D-15); kept events (D-09); "Already started" only for running events (D-08).
- **BR-13:** priority tags are unchanged, but priority no longer colours event fills (D-12).
- **BR-15:** past overlaps excluded, Keep here, no overlapping slots, older data kept (D-09).
- **New BR-16:** categories (D-11). **New BR-17:** calendar lock and drag confirmations (D-03, D-04). **New BR-18:** done tasks (D-07). **New BR-19:** past time (D-08).
- **FR:** FR2 (fixed/flexible, lock), FR5/FR7 (pickers), FR6 (category filter), FR8 (done), FR10 (strategies), FR11 (optional working hours, categories, appearance) and the §7 UX spec are updated. The §2.1 core-features table changes accordingly.
- **ER:**
  - deleting a used category gives a new `CategoryInUse` error;
  - overlapping barred slots give `InvalidInput`, with the message from D-09;
  - Allow-moving with an invalid range gives `InvalidTime`.

---

## 6. Out of scope and future work

- **Out of scope for this round** (to be recorded in PROJECT_SCHEMA §2.3):
  - multi-category events and tasks;
  - events and tasks without a category.
- **Future work** (not this round):
  - multi-level tasks and events with prerequisites, scheduled in dependency order. Today's §2.3 lists "Task dependencies" as out of scope; mark it as planned future work.
- **Not planned:**
  - per-day working hours;
  - resizing an event from its start edge.

---

## 7. Work plan (WI-47–59, one change group each, in this order)

| WI | Title | Main content | Done when |
|---|---|---|---|
| 47 | Docs restructure | D-18 | Files moved with `git mv`; a grep for the old paths finds nothing outside change logs; the gate is green |
| 48 | Data model v3 and migration | D-17, the D-11 entity, the D-07 status, D-09's `keptInBarred`, D-10's switch field; minimal UI changes so it compiles | Dexie v2→v3 upgrade test; v1/v2 import tests; samples re-exported; all existing tests pass (fixtures updated mechanically) |
| 49 | Categories | D-11 (engine commands, palette and free picker, Settings section, inline creation, tags, filters, `flexibleByDefault` removed) | New tests for CRUD, delete blocking, uniqueness, undo, filters |
| 50 | Scheduling model and lock | D-01–D-05 | T43 updated to the new wording; tests for the lock's gestures and grab-to-pan; D-02 search tests |
| 51 | Suggestion pickers | D-06 | Generator unit and property tests; picker RTL tests; e2e apply flows |
| 52 | Past time | D-08 | Panel grouping and counts; muted past styling; Replan wording |
| 53 | Barred slots and working hours | D-09, D-10 | Overlap rejection; older-data banner; Keep here behaviour and its automatic clearing; the switch behaviour across all three searches |
| 54 | Done tasks | D-07 | Atomic mark-done and unschedule; Reopen; bulk preview and apply; undo |
| 55 | Replan strategies and dialog | D-15 | Strategy keys unit-tested; properties for each strategy; dialog RTL tests |
| 56 | Layout | D-14, D-05 | Five regions at 1440, 1280 and 1024 (drawers) in both themes; no duplicate controls; e2e updated |
| 57 | Visual system | D-12, D-13 | `tokens.test.ts` covers fills, tags, accents and shading; screenshots refreshed and reviewed |
| 58 | Dialog and format polish | D-16 | Field-order and format tests; U9/U19/U20/U23 checks |
| 59 | Docs, smoke test and final gate | D-19, README, consistency pass | Full gate against the baseline; smoke test written; human steps listed |

---

## 8. Claude's calls (made while planning; Divyam may veto any)

- **C-01** A new event defaults to **Fixed**: an event the planner should move is a deliberate choice. Categories no longer decide this.
- **C-02** The temporary range for Allow moving is **prefilled** with the event's day through the next day (never before now), so one click searches. The user can edit it.
- **C-03** Chips within a day stay in **time order**. In Find time, the ranking criterion only decides the preselected pick. The option text in chat said the criterion would also order the chips; time order reads more naturally.
- **C-04** Buffer moves behind Details in all three dialogs; Search hours stays visible.
- **C-05** The calendar lock's shortcut is **K**. Drag-to-pan works only while locked.
- **C-06** Barred-slot editing moves from Settings into the Barred slots region. Settings keeps Working time, Scheduling defaults, Categories, Appearance and Data.
- **C-07** Bulk "Mark done before…" sits in the Tasks region's ⋯ menu and always shows a preview before applying.
- **C-08** Deleting the last category is allowed; the dialogs then require creating one inline.
