# TEST_PLAN.md — Interactive Calendar and Intelligent Time Planner

**Doc 3 of 3.** This file covers *how we prove it works*.

- Behaviour and rules (`FR`, `ER`, `BR`) are defined in `PROJECT_SCHEMA.md`.
- Types, file paths and algorithms are defined in `TECH_SPEC.md`.
- The expected values here are normative. If code disagrees, either the code is wrong or this doc gets fixed in the same PR (PROJECT_SCHEMA §0.2).

---

## 1. Strategy

### 1.1 Principles

1. **Test the algorithms hardest.** The pure modules in `src/engine/algorithms` are tested in isolation, and also against brute-force oracles on random inputs. The rest of the system mostly carries their results faithfully. This is A3's central claim, and it is kept.
2. **Test the engine through its facade.** Integration tests call `Engine` methods with a `MemoryRepository`. Repository-sensitive flows also run against `DexieRepository` on `fake-indexeddb`.
3. **Test the UI against the real engine** (never a mock), with React Testing Library. Real dragging is covered by 3 Playwright smoke tests.
4. **Regression discipline.** Every bug fix starts with a failing test, and the PR names the T-number it adds or changes.

### 1.2 Levels and tools

| Level | Tool | Environment | Location | Runs in CI |
|---|---|---|---|---|
| Unit (algorithms, time, schemas, state) | Vitest | node, `TZ=UTC` | `src/**/*.test.ts` | every PR |
| Property / oracle | Vitest + fast-check | node | `src/**/*.props.test.ts` | every PR (1,000 runs, seed 42) |
| DST | Vitest | node, `TZ=America/New_York` | `src/**/*.dst.test.ts` | every PR (`npm run test:dst`) |
| Integration (facade + repository) | Vitest | node (+ `fake-indexeddb/auto`) | `tests/integration/*.test.ts` | every PR |
| UI | Vitest + RTL + user-event | jsdom (`// @vitest-environment jsdom`) | `src/ui/**/*.test.tsx` | every PR |
| End-to-end smoke | Playwright (Chromium) | built app via `vite preview` | `e2e/*.spec.ts` | push to `main` + manual |
| Performance | `vitest bench` + gated assertion | node | `bench/`, `tests/integration/perf.test.ts` | manual / before each milestone |
| Manual | checklists §7, demos §8 | production URL | — | before each milestone |

### 1.3 Measurable targets

These are carried over from A3.

- **Coverage.** At least 90% lines, branches, functions and statements in `src/engine/algorithms/**`, and at least 70% overall. This is enforced by `vitest.config.ts` thresholds (TECH_SPEC §12).
- **Property tests.**
  - CI: all pass with `PROP_RUNS=1000` and `PROP_SEED=42`.
  - Before each milestone tag: `npm run test:props:full`, which runs 10,000 cases with a random seed. Any failing seed is printed, then added as a fixed regression case.
- **Performance.** T15 has a median under 100 ms.
- **End-to-end.** E1–E3 all pass on `main` before each milestone.

---

## 2. Shared test helpers (`tests/helpers/`) — build these in WI-07

All examples below use these helpers. Tests run with `TZ=UTC`, so local time equals UTC.

```ts
// time.ts
export const BASE_MONDAY = atLocal('2026-11-02', '00:00');   // Monday 2 Nov 2026
/** t('Mon 10:00') … t('Sun 23:30') → that time in the base week (Mon 2 – Sun 8 Nov 2026).
 *  t('2026-11-01 09:00') → explicit local date-time. */
export function t(spec: string): Minute;

// builders.ts
export function ev(id: string, start: string, end: string, o?: Partial<CalendarEvent>): CalendarEvent;
//   defaults: title = id, description '', category 'meeting', priority 'medium', flexible false,
//   flexWindow null, taskId null, createdAt/updatedAt = BASE_MONDAY
export function flexEv(id: string, start: string, end: string, win: [string, string], o?: Partial<CalendarEvent>): CalendarEvent;
export function task(id: string, durationMin: number, win: [string, string], o?: Partial<Task>): Task;
//   defaults: name = id, priority 'medium', category 'assignment', useWorkingHours true, unscheduled
export function settings(o?: Partial<Settings>): Settings;          // DEFAULT_SETTINGS + overrides
export const iv = (a: string, b: string): Interval => ({ start: t(a), end: t(b) });

// engine.ts
export async function makeEngine(o?: { events?: CalendarEvent[]; tasks?: Task[]; settings?: Settings;
  now?: string /* default 'Mon 00:00' */; repo?: Repository }): Promise<{ engine: Engine; repo: Repository }>;
//   seeds repo via replaceAll, then engine.init(); newId yields 'id-1', 'id-2', …

// oracle.ts
export function bruteForceConflicts(events: CalendarEvent[]): { key: string; overlap: Interval; minutes: number }[]; // O(n²)
export function bitmapGaps(segments: Interval[], events: Interval[], bufferMin: number): Interval[];             // minute array

// props.ts — fast-check settings for every *.props.test.ts (§1.3)
export function propParams(): { numRuns: number; seed?: number };  // PROP_RUNS (default 1000), PROP_SEED (default 42; 'random' omits it)
export const PROP_TIMEOUT_MS: number;                               // per-test timeout, large enough for 10,000 runs

// failingRepository.ts
export class FailingRepository implements Repository {   // wraps MemoryRepository
  failNextApply(): void; failNextSaveSettings(): void;
}
```

Unless a test says otherwise:
- settings are `DEFAULT_SETTINGS` (Mon–Fri 09:00–18:00, buffer 0, no barred slots, criterion `earliest`)
- `now` is `Mon 00:00`

---

## 3. Requirement traceability

| Requirement | Tests |
|---|---|
| FR1 Create event | T5, T13, E1 |
| FR2 Edit / move / resize | T13, T14, T21, E2 |
| FR3 Delete event | T13, T16 |
| FR4 Conflict detection | T1, T2, T3, T4, T7, T12, T14 |
| FR5 Best-time finder | T6, T7, T8, T9, T10, T11, T18, T19, T28, T33, T34, E3 |
| FR6 Priority sort / filter | T30 |
| FR7 Conflict resolution | T20, T21 |
| FR8 Task management + sync | T16, T31 |
| FR9 Scheduling queue | T17 |
| FR10 Replan | T22, T23, T35 |
| FR11 Settings | T11, T19, T29 |
| ER1 Invalid time / input | T5, T31 |
| ER2 Task longer than window | T8, T19, T28 |
| ER3 No slot found | T9, T11 |
| ER4 Conflicting move allowed with warning | T14, T21 |
| ER5 Storage failure | T26 |
| ER6 Invalid import | T25 |
| ER7 Stale result | T27 |
| B1 Undo / redo | T24, T36 |
| B2 Import / export / samples | T25 |
| B3 Dark mode, B4 Shortcuts | T32 |
| NFR1 Responsiveness | T15 |
| NFR3 Correctness | T12, T33, T34, T35, T36, coverage thresholds |
| NFR5 Modularity | `npm run lint` (boundary rules, TECH_SPEC §3.2) |
| NFR8 Accessibility | §7 checklist, T14 (text labels), T32 |

---

## 4. Test catalogue

All times are on Mon 2 Nov 2026 unless a day is given. Intervals are half-open.

- "Window" is the task window. "Options" means `SlotSearchResult.options`, in rank order.
- `A|B` is a conflict key.
- Every failing command must also leave `engine.snapshot()` deep-equal to the snapshot before it, including `version`, and leave the repository contents unchanged. This is the **unchanged-state check**.

### 4.1 Kept from A3 (T1–T15), with values made exact

| Test | Layer | Input / scenario | Expected output | Purpose |
|---|---|---|---|---|
| **T1** | unit `sweep` | A 10:00–11:30, B 11:00–12:00 | 1 conflict `A\|B`, overlap 11:00–11:30, minutes 30 | The spec's canonical example |
| **T2** | unit `sweep` | A 10:00–11:00, B 11:00–12:00 | 0 conflicts | Touching endpoints are not a conflict (BR-2) |
| **T3** | unit `sweep` | A 09:00–12:00, B 10:00–11:00, C 10:30–11:30 | Exactly 3, in this order: `A\|B` 10:00–11:00 (60); `A\|C` 10:30–11:30 (60); `B\|C` 10:30–11:00 (30) | Catches a running-max sweep that misses `B\|C` |
| **T4** | unit `sweep` | A Mon 23:00–Tue 01:00, B Tue 00:30–01:30 | `A\|B`, overlap Tue 00:30–01:00, 30 min | Midnight crossing with absolute minutes |
| **T5** | schema + facade + UI | (a) `createEvent` with end 09:00 < start 10:00<br>(b) start = end = 10:00<br>(c) a 25 h event<br>(d) title `"   "`<br>(e) `flexible: true, flexWindow: null`<br>(f) flex window 30 min for a 60 min event | (a) `InvalidTime`, issue path `end`, "End time must be after the start time."<br>(b) `InvalidTime`, path `end`<br>(c) `InvalidTime`, path `end`, "Events can be at most 24 hours long."<br>(d) `InvalidInput`, path `title`<br>(e) `InvalidInput`, path `flexWindow`<br>(f) `InvalidTime`, path `flexWindow`<br>All of them pass the unchanged-state check.<br>**UI:** the EventDialog with end before start shows the message under **End**, stays open, keeps the typed values, and does not call the engine. | ER1 |
| **T6** | facade `findSlots` | Events 09:00–10:00, 10:30–12:00, 13:00–14:00. Window Mon 09:00–18:00. Task 90 min, criterion `earliest`. | `freeGaps` = 10:00–10:30, 12:00–13:00, 14:00–18:00. `fittingCount` = 1. One option: slot 14:00–15:30, `gapMin` 240, `leftoverMin` 150, `before` = event boundary (the 13:00–14:00 event, at 14:00), `after` = edge `workEnd` at 18:00. | Merge → complement → filter |
| **T7** | facade | Events X 09:00–11:00, Y 10:00–12:00. Window 09:00–13:00. Task 60. | The snapshot has conflict `X\|Y` 10:00–11:00 (60). Busy is merged to 09:00–12:00. `freeGaps` = [12:00–13:00]. One option, 12:00–13:00, leftover 0, `before` = event Y at 12:00. | Overlapping busy time is not double-counted |
| **T8** | facade | Task 600 min (10 h), window 09:00–18:00 | `TaskLongerThanWindow {durationMin: 600, longestStretchMin: 540}`. No search is run. **UI:** "…needs 10 h, but the longest stretch available in its window is 9 h. Shorten the task or widen the window." | ER2 |
| **T9** | facade + UI | Events 09:00–12:00 and 12:15–18:00. Window 09:00–18:00. Task 30. | `NoSlotFound {durationMin: 30, largestGapMin: 15, largestGap: 12:00–12:15, bufferMin: 0}`. **UI:** the picker shows "No free slot of 30 min in this window. The largest free gap is 15 min (Mon 2 Nov 12:00–12:15)…", not an empty list. | ER3 |
| **T10** | facade | Window Mon 10:00–16:40, event X 14:00–15:00, task 90 | `freeGaps` = 10:00–14:00 (240) and 15:00–16:40 (100). **`earliest`:** [10:00–11:30 (leftover 150), 15:00–16:30 (leftover 10)]. **`bestFit`:** [15:00–16:30, 10:00–11:30]. The first gap's `before` is edge `windowStart`, and the second gap's `after` is edge `windowEnd`. | The ranking criteria really differ |
| **T11** | facade | Event 10:00–11:00, window 09:00–12:00, task 60. Run with (i) buffer 0, (ii) `settings.bufferMin = 15`, (iii) buffer 0 in settings but `findSlots({bufferMin: 15})` | (i) options [09:00–10:00, 11:00–12:00]. (ii) and (iii) `NoSlotFound {largestGapMin: 45, largestGap: 09:00–09:45, bufferMin: 15}`. The free time is 09:00–09:45 and 11:15–12:00. | Buffer from settings and as an override (FR11) |
| **T12** | property `sweep` | `PROP_RUNS` random event sets: n ≤ 200, starts in [0, 2000), lengths in [1, 300], integers | `detectConflicts(sort(events))` has the same keys, overlaps and minutes as `bruteForceConflicts`, in the same order | Soundness and completeness of the sweep (NFR3) |
| **T13** | integration, run with **both** Memory and Dexie repositories | Through the facade: create A 10:00–11:00 and B 12:00–13:00; edit A's end to 11:30; move A to 12:30–13:30; delete B | After each step, the returned conflicts and the reloaded repository rows match:<br>(1) 0 conflicts, rows {A, B}<br>(2) 0 conflicts, A ends 11:30<br>(3) `A\|B` 12:30–13:00 (30), `introducedConflicts` has length 1<br>(4) 0 conflicts, `resolvedConflicts` has length 1, rows {A 12:30–13:30}<br>Reloading a fresh engine from the same repository gives the same snapshot (apart from history). | Event CRUD pipeline plus persistence (FR1–FR4) |
| **T14** | UI (jsdom) | App store on a real engine + MemoryRepository, seeded with A 10:00–11:30 (High) and B 13:00–14:00 (Medium). Call `calendarHandlers.onDrop` with a fake `info` that moves B to 11:00–12:00 and has `revert: vi.fn()`. Then repeat with a `FailingRepository` set to fail. | **Success:**<br>- `revert` is not called<br>- the store has conflict `A\|B` 11:00–11:30 (30)<br>- ConflictPanel shows "Mon 2 Nov 11:00–11:30 (30 min)"<br>- `EventContent` for both events renders the text "Conflict 30 min" and the tags "[H]" / "[M]"<br>- the warning toast says "Saved with a conflict"<br>**Failure:**<br>- `revert` is called once<br>- the error toast says "Couldn't save your change. Nothing was changed."<br>- the store snapshot is unchanged | FullCalendar ↔ engine sync, conflict feedback, ER4, ER5 |
| **T15** | performance | 5,000 events generated with `mulberry32(7)` over 100 weeks: 10 per working day, 20–60 min, on a jittered grid, so k is small. Run `detectConflicts` over all events, plus `findSlots` for a 60 min task whose window covers the first 4 weeks. | Median of 11 runs under 100 ms. The benchmark report prints k. The assertion lives in `tests/integration/perf.test.ts` behind `it.runIf(process.env.PERF)`. | NFR1 |

### 4.2 Added tests (T16–T36)

| Test | Layer | Input / scenario | Expected output | Purpose |
|---|---|---|---|---|
| **T16** | integration | Task R "Write report", 90 min, High, window Mon 09:00–Fri 18:00. Steps: (1) `scheduleTask` at Mon 14:00–15:30; (2) `updateEvent` title "Final report", end 16:00; (3) `updateTask` duration 60; (4) `deleteEvent`; (5) schedule again at Tue 09:00–10:00 (60 min, the duration since step 3), then `deleteTask` | (1) The event has `taskId` R, `flexible` true, `flexWindow` = R's window and priority High. R is `scheduled` with `scheduledEventId` = the event's ID.<br>(2) R's name is "Final report" and its `durationMin` is 120.<br>(3) The event is 14:00–15:00, with its start kept.<br>(4) The event is gone, R is `unscheduled` with `scheduledEventId` null, and R still exists.<br>(5) Both the task and its event are gone.<br>Each step adds exactly one undo entry. | BR-9 sync (FR8) |
| **T17** | integration + UI | Tasks created in order: L1 (Low, 60), H1 (High, 60), M1 (Medium, 60). All have window Mon 09:00–12:00. Empty calendar, criterion `earliest`. | `orderForScheduling([L1, H1, M1])` = `[H1, M1, L1]`.<br>Applying `options[0]` each time gives H1 at 09:00–10:00, then M1 at 10:00–11:00 (the search sees H1), then L1 at 11:00–12:00.<br>**Skip variant:** skipping M1 puts L1 at 10:00–11:00.<br>A scheduled task passed to `orderForScheduling` is dropped.<br>**UI:** the picker header reads "Task 1 of 3", then "Task 2 of 3". At the end the toast reads "Scheduled 3 of 3 tasks" (skip variant: "Scheduled 2 of 3 tasks (1 skipped)"). | FR9, BR-11 |
| **T18** | facade | Window Mon 09:00–Wed 18:00. Events: Mon 09:00–13:00; Tue 09:00–10:00 and 11:00–18:00; Wed 09:00–10:00. Task 60, criterion `priorityAware`, with priority High, then Medium, then Low. | Gaps: Mon 13:00–18:00 (load 240), Tue 10:00–11:00 (load 480), Wed 10:00–18:00 (load 60).<br>**High** (effective `earliest`): [Mon 13:00, Tue 10:00, Wed 10:00].<br>**Medium** (`bestFit`): [Tue 10:00, Mon 13:00, Wed 10:00].<br>**Low** (`leastLoaded`): [Wed 10:00, Mon 13:00, Tue 10:00].<br>Each option's `effectiveCriterion` matches, and its `dayLoadMin` is as listed. | BR-7 priority mapping |
| **T19** | facade | Barred slot "Lunch" 13:00–14:00, Mon–Fri. Empty calendar. Window Mon 12:00–15:00. (i) task 90; (ii) task 60; (iii) `createEvent` 13:00–13:30 | (i) `TaskLongerThanWindow {90, 60}`.<br>(ii) options [12:00–13:00 with `after` = barred "Lunch" at 13:00, 14:00–15:00 with `before` = barred "Lunch" at 14:00].<br>(iii) succeeds: barred slots never block manual events. | BR-5, FR11 |
| **T20** | facade | Lecture: fixed, High, Mon 10:00–12:00. Meeting: flexible, Medium, Mon 11:00–12:00, flex window Mon 09:00–18:00. | The conflict `Lecture\|Meeting` has `targetId` Meeting.<br>`suggestAlternatives({eventId: Meeting})` gives [12:00–13:00 (distance 60), 09:00–10:00 (distance 120)].<br>`applyAlternative` with the top option leaves 0 conflicts and `resolvedConflicts` of length 1.<br>**Toggle:** `suggestAlternatives({eventId: Lecture})` has `searchWindow` = Sun 1 Nov 00:00 → Wed 4 Nov 00:00 and options [Mon 09:00–11:00 (60), Mon 12:00–14:00 (120), Tue 09:00–11:00 (1380)]. | FR7, BR-10 |
| **T21** | facade + UI | Same two events as T20, but Meeting starts at Mon 14:00–15:00. Call `moveEvent(Meeting, 11:00–12:00)`. | `ok`. The snapshot has Meeting at 11:00–12:00 (not blocked). `introducedConflicts` = [`Lecture\|Meeting` 11:00–12:00 (60)]. `suggestion.slot` = 12:00–13:00.<br>**UI:** the warning toast has a "Move to Mon 2 Nov 12:00–13:00" button, and clicking it resolves the conflict. | ER4 |
| **T22** | facade `planReplan` | Range Mon 2 Nov 00:00 → Sat 7 Nov 00:00, buffer 0. Events:<br>- Lecture: fixed, High, Mon 10:00–12:00<br>- Study: flexible, Low, Mon 11:00–12:00, window Mon 09:00–Fri 18:00<br>- Gym: flexible, Medium, Tue 15:00–16:00, same window | `movableCount` 2 (processed Gym, then Study).<br>**Minimal change:** moves = [Study: Mon 11:00–12:00 → Mon 12:00–13:00, reason `conflict` with Lecture]. Gym is kept. Metrics: moved 1, totalShift 60, conflicts 1 → 0, spread 180 → 180, unplaced 0.<br>**Balanced:** moves = [Study → Wed 09:00–10:00, reason `conflict` with Lecture]. Gym is unchanged (Tue is a least-loaded day and is nearest). Metrics: moved 1, totalShift 2760, conflicts 1 → 0, spread 180 → 120. | BR-12; fixed events never move |
| **T23** | facade | (a) Lecture: fixed, Mon 10:00–12:00. Read: flexible, Low, Mon 14:00–15:00, window Mon 09:00–Fri 18:00. Range as in T22.<br>(b) `applyReplan('balanced')` on (a), then `undo()` | (a) **Minimal change:** 0 moves (the plan card shows "No changes needed"). **Balanced:** [Read → Tue 09:00–10:00, reason `balance` 120 → 0]. Spread 180 → 120.<br>(b) After apply, Read is at Tue 09:00 and the label is "Replan: 1 event moved". After undo, Read is back at Mon 14:00. | Balance reason; one undo step |
| **T24** | integration | (1) Create A Mon 10:00–11:00; (2) move A to 12:00–13:00; (3) delete A; then undo ×3, redo ×2, then create B. Separately, 55 creates. Separately, undo a `scheduleTask`. | After the 3 undos the calendar is empty and `canUndo` is false. After the redos, A is at 12:00–13:00. Creating B makes `canRedo` false. The undo labels read "Delete "A"", and so on. After each step the repository rows equal the snapshot. 55 creates leave 50 undo entries. Undoing `scheduleTask` removes the event and sets the task back to `unscheduled`. | B1 |
| **T25** | integration | (a) Load the `sparseWeek` sample, export, and import into a fresh engine.<br>(b) Import invalid inputs: `"not json"`; `format: "other"`; events[3] with end < start; two events with the same ID; a scheduled task whose event is missing. | (a) The events, tasks and settings are deep-equal, `version` increases, `canUndo` is false, and the conflicts are the same.<br>(b) Each gives `InvalidImport` with issue paths `''`, `'format'`, `'events.3.end'`, `'events'` (duplicate ID) and `'tasks.N.scheduledEventId'`. Each passes the unchanged-state check. **UI:** the toast reads "That file isn't a valid calendar export: events[3].end — End time must be after the start time." (numeric path segments are shown in brackets). | B2, ER6 |
| **T26** | integration | `FailingRepository.failNextApply()`, then `createEvent` | `StorageError`, unchanged-state check, the history is unchanged. The next `createEvent` succeeds. `failNextSaveSettings()` → `updateSettings` gives `StorageError` and the settings are unchanged. | ER5 |
| **T27** | integration + UI | `findSlots(task)` at version v. Then `createEvent` elsewhere (v + 1). Then `scheduleTask({slot: options[0].slot, baseVersion: v})`. Also `planReplan`, then `updateSettings`, then `applyReplan`. | `StaleResult` in both cases, and the data is unchanged. **UI:** on `StaleResult` the picker shows "The calendar changed since these options were computed. Refreshing…" and re-runs `findSlots`. | ER7 |
| **T28** | facade | `now` = Mon 12:07.<br>(a) Task 60, window Mon 09:00–18:00, empty calendar.<br>(b) Task 60, window Mon 09:00–11:00.<br>(c) Flexible event Mon 11:00–12:00 in the replan range. | (a) First option 12:10–13:10; its gap is 12:10–18:00 with `before` = edge `now`.<br>(b) `TaskLongerThanWindow {60, 0}`, and the UI shows the "no available time" variant.<br>(c) The event is not counted in `movableCount` and never appears in moves. | BR-5 `notBefore`, BR-12 |
| **T29** | DST (`*.dst.test.ts`, `TZ=America/New_York`) | `now` = `2026-11-01 00:00` (otherwise the default `Mon 00:00` would clip the whole window). Settings `workDays` 0–6. `buildDayFrames` for Sun 2026-11-01 (DST ends 02:00 → 01:00). Task 540 min, window `atLocal('2026-11-01','00:00')` → `atLocal('2026-11-02','00:00')`. | Frame `dayEnd − dayStart` = 1500. `work.start − dayStart` = 600. `work` length = 540. `atLocal` / `localMinuteOfDay` round-trip at 09:00. The only option is local 09:00–18:00. | R3 time handling |
| **T30** | unit selectors + UI | Tasks: A (Low, window end Fri), B (High, Thu), C (Medium, Wed), D (High, Wed). Calendar filter test: events of all priorities, including a conflicting Low one. | Sort by priority → D, B, C, A. Sort by window end → D, C, B, A. A Medium filter shows only C. A calendar filter of High: `fcEvents` contains only High events, `snapshot.events` is unchanged (same reference), and the ConflictPanel still lists the Low conflict with "(hidden by filter)". | FR6 |
| **T31** | schema + facade + UI | `createTask` with: duration 0, −5, `NaN`, 1441, 2.5; window end ≤ start; name `"  "` | Durations give `InvalidInput`, path `durationMin`, with the messages in TECH_SPEC §6. The window gives `InvalidTime`, path `window.end`. The name gives `InvalidInput`, path `name`. All pass the unchanged-state check. **UI:** TaskDialog with an empty duration shows "Duration must be a number." under Duration. | ER1 for tasks |
| **T32** | UI | (a) Press `N`. (b) Press `N` while focused in a text input. (c) Press Ctrl+Z after creating an event. (d) Press `?`. (e) Click the theme toggle ×3. | (a) The event dialog opens. (b) Nothing happens. (c) The event is removed and the toast reads "Undid: Create "…"". (d) The help overlay lists every key in PROJECT_SCHEMA §7.6. (e) `documentElement.dataset.theme` goes light → dark → absent (system), and `localStorage['fc-theme']` follows. | B3, B4 |
| **T33** | property `gaps` | Random disjoint segments in [0, 3000), random events (lengths 1–300), buffer 0–30 | The intervals of `freeGaps(segments, mergeBusy(sort(events), b))` equal `bitmapGaps(...)` | Gap search is exact (NFR3) |
| **T34** | property `rank` | Random gaps, duration, criterion, priority, `originalStart` (or null), and day loads | Every option: length = d; inside its gap; ranks are 1..k with k ≤ 5; options are sorted by the BR-7 key; `leftoverMin = gapMin − d` | Option validity |
| **T35** | property `replan` | Random static and flexible events within one week, random flex windows, random buffer 0–30 | For both plans: no fixed event and no event starting before `notBefore` is moved. Every `to` lies inside one allowed segment of `flexWindow ∩ range`. After applying, placed movable events overlap no static event, and no other placed movable event, even with each expanded by the buffer. `metrics.moved = moves.length`. | Replan safety |
| **T36** | property `undo` | A random sequence (≤ 20) of create, move, delete, createTask, scheduleTask and deleteTask commands on MemoryRepository | Undo-all gives events and tasks equal to the initial state. Redo-all gives the final state. At every step the repository's contents equal the snapshot. | B1 correctness |

### 4.3 Module unit tests (not numbered; required by coverage)

| File | Must cover |
|---|---|
| `interval.test.ts` | `overlaps` for touching, nested, identical and disjoint intervals; `overlapOf` returning null; `contains` at its edges |
| `sortedArray.test.ts` | `compareEvents` tie-breaks; `insertSorted` keeps order and does not mutate its input; `eventsIntersecting` includes an event that started 23:00 the previous day and ends inside the window, and excludes events touching either window edge |
| `minHeap.test.ts` | Push and pop order with duplicates; `peek` on empty; `items()` contains everything pushed and not yet popped |
| `merge.test.ts` | Touching intervals merge; nested intervals; buffer expansion; `startEvent` / `endEvent` attribution |
| `segments.test.ts` | Window clipping sets `windowStart` / `windowEnd`; a barred slot splits a segment; `now` clipping; non-working days are skipped; with `useWorkingHours = false`, adjacent days merge across midnight |
| `gaps.test.ts` | A block spanning two segments; a block before the first segment; boundaries on both sides |
| `dayLoad.test.ts` | An event crossing the edge of working hours is clipped; overlapping events are summed; `loadSpread` with 0 working days |
| `rank.test.ts` | Each criterion's key and tie-break (earlier start, then gap index); the `clamp` placement when an original start is given |
| `target.test.ts` | Each of the 5 rules of BR-10 decides at least once |
| `taskOrder.test.ts` | Each of the 5 keys of BR-11 decides at least once |
| `time.test.ts` | `toMinute` / `fromMinute` round-trip; `ceilTo`; `atLocal`; `buildDayFrames` over a week (5 work frames, barred slots only on their days) |
| `state.test.ts` | `applyChange` forward and backward; `commit` with a rejecting repository leaves the state untouched; history limit; redo cleared on `do` |
| `schemas.test.ts` | Every message in TECH_SPEC §6; mapping to `InvalidTime` vs `InvalidInput` |
| `format/*.test.ts` | `fmtDuration` (45 → "45 min", 60 → "1 h", 90 → "1 h 30 min"); `fmtRange` across midnight; every `EngineError` code has a message |

---

## 5. UI tests (RTL) — additional required cases

These are part of their WI's definition of done in TECH_SPEC §14.

| Component | Case |
|---|---|
| EventDialog | The category "class" defaults to fixed and "assignment" to flexible. Flex window fields appear only when flexible is on. Delete asks for confirmation. Editing a task-linked event disables the flexible toggle. |
| TaskDialog | Duration hours + minutes map to `durationMin`. Find time / Unschedule / Delete are only shown in edit mode, as appropriate. |
| SlotPicker (task) | The summary line reads "3 free gaps in window (30 min, 1 h, 4 h) — 1 fits 1 h 30 min" (T6 data). The options are a radio group with an accessible name. Switching the criterion re-orders the options (T10 data). |
| SlotPicker (alternatives) | Shows the target. The toggle switches the target and the options (T20 data). Each option states "N min earlier/later". |
| ReplanDialog | It defaults to the visible week, shows two cards with their metrics, Apply calls `applyReplan`, and the empty case says "No flexible events in this range". |
| SettingsDialog | Rejects work end ≤ start inline. Adds and removes a barred slot. Export triggers a download (spy on `URL.createObjectURL`). |
| Toasts | Live region: error toasts are `aria-live="assertive"`, others `polite`. The ER5 toast is sticky with Retry. |
| App | Empty state shows "Load sample week"; clicking it loads `sparseWeek` and shows 1 conflict. The degraded-mode banner shows when the store is created with `storageWarning`. |

---

## 6. End-to-end smoke tests (Playwright, `e2e/`)

Each test does `page.clock.install({ time: new Date('2026-11-02T08:00:00') })` before `goto('/')`, so "this week" is the base week. Each test starts with fresh storage (new context).

`e2e/calendar.spec.ts` implements E1–E3; shared UI setup lives in `e2e/helpers.ts`. E2 creates E1's fixture independently, then uses real pointer gestures whose distances come from rendered time rows; no engine or store calls drive the gestures. E3 selects the panel's All status filter so the newly scheduled row remains visible.

| ID | Flow | Assertions |
|---|---|---|
| **E1** | + Event "A", Mon 10:00–11:30 → Save. + Event "B", Mon 11:00–12:00 → Save. | Both blocks contain the text "Conflict". The conflict panel shows "11:00–11:30 (30 min)". |
| **E2** | Continuing E1: drag B's block to Mon 13:00, then drag its bottom edge to 14:30. | The conflict panel shows "No conflicts". B's block reads "13:00–14:30". After a reload the position persists (IndexedDB). |
| **E3** | + Task "Report", 1 h 30 min, window this week → Save → Find time → Apply the first option. | The task row shows "Scheduled". A block "Report" with the tag "Task" appears at the slot shown in the picker. |

---

## 7. Manual checklists (run on the production URL before each milestone)

### 7.1 Accessibility

Local automated evidence (WI-25/26): `src/ui/styles/tokens.test.ts` checks light/dark foreground pairs; `e2e/accessibility.spec.ts` checks desktop widths, drawer, minimum control targets, dialog keyboard/focus behavior and List event names/editing. The production devtools and live screen-reader items below still need a human check.

- [ ] Every conflict is identifiable without colour: the ⚠ icon plus the word "Conflict".
- [ ] Every priority is identifiable without colour: the [H] / [M] / [L] tag.
- [ ] Text contrast is at least 4.5:1 in light and dark mode, checked with the browser devtools contrast picker on:
  - [ ] event text on each priority background
  - [ ] muted text
  - [ ] toasts
- [ ] Every dialog is fully operable with the keyboard alone. Focus is trapped, `Esc` closes the dialog, and focus returns to its trigger.
- [ ] An event can be moved and resized through the event dialog, without a mouse.
- [ ] The List view reads sensibly with a screen reader (VoiceOver or NVDA quick pass). Toasts are announced.
- [ ] Click targets are at least 32 px. The layout works at 1280 px and 1024 px, and the drawer works below 1024 px.

### 7.2 UX sanity

- [ ] No action changes data without either a direct edit or an explicit *Apply* (BR-14).
- [ ] Every error message says what went wrong **and** what to do next.
- [ ] Loading the `stress` sample shows a spinner, and the week view stays responsive after it loads.
- [ ] Dark mode has no unreadable FullCalendar parts (headers, now-indicator, list view).

---

## 8. Demonstration scripts (deliverables: calendar, conflict and best-time demos)

Each demo starts from **Settings → Data → Load sample calendar**.

| ID | Sample | Script (≈ 1–2 min each) | Shows |
|---|---|---|---|
| **D1** Calendar | `sparseWeek` | Create an event by dragging on empty time. Edit its title and priority. Drag it to another day. Resize it. Delete it. Then Undo ×2 and Redo. | FR1–FR3, B1 |
| **D2** Conflicts | `sparseWeek`, then `overlapCluster`, `midnight`, `backToBack` | Point at the Tue Lecture ↔ Meeting conflict: icon, label, overlap and minutes. Suggest alternatives → Apply. `overlapCluster` shows 15 pairs listed. `midnight` shows a conflict across midnight. `backToBack` shows touching events with 0 conflicts. | FR4, FR7, ER4 |
| **D3** Best time | `sparseWeek`, then `fullyBooked` | Select the 45 min and 90 min tasks → Find time for 2 → the queue applies the first and skips the second. On a third task, switch the criterion between Earliest, Best fit and Priority-aware and show the order changing, then read one explanation aloud. Show the 10 h task (ER2). On `fullyBooked`, the 30 min Thursday task gives ER3 with "largest gap 15 min". | FR5, FR9, ER2, ER3 |
| **D4** Replan | `sparseWeek` | Replan → set buffer 10 → Compute. Compare Minimal change vs Balanced week (moves, reasons, spread). Apply Balanced, then Undo. | FR10, B1 |
| **D5** Extras | any | Add Lunch 13:00–14:00 as a barred slot and show the hatching on the calendar and the "Lunch" boundary in an explanation. Show dark mode, then `?` shortcuts, then Export, Clear all data, Import. | FR11, B2–B4 |

**Sample inputs deliverable.** `src/data/samples/*` plus an exported JSON of each sample, committed to `docs/samples/` (WI-30).

---

## 9. Release checklist (definition of done for the whole project)

- [ ] Every FR acceptance criterion in PROJECT_SCHEMA §4 is demonstrably met (D1–D5).
- [ ] `npm run typecheck`, `lint`, `test:coverage` (thresholds met), `test:dst` and `build` pass on `main`.
- [ ] `npm run test:props:full` passes. Any seeds it found are added as regression cases.
- [ ] `npm run e2e` passes (E1–E3).
- [ ] `npm run test:perf` gives a T15 median under 100 ms (portable `PERF=1 npm test -- perf`). The printed numbers are pasted into `README.md`.
- [ ] The production URL is live and in `README.md`. A fresh browser shows the empty state with "Load sample week".
- [ ] `README.md` covers setup (`npm ci`, `npm run dev`), tests, deployment, the architecture summary (links to the three docs), and the production URL.
- [ ] The change logs of all three docs are updated, and `docs/PROGRESS.md` is fully ticked.
- [ ] Viva prep: each member can explain, without notes:
  - [ ] the heap sweep and why the running-max version fails T3
  - [ ] merge, complement and gaps with the buffer
  - [ ] the BR-7 ranking keys
  - [ ] the greedy order in replan and its limitation
  - [ ] the undo model (before- and after-images)
  - [ ] why Dexie replaced SQLite

---

## 10. Change log

| Date | Change |
|---|---|
| 2026-10-25 | v1.0: unified test plan. Kept A3 T1–T15 with exact values; added T16–T36, E1–E3 and D1–D5. |
| 2026-10-26 | v1.1 (WI-08): §2 lists `tests/helpers/props.ts` (`propParams`, `PROP_TIMEOUT_MS`). |
| 2026-10-26 | v1.2 (WI-14): T16 step (5) schedules at Tue 09:00–10:00, not 10:30. Step (3) set the duration to 60, and `scheduleTask` rejects a slot that does not match it (TECH_SPEC §7.4.3). |
| 2026-10-26 | v1.3 (WI-25–27): §6 documents executable E1–E3 and their isolated UI fixtures; §7 records local automated accessibility evidence while retaining human production checks. |
| 2026-10-26 | v1.4 (WI-28): §9 uses the portable `test:perf` script for T15; the gated assertion measures eleven combined-query runs and prints k and the median. |
