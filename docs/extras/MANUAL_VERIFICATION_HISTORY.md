# Manual verification history (before Round 2)

Archived on 14 November 2026. These are historical scripts and reported results, not current release instructions. Use [TEST_PLAN section 7](../TEST_PLAN.md#7-live-site-smoke-test-20-30-minutes) for the single current smoke test. An old production pass does not verify the Round 2 build.

## 7. Manual checklists (run on the production URL before each milestone)

### 7.1 Accessibility

Local automated evidence (WI-25/26): `src/ui/styles/tokens.test.ts` checks light/dark foreground pairs; `e2e/accessibility.spec.ts` checks desktop widths, drawer, minimum control targets, dialog keyboard/focus behavior and List event names/editing. Divyam reported on 2026-10-26 that production contrast is OK in both themes and the screen reader announces toasts; these are human-reported results, not a new agent-run production audit.

- [ ] Every conflict is identifiable without colour: the ⚠ icon plus the word "Conflict".
- [ ] Every priority is identifiable without colour: the [H] / [M] / [L] tag.
- [x] Text contrast is OK in both themes (Divyam, production, 2026-10-26); local token tests also enforce at least 4.5:1:
  - [x] event text on each priority background
  - [x] muted text
  - [x] toasts
- [ ] Every dialog is fully operable with the keyboard alone. Focus is trapped, `Esc` closes the dialog, and focus returns to its trigger.
- [ ] An event can be moved and resized through the event dialog, without a mouse.
- [ ] The List view reads sensibly with a screen reader (VoiceOver or NVDA quick pass); local accessible-name/keyboard checks pass, but this specific human check was not reported.
- [x] Toasts are announced by the screen reader (Divyam, production, 2026-10-26).
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
| **D4** Replan | `sparseWeek`, then a clean week | Replan → set buffer 10 → Compute. Compare Minimal change vs Balanced week (moves, reasons, spread). Apply Balanced, then Undo. In a clean week add Lunch 13:00–14:00, a future flexible Study at 13:00–14:00 with window 09:00–18:00, and a fixed Class at 13:00–14:00. Minimal change moves Study with reason barred; Class remains under Not moved by Replan → Fixed event, Overlaps Lunch, Suggest alternatives. With a flexible event already started in Lunch, it instead says Already started. Zero moves still explain/count remaining overlaps; use an entry's alternatives action to resolve one. | FR10, BR-12, B1, T39/T40 |
| **D5** Extras | any | Add Lunch 13:00–14:00 as a barred slot and show hatching and the "Lunch" boundary. With an event inside Lunch, show `In Lunch`, the separate overlap section, settings info toast/View and Suggest alternatives; conflict counts stay unchanged (WI-32). Show dark mode, then the toolbar `?` button and `?` key (WI-33), then Export, Clear all data, Import. | FR11, BR-15, B2–B4 |

**Sample inputs deliverable.** `src/data/samples/*` plus an exported JSON of each sample, committed to `docs/samples/` (WI-30).

**Rehearsal setup.** Use a fresh browser context on the production URL after the team deploys the tested `main`. Load samples through Settings for the current local week; committed JSON deliverables instead use 2 November 2026 UTC. For D3, the High-priority 90-minute report is offered before the Medium-priority 45-minute chapter task, regardless of checkbox selection order. Export anything you want to keep before a replacement operation.

**Production rehearsal record (reported by user).** Tester **Divyam**, **2026-10-26**, [production URL](https://int-calendarfeature-creatures.vercel.app): **D1–D5 all pass**. Accessibility: contrast OK in both themes; screen reader announces toasts. This run predates WI-32/33; the new D5 steps pass local tests before the human's planned redeploy, with post-deploy smoke checks still human-owned.

| Demo | Local evidence | Production tester/date/outcome |
|---|---|---|
| D1 | E1/E2 create, real drag/resize and reload; CRUD/history integration cases | Divyam · 2026-10-26 · Pass |
| D2 | E1 flags both events; alternatives integration/UI cases and sample conflict tests | Divyam · 2026-10-26 · Pass |
| D3 | E3 schedules a linked task; queue, ranking, ER2/ER3 integration/UI cases | Divyam · 2026-10-26 · Pass |
| D4 | Replan integration/UI cases, atomic apply/undo and T35 properties | Divyam · 2026-10-26 · Pass |
| D5 | Settings/import/export/theme/shortcuts; WI-32/33 local regressions | Divyam · 2026-10-26 · Pass (pre-change version); new steps await planned redeploy |

---

## 9. Release checklist (definition of done for the whole project)

WI-31 completes local release preparation. User-reported production outcomes are distinguished from local automated results. Unchecked human items below are retained for the user's planned push/redeploy and viva, not asserted as completed by the agent.

- [x] D1–D5 pass on production per Divyam, 2026-10-26; WI-32/33's new behavior passes T37/T38 and toolbar UI/browser regressions locally.
- [x] Typecheck/lint/test gate passes; coverage thresholds met (98.30% overall lines / 93.12% branches; algorithms 99.67% / 95.85%). DST: 7 cases. Production build passes.
- [x] After WI-35/36 (2026-10-26, local): 563 tests, coverage 98.50% lines / 93.82% branches (algorithms 99.70% / 95.93%), 7 DST, all five properties at 10,000 random-seed cases, build, and 11 browser checks (E1–E4, smoke on the build and on the StrictMode dev server, accessibility, warnings) green. Not yet on production: needs the human redeploy.
- [x] After WI-37/38 (2026-10-26, local): 578 tests, coverage 98.55% lines / 93.98% branches, 7 DST, build and 18 browser checks green. Dialog geometry/keyboard checks cover both themes at 1440/1024/900 px; D4's barred-replan distinction and per-event alternatives pass locally. The scheduling heuristic is unchanged. Human push/redeploy and the new production D4 steps remain pending.
- [x] After WI-39 (2026-10-26, local): typecheck/lint, 582 tests, coverage 98.60% lines / 94.08% branches, build, warm 180/180 and cold 180/180 browser executions green (each 10 repeats, 2 workers, no retries); no additional flakes found. Deterministic regression failed before the fix. CI retry/trace/HTML/failure-artifact configuration verified locally; the next remote CI run needs the human push.
- [x] `npm run test:props:full`: all five properties pass 10,000 random-seed cases each; no failing seed found.
- [x] `npm run e2e`: all 8 Chromium checks pass, including E1–E3 and the new warning/ER2/help workflows.
- [x] `npm run test:perf`: N=5000, seed=7, k=183, eleven-run median 4.188 ms < 100 ms; recorded in README.
- [x] Production URL recorded in README and used for Divyam's rehearsal; local fresh-context browser tests show the empty state and Load sample week.
- [x] README covers setup, tests, deployment, architecture, limits, production URL and both change requests; six sample exports validate and regenerate identically.
- [x] All three change logs synchronized and all work items in PROGRESS complete.
- [ ] Human: push the finished main/branches/tags, redeploy, and smoke-check the new D5 warning/help steps plus fresh-browser behavior on production.
- [ ] Viva prep: each member can explain, without notes:
  - [ ] the heap sweep and why the running-max version fails T3
  - [ ] merge, complement and gaps with the buffer
  - [ ] the BR-7 ranking keys
  - [ ] the greedy order in replan and its limitation
  - [ ] the undo model (before- and after-images)
  - [ ] why Dexie replaced SQLite

---


## Peer-fix checklist (archived, superseded by the current smoke test)

**Smoke checklist for the deployed site** (human, after `npx vercel --prod`; tick each line):

- [ ] **Two tabs (#14).** Open the site in two tabs of one browser. In tab 1 click *Load sample week*, then reload tab 2 so it shows the week. In tab 2 open *Seminar* (Thu 10:00), then in tab 1 delete Seminar (Delete → Delete). Tab 2 shows "Calendar updated in another tab.", its dialog closes and Seminar disappears. Rename *Tutorial* in tab 2 and check tab 1 shows the new name. Reload both tabs: Seminar is still gone and the rename is kept.
- [ ] **Fixed event drag, cancel then confirm (#1).** Drag *Algorithms lecture* (Mon 09:00, Fixed) down an hour → "Algorithms lecture is fixed. Move it anyway?" → **Keep it**: it snaps back, and Undo stays as it was. Drag it again → **Move**: it moves, and Ctrl+Z moves it back. Hover its *Fixed* tag: the tooltip explains it. Drag a flexible event (*Study*, Wed 15:00): it moves with no question.
- [ ] **Alternatives for a night event (#3, #4, #9).** Create *Night A* Mon 21:00–22:00 and *Night B* Mon 21:30–22:30. In the conflict panel click *Suggest alternatives*: *Search hours* shows **Any time**, and the options lie near 21:00 (e.g. 20:30–21:30). The picker says the event is fixed. Switch to **Working hours only**: the options move into working hours. Also create a new *Personal* event Sat 10:00–11:00 with Flexible on: its default flex window is Sat 00:00–Sun 00:00.
- [ ] **Duplicate barred slot (#6).** Settings → *Add barred slot* twice (two default Lunch rows) → Save: "Duplicate of barred slot 1." appears under slot 2, the dialog stays open and nothing is saved. Remove slot 2 → Save works.
- [ ] **All priorities off (#10, #12, #13).** With the sample loaded, turn off H, M and L: the status line reads "0 events (8 hidden by filter) · 4 tasks · 1 conflict". Switch to **List**: "All events in this range are hidden by the priority filter" with **Show all**, which brings every event back. Scroll List: day headers stay above the conflict outlines. On a phone (or a 420 px wide window) List rows wrap instead of being cut off.
- [ ] **Settings in both themes (G, #11).** Set the theme to Light, open Settings: four sections (Working time, Scheduling defaults, Barred slots, Data), barred slots as one-line rows with day chips, text readable, × closes the dialog. Repeat in Dark. Also check that × closes the event dialog and Keyboard shortcuts, and that an ER2 task (e.g. 45 min in a 12:30–14:30 window with Lunch) lists "Available: … — Lunch 13:00–14:00 is barred.".

