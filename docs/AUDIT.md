# int-calendar audit

| Marker | Value |
| --- | --- |
| Audit ID | INT-CALENDAR-2026-10-26-01 |
| Auditor | Codex |
| Started | 2026-10-26 09:25:34 IST (UTC+05:30) |
| Review completed | 2026-10-26 09:34:22 IST (UTC+05:30) |
| Source baseline | `bde3387d50bc1ec912fb2b1206ba1c256e1ceec8` on `main` |
| Scope | Functional correctness, persistence, validation, scheduling, replan, UI behavior, redundancy, and test adequacy |
| Method | Documentation-first source review; existing automated checks; isolated, in-memory reproduction checks |
| Changes by auditor | This report only; no application/test/config edits, branch changes, commits, or persistent app-data changes |

The concurrent UI agent started WI-34 on `feat/wi-34-visual-refresh` during this review. Findings refer to the baseline above. At report verification, its latest commit was `bbce017`, with an additional Toolbar edit in progress. Engine, shared, data, forms, store, and the components cited in findings remained unchanged from the baseline. Concurrent styling/Toolbar changes are excluded and need their own verification.

## Assessment

The architecture is clear and the existing suite is substantial, but passing tests do not establish complete workflow correctness. Ten functional findings follow: **2 high priority (P1)** and **8 medium priority (P2)**. Three lower-priority cleanup opportunities and two contract/usability notes follow separately. No fixes were attempted.

P1 means a persistent failure or a significant scheduling-safety problem. P2 means incorrect behavior under a specific workflow or input. “Reproduced” means execution against actual repository modules compiled in memory, using isolated memory repositories; “source-confirmed” means traced through code without a new browser test.

## Functional findings

### A01 · P1 · Replan can introduce a conflict with a later unplaced event

**Locations:** [replanHeuristics.ts:237](../src/engine/algorithms/replanHeuristics.ts#L237), [replanHeuristics.props.test.ts:144](../src/engine/algorithms/replanHeuristics.props.test.ts#L144). **Evidence: reproduced.**

On Monday 2 November 2026, create high-priority flexible A at 10:00–11:00 with flex window 09:00–10:00, and low-priority flexible B at 09:00–10:00 with its flex window on Tuesday. Replan Monday. Both plans move A onto B at 09:00–10:00, leave B unplaced at its original time, and report conflicts **0 → 1**. Applying the plan succeeds.

`occupied` initially excludes all movable events; an unplaceable event becomes busy only after its turn. T35 excludes unplaced events from both its placed list and its static list, so it misses this case. Preserve occupancy for events ultimately left unplaced and validate final placements, including buffers. Align TECH_SPEC §8.13/T35 with BR-12's “remains busy” rule when resolving this safety gap.

**Resolution (WI-36, Claude Code, 2026-10-26):** reproduced on `main` and fixed in 633dc3d. Each plan now repeats the greedy pass with every newly unplaced event pinned in place (busy from the start) until no new event is unplaced (≤ c + 1 passes). Regression unit test with the scenario above; T35 now treats unplaced events as busy and found counterexamples before the fix. BR-12, TECH_SPEC §8.13/§10 and T35 updated.

### A02 · P1 · Import accepts dates that crash rendering and remain saved

**Locations:** [schemas.ts:24](../src/shared/schemas.ts#L24), [facade.ts:400](../src/engine/facade.ts#L400), [time.ts:24](../src/ui/format/time.ts#L24). **Evidence: reproduced.**

An otherwise valid export with an event from `Number.MAX_SAFE_INTEGER - 60` to `Number.MAX_SAFE_INTEGER` passes import. Formatting its start then throws `RangeError: Invalid time value`. The shared minute schema checks integer shape but not JavaScript Date representability; the calendar's accessible-label formatting uses these dates during rendering. With IndexedDB, the accepted record survives reload and passes startup validation again.

Validate representable calendar dates at the shared boundary before persistence. Add import/startup regressions proving invalid dates leave existing data untouched. Separately consider practical limits for day-by-day expansion of very large task/flex windows.

**Resolution (WI-36, Claude Code, 2026-10-26):** reproduced and fixed in dfbcedd. The shared `minute` schema accepts only 1970-01-01T00:00Z … 9999-12-31T23:59Z (`MIN/MAX_SUPPORTED_MINUTE`), as an `InvalidTime` issue, so import returns `InvalidImport` and startup `StorageError` with existing data untouched (schema, import and init regressions). ER1 and TECH_SPEC §5/§6 updated. *Deferred:* a cap on very long task/flex windows (day-by-day frame expansion of a multi-year window is slow, not a crash); forms make such windows unlikely, and a cap would be a new business rule for the humans to decide.

### A03 · P2 · Conflict-toast actions bypass stale-result protection

**Locations:** [appStore.ts:234](../src/ui/store/appStore.ts#L234), [appStore.ts:733](../src/ui/store/appStore.ts#L733). **Evidence: reproduced.**

Create A 10:00–11:00 and B 10:30–11:30. B's warning offers 11:00–12:00. Add another event occupying that suggestion, then use the old warning action. The move succeeds and conflicts with the new event. The store supplies the **current** version when applying the **old** slot, so the engine cannot detect staleness.

Capture the suggestion's original snapshot version in the toast action. On `StaleResult`, recompute alternatives instead of applying the obsolete slot. Extend T21/T27 with an intervening mutation.

**Resolution (WI-36, Claude Code, 2026-10-26):** reproduced and fixed in bf5170b. The toast's *Move to* now applies with the suggestion's own `snapshot.version`; on `StaleResult` it leaves the event alone and opens the alternatives picker for it. Store regression with an intervening Blocker event; T21, ER4 and TECH_SPEC §11.1 updated.

### A04 · P2 · Import validates links but not linked-record invariants

**Locations:** [schemas.ts:261](../src/shared/schemas.ts#L261), [facade.ts:193](../src/engine/facade.ts#L193). **Evidence: reproduced.**

Export a scheduled task and edit the JSON so its name/duration differ from the linked event; make that event fixed with a null flex window. Import still succeeds when the IDs point back correctly. The reproduced pair had a 120-minute task named “Different” linked to a fixed 60-minute event named “Original”. Startup uses the same checks and accepts it too.

Extend cross-record validation to BR-9's mirrored name/title, priority, duration and window, and require scheduled-task events to stay flexible. Description/category are initially copied but are not among BR-9's four mirrored fields; do not accidentally impose additional synchronization rules.

**Resolution (WI-36, Claude Code, 2026-10-26):** reproduced and fixed in fd28e32. `linkIssues` (import and `init`) now also requires the linked event to be flexible and to mirror the task's name, priority, duration and window (description/category untouched). Five new import cases plus an accepted consistent pair; test fixtures that named linked events 'E' were made BR-9-consistent; the six sample deliverables still import. ER6, T25 and TECH_SPEC §7.4.6 updated.

### A05 · P2 · Partial-day windows produce incorrect day loads and ranking

**Locations:** [search.ts:64](../src/engine/search.ts#L64), [search.ts:85](../src/engine/search.ts#L85). **Evidence: reproduced.**

Book Monday 09:00–17:00. Search for a low-priority 60-minute task whose window is Monday 17:00 through Tuesday 10:00, using `priorityAware`. The engine reports both days' loads as zero and ranks Monday 17:00 first. Under the documented whole-working-day definition, Monday's load is **480 minutes**, Tuesday's is zero, so Tuesday should rank first.

Busy-gap selection correctly uses the narrow search window, but day-load computation wrongly reuses that same event slice. Compute loads from all events intersecting the relevant working days. Add a partial-first/last-day variant of T18.

**Resolution (WI-36, Claude Code, 2026-10-26):** reproduced and fixed in 33ab1cb. `search` computes day loads from every event on the frames' whole days (excluding `excludeIds`); gaps still use the window slice. Facade regression (partial-day T18 variant: Tue 09:00 load 0 before Mon 17:00 load 480); T18 and TECH_SPEC §7.5 updated.

### A06 · P2 · Scheduling can persist invalid minute values

**Locations:** [search.ts:133](../src/engine/search.ts#L133), [taskScheduler.ts:281](../src/engine/pipelines/taskScheduler.ts#L281). **Evidence: reproduced through the facade.**

`scheduleTask` checks version, task status and slot length, then constructs an event without schema validation. A 60-minute slot starting at 09:00:30 and ending at 10:00:30—fractional epoch minutes—succeeds. Initializing another engine from that repository then fails with `StorageError: Saved data is damaged.`

Validate slot endpoints as supported integer Minutes and validate the constructed stored/event input before committing. Length equality alone also does not establish containment or availability. Normal picker options are integer-valued; this finding concerns the facade's promised validation boundary, not the current picker generating fractional slots.

**Resolution (WI-36, Claude Code, 2026-10-26):** reproduced and fixed in 03e3a21. The shared slot check (`requireValidSlot`, formerly `requireSlotLength`) validates the slot with the new `slotSchema` (supported integer Minutes) before the length, for both `scheduleTask` and `applyAlternative`; regressions for fractional and out-of-range slots. Availability stays guaranteed by the version check against the search the slot came from (ER7); TECH_SPEC §6/§7.4.2/§7.4.3 updated.

### A07 · P2 · Elapsed time does not invalidate options or plans

**Locations:** [replan.ts:86](../src/engine/pipelines/replan.ts#L86), [taskScheduler.ts:269](../src/engine/pipelines/taskScheduler.ts#L269), [conflictResolution.ts:90](../src/engine/pipelines/conflictResolution.ts#L90). **Evidence: reproduced with the injected clock.**

Compute a plan at 08:00 for a flexible event starting at 09:30. Advance the clock to 09:45 without changing data. Applying the plan still moves the now-started event, contrary to FR10. Likewise, a previously offered task slot can be applied after its start has passed. Data versions do not change merely because time passes.

Recheck time-sensitive eligibility inside the queued apply operation. Refresh expired results without moving an already-started event or placing new work in the past. Add clock-advance variants of T27/T28.

### A08 · P2 · Replan input edits leave old plans applicable

**Locations:** [ReplanDialog.tsx:93](../src/ui/components/ReplanDialog/ReplanDialog.tsx#L93), [ReplanDialog.tsx:123](../src/ui/components/ReplanDialog/ReplanDialog.tsx#L123). **Evidence: source-confirmed.**

Compute plans, then change From, To or Buffer without pressing Compute again. The old cards and Apply buttons remain. Apply uses the old result's version/plan ID, so an unchanged calendar accepts a plan computed for different parameters than those currently displayed.

Invalidate the result whenever a planning parameter changes, or bind the preview visibly to immutable computed parameters and require recomputation. Test that changing the buffer from 0 to 30 cannot apply the old zero-buffer plan.

### A09 · P2 · Description validation errors are invisible

**Locations:** [EventDialog.tsx:185](../src/ui/components/EventDialog/EventDialog.tsx#L185), [TaskDialog.tsx:151](../src/ui/components/TaskDialog/TaskDialog.tsx#L151). **Evidence: resolver reproduced; rendering source-confirmed.**

Enter a description longer than 1,000 characters and Save. The resolver returns `errors.description` and blocks submission, but neither dialog renders that error or associates it with the textarea. The form stays open without explaining why saving failed, contrary to ER1 feedback requirements.

Render the description error and accessible invalid-field attributes in both forms; consider a visible character limit. Add UI cases covering the shared schema's description boundary.

### A10 · P2 · Opening Replan from Month defaults to an invalid range

**Locations:** [ReplanDialog.tsx:20](../src/ui/components/ReplanDialog/ReplanDialog.tsx#L20), [calendarHandlers.ts:75](../src/ui/components/CalendarView/calendarHandlers.ts#L75). **Evidence: source-confirmed.**

Month view supplies its entire visible grid as `activeRange`, normally 35 or 42 days. Replan copies that range into its defaults, then rejects it because the maximum is 14 days. The documented default is the visible week; a user entering the feature from Month immediately encounters an avoidable validation failure.

Use a valid week based on the focused calendar date when the visible range exceeds the supported span. Reconcile TECH_SPEC's `activeRange` default with PROJECT_SCHEMA FR10/§7.1, and test all four calendar views.

## Redundancy and efficiency opportunities

| ID | Observation | Suggested follow-up |
| --- | --- | --- |
| R01 · P3 | [TaskPanel.tsx:147](../src/ui/components/TaskPanel/TaskPanel.tsx#L147) searches all events and scans selected IDs for every shown task: O(T·N + T·S), quadratic when these grow together. | Build an event-ID map and selected-ID set once per render/memoized input. This is a source-level complexity finding, not a measured latency failure. |
| R02 · P3 | A normal file import calls `parseExportFile` in `checkImport`, again to count records in the store, and again in the engine. The second full parse happens before the loading overlay. | Reuse preflight metadata for the count; retain authoritative engine validation. UI validation plus engine validation is intentional defense, not redundant by itself. |
| R03 · P3 | Category options, priority labels and priority tags repeat across EventDialog, TaskDialog, TaskPanel, SlotPicker, EventContent and `format/explain.ts`. | Share stable UI metadata while retaining intentional differences in option order. Avoid a broad form abstraction merely because markup looks similar. |

`countOverlaps` currently has no production caller, but implements the documented optional drag preview and has a frozen signature/tests. Its presence alone is not evidence that deletion is appropriate. Repository strategies and the facade/pipeline split serve clear purposes; no replacement architecture is warranted by this review.

## Additional contract/usability notes

- **Range validator is weaker than BR-12.** [replan.ts:36](../src/engine/pipelines/replan.ts#L36) accepts a one-minute range and, in UTC, 14 days plus one minute; both were reproduced. It checks only positive elapsed duration against a fixed DST allowance, not local-midnight endpoints or 1–14 local calendar days. TECH_SPEC currently describes this weaker check; align the contract and implementation with PROJECT_SCHEMA before treating it as correct.
- **“View conflict” does not navigate to the panel.** [appStore.ts:256](../src/ui/store/appStore.ts#L256) only emphasizes the event IDs. It does not open the narrow drawer, focus the row, or scroll to a conflict outside the visible period. This limitation was already noted in PROGRESS; the newer barred-warning View action demonstrates the missing drawer/focus behavior.

## Verification and limits

| Check performed | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd run lint -- --no-cache` | Passed |
| `npm.cmd test -- --no-cache --no-fsModuleCache --configLoader runner` | 67 files passed; 524 tests passed; 1 performance test/file skipped as configured |
| `npm.cmd run test:dst -- --no-cache --no-fsModuleCache --configLoader runner` | 4 files / 7 tests passed |
| In-memory probes against actual modules | Confirmed A01–A07, A09 resolver behavior, and the range-validator note; no probe files saved |

Read `docs/PROGRESS.md`, PROJECT_SCHEMA's requirements/business rules/UX, TECH_SPEC's contracts/pipelines/algorithms/build plan, and TEST_PLAN's catalogue, UI cases and release evidence before assessing implementation. Reviewed production source across shared validation/time/types, all engine algorithms and pipelines, facade/history, repositories/samples, store/forms, calendar integration, dialogs/panels, shortcuts/preferences, bootstrap and test/configuration coverage. Styling was outside scope.

The principal test gap is **composition and state transitions**, especially later unplaced events, partial-day load inputs, malformed-but-linked imports, clock advancement, and parameter edits after computation. A01 specifically shows an oracle that omits an important class of remaining events.

Build, Playwright, coverage generation, sample export, installs and deployments were not rerun because they generate files or alter the environment. Existing coverage/build/browser/performance figures in PROGRESS are historical evidence, not newly verified audit results. No production browser data was accessed. Other agents' changes were left untouched; this report is intentionally uncommitted.

Suggested implementation order: A01/A02, then A03/A04/A06/A07, then A05/A08–A10. Add focused regressions before each fix and preserve the existing gate.
