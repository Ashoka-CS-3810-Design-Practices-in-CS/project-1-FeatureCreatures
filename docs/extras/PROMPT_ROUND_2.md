# Round 2 agent prompt (reusable)

Paste the block below into a fresh Codex or Claude Code session at the repo root. It is safe to paste again after a usage-limit halt: the agent resumes from the batch plan in the progress file and does not start over.

```text
You are a coding agent on int-calendar (CS-3810, team Feature Creatures). This is round 2: a large redesign that is already planned and decided. Your job is to implement it, one work item at a time, exactly as specified.

## 0. Rules you follow throughout
- AGENTS.md is the law for this repo, and CLAUDE.md applies too if you are Claude Code. Follow its session protocol (§3–§5), its human-only list (§7) and its rules for asking (§8).
- Load the disciplined-coding skill before writing any code. Use .agents/skills/disciplined-coding/SKILL.md (Codex) or /disciplined-coding (Claude Code). Every line you write or modify follows it: PRE/POST on every function and component, INVARIANT/POST on every loop, no magic numbers, Facade and Strategy as the only patterns.
- The binding design is docs/extras/AUDIT_2.md. It contains the answers to the three questions (§2), findings U1–U25 (§3), decisions D-01–D-19 (§4), business-rule changes (§5), scope (§6), the work plan WI-47–59 (§7) and Claude's calls C-01–C-08 (§8). Do not reopen a decision that file settles. If code or the main docs disagree with AUDIT_2, change them to match it, with change-log lines, in the WI that touches that behaviour.
- Verify against the code and a running build, never from memory or screenshots.
- Never push, deploy, create PRs, change remotes, delete branches or rewrite history. Those steps are human-only.

## 1. Find out where the batch stands (every session)
1. Find the progress file. It is at docs/progress/PROGRESS.md, or at docs/PROGRESS.md if WI-47 has not been merged yet. Read "Current state" and the section "### Round 2 overhaul (batch)".
2. Run AGENTS.md §3 in full: git status, branches, the log, leftovers from a cut-off session, the gate on main, and a spot-check of the last [x] WI.
3. If the section "Round 2 overhaul (batch)" does not exist, this is the first session. Do this setup on main, then continue with step 4:
   a. Commit the untracked planning inputs exactly as they are, with the message "docs: add round-2 audit and planning inputs". These are docs/extras/AUDIT_2.md, docs/extras/PROMPT_ROUND_2.md, docs/extras/audit-2/ and docs/extras/feedback-2026-11-12/. Commit nothing else in that commit.
   b. Record a BASELINE gate. Run every command in §3 and write the exact numbers into the progress file under the batch heading: test count, skipped count, coverage for statements, branches, functions and lines (overall and for algorithms), DST count, property runs, build result, and e2e checks × repeats.
   c. Add the batch plan under "### Round 2 overhaul (batch)". It has one [ ] line per WI-47…WI-59, using the titles and "Done when" from AUDIT_2 §7, each WI depending on the previous one. It also has a final [ ] "Finish" line and a [ ] "Human: push, deploy, run the smoke test" line. Add the same WIs as rows to TECH_SPEC §14, with a change-log line. Commit as "docs: plan round 2 (WI-47–59)".
4. Resume. If a WI is [~], continue it on its branch. Otherwise take the lowest [ ] WI. One WI is one change group, on its own branch feat/wi-NN-short-name, merged to main with --no-ff only when the full gate (§3) is green on the branch and again on main. Keep the branch. Update the WI note at every meaningful commit, as AGENTS.md §5 describes, so a later re-paste resumes exactly where you stopped.

## 2. How to build each WI
- Test first. Write the failing tests for the WI's decisions, and see them fail for the right reason before you write the code. Engine and algorithm changes get unit tests, plus property tests where AUDIT_2 asks for them (D-06 generator, D-15 strategies). UI changes get RTL tests, plus Playwright where a gesture, layout or two-page flow is involved.
- Keep every existing test passing. You may change an existing expectation only where a decision in AUDIT_2 changes that behaviour, for example T43's wording (D-03), BR-7 picker output (D-06), the event fill (D-12) or the layout selectors (D-14). Name every changed test and the decision behind it in the commit message and in the WI note.
- Never weaken a test: no deleted assertions, no .skip or .only, no looser coverage thresholds, no fewer property runs, no longer timeouts used to hide flakiness. When a selector moves, update it to the new accessible name or role. Do not fall back to a CSS-class hook.
- Accessible names: keep the existing ones wherever the control still exists. New controls get clear names, as AUDIT_2 gives them (for example "Calendar lock").
- Contrast: every new token pair goes into src/ui/styles/tokens.test.ts. Text must be ≥ 4.5:1 and non-text ≥ 3:1, in both themes, including for every accent swatch and every category swatch.
- Only the dependencies TECH_SPEC §1.2 lists. A new one needs a TECH_SPEC update in the same commit. Prefer none.
- Commit small and often, with the AGENTS.md prefixes.

## 3. The full gate (on the branch before merging, and on main after)
npm run typecheck && npm run lint && npm run test:coverage && npm run test:dst && npm run test:props:full && npm run build && npx playwright test --repeat-each=3 --workers=2
- Run npm run build before e2e, because a stale preview server on port 4173 serves whatever is in dist/.
- For UI WIs, also run npm run screenshots. Look at the captures in both themes at 1440, 1280 and 1024 px, fix what looks wrong, and commit the reviewed set to docs/screenshots/.
- On Windows PowerShell, use npm.cmd and npx.cmd if the shims are blocked. The path contains a space, so quote it.
- If main is red at the start of a session, fixing it is your first job. Record what broke.

## 4. Requirements that cut across WIs
IndexedDB and export (WI-48; D-17):
- Add Dexie version(3) with an upgrade function. Never edit versions 1 or 2.
- An upgrade test opens a v2 database full of data (events with each enum category, tasks, settings with overlapping barred slots, and the meta revision) and proves that every row is kept and mapped correctly.
- Bump the export format to version 2. Import accepts v1 files (the mapping in D-17) and v2 files. Keep one v1 fixture under tests/ for the v1-import test.
- Re-export docs/samples/*.json as v2 with npm run samples:export, and check that all six still import.
- The revision check from WI-40 must keep working on v3.

Docs:
- In each WI, update all three main docs (PROJECT_SCHEMA, TECH_SPEC, TEST_PLAN) where its behaviour, contracts or tests change, each with a change-log line. Also update the README where users would notice the change. AUDIT_2 §5 lists the business-rule and requirement changes.
- Add the new tests to TEST_PLAN as new T-numbers, starting at T48.
- Update the progress file's Decisions log for every choice AUDIT_2 does not settle.

Docs restructure (WI-47; D-18), done with git mv:
- PROGRESS.md moves to docs/progress/PROGRESS.md.
- AUDIT.md, BUG_REPORTS.md and PROMPTS.md move to docs/extras/.
- PROJECT_SCHEMA.md, TECH_SPEC.md and TEST_PLAN.md stay in docs/. samples/ and screenshots/ stay where they are.
- Fix every link and reference: AGENTS.md (its docs table, session protocol and examples), CLAUDE.md, README, the three main docs, the extras, scripts/, .github/, playwright configs and both skill copies, if they mention paths.
- Check with a grep for "docs/PROGRESS", "docs/AUDIT", "docs/BUG_REPORTS" and "docs/PROMPTS" across the repo, excluding node_modules, dist and coverage. Nothing may be left outside historical change-log text.

Smoke test (WI-59; D-19):
- Write ONE manual smoke test as TEST_PLAN §7. It replaces the demo scripts D1–D5 (§8), the accessibility checklist (§7.1), the UX sanity list (§7.2) and the peer-fix smoke checklist in the progress file.
- It covers every new and changed feature in AUDIT_2, plus the core FRs and B1–B4.
- It is ordered sections S1…Sn of short tickable steps, each step saying what to do and what you should see. It runs on the live site, in both themes, with keyboard and contrast checks woven into the steps, and is doable in 20–30 minutes.
- Point TEST_PLAN §9 and README at it. Move the old rehearsal record to docs/extras/ as history.

## 5. Finishing the batch
- When WI-59 is merged, run the full gate on main with --repeat-each=5. Compare it with the baseline in the progress file: the test count must not drop, and coverage must not fall by more than 0.5 points.
- Put the results in the README's test-results section. Tick "Finish", and add the human step to "Human-only steps".
- Then stop, and print for the human exactly:
  1. The push commands:
     git push origin main
     git push origin --all
     git push origin --tags
  2. The deploy command:
     npx vercel --prod      (npx.cmd vercel --prod on blocked PowerShell)
  3. "Run the smoke test on the live site: TEST_PLAN §7, https://int-calendarfeature-creatures.vercel.app"

If your budget runs low before the batch is done, follow AGENTS.md §5 "Before you stop": everything committed, the WI note saying what is done and what is next, and "Current state" accurate. Then say in one line where the next session should resume.
```
