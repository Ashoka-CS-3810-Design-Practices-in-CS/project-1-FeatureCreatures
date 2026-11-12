# Prompts that drove development

This file records the prompts that directly shaped the project, in the order they were used.

- **Human-written prompts** (by Divyam) are quoted as written, with obvious typos left in. WI-47 updates documentation paths and relative links throughout this historical record.
- **Agent prompts** were drafted with Claude and then pasted by the team into Codex and Claude Code sessions.
- **Not recorded here:** short in-session nudges (for example "halt after WI-01") and the prompt used for the independent audit in [AUDIT.md](AUDIT.md).

How these prompts fit together:
- The three spec documents in `docs/` are the source of truth.
- [`AGENTS.md`](../../AGENTS.md) is the session protocol for agents.
- The `disciplined-coding` skill sets the code style.
- Each prompt below either created those, or started a block of work items against them.

---

## 1. Design stage (before implementation)

These prompts produced Assignment 1 and the first presentation. Assignments 2 and 3 were later written from them. They are kept here because the unified specs in §2 were built from those documents.

### 1.1 Assignment 1 (project specification)

```text
You are an expert software development engineer assistant. For my Design Practises in CS course I and a teammate have been tasked to develop an intelligent calendar and time planner. The specification for the project can be found in Project 1 Spec. The project is split up into documentation assignments and the actual app that we need to code up. The first documentation assignment can be found in P1 A1 Spec. In accordance me and my teammate sat down and came up with a basic, rough first draft found in A1 Draft (the sections 4.4, 5, and 6 are especially very basic and need to be rethought and improved by incorporating more ideas from the P1 A1 Spec). Ruminate on the given material and come up with a better documentation version of Assignment 1 in Latex and PDF, eliminating redundancies, incorporating better algos, etc. The course is open AI, and all students are encouraged to use AI for all tasks only that every assignment submission is followed by a rigorous in-person viva to guage wether students understood the output of AI before submitting or not. So don't hold back and give me as perfect an output as you can I will read through it and let you know any changes that I want.

Important pointers:
- For saving events and tasks and time intervals in the app in memory use only arrays (no bst or some other complex structure).
- Events can be flexible meaning they can be reschedules within are permeable time window or not such as classes.
- Tasks have no exact time bounding only a permeable window in which they should be completed so as such they will not showup on the calendar timeline, but are visible on a separate panel. But the user can choose to manually schedule a task or request the app to schedule multiple tasks intelligently, at which point they become events and are put on the calendar timeline.
- All time complexity should only be in terms of asymptotic notation and not actual time in ms or s or whatever.
- Divide the features that we'll implement into core (like event crud, conflict resolution, task scheduler, replan, etc and their sub features) and bonus (like multi-level tasks, import/export calendar, and undo-redo functionality, etc) (think up on your own and also take ideas from the Project 1 Spec, but remember its is only a mini project and not a industry scale app so don't incorporate every thing; basically measure the scope and scale modestly).
- Add a feature to replan flexible events on the timeline based on priority, some heuristics such as balancing days in week so as to attempt to avoid some busy days and some free days in a week, barred timeslots like lunch, etc. Also, for replanning there should be an option to choose buffer time between events. Remember replan feature (for events already on the timeline) is different from schedule feature (for task to become events), but both give users several options rather than making changes straight away.
- The app will have 4 core pipelines: Event CRUD, Event Conflict Resolution, Task Scheduler, and Replan.
```

### 1.2 First presentation

```text
You are an expert software development engineer assistant. For my Design Practises in CS course I and a teammate have been tasked to develop an intelligent calendar and time planner. [...] We now have to give a brief presentation on the same [...] The instructors' instructions for the presentation are: We want to hear from you on what you want to implement, how you're planning to, and your early design and technology choices. [...] Each presentation should not go over 3-5 minutes maximum. This is a hard stop.

Ruminate on the given material and come up with a better presentation in Latex and PDF and also a script; make sure to eliminate repetition. [...]

Important pointers:
- Remember the presentation is to be within 5 mins.
- Slides arrangement: Intro, Features Slide (Core + Basic), System Architecture (defining the 3 layers: UI, intelligent engine, data store and their interactions with each other), Core Pipelines in the itelligent engine (Event CRUD, Event Conflict Resolution, Task Scheduler, and Replan), Development & Testing Plan.
- Test plan should include unit tests on each of the layers, tests for each of the use cases as well as the failure conditions in the A1 Doc.
- [...] remove any redundacies that are not mentioned in the current attached version of A1 Doc [...]
```

---

## 2. One source of truth: unifying Assignments 1–3

This prompt produced `docs/PROJECT_SCHEMA.md`, `docs/TECH_SPEC.md` and `docs/TEST_PLAN.md`.

```text
So I have to code up a mini-project for my design practises in computer science course. AI assisted development is completely allowed with even the allowance to generate everything with AI, only with the caveat that I should be able to explain every single line of code that I submit so there is no honor code problems that ways. I have attached the basic description markdown file (that was shared by teaching staff) along side 3 documentation markdown assignments (project specification, technical design, and test plan prepared by me and a partner) pertaining to the mini-project. I will be graded on the overall implementation and consistency and not necessarily how great the project or app turned out to be (ofc quality is still a plus point). The thing is that the three documentation files were created in a sort of isolated manner you know just to submit for assignment completions sake which means there are discrepancies and inconsistecies across the three documentations. but I want a unified source of truth that I will actually use to guide the development of the mini-project. [...] Go through them ask me any doubts you have, brainstorm things with me if you need, then generate three consistent markdown files one after the other starting with the project schema, then the technical specification, then the test plan with the aim that I or any other dev or any agent reads them and instantly understands what to build, how to build, where to begin and where to end. So no handwaving or loose idea, just straightforward and consistent architectural specification. This does not mean that you stray too far away from the original documentations as the grading will involve consistency between them and the actual project that we build but then again at times in them I have been very ambitious or vague or whatever so there is a decent amount of wiggle room for you to deviate from the material that I provided [...] Essentially I will be using 2 codex agents and one claude code agent [...] I wanted this unified source of truth lets just say. [...] In terms of the scope of the project as in the features we'll implement, be rather modest, so all core features as outlined by the teaching team for sure with a handful of quick and easy to implement bonus features, since we are on a bit of a time crunch. One last thing, I thought I would make this as a locally hosted thing, but we are required to submitted a online hosted url so think of whatever is the simplest, cheapest, easiest, plug and play thing that works and gets the job done whether thats vercel or github pages or whatever.
```

Before writing anything, Claude asked three design questions. These are Divyam's answers, which fixed the scope:

```text
Storage: Plain IndexedDB (Dexie) as that would make sense since sqlite was considered for local hosting not online hosting. [...] for things that make sense deviations are fine even if it means abandoning something that was mentioned in the assignment docs, just that the final version of whatever has been built should be documented.

Replan: the replan pipeline is to be similar to your solution in 1. lean range replan; also on adjacent note the task scheduler should schedule tasks one after the other even if the user selects multiple tasks to schedule at once, giving recommended slots for one then the user accepts from one of the options and repeat till all tasks are scheduled.

Bonus: Dark mode + keyboard shortcuts, JSON import/export, Undo/redo.
```

---

## 3. Multi-agent setup

This prompt produced `AGENTS.md`, `CLAUDE.md`, the two skill copies, `.claude/settings.json`, `.gitattributes` and `docs/progress/PROGRESS.md`. The `disciplined-coding` skill itself was written by Divyam with a separate AI assistant.

```text
[...] give me the steps I need to follow to basically be in a condition from where I can prompt an codex or claude code agent open within vscode inside the project folder to work and it begins working. [...] So I wanted any agent that works on this to use a skill that I have attached disciplined-coding while working on the project. So again give me the exact steps that I need to follow, things that I need to ensure are installed and available on my windows PATH, the agents.md and claude.md files, etc so that I can prompt an agent to begin. Aslo after the steps give me a concise reusable prompt that I can give any agent that has limit to work on the directory - something along the lines of: You are one of several agents working on this project one at a time, go through the docs to understand what's going on, another agent or you could previously have worked on this and halted because of usage limit, figure out where the work was halted and resume, don't try to force resume on whatever you were previously working on before halting as another agent may already have picked it up and completed that work so do a quick review and then work. Use the disciplined-coding skill. [...]
```

---

## 4. The reusable session prompt

This prompt was pasted at the start of every agent session, whether Codex or Claude Code. It built WI-01 to WI-31. Every later prompt in this file was appended to it.

```text
You are one of several AI coding agents (Codex and Claude Code) that take turns on this repository, one at a time. Any of us — including you in an earlier session — may have been cut off mid-task by a usage limit.

1. Read AGENTS.md and follow its session protocol exactly. Load the disciplined-coding skill ($disciplined-coding in Codex, /disciplined-coding in Claude Code) and apply it to every line of code you write or change.
2. Rebuild the current state from the repo, not from memory: docs/progress/PROGRESS.md, git status, branches, recent log, and the test gate. Trust what the code and tests show over any note, including your own earlier ones — another agent may have finished, changed or abandoned that work. Don't blindly resume what you were last doing; verify first.
3. Pick the active or next work item as AGENTS.md §3 describes, claim it in PROGRESS.md, and implement it test-first against docs/TECH_SPEC.md §14 and the TEST_PLAN cases it lists.
4. Commit small and often and keep the PROGRESS.md note current, because you can be stopped at any moment. When a work item's tests and the gate pass, finish and merge it as AGENTS.md §5 says, then continue with the next one.
5. Only stop to ask me for human-only steps (push, deploy, accounts) or a decision the docs don't settle. Otherwise keep going.

Begin by telling me in three lines what state you found and which work item you're taking, then start working without waiting for a reply.
```

---

## 5. Production rehearsal feedback: WI-32 and WI-33

These followed Divyam's production rehearsal of demos D1–D5. His feedback:

> Pressing the / key does nothing I have to press shift+/ key for the question mark [...] So I think [...] making a ? button to show it next to the setting and theme buttons in the top theme should be better. [...] it had events that were scheduled over the lunch slot, so when I added the barred slot, the hatching showed as expected there was ofc the event that was already scheduled over it. I feel there should be something to warn about it, like a conflict or some other relevant mechanism, know?

The agent prompt:

```text
Production rehearsal results (tester: Divyam, 2026-10-26, production URL): D1–D5 all pass. Accessibility checks (TEST_PLAN §7): contrast OK in both themes, screen reader announces toasts. Record these in TEST_PLAN §8 and PROGRESS.md. Also confirm the 10 h task in sparseWeek shows the TaskLongerThanWindow (ER2) message, not NoSlotFound.

Before finishing WI-30, add and complete two small change requests as WI-32 and WI-33 (make WI-30 depend on them in TECH_SPEC §14 and PROGRESS.md). Update all three docs first (requirements, contracts, tests, change logs), then implement test-first:

WI-32 — Barred-slot overlap warnings. Events may still sit inside barred slots (unchanged), but the app now warns about them. This is NOT a conflict: BR-3, the sweep, conflict counts and replan metrics stay exactly as they are.
- Definition: an event overlaps a barred slot when its interval overlaps that slot's interval on any local day it touches (half-open; touching is not overlap). Barred slots apply on their own days regardless of working days.
- Engine: a pure algorithm (e.g. algorithms/barred.ts) returns {eventId, label, overlap, minutes} per overlap, using DayFrames from shared/time. Add Snapshot.barredOverlaps, recomputed on every commit and on updateSettings. State its complexity in TECH_SPEC §10.
- UI: event blocks show a text tag like "In Lunch" (not colour alone). The conflict panel gets a second section "Barred-slot overlaps (N)", listing the event, the slot label, the overlap range and minutes, with a "Suggest alternatives" action reusing suggestAlternatives for that event. After saving settings, if new overlaps appear, show an info toast "2 events overlap barred slots" with a "View" action.
- Tests: add T37 (algorithm and snapshot, e.g. backToBack with Lunch 13:00–14:00 → exactly one overlap of 60 min; 12:30–13:30 → 30 min; 12:00–13:00 → none; a slot only on its own days; recomputed after updateSettings) and T38 (UI: tag, panel section, toast). Add it to D5 in TEST_PLAN §8.

WI-33 — Shortcuts button. Keep the "?" key. Add a "?" icon button with aria-label "Keyboard shortcuts" to the toolbar, next to the theme and settings buttons, that opens the shortcut help. Update PROJECT_SCHEMA §7 (toolbar, Figure 1) and add a UI test.

Then finish WI-30 and WI-31. I will redeploy and push afterwards.
```

---

## 6. Visual refresh: WI-34

```text
New change request: WI-34 — visual refresh (a little more colour, a lot more space). All functionality is done and verified on production; this WI changes appearance only.

Setup
- Add WI-34 to TECH_SPEC §14 and PROGRESS.md (depends on 33) and work on branch feat/wi-34-visual-refresh as usual.
- Design follows two rules: PROJECT_SCHEMA §7.5/§7.7 stay true, and TECH_SPEC §11.4 is updated to the final token values (change logs included).

Brief
- Product: a personal week planner for students juggling classes, assignments and personal tasks. It should feel calm, roomy and quietly cheerful — never corporate, never toy-like.
- Spacious: introduce a spacing scale (e.g. 4/8/12/16/24/32 px) and a type scale as tokens, and use them everywhere instead of raw px. Give the toolbar, side panels, dialogs, list rows and FullCalendar real breathing room. Taller time-grid slots, more padding inside event blocks, roomier day headers, comfortable line-height. Widen the side column slightly if needed.
- A little colour: keep the base neutral and soft, with one confident accent used sparingly — primary actions (+ Event, + Task, Apply), today's column, the now-indicator, focus rings, the selected view. The priority colours on events are the main splash of colour: soft tinted fills with a stronger edge. Everything else stays quiet.
- Spend boldness in one place: pick a single memorable element (for example the event blocks or the week header) and keep the rest disciplined. Avoid generic defaults: no identical rounded cards with the same grey shadow on every container, no gradient washes, no all-caps labels, no decorative eyebrows or arrows. Give hierarchy through spacing and weight rather than boxes. Containers that differ in role should not all share one radius and shadow.
- Typography: one family with a clear scale and deliberate weights. A system font stack is fine. If you want one web font, add exactly one package (e.g. a @fontsource-variable font), justify it, and record it in TECH_SPEC §1.2.

Process
1. Before writing CSS, put a short design plan in the PROGRESS.md Decisions log: palette as 4–6 named hex values per theme, the type and spacing scales, and the one memorable element. Review it against the brief, and revise anything that reads like a default you would produce for any app.
2. Implement CSS-first. Change markup only to add classes or wrappers. Keep every visible label, role and accessible name, because the tests and screen readers depend on them. Any TS/TSX you touch follows the disciplined-coding skill.
3. Critique with screenshots. Write a small Playwright screenshot script, and capture the week view with the sparseWeek sample loaded (light and dark, at 1440 px and 1024 px), plus the slot picker, the Replan dialog and the empty state. Look at them, fix what looks off, and repeat at least twice. Commit the final set to docs/screenshots/ and link them from README.md.

Must stay true
- Behaviour is unchanged.
- Text contrast is ≥ 4.5:1 in both themes, so update tokens.test.ts to the new values.
- Conflicts and priorities are never shown by colour alone, and click targets are ≥ 32 px.
- The responsive drawer still works below 1024 px, and prefers-reduced-motion is respected.
- The dark theme is as polished as the light one.
- Colours live only in tokens.css.
- The full gate passes, including npm run e2e: E2 drags and resizes, so re-check it after changing slot heights.

When done
- Do NOT merge WI-34 into main. Leave the branch committed with the gate green, record the screenshot paths in PROGRESS.md, and tell me in a few lines what you changed. I'll review it myself with npm run dev, then reply "merge" or send tweaks.
```

---

## 7. Crash fixes and audit findings: WI-35 and WI-36

Divyam's bug report:

> [...] the ? panel or the settings panel doesn't open, if I try to click and or drag anywhere on the timeline to create an event the whole screen goes dark. [...] I ran npm run build and then npm run dev then test on local host.

Claude reproduced both bugs in a headless browser before writing this prompt. An independent Codex audit (`AUDIT.md`) was folded in.

```text
I reviewed WI-34 and approve the design: merge it into main as usual. Then do two new work items, in order, following the normal protocol (add them to TECH_SPEC §14 and PROGRESS.md, test-first, update all three docs and change logs).

WI-35 — Crash fixes (production is affected, so this comes first).
(a) Selecting or clicking empty time crashes the whole app. FullCalendar's select-mirror/placeholder event has no extendedProps, so EventContent's barredLabels.map throws "Cannot read properties of undefined (reading 'map')", and with no error boundary React unmounts the app. Fix it so mirror events render safely: give EventContent's extended props safe defaults or handle arg.isMirror in CalendarView. Add a regression test that renders EventContent / eventContent for a mirror event without extendedProps. Add Playwright E4: click on an empty slot, then drag-select a range, and both open the New event dialog with times prefilled.
(b) Under `npm run dev`, no dialog opens. React StrictMode mounts → unmounts → remounts Modal. The cleanup's dialog.close() queues a 'close' event that arrives after the remount reset programmaticClose, so onClose fires and the store closes the dialog. Fix Modal so a stale close event from a programmatic close is ignored — for example, in onClose, ignore the event if dialogRef.current?.open is true again. Add an RTL test that renders Modal inside <StrictMode> and asserts it stays open, and one that Esc still closes it.
(c) Add a top-level React error boundary. It shows "Something went wrong" with Reload and Export data actions instead of a blank page, and is covered by a test.
(d) Close the gap that let these through. Add an e2e smoke that runs the main flows (each toolbar dialog, click-create, drag-create, open an event, alternatives, find time, replan compute) and fails on any uncaught page error. Record in TEST_PLAN that dev-mode/StrictMode behaviour is covered.

WI-36 — Audit findings. AUDIT.md at the repo root is an untracked read-only review (findings A01–A10 plus cleanup notes) written against commit bde3387. Move it to docs/extras/AUDIT.md and commit it. Then for each finding: re-verify it against the current main; if it is real, write the failing test first, fix it, and append a short resolution (fixed in <commit> / not reproducible / deferred with reason) under that finding. Do the P1s (A01, A02) first, then A03–A10, then the cleanup notes only if cheap. Where a fix changes behaviour or a contract, update PROJECT_SCHEMA/TECH_SPEC/TEST_PLAN accordingly.

After WI-36, finish as usual and tell me when main is ready to redeploy.
```

---

## 8. Dialog polish and Replan explanations: WI-37 and WI-38

Divyam's feedback:

> the flexible with time planner option when creating a new event is sort clipping for some reason, and rendering in front of end date picker instead of below it. In the same dialog box change the priority picker to radials instead of a drop down. Same for Only during working hours in task creation. Replan pipeline considers any existing conflicts, but when I created a barred time slot, the barred slot overlap list in the right panel shows these and gives the option to reschedule them one by one but if I try replan it says no changes needed in either strategy.

The agent prompt:

```text
Two new work items, normal protocol (add to TECH_SPEC §14 and PROGRESS.md, test-first, update docs and change logs, merge when green).

WI-37 — Dialog form polish.
(a) Bug: in the Event dialog, the flexible-event time window fields clip and render on top of the End date picker instead of below it. Fix the layout so the flex window fields sit in their own group below End, at full dialog width, with nothing overlapping or clipped at 1440 px, 1024 px and the narrow/drawer width, in both themes. Add a Playwright check that the bounding boxes of the End input and the flex-window inputs do not intersect and are fully inside the dialog.
(b) Event dialog: replace the priority dropdown with a radio group (High / Medium / Low). Each option shows its [H]/[M]/[L] tag and priority colour, as a fieldset with a legend, keyboard-navigable with arrow keys. Use the same radio group for priority in the Task dialog, for consistency.
(c) Task dialog: replace the "Only during working hours" control with a two-option radio group: "Working hours only" (default) and "Any time". It still maps to useWorkingHours.
Keep the schemas and engine unchanged; this is UI only. Update the RTL tests that query these controls, refresh the docs/screenshots dialog shots, and update PROJECT_SCHEMA §7.1 to describe the new controls.

WI-38 — Replan vs barred-slot overlaps.
Observed: after adding a barred slot, the "Barred-slot overlaps" panel lists several events and offers to reschedule each one, but Replan says "No changes needed" for both plans.
1. First, determine which case it is, with tests:
   (i) a flexible, not-yet-started event inside the range that overlaps a barred slot must be moved by Minimal change with reason `barred`. If it is not moved, that's a bug: fix it with a failing test first.
   (ii) fixed events and events that have already started are never moved, by design (BR-12).
2. Make the difference visible. When a replan range contains barred-slot overlaps or conflicts that Replan will not touch, the Replan dialog lists them under a short heading like "Not moved by Replan", with the reason per event ("Fixed event" / "Already started" / "Outside its flex window" / "No free slot"). Each entry gets a "Suggest alternatives" action reusing the existing per-event flow. Never show a bare "No changes needed" while such items exist; say e.g. "No flexible events need moving — 3 fixed events still overlap Lunch".
3. In the conflict panel's barred-overlap rows, add a small "Fixed" or "Flexible" tag so it's clear which ones Replan can handle.
4. Update PROJECT_SCHEMA FR10/BR-12 wording (UX only; the plan algorithm is unchanged unless (i) finds a bug), add tests (engine: the reason classification; UI: the "Not moved by Replan" list and the message), and add this case to D4 in TEST_PLAN §8.
```

---

## 9. Repository documentation

This prompt produced this file and the README's team and AI-assisted development sections.

```text
Now, for the github repo's readme, add my team's credentials there. Next add something or if it has to be done manually tell me something to add for the description under the About label on the repo home page. Next create a prompts markdown and add all relevant prompts from this conversation that directly contributed to development in it. Then update the readme to add a AI assisted development section that first outlines that relevant files such as claude md agents md my skill the prompts md audit md etc (make a small markdown file tree of sorts for this) and then very briefly outlines the usage of AI and the whole contracts system TDD that I designed with your help and intended for the AI agents to use while coding. In the same readme md, under the documentation section add a line/paragraph about we deviated a bit to fit the needs to the app given the constraints blah blah blah the deviations are documented under where ever they are.
```
