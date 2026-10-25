# Progress

Shared handoff file for every agent and human working on this repo. Format and rules: `AGENTS.md` §3–§5 and `docs/TECH_SPEC.md` §0 and §14.

Production URL: https://int-calendarfeature-creatures.vercel.app

## Current state

- **Active WI:** none — next is WI-06 Repositories (WI-07 is also unblocked).
- **Last session:** 2026-10-25 · Claude Code · finished and merged WI-01–05.
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
- [ ] **WI-06** Repositories — owner Dv — depends on 02
- [ ] **WI-07** Test helpers & oracles — owner S — depends on 02, 04

### Phase 3 — Algorithms and engine

- [ ] **WI-08** Conflict sweep — owner S — depends on 05, 07
- [ ] **WI-09** Merge, segments, gaps — owner S — depends on 05, 07
- [ ] **WI-10** Day load + ranking — owner S — depends on 09
- [ ] **WI-11** Task order + replan heuristics — owner S — depends on 10
- [ ] **WI-12** Engine state & commit & history — owner Dv — depends on 06, 08
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

## Human-only steps

- [ ] Connect the GitHub Classroom repo as `origin` and push `main`.
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
