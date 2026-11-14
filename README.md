# Interactive Calendar and Intelligent Time Planner

A browser-based week planner that detects every scheduling conflict, finds free time for your tasks and explains _why_ each suggested slot fits.

**▶ Live app:** [int-calendarfeature-creatures.vercel.app](https://int-calendarfeature-creatures.vercel.app). Nothing to install; all data stays in your browser.

![Week view with the sample calendar loaded](docs/screenshots/week-light-1440.png)

## Team

**Feature Creatures** · Project 4 of CS-3810 _Design Practices in Computer Science_, Ashoka University, Monsoon 2026

| Member           | Roll number |
| ---------------- | ----------- |
| Samar Baskar     | 1020241699  |
| Divyam Chaudhary | 1020221520  |

## What it does

- **Calendar.** Create, edit, drag, resize and delete events in Day, Week, Month and List views.
  - Each event has a category, a priority (High, Medium or Low) and an optional _flexible_ window. New events start Fixed; choose Flexible when the planner may move them.
- **Categories.** Create, rename, recolour and delete categories in Settings → Categories, or create one inline in either item dialog. Each change is undoable. Used categories show their event/task counts when deletion is blocked. Choose from twelve swatches or a custom colour checked for contrast and distinctness. Category chips beside H/M/L filter the calendar; Reset filters restores both. Tasks and conflict detection keep all their data.
- **Conflict detection.** Every pair of overlapping events is found automatically after each change.
  - Each conflict shows which events overlap, the exact overlap (e.g. 11:00–11:30) and its length in minutes.
  - Back-to-back events do not count as conflicts.
  - Upcoming conflicts drive the count; **Past** starts collapsed and keeps read-only overlap details. Ended events and past days are muted, while each day has a faint current-time guide. Counts and warnings refresh as time passes.
- **Conflict resolution.** _Suggest alternatives_ proposes free slots for the event that is better to move, closest to its original time first.
  - Fixed events require **Allow moving this event** and a temporary date range; applying an option keeps the event Fixed.
- **Calendar lock.** Lock the timeline to browse and drag the time grid to pan without changing events. **K** toggles it; event dialogs, + Event and deliberate Apply actions remain available. Existing calendars start locked on reload. Unlocked fixed moves/resizes ask for the proposed destination or duration.
- **Calendar / List.** List always shows a week; return to Calendar to restore its last Day, Week or Month view. **L** toggles the two.
- **Best-time finder.** Tasks have a duration, a priority and a window, such as "90 minutes, sometime this week".
  - Review named top picks and time chips grouped by day. Rank by (earliest, best fit or priority-aware) preselects a pick; chips stay in time order. Show N more expands a day, and Details reveals the window, buffer and selected slot's explanation.
  - Every slot says which gap it came from and what bounds it. When nothing fits, the app says why and shows the largest gap it found.
- **Several tasks at once.** Selected tasks are offered one at a time, highest priority first. Each search sees the slots you already accepted.
- **Replan.** For a chosen week, the app proposes two rearrangements of your flexible events: _Minimal change_ and _Balanced week_.
  - Each plan lists every move with a reason, plus before/after metrics. Apply one or neither.
  - Unresolved future or ongoing problems Replan won't move are listed with the reason. Entirely past problem overlaps are omitted; Already started describes a currently running event.
- **Your rules.** Set working time/buffer in Settings and edit lunch or other slots in the **Barred slots** region. Ongoing/future barred overlaps are flagged separately from conflicts; past overlaps have no tag, row or settings warning. **Keep here** moves an overlap into the collapsed **Kept** group; **Stop keeping** restores its warning. Both are undoable. Time edits or slot time/day changes clear it. New overlapping barred slots are rejected.
- **Comfort features.** Undo/redo, JSON export/import, six built-in sample calendars, light and dark themes, keyboard shortcuts (press **?**), and screen-reader and keyboard support.
- **Appearance.** Neutral event blocks keep priority, category and scheduling tags readable on their own backgrounds. Settings → Appearance offers Neutral plus seven accent choices and System/Light/Dark; the app-bar sun/moon switches Light/Dark directly. These choices stay on your device and are not exported.
- **Compact forms and dates.** Event and task forms share Priority/Category order and paired date fields. List uses compact dates and 24-hour ranges. Import JSON opens the file chooser from a button; cancelling a single-task search stays quiet. Native date/time inputs follow your browser locale.

Nothing changes without your say-so: suggestions and plans are previews until you click **Apply**.

## Try it in two minutes

1. Open the [live app](https://int-calendarfeature-creatures.vercel.app) and click **Load sample week**.
2. **Conflicts.** Tuesday's _Lecture_ and _Meeting_ overlap for 30 minutes. Upcoming conflicts offer **Suggest alternatives**; ended overlaps are retained under **Past**. The sample uses the current week, so its tasks and conflicts may already be past when you open it.
3. **Finding time.** Use **+ Task** in Tasks to make a task with a future window, then **Find time**. Switch _Earliest fit_, _Best fit_ and _Priority-aware_ to change the selected pick. Choose a pick or chip, open **Details**, then **Apply selected**. Alternatives shares the layout with Closest, Same day and Lightest day picks.
4. **Your own events.** Use **+ Event** for future Fixed or Flexible events. Creating overlapping events immediately shows their exact conflict. Fixed alternatives require **Allow moving this event** and a temporary range.
5. **Replan.** In the Replan region choose **Plan…**, set a range containing future flexible events, then **Compute plans**. Compare, Apply and **Undo** to revert the whole plan in one step.
6. **Timeline gestures.** Press **K** to unlock before dragging to create/move/resize. Fixed moves/resizes ask for confirmation; while locked, dragging pans the grid. Event dialogs stay available.

More presets (overlap cluster, midnight crossing, fully booked day, a 5,000-event stress test) are under **Settings → Data → Load sample calendar**. Loading a sample replaces your current data, so export first if you want to keep it.

Existing browser data upgrades automatically to database v3 with events, tasks, settings and the multi-tab revision preserved. New JSON exports use version 2 and include categories; version 1 backups still import.

**Layout.** Tasks, Calendar and Planning use separate scrolling columns at 1280 px and wider. Below that, use the counted Tasks and Conflicts buttons in the app bar to open their drawers. **+ Task** lives in Tasks, **+ Event** in Calendar, and **Plan…** in Replan. Task rows show both window dates; hover them for the full time range. Barred-slot validation names the overlapping slot and its times.

**Replan strategies.** Keep Minimal change as the first plan, and choose Balanced week, Cluster by category, Vary categories, Front-load or Fewer fragments for the second. Cards show compact moves by day; **Details** reveals full metrics, explanations and Buffer. **Not moved by Replan** appears once below the cards with alternatives for unresolved events.

**Done tasks.** Use **✓ Mark done** on a task row or in its dialog to free any scheduled time and complete it in one undo step. **Show → Done** reveals completed tasks; **Reopen** returns them to unscheduled for a fresh search. In the Tasks **⋯** menu, **Mark done before…** previews tasks by scheduled event end or unscheduled window end before applying them together. Editing the cutoff or changing tasks requires a new preview.

Turn off **Use working hours** in Settings to let Find time, alternatives and Replan use whole local days, including nights and weekends. Barred slots still apply. Saved working-time preferences are disabled and retained; task/search-hour choices and non-working shading return when you switch it back on.

## Run it locally

You need Node.js 22 and npm.

```bash
npm ci
npm run dev      # development server; open the URL it prints
npm run build    # production build into dist/
npm run preview  # serve that build locally
```

On Windows PowerShell setups that block npm's script wrappers, use `npm.cmd` and `npx.cmd`.

## How it works

The app is a static React + TypeScript site with three layers. Each layer may only call the one below it, and ESLint rules enforce that.

| Layer                                 | What it does                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **UI** (React, FullCalendar, zustand) | Draws the calendar and dialogs, and turns clicks and drags into commands. FullCalendar only renders; it makes no scheduling decisions.                                                           |
| **Engine** (plain TypeScript)         | Validates every command, runs four pipelines (event changes, conflict resolution, task scheduling, replan) and keeps undo history. Its algorithms are pure functions with no UI or storage code. |
| **Storage** (Dexie / IndexedDB)       | Saves categories, events, tasks, settings and the multi-tab revision in the browser, behind an interface that also has an in-memory version for tests.                                           |

**Key algorithms.** Here N is the number of events, n the number in the searched window, m the number of free gaps and k the number of conflicting pairs.

- **Conflict detection: a sweep line with a min-heap.**
  - Events are kept sorted by start time. The sweep holds every still-running event in a heap ordered by end time, and drops each one once it has ended.
  - Every event still in the heap overlaps the new one, so all pairs are found in O(N log N + k), plus O(k log k) to order the output.
  - A simpler "running maximum end" sweep was considered and rejected: it misses pairs when three events overlap.
- **Free time: merge, then complement.**
  - Events in the window, widened by the buffer, are merged into busy blocks.
  - What remains of the working hours, after removing barred slots and the busy blocks, is the free gaps.
  - This takes O(log N + n) once the store is sorted, with no re-sorting.
- **Ranking: greedy choice over the gaps.**
  - Picker candidates include both fitting gap boundaries, every fitting half-hour start and the clamped original start for alternatives. Each retains its gap/boundaries, leftover, day load and distance. The selected criterion preselects a named pick. Replan keeps one candidate per gap and its original ranking.
  - For C generated picker candidates across D local days, generation/ranking costs O(C log(C+1) + C log(D+1)); Replan's one-candidate-per-gap ranking stays O(m log m).
- **Replan: a one-pass greedy.**
  - Flexible events are placed in priority order. Each one either keeps a valid spot or takes the best candidate for that plan.
  - It is fast and every move is explainable, but it is not guaranteed to be globally optimal.

The full algorithm descriptions, correctness arguments and complexity table are in [TECH_SPEC.md](docs/TECH_SPEC.md) (§8 and §10). The data representation of events, tasks, priorities and intervals is in TECH_SPEC §5 and [PROJECT_SCHEMA.md](docs/PROJECT_SCHEMA.md) §3.

**Limitations.**

- There is no backend, account system, sync or sharing; data lives in one browser.
- There are no recurring events.
- Several tasks are scheduled one at a time, not jointly optimised.
- The phone layout is best effort.

## Testing

The algorithms are the core of the project, so they are tested hardest:

- **Exact cases.** Hand-worked examples with exact expected results, such as "10:00–11:30 and 11:00–12:00 overlap from 11:00 to 11:30 for 30 minutes".
- **Brute-force oracles.** The fast algorithms are compared against deliberately simple, obviously-correct versions on thousands of random calendars.
- **Integration.** The engine is tested end to end with both storage implementations.
- **UI.** The interface is tested against the real engine, not a mock.
- **Browser automation** (Playwright). Real dragging, resizing and the main workflows run in Chromium.

Continuous integration runs these checks on every change to `main`.

**Latest verified results** (14 November 2026, WI-58 on local main; the WI-59/five-repeat Finish gate follows):

| Check                                      | Result                                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit, integration and UI tests             | 861 passing + 1 existing opt-in performance skip                                                                                                                                                                    |
| Randomised oracle tests                    | 10 property cases × 10,000 random calendars each, all passing                                                                                                                                                       |
| Daylight-saving tests (New York time zone) | 9 passing                                                                                                                                                                                                           |
| Browser tests (Chromium)                   | 64 checks × 3 repeats = 192/192, including the production and StrictMode smoke projects; zero retries                                                                                                               |
| Code coverage                              | Overall 98.53 / 94.38 / 98.05 / 98.74; algorithms 99.72 / 96.80 / 100 / 99.71 (statements/branches/functions/lines, %)                                                                                              |
| Performance                                | Previously measured on 12 November: 5,000-event conflict detection plus slot search, median 1.278 ms (target under 100 ms)                                                                                          |
| Manual checks on the live site             | Round 2 deployment smoke remains human-owned: [TEST_PLAN §7](docs/TEST_PLAN.md#7-live-site-smoke-test-20-30-minutes). [Earlier reported results](docs/extras/MANUAL_VERIFICATION_HISTORY.md) describe older builds. |
| Independent code audit                     | 10 findings re-checked, then fixed with tests or deferred with reasons ([AUDIT.md](docs/extras/AUDIT.md))                                                                                                           |
| Peer bug reports                           | 14 reports re-checked: 11 fixed with tests, 1 clarified, 1 by design, 1 invalid ([BUG_REPORTS.md](docs/extras/BUG_REPORTS.md))                                                                                      |

The Round 2 baseline is recorded in [PROGRESS.md](docs/progress/PROGRESS.md). The current comparison preserves the test count and every coverage measure within the allowed 0.5 percentage-point drop:

| Coverage (%) | Baseline statements / branches / functions / lines | Current statements / branches / functions / lines | Change (percentage points)    |
| ------------ | -------------------------------------------------- | ------------------------------------------------- | ----------------------------- |
| Overall      | 98.71 / 94.23 / 98.23 / 98.78                      | 98.53 / 94.38 / 98.05 / 98.74                     | −0.18 / +0.15 / −0.18 / −0.04 |
| Algorithms   | 99.70 / 95.93 / 100 / 99.68                        | 99.72 / 96.80 / 100 / 99.71                       | +0.02 / +0.87 / 0 / +0.03     |

Passing tests grew from 639 to 861 (+222); DST cases from 7 to 9; full property cases from 5 to 10; browser checks from 25 to 64. Assertions, coverage thresholds, property runs, local retry settings and timeouts were not weakened.

**Reproduce the results.** Install dependencies with `npm ci`, then:

```bash
npm test                  # unit, integration and UI tests
npm run test:coverage     # the same, with a coverage report in coverage/index.html
npm run test:dst          # daylight-saving tests
npm run test:props:full   # randomised oracle tests at 10,000 cases each
npx playwright install chromium
npm run typecheck
npm run lint
npm run build
npx playwright test --repeat-each=5 --workers=2
node scripts/checkTextDiagrams.mjs
npm run test:perf         # the 5,000-event performance check
```

Every test case and requirement mapping is in [TEST_PLAN.md](docs/TEST_PLAN.md). Its single [20–30 minute live-site smoke test](docs/TEST_PLAN.md#7-live-site-smoke-test-20-30-minutes) covers the Round 2 changes, FR1–FR11 and B1–B4 in both themes, including keyboard, contrast and screen-reader checks. Earlier rehearsals are archived as history. Timings depend on hardware; coverage and test counts should match.

## Samples and demonstrations

- **Sample calendars.** [docs/samples/](docs/samples/README.md) has six importable sample calendars: sparse week, back-to-back, overlap cluster, fully booked day, midnight crossing, and a 5,000-event stress test. Import them via **Settings → Data → Import JSON**, or load the same presets directly from the app.
- **Live-site smoke test.** Follow [TEST_PLAN §7](docs/TEST_PLAN.md#7-live-site-smoke-test-20-30-minutes) after deploying. The old D1–D5 scripts and production reports are [archived](docs/extras/MANUAL_VERIFICATION_HISTORY.md).
- **Screenshots** (in [docs/screenshots/](docs/screenshots/)):

| View                     | Light                                                                                                                                                                                                                                                                  | Dark                                                                                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Week                     | [1440 px](docs/screenshots/week-light-1440.png) · [1280 px](docs/screenshots/week-light-1280.png) · [1024 px](docs/screenshots/week-light-1024.png)                                                                                                                    | [1440 px](docs/screenshots/week-dark-1440.png) · [1280 px](docs/screenshots/week-dark-1280.png) · [1024 px](docs/screenshots/week-dark-1024.png)                                                                                                                   |
| Past time (expanded)     | [1440 px](docs/screenshots/past-time-expanded-light-1440.png) · [1280 px](docs/screenshots/past-time-expanded-light-1280.png) · [1024 px](docs/screenshots/past-time-expanded-light-1024.png)                                                                          | [1440 px](docs/screenshots/past-time-expanded-dark-1440.png) · [1280 px](docs/screenshots/past-time-expanded-dark-1280.png) · [1024 px](docs/screenshots/past-time-expanded-dark-1024.png)                                                                         |
| Barred slots             | [1440 px](docs/screenshots/barred-slots-light-1440.png) · [1280 px](docs/screenshots/barred-slots-light-1280.png) · [1024 px](docs/screenshots/barred-slots-light-1024.png)                                                                                            | [1440 px](docs/screenshots/barred-slots-dark-1440.png) · [1280 px](docs/screenshots/barred-slots-dark-1280.png) · [1024 px](docs/screenshots/barred-slots-dark-1024.png)                                                                                           |
| Kept overlaps            | [1440 px](docs/screenshots/barred-kept-light-1440.png) · [1280 px](docs/screenshots/barred-kept-light-1280.png) · [1024 px](docs/screenshots/barred-kept-light-1024.png)                                                                                               | [1440 px](docs/screenshots/barred-kept-dark-1440.png) · [1280 px](docs/screenshots/barred-kept-dark-1280.png) · [1024 px](docs/screenshots/barred-kept-dark-1024.png)                                                                                              |
| Legacy barred labels     | [1440 px](docs/screenshots/barred-legacy-light-1440.png) · [1280 px](docs/screenshots/barred-legacy-light-1280.png) · [1024 px](docs/screenshots/barred-legacy-light-1024.png)                                                                                         | [1440 px](docs/screenshots/barred-legacy-dark-1440.png) · [1280 px](docs/screenshots/barred-legacy-dark-1280.png) · [1024 px](docs/screenshots/barred-legacy-dark-1024.png)                                                                                        |
| Working hours off        | [1440 px](docs/screenshots/working-hours-off-light-1440.png) · [1280 px](docs/screenshots/working-hours-off-light-1280.png) · [1024 px](docs/screenshots/working-hours-off-light-1024.png)                                                                             | [1440 px](docs/screenshots/working-hours-off-dark-1440.png) · [1280 px](docs/screenshots/working-hours-off-dark-1280.png) · [1024 px](docs/screenshots/working-hours-off-dark-1024.png)                                                                            |
| Unshaded calendar        | [1440 px](docs/screenshots/working-time-off-light-1440.png) · [1280 px](docs/screenshots/working-time-off-light-1280.png) · [1024 px](docs/screenshots/working-time-off-light-1024.png)                                                                                | [1440 px](docs/screenshots/working-time-off-dark-1440.png) · [1280 px](docs/screenshots/working-time-off-dark-1280.png) · [1024 px](docs/screenshots/working-time-off-dark-1024.png)                                                                               |
| Categories               | [1440 px](docs/screenshots/categories-light-1440.png) · [1280 px](docs/screenshots/categories-light-1280.png) · [1024 px](docs/screenshots/categories-light-1024.png)                                                                                                  | [1440 px](docs/screenshots/categories-dark-1440.png) · [1280 px](docs/screenshots/categories-dark-1280.png) · [1024 px](docs/screenshots/categories-dark-1024.png)                                                                                                 |
| Five-region layout       | [1440 px](docs/screenshots/layout-light-1440.png) / [1280 px](docs/screenshots/layout-light-1280.png) / [1024 px](docs/screenshots/layout-light-1024.png)                                                                                                              | [1440 px](docs/screenshots/layout-dark-1440.png) / [1280 px](docs/screenshots/layout-dark-1280.png) / [1024 px](docs/screenshots/layout-dark-1024.png)                                                                                                             |
| Tasks / Planning drawers | [Tasks](docs/screenshots/layout-tasks-drawer-light-1024.png) / [Planning](docs/screenshots/layout-planning-drawer-light-1024.png)                                                                                                                                      | [Tasks](docs/screenshots/layout-tasks-drawer-dark-1024.png) / [Planning](docs/screenshots/layout-planning-drawer-dark-1024.png)                                                                                                                                    |
| Replan strategies        | [1440 px](docs/screenshots/replan-strategies-light-1440.png) / [1280 px](docs/screenshots/replan-strategies-light-1280.png) / [1024 px](docs/screenshots/replan-strategies-light-1024.png)                                                                             | [1440 px](docs/screenshots/replan-strategies-dark-1440.png) / [1280 px](docs/screenshots/replan-strategies-dark-1280.png) / [1024 px](docs/screenshots/replan-strategies-dark-1024.png)                                                                            |
| Replan Details           | [1440 px](docs/screenshots/replan-strategies-details-light-1440.png) / [1280 px](docs/screenshots/replan-strategies-details-light-1280.png) / [1024 px](docs/screenshots/replan-strategies-details-light-1024.png)                                                     | [1440 px](docs/screenshots/replan-strategies-details-dark-1440.png) / [1280 px](docs/screenshots/replan-strategies-details-dark-1280.png) / [1024 px](docs/screenshots/replan-strategies-details-dark-1024.png)                                                    |
| Done tasks               | [1440 px](docs/screenshots/done-tasks-light-1440.png) / [1280 px](docs/screenshots/done-tasks-light-1280.png) / [1024 px](docs/screenshots/done-tasks-light-1024.png)                                                                                                  | [1440 px](docs/screenshots/done-tasks-dark-1440.png) / [1280 px](docs/screenshots/done-tasks-dark-1280.png) / [1024 px](docs/screenshots/done-tasks-dark-1024.png)                                                                                                 |
| Bulk completion preview  | [1440 px](docs/screenshots/done-before-light-1440.png) / [1280 px](docs/screenshots/done-before-light-1280.png) / [1024 px](docs/screenshots/done-before-light-1024.png)                                                                                               | [1440 px](docs/screenshots/done-before-dark-1440.png) / [1280 px](docs/screenshots/done-before-dark-1280.png) / [1024 px](docs/screenshots/done-before-dark-1024.png)                                                                                              |
| Find time (slot picker)  | [1440 px](docs/screenshots/task-suggestions-light-1440.png) / [1280 px](docs/screenshots/task-suggestions-light-1280.png) / [1024 px](docs/screenshots/task-suggestions-light-1024.png)                                                                                | [1440 px](docs/screenshots/task-suggestions-dark-1440.png) / [1280 px](docs/screenshots/task-suggestions-dark-1280.png) / [1024 px](docs/screenshots/task-suggestions-dark-1024.png)                                                                               |
| Find time Details        | [1440 px](docs/screenshots/task-suggestions-details-light-1440.png) / [1280 px](docs/screenshots/task-suggestions-details-light-1280.png) / [1024 px](docs/screenshots/task-suggestions-details-light-1024.png)                                                        | [1440 px](docs/screenshots/task-suggestions-details-dark-1440.png) / [1280 px](docs/screenshots/task-suggestions-details-dark-1280.png) / [1024 px](docs/screenshots/task-suggestions-details-dark-1024.png)                                                       |
| Alternatives Details     | [1440 px](docs/screenshots/fixed-alternatives-details-light-1440.png) / [1280 px](docs/screenshots/fixed-alternatives-details-light-1280.png) / [1024 px](docs/screenshots/fixed-alternatives-details-light-1024.png)                                                  | [1440 px](docs/screenshots/fixed-alternatives-details-dark-1440.png) / [1280 px](docs/screenshots/fixed-alternatives-details-dark-1280.png) / [1024 px](docs/screenshots/fixed-alternatives-details-dark-1024.png)                                                 |
| Fixed-event search       | [off](docs/screenshots/fixed-alternatives-off-light-1440.png) · [1440 px](docs/screenshots/fixed-alternatives-on-light-1440.png) · [1280 px](docs/screenshots/fixed-alternatives-on-light-1280.png) · [1024 px](docs/screenshots/fixed-alternatives-on-light-1024.png) | [off](docs/screenshots/fixed-alternatives-off-dark-1440.png) · [1440 px](docs/screenshots/fixed-alternatives-on-dark-1440.png) · [1280 px](docs/screenshots/fixed-alternatives-on-dark-1280.png) · [1024 px](docs/screenshots/fixed-alternatives-on-dark-1024.png) |
| Replan with both plans   | [light](docs/screenshots/replan-light.png)                                                                                                                                                                                                                             | [dark](docs/screenshots/replan-dark.png)                                                                                                                                                                                                                           |
| Event dialog             | [light](docs/screenshots/event-dialog-light-1440.png)                                                                                                                                                                                                                  | [dark](docs/screenshots/event-dialog-dark-1440.png)                                                                                                                                                                                                                |
| Empty state              | [light](docs/screenshots/empty-light.png)                                                                                                                                                                                                                              | [dark](docs/screenshots/empty-dark.png)                                                                                                                                                                                                                            |
| Settings                 | [1440 px](docs/screenshots/settings-light-1440.png) · [900 px](docs/screenshots/settings-light-900.png)                                                                                                                                                                | [1440 px](docs/screenshots/settings-dark-1440.png) · [900 px](docs/screenshots/settings-dark-900.png)                                                                                                                                                              |

## Documentation

Appearance: [Light](docs/screenshots/appearance-light-1440.png) / [Dark](docs/screenshots/appearance-dark-1440.png). Fern accent: [Light](docs/screenshots/accent-fern-light-1440.png) / [Dark](docs/screenshots/accent-fern-dark-1440.png); the same scenes are captured at 1280 and 1024 px.

| Document                                     | Read it for                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [PROJECT_SCHEMA.md](docs/PROJECT_SCHEMA.md)  | What the app does: requirements, error handling, exact scheduling rules, domain model and UX      |
| [TECH_SPEC.md](docs/TECH_SPEC.md)            | How it is built: architecture, data types, algorithms with complexity, storage and the build plan |
| [TEST_PLAN.md](docs/TEST_PLAN.md)            | How it is verified: every test case, traceability, manual checks and demo scripts                 |
| [AUDIT.md](docs/extras/AUDIT.md)             | An independent review of the finished code, and how each finding was resolved                     |
| [BUG_REPORTS.md](docs/extras/BUG_REPORTS.md) | The fourteen peer bug reports: each verdict, its evidence and the fix                             |
| [PROGRESS.md](docs/progress/PROGRESS.md)     | The development log: each work item, its test results and the decisions made along the way        |
| [AUDIT_2.md](docs/extras/AUDIT_2.md)         | The binding Round 2 redesign decisions and implementation plan                                    |
| [PROMPTS.md](docs/extras/PROMPTS.md)         | The prompts that shaped the project; [Round 2 session prompt](docs/extras/PROMPT_ROUND_2.md)      |

**Deviations from our earlier design assignments.** These documents replace our three design assignments, which were written separately before any code existed. Merging them meant settling where they disagreed, and a few changes came from real constraints:

- The course requires a hosted URL, so the app became a static website. Browser storage (IndexedDB) replaced the SQLite database we had planned for a locally run app.
- Conflict detection uses a heap-based sweep. The simpler sweep in the early assignments misses some overlapping pairs.
- Events are stored in plain sorted arrays. A planned binary-search-tree upgrade was unnecessary at realistic sizes and was dropped.
- Features the assignments described only loosely (Replan, scheduling several tasks, priority-aware ranking) were given exact rules.

Each deviation is listed with its reason in [PROJECT_SCHEMA.md §9](docs/PROJECT_SCHEMA.md#9-deviations-from-the-submitted-assignments). Smaller decisions made during implementation are in the decisions log of [PROGRESS.md](docs/progress/PROGRESS.md) and in each document's change log.

## How this project was built (AI-assisted development)

Our course permits AI for any task, on one condition: each student must be able to explain every line in an oral examination.

- **What the team did.** We wrote the requirements and design, made every product decision, reviewed the work, tested the live app and reported problems.
- **What the AI agents did.** Most of the code was written by AI coding agents (OpenAI Codex and Anthropic Claude Code). They worked one at a time, handing over through the repository.
- **Why there are guardrails.** To keep code from several agents consistent, correct and explainable, we built a set of rules into the repository. These files show how:

```text
.
├── AGENTS.md                         # the rules every agent followed in every session
├── CLAUDE.md                         # points Claude Code at AGENTS.md
├── .agents/skills/disciplined-coding/SKILL.md   # our coding standard (the same file is in .claude/skills/)
├── .claude/settings.json             # commands agents could run; pushing and deploying were reserved for humans
└── docs/
    ├── PROJECT_SCHEMA.md, TECH_SPEC.md, TEST_PLAN.md   # the specification agents built against
    ├── progress/PROGRESS.md          # the work-item log and handover notes between sessions
    └── extras/                      # audits, peer reports, prompts and Round 2 planning evidence
```

What these rules meant in practice:

1. **The specification came first.** Agents built against the three documents above, not a chat history. The work was split into 59 numbered work items, with explicit completion checks before each counts as done.
2. **Every function carries a contract.** Our coding standard requires a written precondition and postcondition (`PRE` / `POST`) above every function and component, and an `INVARIANT` above every loop, before the code is written.
   - Open any file in `src/engine/algorithms/` to see them.
   - They make the reasoning reviewable, and they are what we study from for the oral exam.
3. **Tests come before code.** Algorithm and engine code was written test-first against the exact values in TEST_PLAN.md, then cross-checked by the randomised oracle tests.
4. **The architecture is enforced, not just described.** Lint rules stop the algorithms from importing UI, storage or date libraries, and coverage thresholds and CI stop regressions.
5. **Humans stayed in the loop.**
   - We tested every milestone on the live site.
   - A separate AI audit reviewed the code; each confirmed finding was fixed with a failing test first.
   - The full history is visible: each work item has its own branch, merged into `main` with its own commits.
