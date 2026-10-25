# Progress

Shared handoff file for every agent and human working on this repo. Format and rules: `AGENTS.md` §3–§5 and `docs/TECH_SPEC.md` §0 and §14.

Production URL: https://int-calendarfeature-creatures.vercel.app

## Current state

- **Active WI:** none — next is WI-13 Facade + Event CRUD (its dependencies 10 and 12 are done).
- **Last session:** 2026-10-26 · Claude Code · finished and merged WI-08–WI-12.
- **Gate status on `main`:** green (typecheck, lint, test; also test:dst, test:coverage, build).

## Work items

Status marks: `[ ]` not started · `[~]` in progress · `[x]` done (tests listed in the WI's "Done when" pass and the gate passes).

### Phase 1 — Setup

- [x] **WI-01** Scaffold & tooling — owner Dv — depends on —
  - 2026-10-25 · Claude Code · branch `feat/wi-01-scaffold` · done: Vite react-ts scaffold, all §12 configs, ESLint §3.2 boundaries (probed: algorithms→date-fns is rejected), CI §13.1, README stub, toolchain tests for TZ=UTC and the DST zone · next: WI-02 · note: `src/main.tsx` is a placeholder until WI-18; `npx playwright install chromium` not run yet (needed from WI-27); first Vercel deploy is a human step

### Phase 2 — Core types and data

- [x] **WI-02** Shared types, result, errors, constants — owner S — depends on 01
  - 2026-10-25 · Claude Code · branch `feat/wi-02-shared-types` · done: `src/shared/{types,result,errors,constants}.ts` match §5; `result.test.ts` and `constants.test.ts` green · next: WI-03 · note: `ok`/`err` are function declarations (same exported names and signatures) so they carry PRE/POST
- [x] **WI-03** Schemas — owner Dv — depends on 02
  - 2026-10-25 · Claude Code · branch `feat/wi-03-schemas` · done: `src/shared/schemas.ts` with T5 (a–f) and T31 schema-level cases, settings, stored and export schemas; 41 cases in `schemas.test.ts` · next: WI-04 · note: the engine must validate with `parseInput` (maps to InvalidTime/InvalidInput); import builds InvalidImport from `toFieldIssues`; facade-level and UI parts of T5/T31 belong to WI-13/14 and WI-19/20 (TECH_SPEC v1.3)
- [x] **WI-04** Local-time module — owner S — depends on 02
  - 2026-10-25 · Claude Code · branch `feat/wi-04-time` · done: `src/shared/time.ts` (§8.6); `time.test.ts` green under UTC; `time.dst.test.ts` (T29 time part: 1500-min frame, work at +600, 540 long, 09:00 round-trip) green under `test:dst` · next: WI-05 · note: T29's "only option is 09:00–18:00" needs `findSlots`, so WI-14 must add it to a `*.dst.test.ts`; a barred `endMin` of 1440 also maps to `dayEnd`; added an ESLint rule so only `shared/time.ts` may import date-fns
- [x] **WI-05** Interval / sortedArray / minHeap — owner S — depends on 02
  - 2026-10-25 · Claude Code · branch `feat/wi-05-structures` · done: `algorithms/{interval,sortedArray,minHeap}.ts` with TEST_PLAN §4.3 unit tests, 100% coverage · next: WI-06 · note: `sortedArray.test.ts` has a local `event()` builder; WI-07 should swap it for the shared `ev()` helper; `insertSorted` places a new event after equal ones
- [x] **WI-06** Repositories — owner Dv — depends on 02
  - 2026-10-25 · Claude Code · branch `feat/wi-06-repositories` · done: `src/data/{repository,memoryRepository,dexieRepository}.ts`; `repository.test.ts` runs the same round-trip/no-aliasing contract on both adapters plus Dexie atomicity (apply and replaceAll roll back) and reopen persistence under fake-indexeddb · next: WI-07 · note: `DexieRepository.close()` was added for tests (not on the interface); `repository.test.ts` has local `event()`/`task()` builders that WI-07 should replace
- [x] **WI-07** Test helpers & oracles — owner S — depends on 02, 04
  - 2026-10-25 · Claude Code · branch `feat/wi-07-test-helpers` · done: `tests/helpers/{time,builders,oracle,failingRepository}.ts`; `helpers.test.ts` checks the oracles against T1–T3, T6, T11 · next: WI-08 · note: **`tests/helpers/engine.ts` (`makeEngine`) is not built yet — it needs the Engine, so WI-13 must add it**; the local minute-based builders in `sortedArray.test.ts` / `repository.test.ts` were kept on purpose (they test raw minute arithmetic)

### Phase 3 — Algorithms and engine

- [x] **WI-08** Conflict sweep — owner S — depends on 05, 07
  - 2026-10-26 · Claude Code · branch `feat/wi-08-sweep` · done: `algorithms/{sweep,target}.ts`; T1–T4 and BR-10 rules 1–5 in unit tests; T12 in `sweep.props.test.ts` (also green at 10,000 random-seed runs; a `<`/`≤` mutation is caught) · next: WI-09 · note: new `tests/helpers/props.ts` (`propParams`, `PROP_TIMEOUT_MS`) — use it in T33–T35; `countOverlaps` takes `Interval`s (TECH_SPEC v1.4)
- [x] **WI-09** Merge, segments, gaps — owner S — depends on 05, 07
  - 2026-10-26 · Claude Code · branch `feat/wi-09-gaps` · done: `algorithms/{merge,segments,gaps}.ts` with the §4.3 unit tests; T33 in `gaps.props.test.ts` (green at 10,000 random-seed runs; a skip-too-far mutation is caught) · next: WI-10 · note: no-working-hours segments are the window minus barred slots in one pass, not per day plus merge (TECH_SPEC v1.5); gap boundaries read `bufferMin` back from the block; `allowedSegments` expects `notBefore` already rounded up to `SNAP_MIN` (the caller's job, WI-13 `search.ts`)
- [x] **WI-10** Day load + ranking — owner S — depends on 09
  - 2026-10-26 · Claude Code · branch `feat/wi-10-rank` · done: `algorithms/{dayLoad,rank}.ts` with the §4.3 unit tests (T10 orders, clamp, every tie-break); T34 in `rank.props.test.ts` (green at 10,000 runs; a key-order mutation is caught) · next: WI-11 · note: `computeDayLoads` returns an entry for every frame (0 on non-working days); the frame builder moved to `tests/helpers/builders.ts` as `dayFrame()`; ranking criteria are the Strategy pattern (`sortKey` in `rank.ts`)
- [x] **WI-11** Task order + replan heuristics — owner S — depends on 10
  - 2026-10-26 · Claude Code · branch `feat/wi-11-replan` · done: `algorithms/{taskOrder,replanHeuristics}.ts`; unit tests cover all 5 BR-11 keys, every BR-12 move reason and their order, unplaced events staying busy, notBefore, and T22/T23 with TEST_PLAN's exact values at algorithm level; T35 in `replanHeuristics.props.test.ts` (green at 10,000 runs; a dropped buffer check is caught) · next: WI-12 · note: WI-16 can build `ReplanInput` the way `replanHeuristics.test.ts` does (`segmentsFor` = `allowedSegments(…, useWorkingHours: true, notBefore)`); `compareIds` is now exported from `sortedArray.ts`
- [x] **WI-12** Engine state & commit & history — owner Dv — depends on 06, 08
  - 2026-10-26 · Claude Code · branch `feat/wi-12-state` · done: `src/engine/state.ts` (`createState`, `applyChange`, `commit`, history) + `state.test.ts` (forward/backward, StorageError leaves state and repo untouched, 50-step limit, redo cleared on do) · next: WI-13 · note: `commit` returns a `CommitOutcome`; the facade must add `snapshot` and `suggestion` (TECH_SPEC v1.6). For 'undo'/'redo' the caller passes the top of that stack, and `commit` pops it. **WI-13 must also add `tests/helpers/engine.ts` (`makeEngine`)**
- [ ] **WI-13** Facade + Event CRUD — owner Dv — depends on 12, 10
- [ ] **WI-14** Task Scheduler pipeline — owner Dv — depends on 13
- [ ] **WI-15** Conflict Resolution pipeline — owner Dv — depends on 13
- [ ] **WI-16** Replan pipeline — owner S — depends on 11, 13
- [ ] **WI-17** Undo/redo, import/export, samples — owner Dv — depends on 13

### Phase 4 — UI

- [ ] **WI-18** Store, bootstrap, App shell, toasts, empty state — owner Dv — depends on 17
- [ ] **WI-19** Calendar view + EventDialog — owner Dv — depends on 18
- [ ] **WI-20** Task panel + TaskDialog — owner S — depends on 18
- [ ] **WI-21** Conflict panel + SlotPicker (both modes) — owner S — depends on 19, 20
- [ ] **WI-22** Replan dialog — owner S — depends on 21
- [ ] **WI-23** Settings dialog + data section — owner S — depends on 18
- [ ] **WI-24** Toolbar, theme, shortcuts, help — owner Dv — depends on 19
- [ ] **WI-25** Styles & tokens — owner Dv — depends on 19
- [ ] **WI-26** Responsive drawer + a11y pass (+ optional drag preview) — owner S — depends on 21–25

### Phase 5 — Testing

- [ ] **WI-27** Playwright E1–E3 — owner Dv — depends on 26
- [ ] **WI-28** Benchmarks — owner S — depends on 17
- [ ] **WI-29** Coverage & bug bash — owner S + Dv — depends on 27, 28

### Phase 6 — Docs and demo

- [ ] **WI-30** README & demo scripts — owner S + Dv — depends on 29
- [ ] **WI-31** Final docs sync — owner S + Dv — depends on 30

## Milestones

- **m1** (2026-10-25) — Phase 1 Setup: Vite/React/TS scaffold, ESLint layer boundaries, Vitest (UTC + DST), Playwright config, CI workflow; first Vercel deploy done by the humans.
- **m2** (2026-10-25) — Phase 2 Core types and data: frozen shared types/constants/result/errors, Zod schemas with `parseInput`, DST-safe local-time module, interval/sortedArray/minHeap, Memory + Dexie repositories (atomic), test helpers and brute-force oracles. 105 unit tests + 4 DST tests, 100% coverage of `src/`.

## Human-only steps

- [ ] Connect the GitHub Classroom repo as `origin` and push `main`.
- [ ] Push the WI branches and milestone tags too: `git push origin --all` and `git push origin --tags` (tags `m1`, `m2` exist locally).
- [x] First Vercel deploy (TECH_SPEC §13.2) and paste the URL at the top of this file.
- [ ] Turn on branch protection for `main` on GitHub (optional).

## Decisions log (append-only)

- 2026-10-25: Repo initialised with the three spec docs, AGENTS.md, CLAUDE.md and the `disciplined-coding` skill. TECH_SPEC v1.1 aligns the spec with the skill.
- 2026-10-25 (WI-01, Claude Code): the current create-vite template ships oxlint and a split tsconfig; both were dropped for ESLint (§1.1) and a single `tsconfig.json` (§12).
- 2026-10-25 (WI-01, Claude Code): `@hookform/resolvers` pinned to `^5`; v6 fails to install on an optional-peer conflict (`effect` 3 vs 4). Zod resolved to 4.x. TECH_SPEC v1.2.
- 2026-10-25 (WI-01, Claude Code): CI e2e runs with `--pass-with-no-tests` until WI-27, otherwise every push to `main` fails on "no tests found". WI-27 must remove the flag. TECH_SPEC v1.2.
- 2026-10-25 (WI-01, Claude Code): `.prettierignore` excludes `docs/`, `AGENTS.md`, `CLAUDE.md` and the skill folders so `npm run format` never reflows the hand-written specs.
- 2026-10-25 (WI-01, Claude Code): `vitest.dst.config.ts` spreads the base config instead of using `mergeConfig`, because `mergeConfig` concatenates arrays and would keep the base include/exclude lists.
- 2026-10-25 (WI-02, Claude Code): CI runs `test:coverage` with global thresholds (70%, and 90% for algorithms), so any `src/` file with runtime code and no test makes CI red. Every WI must ship tests that import each new runtime file, even when its "Done when" asks only for "compiles".
- 2026-10-25 (WI-07, Claude Code): `makeEngine` (TEST_PLAN §2, `tests/helpers/engine.ts`) moves from WI-07 to WI-13, because WI-07 depends only on WI-02/04 and the Engine does not exist until WI-13.
- 2026-10-26 (WI-08, Claude Code): property tests read `PROP_RUNS`/`PROP_SEED` through one shared helper, `tests/helpers/props.ts`. `npm test` leaves both unset, so the helper's defaults (1000, 42) are what CI runs; this matches TEST_PLAN §1.3 without changing the npm scripts.
- 2026-10-26 (WI-09, Claude Code): in `allowedSegments`, when the work start or end equals the window edge, the edge is labelled `workStart`/`workEnd`, not `windowStart`/`windowEnd`. T6 expects `after = workEnd` for a window that equals working hours.
- 2026-10-26 (WI-11, Claude Code): T35 reads "overlap no static event … even with each expanded by the buffer" as "the placed event grown by the buffer meets no other event". That is BR-6's free-gap condition; growing both sides would demand twice the buffer, which BR-12 never promises.
