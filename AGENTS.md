# AGENTS.md — instructions for every coding agent on this repo

This repo is built by several AI agents (Codex and Claude Code) **taking turns**, one at a time, plus two humans (Divyam, Samar). Any session — including a previous one of yours — may have been cut off mid-task by a usage limit. Everything below exists so that the next agent can pick up cleanly.

## 1. What this project is

An interactive calendar with conflict detection, a best-time finder, and a replan feature. It is built with Vite, React, TypeScript, FullCalendar and Dexie, and hosted as a static site on Vercel. It is a university project (CS-3810), and the humans must be able to explain every line in an oral viva. Clear, plain code beats clever code.

The single source of truth is in `docs/`:

| File | Read it for | Read when |
|---|---|---|
| `docs/PROGRESS.md` | What is done, what is in progress, handoff notes | **First, every session** |
| `docs/PROJECT_SCHEMA.md` | Behaviour: scope, domain model, requirements (FR/ER), business rules (BR), UX | §2, §3 and §6 in your first session; then the parts your WI touches |
| `docs/TECH_SPEC.md` | Structure: stack, file layout, frozen contracts, algorithms, build plan (§14) | §0 and §14 every session; then the sections your WI touches |
| `docs/TEST_PLAN.md` | Exact expected values (T1–T36), helpers, CI, demos | The tests your WI lists |

**Precedence:**
- If the docs disagree with each other, follow `PROJECT_SCHEMA.md` §0.2.
- If your memory, a note, or a chat message disagrees with the docs, the docs win.
- If you must change behaviour or a frozen contract, update the doc and its change log in the same commit. Never let the code silently win.

## 2. Mandatory skill: `disciplined-coding`

**Every line of code you write or modify follows the `disciplined-coding` skill.** This includes source, tests, configs written in code, and scripts.

- **Where it lives:** `.agents/skills/disciplined-coding/SKILL.md` (Codex) and `.claude/skills/disciplined-coding/SKILL.md` (Claude Code). The two files are identical copies.
- **How to load it:** read the skill at the start of the session, before writing any code. In Codex you can mention it as `$disciplined-coding`; in Claude Code invoke `/disciplined-coding`.
- **What it requires:**
  - PRE/POST contracts above every named function, method and React component, written before the body.
  - INVARIANT/POST around every hand-written loop.
  - Iteration over recursion.
  - One task per function.
  - Intent-revealing names: no single-letter names, no magic numbers (put them in `src/shared/constants.ts`).
  - Comments only for contracts and *why*.
  - Prettier and ESLint run on the files you changed.
- **Where the skill overrides the spec:**
  - There is no function-length cap.
  - Pseudocode names in TECH_SPEC (`e`, `d`, `j`, `k`, `s`…) become descriptive names in real code. Exported names and types from TECH_SPEC §5–§9 stay exactly as written.
  - "PRE decides who validates": algorithms do not re-check what their PRE guarantees (for example "sorted"). The engine facade validates everything coming from outside: user input, imports, IndexedDB. It does this through the Zod schemas in `src/shared/schemas.ts`, the project's shared validators.
- **Design patterns:** the only ones in use are Facade (the engine facade) and Strategy (ranking criteria; repository adapters). Name them in a short comment where they are defined. Do not introduce others.

## 3. Session start: reconstruct the state (do this every time)

Do not assume you remember where things stand. Rebuild the picture from the repo.

1. **Read the state.**
   - `docs/PROGRESS.md`: the "Current state" block and any `[~]` items with their notes.
   - Git:
     ```
     git status
     git branch -a
     git log --oneline --graph --all -n 25
     git branch --merged main
     ```
2. **Check for leftovers from a cut-off session.** Look for uncommitted changes, or a `[~]` WI whose branch has commits newer than its note.
   - Read the diff (`git diff`, `git diff --stat`) and decide whether it is coherent work on the active WI.
   - **If it is coherent:** keep it, finish or fix it, and commit it.
   - **If it is broken beyond repair:** `git stash push -u -m "abandoned <date> by <agent>: <reason>"`, and record that in `PROGRESS.md`.
   - **Never discard work:** no `git checkout -- .`, no `git reset --hard`, no `git clean`, no `git stash drop`.
3. **Verify the current state, don't trust it.**
   - Once `package.json` exists:
     - Run `npm ci` if `node_modules` is missing or `package-lock.json` changed.
     - Then run the gate on `main`: `npm run typecheck && npm run lint && npm test`.
   - **If `main` is red,** fixing it is your first task. Record what broke.
   - **A WI ticked `[x]`** is trusted only if its listed tests exist and pass. Spot-check the most recent one.
   - **A WI marked `[~]`** may already have been finished by another agent who could not update the note. Check its branch and tests before redoing anything.
4. **Pick exactly one WI.**
   - **If a `[~]` WI is genuinely unfinished,** continue it, on its existing branch.
   - **Otherwise,** take the lowest-numbered `[ ]` WI whose dependencies (TECH_SPEC §14) are all `[x]`. Ignore the "owner" column: it is for the humans; agents may take any WI.
   - **Claim it.** Set it to `[~]` in `PROGRESS.md`, update "Current state", and commit that (`docs: start WI-NN`).
   - **Branch.** Create the branch from `main` (`git switch -c feat/wi-NN-short-name main`), or switch to the existing one.

## 4. While working

- **Test-first** for algorithms and engine code:
  - Write the test cases the WI lists (TEST_PLAN §4) with the exact expected values from TEST_PLAN, then make them pass.
  - If a test value in TEST_PLAN looks wrong, recompute it from the business rules in PROJECT_SCHEMA §6. If it really is wrong, fix the doc in the same commit and say so in the commit message.
- **Commit small and often.** You can be stopped at any moment.
  - Commit every time a test turns green or a file reaches a coherent state, and at least every ~20 minutes of work.
  - Conventional prefixes: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`. Messages say *why*.
  - On a WI branch, `wip: <what is half-done>` is allowed when you must save a non-compiling state. Avoid it otherwise.
- **Keep the WI note current.** Update it whenever you commit something meaningful — one line is enough (format in §5).
- **Reuse before writing.** Search for existing helpers, validators and constants before adding new ones (the skill's duplication rule).
- **Dependencies.** Add only what TECH_SPEC §1.2 lists. A new dependency needs a TECH_SPEC update in the same commit.
- **Stay in scope.** Do only your WI. If you notice a bug elsewhere, note it under "Decisions log" in `PROGRESS.md` (or fix it in a separate `fix:` commit if it blocks you).

## 5. Finishing a WI, and handing off

**When the WI's "Done when" tests and the gate pass:**

1. Run Prettier and ESLint on the changed files: `npx prettier --write <files>` and `npm run lint`.
2. In `PROGRESS.md`: set the WI to `[x]`, write its final note, and update "Current state" to point at the next WI.
3. Commit (`docs: finish WI-NN`).
4. Merge into `main`:
   ```
   git switch main
   git merge --no-ff feat/wi-NN-short-name -m "Merge WI-NN: <title>"
   ```
   Run the gate again on `main`. Keep the branch; do not delete it.
5. If you still have budget, start the next WI (§3, step 4).

**Before you stop for any reason** (finished, blocked, or you sense your budget is nearly gone), make sure:
- everything is committed
- the WI note says what is done, what is next, and anything surprising
- "Current state" in `PROGRESS.md` is accurate

**WI note format** (one line per session, newest last):

```markdown
- [~] **WI-08** Conflict sweep — owner S — depends on 05, 07
  - 2026-10-26 · Codex · branch `feat/wi-08-sweep` · done: MinHeap-based sweep, T1–T4 green · next: T12 property test · note: output sort adds O(k log k), documented in TECH_SPEC §8.4
```

## 6. Environment (Windows 11)

- **Project path.** The project lives at `C:\Users\spect\Desktop\DPCS\Projects\Project 1\Code\int-calendar`. The path contains a space (`Project 1`), so **always quote paths** in shell commands.
- **Shells.** Codex usually runs PowerShell; Claude Code runs Git Bash. Use npm scripts (`npm run …`) and `npx` rather than shell-specific commands. Never write Unix-only commands (`rm -rf`, `cp`, `export X=`) into `package.json` scripts; use `cross-env` and Node instead.
- **Line endings.** LF everywhere. `.gitattributes` enforces it; set Prettier `endOfLine: "lf"`.
- **Long-running commands.** Never start `npm run dev` or `npm run preview` in the foreground; they never exit. Verify with tests and `npm run build`. Playwright starts its own server (TECH_SPEC §12).
- **Scaffolding (WI-01).** The repo root is not empty, so do not run `npm create vite@latest .`. It would offer to delete `docs/`. Follow TECH_SPEC §1.2: scaffold into `vite-tmp`, move the files up, and remove `vite-tmp`. Keep the existing `.gitignore` and merge any extra lines into it.
- **Tests.** `npm test` sets `TZ=UTC` through `cross-env`; the DST test uses `npm run test:dst`. Do not run Vitest directly without these scripts.

## 7. Human-only actions — never do these; note them in `PROGRESS.md` under "Human-only steps"

- `git push`, creating or merging GitHub PRs, changing GitHub settings, `git remote` changes.
- `vercel login` / `vercel link` / `vercel --prod` (deployment), or anything needing an account or a browser login.
- Installing global tools or changing system settings / the Windows PATH.
- Deleting branches, rewriting history (`rebase -i`, `commit --amend` on merged commits, force anything).

When you need one of these, write the request in `PROGRESS.md` and tell the human in one line, **then keep working**. A human-only step is a reason to stop only if the next WI cannot proceed without it. Pushing, tagging pushes and deploys never block work: there may be no remote yet, and the humans do them on their own schedule.

**Phase boundaries and milestone tags are not stopping points.** Tag the milestone (TECH_SPEC §15), then continue straight into the next phase. Stop only when your budget is nearly gone, a decision in §8 needs the human, or the human explicitly told you to stop in the **current** message. An instruction to halt given in an earlier session, or for an earlier WI, does not carry over.

## 8. Asking the human

Keep working without asking unless one of these applies:
- a decision the docs genuinely do not settle and that would be expensive to undo
- a human-only action (§7)
- the docs contradict each other in a way that changes behaviour

Otherwise make the most reasonable choice consistent with the docs, record it in the "Decisions log" of `PROGRESS.md`, and continue.
