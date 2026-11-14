```text
You are a coding agent on int-calendar (CS-3810, team Feature Creatures). This is ROUND 3: a UI polish batch that fixes problems a review found in the deployed round-2 build. There is no audit file: this prompt is the binding spec. Implement it one work item at a time, exactly as written.

## RUN CONTINUOUSLY: this overrides any habit of stopping
- The human is NOT watching between work items. Do not stop, summarise or wait after a WI.
- After merging a WI, go straight to §1 step 4 and claim the next WI in the same session, with no message to the human in between.
- A finished WI, a merge, a phase boundary or a green gate is never a stopping point. Do not ask "shall I continue?", and do not offer a plan for the next WI: just start it.
- Stop only when:
  (a) every round-3 WI and "Finish" is [x];
  (b) your usage budget is nearly gone, in which case do AGENTS.md §5 "Before you stop" first;
  (c) you hit a blocker under AGENTS.md §8 that this prompt does not settle and that is expensive to undo. Record it in the progress file, then continue with any later WI that does not depend on it.
- A human-only step (push, deploy) is never a reason to stop.
- Keep progress messages to one line per WI.
- First action in every session: if docs/extras/PROMPT_ROUND_3.md does not exist, or differs from this prompt, write this whole prompt into that file inside a ```text block. Commit it as "docs: save the round-3 prompt", on the current branch if a WI is in progress. Then carry on.

## 0. Rules you follow throughout
- AGENTS.md is the law for this repo (CLAUDE.md too, if you are Claude Code): the session protocol (§3–§5), human-only actions (§7) and asking (§8). The progress file is docs/progress/PROGRESS.md.
- Load the disciplined-coding skill before writing any code. That is .agents/skills/disciplined-coding/SKILL.md for Codex, or /disciplined-coding for Claude Code. Every line you write or modify follows it: PRE/POST on every function and component, INVARIANT/POST on every loop, no magic numbers (constants go in src/shared/constants.ts), and Facade and Strategy as the only patterns.
- docs/extras/AUDIT_2.md (D-01–D-21) stays binding. This round changes presentation only, unless a WI below explicitly says otherwise. Do not reopen any D-xx decision. Where a WI below refines one, update AUDIT_2's wording is NOT needed. Update the three main docs and their change logs instead.
- Verify against the code and a running build, never from memory or screenshots. For every UI WI, capture and look at the screens it changes before and after the change:
  - 1440×900, 1280×800 and 1024×768;
  - both themes;
  - the sample week loaded;
  - the browser clock set to a weekday morning of that week, so events are in the future.
- Never push, deploy, create PRs, change remotes, delete branches or rewrite history: those are human-only. Do not tick round 2's "Human: push, deploy, run the smoke test" line; the human owns it.

## 1. Find out where the batch stands (once, at the start of every session)
1. Read "Current state" and the section "### Round 3 polish (batch)" in docs/progress/PROGRESS.md.
2. Run AGENTS.md §3 in full, once per session: git status, branches, the log, leftovers from a cut-off session, the gate on main, and a spot-check of the last [x] WI. This check is for recovering from an abrupt stop. Do not repeat it between WIs in the same session.
3. If the section "Round 3 polish (batch)" does not exist, this is the first session. Do this on main:
   a. Record a BASELINE gate. Run every command in §3 and write the exact numbers under the new batch heading: tests passed and skipped, coverage for statements, branches, functions and lines (overall and for algorithms), DST, property runs, build, and e2e checks × repeats. Expected, from round 2's Finish: 861 passed + 1 skipped, DST 9, 64 browser checks.
   b. Add the batch plan under "### Round 3 polish (batch)": one [ ] line per WI-60…WI-66, using the titles and "Done when" below, each depending on the previous one, plus a final [ ] "Finish" line and a [ ] "Human: push, deploy, run the smoke test" line. Add the same WIs as rows to TECH_SPEC §14, with a change-log line. Commit as "docs: plan round 3 (WI-60–66)".
4. Resume. If a WI is [~], continue it on its branch. Otherwise take the lowest [ ] WI.
   - One WI is one change group, on its own branch feat/wi-NN-short-name.
   - Merge it to main with --no-ff only when the full gate (§3) is green on the branch, and run the gate again on main after the merge. Keep the branch.
   - Update the WI note at every meaningful commit (AGENTS.md §5 format), so a re-paste resumes exactly where you stopped.

## 2. How to build each WI
- Test first. Write the failing tests for the WI's "Done when" and watch them fail for the right reason before writing the fix.
  - RTL for components.
  - Playwright for layout, geometry, overflow and gestures. Geometry checks use bounding boxes, scrollWidth and clientWidth, and getComputedStyle, at the stated widths and in both themes.
- Keep every existing test passing. Change an existing expectation only where a WI below changes that behaviour or markup. Name each changed test and the WI behind it in the commit message and in the WI note.
- Never weaken a test:
  - no deleted assertions, no .skip or .only;
  - no looser coverage thresholds, no fewer property runs;
  - no longer timeouts used to hide flakiness.
  When a selector moves, update it to the new accessible name or role, never to a CSS-class hook.
- Accessible names: keep the existing ones wherever the control still exists. New controls get clear names, given below where it matters.
- Contrast: every new or changed token pair goes into src/ui/styles/tokens.test.ts. Text must be ≥ 4.5:1 and non-text ≥ 3:1, in both themes, including every accent swatch and every category colour on the surfaces where it now appears.
- Design philosophy (D-13): minimal, sleek and elegant. Thin hairline borders, hierarchy from spacing and weight, no nested cards, no emoji, one primary button per region. Colours live only in tokens.css.
- No new dependencies. CSS container queries, `<details>` and the existing Modal are all available.
- Commit small and often, with the AGENTS.md prefixes.

## 3. The full gate (on the branch before merging, and on main after)
npm run typecheck && npm run lint && npm run test:coverage && npm run test:dst && npm run test:props:full && npm run build && npx playwright test --repeat-each=3 --workers=2
- Run npm run build before e2e: a stale preview server on port 4173 serves whatever is in dist/.
- For UI WIs, also run npm run screenshots. Review the captures in both themes at 1440, 1280 and 1024, fix what looks wrong, and commit the reviewed set to docs/screenshots/.
- On Windows PowerShell, use npm.cmd and npx.cmd if the shims are blocked. The path contains a space, so quote it.
- If main is red at the start of a session, fixing it is your first job. Record what broke.

## 4. The work items (in this order)

### WI-60 Event blocks are readable at desktop widths
Problem (verified on the deployed build). With D-14's three columns, a week-view day is about 105 px wide at 1440 and 1280 px. Every event block falls back to the narrow layout:
- the title is cut ("Algorithms le…", "Meet…");
- there is no time and no category;
- the priority tag is clipped to "(H)", with its brackets cut off;
- there is no inner padding.
Full blocks appear only at 1024 px, where the side columns become drawers.

Fix: size-aware block content using CSS container queries on the event content element. Do not use JS measuring unless a container query cannot express it. Tiers by the block's own width and height, with constants in constants.ts or tokens:
- Every block has inner padding (the spacing token for 4–6 px) and never paints text against its edge.
- **Full** (width ≥ 150 px):
  - title up to 2 lines;
  - time "09:00–10:30";
  - a tag row with the priority tag, the category tag (dot and name), a Fixed or Flexible tag with text, and conflict / Task / In <label> as today.
  Tags wrap onto more lines when there is room, and are never clipped.
- **Compact** (90 ≤ width < 150 px; the normal desktop week):
  - title up to 2 lines with an ellipsis;
  - the time on its own line;
  - one tag row: the priority tag at full size, a category colour dot (its name in the accessible name and tooltip), and the Fixed/Flexible icon, plus the conflict icon when relevant.
- **Narrow** (width < 90 px, i.e. overlapping events): the title (1 line), the priority tag, and the conflict icon.
- **Short blocks** (height under about 40 minutes of grid): one line with title and time; tags only if they fit without clipping.
- **In every tier:**
  - The priority tag shows its full [H]/[M]/[L] text with no clipping.
  - The block's accessible name and tooltip still carry everything: title, time, priority, category, Fixed/Flexible, conflict, barred labels and Task.
  - Past-event styling (D-08) keeps text ≥ 4.5:1 on the fill.

Done when: Playwright at 1440 and 1280, both themes, with the sample week and a weekday-morning clock:
- every block ≥ 1 h tall shows its time, a fully visible priority tag (bounding box inside the block) and a category marker;
- no tag's box crosses its block's box;
- titles of ≤ 20 characters are not truncated.
At 1024, full blocks are unchanged. The tier rules are in PROJECT_SCHEMA §7.5 and TECH_SPEC §11.

### WI-61 The filter row never overflows
Problem: at 1440, 1280 and 1024 the category chips run off the calendar region's second row. After "Class" the chips are cut off, Meeting, Personal and Reset filters are hidden, and there is no scroll cue. The more categories the user creates (D-11 CRUD), the worse it gets.

Fix:
- H/M/L stay as three toggles.
- The category chips move into one **Categories** disclosure button. Its label is "Categories" when all categories are shown, and "Categories (3 of 5)" when some are hidden.
- The button opens a popover: a checkbox list with each category's colour dot and name, plus "Show all".
  - Keyboard operable; Esc closes it and returns focus to the button.
  - It uses the existing focus rules.
  - Its accessible name is "Category filter".
- *Reset filters* appears next to it only while any priority or category filter is active.
- Filter behaviour, counts, the "(N hidden by filter)" text and FR6 are unchanged.

Done when: in the calendar region's toolbar rows at 1024, 1280 and 1440, both themes, with 5 and with 12 categories:
- no child overflows (scrollWidth ≤ clientWidth, every control fully inside the region);
- the popover works by mouse and keyboard;
- filtering and Reset are still covered by tests.

### WI-62 The built-in samples are never a dead week
Problem: the built-in samples are built for the current week (startOfLocalWeek(now)). On a Saturday or Sunday, all of it is already in the past: the sample conflict, every task window and every Replan move. A grader who opens the site on a weekend has nothing to try.

Fix:
- Built-in samples anchor on the **next** Monday when today is Saturday or Sunday, and on the current week otherwise.
- After loading, the calendar navigates to the sample's week.
- The toast names the week: "Loaded sample: Sparse week (week of 16 Nov)."
- This applies to the empty-state button and to Settings > Data > Load sample calendar.
- docs/samples/*.json, npm run samples:export and every fixture keep their fixed 2 November 2026 dates.

Done when:
- Tests with a fixed clock: Sat and Sun anchor on the next Monday; Mon–Fri on the current Monday; the DST case is respected.
- A browser test with a Saturday clock: after loading, the Upcoming conflicts group has the sample conflict, and Find time on a sample task offers slots.
- TEST_PLAN, PROJECT_SCHEMA (W10, samples) and the README's "Try it in two minutes" say so.

### WI-63 Settings has one clear saving model
Problem: Save and Cancel sit in the middle of the dialog, after Scheduling defaults. Categories and Appearance below them apply immediately, and Data holds actions. The user cannot tell what Save covers.

Fix: split Settings into four tabs inside the same dialog: **Scheduling**, **Categories**, **Appearance**, **Data**.
- Use a proper tablist (arrow keys between tabs). The first tab is focused on open, and the dialog keeps its ×.
- **Scheduling** holds Working time and Scheduling defaults. It is the only tab with a sticky Save / Cancel footer, and the only tab with staged edits.
- **Categories** and **Appearance** apply immediately. Each starts with one muted line: "Changes apply immediately." (Categories adds "You can undo them.")
- **Data** holds Export, Import, Load sample and Clear all data, unchanged.
- Switching tabs with unsaved Scheduling edits keeps them; Cancel or × discards them, as today.
- Keep every existing accessible name, so existing tests find their controls inside the right tab.

Done when:
- RTL covers tab order and keyboard, the staged-vs-immediate behaviour per tab, and unsaved edits surviving a tab switch.
- All existing Settings tests pass after only moving to the right tab.
- Screenshots of every tab are reviewed in both themes.

### WI-64 Right and left columns are compact
1. **Barred slots region** (320 px wide). Each slot currently wraps onto four lines with a dangling "–", and the Save/Cancel row butts against the "Barred-slot overlaps" heading. Fix:
   - Each saved slot is a read-only summary row: "Lunch · 13:00–14:00 · Mon–Fri" (days as compact ranges or lists), with an Edit button (pencil icon with the accessible name "Edit barred slot Lunch") and the remove ×.
   - Edit, or *Add barred slot*, opens an inline editor in place of that row:
     - line 1: label and a compact from–to pair on one line;
     - line 2: the day chips;
     - then Save / Cancel for that slot.
   - Validation and D-09/D-20 messages stay exactly as they are and show in the editor.
   - Legacy-overlap banners still work.
   - Keep the region-level semantics: these are settings, not undoable.
   - Give the Overlaps and Kept sections the standard section spacing.
2. **Task rows.** Each row is still about 150 px tall, with three buttons, so four tasks fill the column. Target about 64–72 px per row:
   - line 1: checkbox, name, priority tag, category tag;
   - line 2: muted meta, "1 h 30 · Mon 9–Fri 13 Nov · Unscheduled" (or "Scheduled Tue 14:00" / "✓ Done");
   - actions on the right: one **Find time** button, plus a ⋯ menu with Mark done (or Reopen), Edit, Unschedule (when scheduled) and Delete. The ⋯ menu's accessible name is "More actions for <name>".
   - Clicking the task name also opens Edit.
   - Done rows keep D-07's look.
   - The queue ("Find time (N)" appears only when N ≥ 1) and the selection checkboxes are unchanged.

Done when:
- At 1440×900 with the sample week, all 4 sample tasks and the whole Barred slots region (summary, Overlaps, Kept) are visible without scrolling their columns.
- RTL covers the menu actions and the barred editor.
- Existing task and barred tests pass after only selector updates.

### WI-65 Small consistency fixes
1. **List view.** The Day/Week/Month control shows no selection while List is active. Show Week as selected and disabled (aria-disabled, with the tooltip "List always shows one week"). Switching back to Calendar restores the user's previous Day/Week/Month choice.
2. **Replan dialog.** Priority tags in move rows and "Not moved" rows use the same coloured priority tag component as everywhere else, not grey.
3. **Replan region header.** "Replan (2)" counts movable events without saying so. The header becomes "Replan". Under the range, show "2 flexible events can move" (singular "1 flexible event can move"; when there are none, "No flexible events in this range").
4. **Calendar lock icon.** The lock is the only emoji in the UI (🔒/🔓) and renders differently on each OS. Use the same line-icon style as the app bar (an inline SVG lock or unlock) with the text Locked/Unlocked. Keep the accessible name "Calendar lock" and aria-pressed.
5. **Pick cards.** In Find time, the pick cards wrap their times onto two lines ("10:30–" / "12:00"). Keep each slot's time range on one line (nowrap, adjusting card width or type size) at 1024–1440 in both pickers.
6. **App-bar undo/redo glyphs.** ↶ and ↷ look faint and small. Use the same line-icon style and size as the other app-bar icons, at ≥ 3:1 non-text contrast, and keep the names "Undo" and "Redo".

Done when: each item has an RTL or Playwright check, and the screenshots are reviewed.

### WI-66 Docs, smoke test and final gate
- Update PROJECT_SCHEMA (§7 UX, figures), TECH_SPEC (§11, §14) and TEST_PLAN (new T-numbers continuing after the last one used), each with change-log lines, plus the README's screenshots and "Try it" steps.
- Every text diagram follows D-21: ASCII plus box-drawing ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ and ▲ ▼ only, with equal box-line lengths. Re-run the D-21 check script over docs/, README.md and AGENTS.md.
- Update the TEST_PLAN §7 live smoke test so it covers WI-60–65. Edit the existing S-steps instead of adding a new section where possible; the whole run must still take 20–30 minutes.
- Then do "Finish" (§5).

## 5. Finishing the batch
- After WI-66 is merged, run the full gate on main with --repeat-each=5. Compare it with the round-3 BASELINE: no drop in the test count, and no coverage measure dropping by more than 0.5 points.
- Put the results in the README's test-results section. Tick "Finish", and add the human step to "Human-only steps".
- Then stop, and print for the human exactly:
  1. Push:
     git push origin main
     git push origin --all
     git push origin --tags
  2. Deploy:
     npx vercel --prod      (npx.cmd vercel --prod on blocked PowerShell)
  3. "Run the smoke test on the live site: TEST_PLAN §7, https://int-calendarfeature-creatures.vercel.app"

If your budget runs low before the batch is done, follow AGENTS.md §5 "Before you stop": everything committed, the WI note saying what is done and what is next, and "Current state" accurate. Then say in one line where the next session should resume.
```
