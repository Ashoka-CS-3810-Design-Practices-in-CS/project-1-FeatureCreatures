# Progress

Shared handoff file for every agent and human working on this repo. Format and rules: `AGENTS.md` §3–§5 and `docs/TECH_SPEC.md` §0 and §14.

Production URL: _not deployed yet_

## Current state

- **Active WI:** none — start at WI-01.
- **Last session:** repo setup by the humans (docs, AGENTS.md, skill, git init). No code yet.
- **Gate status on `main`:** n/a (no package.json yet).

## Work items

Status marks: `[ ]` not started · `[~]` in progress · `[x]` done (tests listed in the WI's "Done when" pass and the gate passes).

### Phase 1 — Setup

- [ ] **WI-01** Scaffold & tooling — owner Dv — depends on —

### Phase 2 — Core types and data

- [ ] **WI-02** Shared types, result, errors, constants — owner S — depends on 01
- [ ] **WI-03** Schemas — owner Dv — depends on 02
- [ ] **WI-04** Local-time module — owner S — depends on 02
- [ ] **WI-05** Interval / sortedArray / minHeap — owner S — depends on 02
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
- [ ] First Vercel deploy (TECH_SPEC §13.2) and paste the URL at the top of this file.
- [ ] Turn on branch protection for `main` on GitHub (optional).

## Decisions log (append-only)

- 2026-10-25: Repo initialised with the three spec docs, AGENTS.md, CLAUDE.md and the `disciplined-coding` skill. TECH_SPEC v1.1 aligns the spec with the skill.
