# TECH_SPEC.md — Interactive Calendar and Intelligent Time Planner

**Doc 2 of 3.** This file covers *how* to build it.

- Behaviour, vocabulary and business rules (`BR-*`) are defined in `PROJECT_SCHEMA.md`.
- Exact test inputs and outputs (`T*`) are in `TEST_PLAN.md`.
- Precedence rules are in `PROJECT_SCHEMA.md` §0.2.

---

## 0. How to work on this repo (humans and agents)

The session protocol for agents (start, commit, handoff, merge) lives in `AGENTS.md` at the repo root. Code style is governed by the `disciplined-coding` skill (`.agents/skills/disciplined-coding/SKILL.md`, mirrored in `.claude/skills/`). The rules below are the project-specific part.

1. **Read before coding.** Read `PROJECT_SCHEMA.md` §2, §3 and §6. Then read this file's sections for your work item (§14), and the tests that work item lists in `TEST_PLAN.md`.
2. **Progress file.** `docs/progress/PROGRESS.md` holds one checkbox per work item (WI) from §14. It was created during repo setup, before WI-01.
   - Before you stop (including when your usage limit runs out), tick what you finished.
   - Under the WI, write a note of one to three lines: what is done, what is next, and anything surprising.
   - The next agent starts from that note.
3. **One branch per work item.** Use names like `feat/wi-08-sweep`, `fix/...` or `test/...`, always branched from the latest `main`. Commits follow conventional style (§15). When the work item's tests and the gate (rule 5) pass, merge it into `main` locally with `git merge --no-ff`, so the branch stays visible in history. Agents never push; the humans push `main` and the branches to GitHub.
4. **Frozen contracts.** These must not change without updating this file in the same PR and adding a change-log line (§16):
   - shared types (§5)
   - schemas (§6)
   - the Engine interface (§7.2)
   - the Repository interface (§9.1)
   - algorithm signatures (§8)
5. **Gate before pushing.** `npm run typecheck && npm run lint && npm test` must pass.
6. **Viva rule.** Every line must be explainable by its owner.
   - Prefer plain loops over clever one-liners.
   - Keep each function to one narrow task (the `disciplined-coding` skill has no line limit).
   - The short names in this file's pseudocode (`e`, `d`, `j`, `k`, `s`) are pseudocode only. Real code uses intent-revealing names; exported function and type names in §5–§9 are the frozen part, parameter names are not.
   - Write comments that say *why* wherever a line is not obvious.
   - Do not add dependencies beyond §1.2 without updating this file.

---

## 1. Stack

### 1.1 Choices

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes: false` |
| UI | React (latest stable) + Vite | SPA, single route |
| Calendar widget | FullCalendar React, with the MIT plugins `core`, `react`, `daygrid`, `timegrid`, `interaction`, `list` | Rendering and gestures **only** (§11.3) |
| UI state | zustand | One store (§11.1) |
| Forms / validation | React Hook Form + Zod | The same Zod schemas validate in the UI and the engine (§6) |
| Dates | date-fns | Only in `src/shared/time.ts` and `src/ui/**` |
| Persistence | Dexie (IndexedDB) | Behind the `Repository` interface (§9) |
| Unit / integration tests | Vitest, @vitest/coverage-v8, fast-check, fake-indexeddb | |
| UI tests | React Testing Library, user-event, jest-dom, jsdom | |
| End-to-end tests | Playwright (Chromium only) | 3 smoke tests |
| Lint / format | ESLint (flat config, typescript-eslint, react-hooks), Prettier | Layer boundaries are enforced in ESLint (§3.2) |
| CI | GitHub Actions | §13.1 |
| Hosting | Vercel (static) | §13.2 |
| Styling | CSS Modules for layout; global tokens, shared controls and FullCalendar overrides | No CSS framework |

### 1.2 Dependencies (install exactly these)

```bash
# The repo root is not empty (docs/, AGENTS.md, …), and create-vite would ask whether to delete those files.
# Scaffold into a temporary folder instead, then move its contents up and remove the folder:
npm create vite@latest vite-tmp -- --template react-ts
npm i @fullcalendar/core @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid \
      @fullcalendar/interaction @fullcalendar/list zustand react-hook-form @hookform/resolvers \
      zod date-fns dexie
npm i -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event \
      @testing-library/jest-dom fast-check fake-indexeddb @playwright/test cross-env \
      eslint @eslint/js typescript-eslint eslint-plugin-react-hooks globals prettier
npx playwright install chromium
```

Pin whatever versions npm resolves on day one (`package-lock.json` is committed). Exception: `@hookform/resolvers` is pinned to `^5` (v6 has an unresolvable optional-peer conflict on `effect`; v5 supports Zod 4). Exception: `@fullcalendar/react` is pinned to `^6.1.22`, the version of the other `@fullcalendar/*` plugins. The day-one resolution gave v7, a separate architecture that bundles its own views, needs `temporal-polyfill`, and cannot use the v6 plugins of §11.3.

The code examples here use Zod 4 syntax. If Zod 3 is installed, the equivalent API is identical for everything used in this file.

### 1.3 npm scripts

```jsonc
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "format": "prettier --write .",
  "test": "cross-env TZ=UTC vitest run",
  "test:watch": "cross-env TZ=UTC vitest",
  "test:coverage": "cross-env TZ=UTC vitest run --coverage",
  "test:dst": "cross-env TZ=America/New_York vitest run --config vitest.dst.config.ts",
  "test:props:full": "cross-env TZ=UTC PROP_RUNS=10000 PROP_SEED=random vitest run props",
  "bench": "cross-env TZ=UTC vitest bench --run --reporter=verbose",
  "test:perf": "cross-env PERF=1 npm test -- perf --reporter=verbose",
  "samples:export": "cross-env TZ=UTC node scripts/exportSamples.mjs",
  "e2e": "playwright test",
  "screenshots": "playwright test --config playwright.screenshots.config.ts"
}
```

`screenshots` (WI-34) is a design-review aid, not a test: it builds the app, serves it on its own port (4174, never reusing a running server) and writes the scenes in `scripts/screenshots/screenshots.spec.ts` to `docs/screenshots/`. Rerun it after any visual change and look at the images.

---

## 2. Repository layout

Every file listed here exists by the end of the project. The WI column says which work item creates it.

```text
/
├─ docs/
│  ├─ PROJECT_SCHEMA.md  TECH_SPEC.md  TEST_PLAN.md   # these specs
│  ├─ progress/PROGRESS.md                             # WI checklist + handoff notes (WI-47 location)
│  ├─ extras/                                         # audits, peer reports, prompts, planning evidence (WI-47)
│  ├─ samples/                                        # six importable calendars and README
│  └─ screenshots/                                     # design-review captures linked from README (WI-34)
├─ .github/workflows/ci.yml                            # WI-01
├─ index.html  vite.config.ts  vitest.config.ts  vitest.dst.config.ts
├─ playwright.config.ts  playwright.screenshots.config.ts  eslint.config.js  tsconfig.json  .prettierrc  README.md
├─ scripts/                # exportSamples.mjs (WI-30), screenshots/screenshots.spec.ts (WI-34)
├─ public/favicon.svg
├─ e2e/                    # Playwright E1–E3 (WI-27), E4 and smoke.spec.ts (WI-35)
├─ bench/engine.bench.ts   # T15 (WI-28)
├─ tests/
│  ├─ setup.ts             # jest-dom, <dialog> polyfill, ResizeObserver stub
│  ├─ helpers/             # time.ts (t(), BASE_MONDAY), builders.ts (ev(), task()), engine.ts (makeEngine()),
│  │                       # render.tsx (storeFor(), renderWithStore()), props.ts (propParams()),
│  │                       # oracle.ts (brute-force sweep, minute-bitmap gaps), failingRepository.ts
│  └─ integration/         # T13, T16, T17, T24, T25, T26 ... (facade-level tests)
└─ src/
   ├─ main.tsx             # COMPOSITION ROOT: picks repository, creates engine + store, renders <App/>
   ├─ shared/              # imported by every layer; imports nothing above it
   │  ├─ types.ts          # all domain + result types (§5)
   │  ├─ result.ts         # Result<T,E>, ok(), err()
   │  ├─ errors.ts         # EngineError union, FieldIssue
   │  ├─ constants.ts      # MAX_EVENT_MIN, MAX_OPTIONS, HISTORY_LIMIT, SNAP_MIN, PRIORITY_RANK, DEFAULT_SETTINGS
   │  ├─ schemas.ts        # Zod: eventInput, taskInput, settings, exportFile (§6)
   │  └─ time.ts           # the ONLY non-UI module allowed to use date-fns (§8.6)
   ├─ engine/
   │  ├─ index.ts          # export { createEngine, type Engine }
   │  ├─ facade.ts         # Engine implementation: command queue, version checks, dispatch
   │  ├─ state.ts          # EngineState, Change, applyChange, commit, history
   │  ├─ replanDiagnostics.ts # per-plan remaining problems (WI-38); no placement changes
   │  ├─ search.ts         # shared "segments → busy → gaps → rank" helper used by 3 pipelines
   │  ├─ pipelines/
   │  │  ├─ eventCrud.ts           # FR1–FR3 (+ ER4 suggestion)
   │  │  ├─ conflictResolution.ts  # FR4 wiring, FR7 alternatives
   │  │  ├─ taskScheduler.ts       # FR5, FR8, FR9
   │  │  └─ replan.ts              # FR10
   │  └─ algorithms/       # PURE functions over arrays; each file has a sibling *.test.ts
   │     ├─ interval.ts  sortedArray.ts  minHeap.ts  sweep.ts  barred.ts  merge.ts
   │     ├─ segments.ts  gaps.ts  dayLoad.ts  rank.ts  target.ts  taskOrder.ts
   │     └─ replanHeuristics.ts
   ├─ data/
   │  ├─ repository.ts     # Repository interface, ChangeSet, StoredData
   │  ├─ memoryRepository.ts
   │  ├─ dexieRepository.ts
   │  └─ samples/          # index.ts (registry), sparseWeek.ts, backToBack.ts, overlapCluster.ts,
   │                       # fullyBooked.ts, midnight.ts, stress.ts, prng.ts (mulberry32),
   │                       # build.ts (shared record builders and the at()/span() time helpers)
   └─ ui/
      ├─ App.tsx  App.module.css
      ├─ store/appStore.ts  store/selectors.ts  store/pickerSlice.ts  store/toastSlice.ts
      ├─ components/
      │  ├─ Toolbar/  CalendarView/ (CalendarView.tsx, calendarHandlers.ts, toFullCalendar.ts, EventContent.tsx, renderEventContent.tsx)
      │  ├─ TaskPanel/  ConflictPanel/  EventDialog/  TaskDialog/  SlotPicker/  ReplanDialog/
      │  ├─ SettingsDialog/  ConfirmDialog/  ShortcutHelp/  Toasts/  Modal/ (native <dialog> wrapper)
      │  └─ EmptyState/  ErrorBoundary/ (top-level crash screen, WI-35)
      ├─ hooks/useShortcuts.ts  hooks/useTheme.ts  hooks/preferences.ts  # guarded localStorage (theme, last view)
      │  hooks/download.ts     # downloadJson(): Settings export and the crash screen's Export data
      │  hooks/tabSync.ts      # WI-40: BroadcastChannel between tabs (announce / reload)
      ├─ format/time.ts  format/explain.ts  format/errors.ts   # all user-facing strings built here
      ├─ forms/eventForm.ts  forms/taskForm.ts  forms/settingsForm.ts  # form ⇄ input converters + resolvers
      └─ styles/tokens.css  styles/global.css  styles/fullcalendar.css
```

**Test placement.**
- Unit tests sit next to the source file: `foo.ts` → `foo.test.ts`.
- Property tests are named `*.props.test.ts`.
- Facade-level integration tests go in `tests/integration/`.

---

## 3. Architecture

### 3.1 Layers

```text
            ┌───────────────────────── UI layer (src/ui) ─────────────────────────┐
            │ React components · zustand store · forms · formatting · shortcuts   │
            └───────────────┬─────────────────────────────────▲──────────────────┘
                 commands   │ (Engine methods, typed)         │ Result<…> (Snapshot, options, plans, errors)
            ┌───────────────▼──────── Intelligent Engine (src/engine) ─┴──────────┐
            │ facade.ts ─ command queue, validation, version checks               │
            │ pipelines/ ─ Event CRUD · Conflict Resolution · Task Scheduler · Replan
            │ state.ts ─ sorted in-memory arrays, commit, undo/redo history       │
            │ algorithms/ ─ pure: sweep · merge · segments · gaps · rank · replan │
            └───────────────┬─────────────────────────────────▲──────────────────┘
                 ChangeSet  │ (Repository interface)          │ StoredData
            ┌───────────────▼──────────── Data Store (src/data) ┴─────────────────┐
            │ repository.ts (interface) · dexieRepository · memoryRepository · samples
            └─────────────────────────────────────────────────────────────────────┘
   src/shared (types, schemas, constants, result, time) is importable by all three layers.
```

### 3.2 Dependency rules (enforced by `eslint.config.js`)

| Files | May import | Must NOT import |
|---|---|---|
| `src/shared/**` | `zod`, `date-fns` (only in `time.ts`), other shared files | anything in `src/ui`, `src/engine` or `src/data`; `react`; `dexie`; `zustand` |
| `src/engine/algorithms/**` | `@/shared/types`, `@/shared/constants`, other algorithm files | `@/shared/time`, `@/shared/schemas`, `date-fns`, `react`, `dexie`, `zustand`, `@/data/**`, `@/ui/**`, pipelines, facade |
| `src/engine/**` (rest) | shared, algorithms, `@/data/repository` (types only) | `@/data/dexieRepository`, `@/data/memoryRepository`, `@/data/samples/**`, `@/ui/**`, `react`, `dexie`, `zustand`, `@fullcalendar/*` |
| `src/data/**` | shared, `dexie` | `@/engine/**`, `@/ui/**`, `react` |
| `src/ui/**` | shared, `@/engine` (index only), `@/data/samples`, React libraries | `@/engine/algorithms/**`, `@/engine/pipelines/**`, `@/engine/state`, `@/data/dexieRepository`, `@/data/memoryRepository` |
| `src/main.tsx` | everything | (composition root) |

```js
// eslint.config.js (excerpt — boundary rules)
const restrict = (groups, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: groups, message }] }],
});
export default tseslint.config(
  js.configs.recommended, ...tseslint.configs.strict,
  { files: ['src/shared/**/*.ts'], rules: restrict(
      ['@/ui/**', '@/engine/**', '@/data/**', 'react', 'dexie', 'zustand'], 'shared must not depend on upper layers') },
  { files: ['src/engine/**/*.ts'], rules: restrict(
      ['@/ui/**', '@/data/dexieRepository', '@/data/memoryRepository', '@/data/samples/**',
       'react', 'react-dom', 'dexie', 'zustand', '@fullcalendar/*'], 'engine must not depend on UI or storage adapters') },
  { files: ['src/engine/algorithms/**/*.ts'], rules: restrict(
      ['@/ui/**', '@/data/**', '@/engine/pipelines/**', '@/engine/facade', '@/engine/state', '@/engine/search',
       '@/shared/time', '@/shared/schemas', 'date-fns', 'date-fns/*', 'react', 'dexie', 'zustand'],
      'algorithms must be pure (TECH_SPEC §3.2)') },
  { files: ['src/data/**/*.ts'], rules: restrict(['@/engine/**', '@/ui/**', 'react'], 'data must not depend on engine/UI') },
  { files: ['src/ui/**/*.{ts,tsx}'], rules: restrict(
      ['@/engine/algorithms/**', '@/engine/pipelines/**', '@/engine/state', '@/engine/search',
       '@/data/dexieRepository', '@/data/memoryRepository'], 'UI talks to the engine facade only') },
  { files: ['**/*.test.{ts,tsx}', 'tests/**', 'bench/**', 'e2e/**', 'src/main.tsx'], rules: { 'no-restricted-imports': 'off' } },
);
```

### 3.3 Runtime flow of one command (example: a drag-move)

1. FullCalendar fires `eventDrop`. The handler in `calendarHandlers.ts` calls `store.actions.moveEvent(id, {start, end}, info.revert)`.
2. The store action calls `engine.moveEvent(id, interval)`.
3. The facade queues the command (§7.3). The Event CRUD pipeline validates it, builds a `Change`, and calls `commit()`.
4. `commit()` builds the new sorted arrays and awaits `repository.apply(changeSet)`:
   - **If storage rejects:** it returns `err(StorageError)` and the state is untouched.
   - **Otherwise:** it runs the conflict sweep, updates the history, increments the version and swaps in the new state.
5. If the move introduced a conflict involving the event, the pipeline computes the top `nearest` alternative as `suggestion` (ER4).
6. The store receives the `Result`:
   - **On `ok`:** it sets `snapshot` and shows a toast (a warning if `introducedConflicts` is non-empty).
   - **On `err`:** it calls `info.revert()` and shows the error toast.
7. React re-renders. FullCalendar receives new `events` props built from `snapshot`.

---

## 4. Composition root (`src/main.tsx`)

```ts
async function bootstrap() {
  let repo: Repository;
  let storageWarning = false;
  try { repo = await DexieRepository.open('feature-creatures-calendar'); }
  catch { repo = new MemoryRepository(); storageWarning = true; }       // degraded mode banner
  const channel = storageWarning ? null : openTabChannel();             // WI-40, hooks/tabSync.ts
  const engine = createEngine({
    repo,
    now: () => toMinute(new Date()),
    newId: () => crypto.randomUUID(),
    onCommit: channel === null ? undefined : () => announceStoredChange(channel),
  });
  const init = await engine.init();                                     // loads + sorts + sweeps
  const store = createAppStore(engine, { storageWarning, init, … });
  if (channel !== null) reloadOnOtherTabChanges(channel, store);        // → actions.reloadFromOtherTab
  createRoot(document.getElementById('root')!).render(
    <StrictMode><ErrorBoundary onReload={…} onExport={…}><StoreProvider store={store}><App /></StoreProvider></ErrorBoundary></StrictMode>);
}
bootstrap();
```

If `init` returns an error, `App` shows a full-page error with the buttons **Retry** and **Reset local data**. Reset loads the stored revision, calls `repo.replaceAll(empty, revision)` and then `init` again.

**Several tabs (WI-40, peer report #14).** Every tab has its own engine over the same IndexedDB. `hooks/tabSync.ts` opens a `BroadcastChannel` named `TAB_CHANNEL_NAME` (null when the browser has none, and not used in degraded mode, where tabs share nothing). The engine's `onCommit` posts `'stored'` after every write the repository accepted; the other tabs run `actions.reloadFromOtherTab()`. A write that races the message is refused by the stored revision (§9.1, ER8).

`ErrorBoundary` (WI-35, `components/ErrorBoundary/`) wraps everything, outside the store provider, so any render crash shows **Something went wrong** with **Reload** (`location.reload()`) and **Export data** (`store.getState().actions.exportFile()` through `hooks/download.ts`; a failed export says so) instead of an unmounted, blank page. It is the only class component, because React offers error boundaries only as classes.

---

## 5. Shared types (`src/shared/types.ts`) — frozen contract

```ts
export type Minute = number;                       // integer minutes since Unix epoch (UTC)
export interface Interval { readonly start: Minute; readonly end: Minute } // half-open [start, end)

export type Priority = 'high' | 'medium' | 'low';
export type LegacyCategory = 'meeting' | 'class' | 'appointment' | 'assignment' | 'personal';
export interface Category {
  readonly id: string; readonly name: string; readonly colour: string; readonly createdAt: Minute;
}
export type CategoryInput = Pick<Category, 'name' | 'colour'>;
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0 = Sunday (JS Date convention)

export interface CalendarEvent extends Interval {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly categoryId: string;
  readonly keptInBarred: readonly string[];
  readonly priority: Priority;
  readonly flexible: boolean;
  readonly flexWindow: Interval | null;          // non-null iff flexible
  readonly taskId: string | null;                // set iff this event is a scheduled task
  readonly createdAt: Minute;
  readonly updatedAt: Minute;
}

export interface Task {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly categoryId: string;
  readonly priority: Priority;
  readonly durationMin: number;                  // 5..1440
  readonly window: Interval;                     // allowable scheduling window
  readonly useWorkingHours: boolean;
  readonly status: 'unscheduled' | 'scheduled' | 'done';
  readonly doneAt: Minute | null;
  readonly scheduledEventId: string | null;      // non-null iff status === 'scheduled'
  readonly createdAt: Minute;
  readonly updatedAt: Minute;
}

export interface BarredSlot {
  readonly id: string; readonly label: string;
  readonly startMin: number; readonly endMin: number;   // minutes after local midnight
  readonly days: readonly Weekday[];
}

export interface Settings {
  readonly useWorkingHours: boolean;
  readonly workDays: readonly Weekday[];
  readonly workStartMin: number;   // minutes after local midnight
  readonly workEndMin: number;
  readonly bufferMin: number;      // 0..120
  readonly barredSlots: readonly BarredSlot[];
  readonly defaultCriterion: UserCriterion;
}

export type EventInput = Pick<CalendarEvent,
  'title' | 'description' | 'categoryId' | 'priority' | 'start' | 'end' | 'flexible' | 'flexWindow'>;
export type TaskInput = Pick<Task,
  'name' | 'description' | 'categoryId' | 'priority' | 'durationMin' | 'window' | 'useWorkingHours'>;

// ---- derived (never stored) ----
export interface Conflict {
  readonly key: string;            // `${smallerId}|${largerId}`
  readonly aId: string; readonly bId: string;   // aId < bId (string compare)
  readonly overlap: Interval;
  readonly minutes: number;
  readonly targetId: string;       // which one BR-10 suggests moving
}

export type UserCriterion = 'earliest' | 'bestFit' | 'priorityAware';
export interface BarredOverlap {
  readonly eventId: string;
  readonly slotId: string;
  readonly label: string;
  readonly overlap: Interval;
  readonly minutes: number;
}
export type Criterion = UserCriterion | 'nearest' | 'leastLoaded';
export type EffectiveCriterion = Exclude<Criterion, 'priorityAware'>;

export type EdgeReason = 'windowStart' | 'windowEnd' | 'workStart' | 'workEnd' | 'now';
export type Boundary =
  | { readonly kind: 'event'; readonly eventId: string; readonly title: string; readonly at: Minute; readonly bufferMin: number }
  | { readonly kind: 'barred'; readonly label: string; readonly at: Minute }
  | { readonly kind: 'edge'; readonly reason: EdgeReason; readonly at: Minute };

/** One local day, pre-expanded to absolute minutes by shared/time.ts so algorithms never do calendar math. */
export interface DayFrame {
  readonly dayStart: Minute; readonly dayEnd: Minute;     // local midnight → next local midnight (23–25 h)
  readonly weekday: Weekday;
  readonly work: Interval | null;                          // whole local day when globally off
  readonly barred: readonly { readonly slotId: string; readonly label: string; readonly interval: Interval }[];
}

export interface Segment extends Interval { readonly startEdge: Boundary; readonly endEdge: Boundary }
export interface BusyBlock extends Interval {              // buffered, merged
  readonly startEvent: { id: string; title: string; start: Minute };  // event whose buffered start opens the block
  readonly endEvent: { id: string; title: string; end: Minute };      // event whose buffered end closes the block
}
export interface FreeGap extends Interval { readonly before: Boundary; readonly after: Boundary }

export interface SlotOption {
  readonly rank: number;                 // 1-based
  readonly slot: Interval;
  readonly gap: FreeGap;
  readonly gapMin: number;
  readonly leftoverMin: number;          // gapMin − duration
  readonly dayLoadMin: number;           // load of the slot's local day before placing
  readonly criterion: Criterion;         // requested
  readonly effectiveCriterion: EffectiveCriterion;
  readonly distanceMin: number | null;   // |slot.start − originalStart| when an original start exists
}

export type SearchSubject =
  | { readonly kind: 'task'; readonly taskId: string; readonly name: string }
  | { readonly kind: 'event'; readonly eventId: string; readonly title: string; readonly otherEventId: string | null };

export interface SlotSearchResult {
  readonly baseVersion: number;
  readonly subject: SearchSubject;
  readonly durationMin: number;
  readonly priority: Priority;
  readonly criterion: Criterion;
  readonly bufferMin: number;
  readonly searchWindow: Interval;
  readonly segmentCount: number;
  readonly freeGaps: readonly FreeGap[];   // ALL gaps, including too-short ones
  readonly fittingCount: number;
  readonly options: readonly SlotOption[]; // all D-06 picker candidates, ranked; no MAX_OPTIONS limit
}

export type ReplanStrategy = 'balanced' | 'clusterByCategory' | 'varyCategories' | 'frontLoad' | 'fewerFragments';
export type MoveReason =
  | { readonly kind: 'outsideFlexWindow' }
  | { readonly kind: 'outsideWorkingHours' }
  | { readonly kind: 'barred'; readonly label: string }
  | { readonly kind: 'conflict'; readonly withEventId: string; readonly withTitle: string }
  | { readonly kind: 'buffer'; readonly withEventId: string; readonly withTitle: string }
  | { readonly kind: 'balance'; readonly fromDayLoadMin: number; readonly toDayLoadMin: number }
  | { readonly kind: 'strategy'; readonly strategy: Exclude<ReplanStrategy, 'balanced'> };

export interface ReplanMove {
  readonly eventId: string; readonly title: string; readonly priority: Priority;
  readonly from: Interval; readonly to: Interval; readonly reason: MoveReason;
}
export interface ReplanMetrics {
  readonly moved: number; readonly totalShiftMin: number;
  readonly conflictsBefore: number; readonly conflictsAfter: number;
  readonly loadSpreadBeforeMin: number; readonly loadSpreadAfterMin: number;
  readonly unplaced: number;
}
export interface ReplanPlan {
  readonly id: 'minimalChange' | 'balanced';
  readonly moves: readonly ReplanMove[];
  readonly unplaced: readonly { readonly eventId: string; readonly title: string; readonly reason: MoveReason | null }[];
  readonly metrics: ReplanMetrics;
}
export interface ReplanResult {
  readonly strategy: ReplanStrategy;
  readonly baseVersion: number; readonly range: Interval; readonly bufferMin: number;
  readonly movableCount: number;
  readonly plans: readonly [ReplanPlan, ReplanPlan];      // [minimalChange, balanced]
  readonly notMoved: Readonly<Record<ReplanPlan['id'], readonly ReplanNotMoved[]>>;
}

export interface ReplanNotMoved {
  readonly eventId: string; readonly title: string;
  readonly reason: 'fixed' | 'started' | 'outsideFlexWindow' | 'noSlot';
  readonly barredLabels: readonly string[];
  readonly conflictTitles: readonly string[];
}

export interface Snapshot {
  readonly categories: readonly Category[];
  readonly version: number;
  readonly events: readonly CalendarEvent[];   // sorted by (start, end, id)
  readonly tasks: readonly Task[];             // creation order
  readonly settings: Settings;
  readonly conflicts: readonly Conflict[];     // sorted by (overlap.start, key)
  readonly barredOverlaps: readonly BarredOverlap[]; // event order, local day, slot order; derived
  readonly canUndo: boolean; readonly canRedo: boolean;
  readonly undoLabel: string | null; readonly redoLabel: string | null;
}

export interface MutationResult {
  readonly snapshot: Snapshot;
  readonly label: string;                      // e.g. 'Move "Gym"' — also the undo label
  readonly changedEventIds: readonly string[];
  readonly introducedConflicts: readonly Conflict[];
  readonly resolvedConflicts: readonly Conflict[];
  readonly suggestion: SlotOption | null;      // ER4: top nearest alternative for the subject event
}

export interface ExportFile {
  readonly format: 'feature-creatures-calendar';
  readonly version: 2;
  readonly categories: readonly Category[];
  readonly exportedAt: string;                 // ISO 8601
  readonly events: readonly CalendarEvent[];
  readonly tasks: readonly Task[];
  readonly settings: Settings;
}
```

`src/shared/result.ts`:

```ts
export type Result<T, E = EngineError> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

`src/shared/errors.ts`:

```ts
export interface FieldIssue { readonly path: string; readonly message: string }  // path like 'end', 'window.end'
export type EngineError =
  | { code: 'InvalidInput'; issues: FieldIssue[] }                                   // ER1 (shape)
  | { code: 'InvalidTime'; issues: FieldIssue[] }                                    // ER1 (ordering)
  | { code: 'TaskLongerThanWindow'; durationMin: number; longestStretchMin: number; emptyCause?: EmptyWindowCause } // ER2
// EmptyWindowCause = 'past' | 'noWorkingHours' | 'barred' (WI-41; set by suggestAlternatives when longestStretchMin = 0)
  | { code: 'NoSlotFound'; durationMin: number; largestGapMin: number; largestGap: Interval | null; bufferMin: number } // ER3
  | { code: 'StorageError'; message: string }                                        // ER5
  | { code: 'InvalidImport'; issues: FieldIssue[] }                                  // ER6
  | { code: 'StaleResult' }                                                          // ER7
  | { code: 'ConcurrentModification' }                                               // ER8 (WI-40)
  | { code: 'CategoryInUse'; eventCount: number; taskCount: number }
  | { code: 'NotFound'; entity: 'event' | 'task' | 'category'; id: string };
```

`src/shared/constants.ts`:

```ts
export const MAX_EVENT_MIN = 1440;   // BR-4
export const MAX_OPTIONS = 5;        // BR-7
export const SUGGESTION_STEP_MIN = 30; // D-06 picker candidate grid
export const SUGGESTION_CHIPS_PER_DAY = 8;
export const HISTORY_LIMIT = 50;     // B1
export const SNAP_MIN = 5;           // BR-5 notBefore rounding + UI snap
export const MAX_REPLAN_DAYS = 14;   // BR-12
export const EXPORT_FORMAT = 'feature-creatures-calendar'; // §9.4
export const EXPORT_VERSION = 2;
export const LEGACY_EXPORT_VERSION = 1;
export const MAX_CATEGORY_NAME_LENGTH = 40;
// DEFAULT_CATEGORIES seeds Meeting, Class, Appointment, Assignment and Personal with stable ids.
export const REPLAN_DST_SLACK_MIN = 120; // a 14-day replan range may span DST changes
export const CONFLICT_LIST_LIMIT = 50;
export const TOAST_MS = 4000;          // success / info toasts
export const WARNING_TOAST_MS = 8000;  // ER4 warning toasts
export const EMPHASIS_MS = 1500;       // changed events stay emphasised
export const DRAWER_BREAKPOINT_PX = 1024;
export const MIN_CLICK_TARGET_PX = 32;
export const CLICK_EVENT_MIN = 30;        // a click on empty time creates one calendar row (WI-35)
export const IMPORT_SPINNER_THRESHOLD = 1000;
export const INITIAL_REVISION = 0;                        // WI-40: stored revision before any write
export const TAB_CHANNEL_NAME = 'feature-creatures-calendar'; // WI-40: BroadcastChannel between tabs
export const MINUTES_PER_DAY = 1440;
export const MIN_SUPPORTED_MINUTE = 0;              // 1970-01-01T00:00Z (AUDIT A02)
export const MAX_SUPPORTED_MINUTE = 4_223_371_679;  // 9999-12-31T23:59Z: always a valid JS Date
export const MAX_TITLE_LENGTH = 100;          // event title and task name
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_BARRED_LABEL_LENGTH = 40;
export const MIN_TASK_DURATION_MIN = 5;
export const MAX_TASK_DURATION_MIN = MAX_EVENT_MIN;
export const MAX_BUFFER_MIN = 120;
export const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
export const DEFAULT_SETTINGS: Settings = {
  useWorkingHours: true,
  workDays: [1, 2, 3, 4, 5], workStartMin: 540, workEndMin: 1080,
  bufferMin: 0, barredSlots: [], defaultCriterion: 'earliest',
};
```

---

## 6. Validation (`src/shared/schemas.ts`) — frozen contract

There is one schema per input. The engine re-validates **every** command with the same schema, so the UI is never trusted.

The time-ordering rules are added in `superRefine` with `params: { kind: 'time' }`. The engine maps issues to errors like this:

- **`InvalidTime`:** every issue has `params.kind === 'time'`.
- **`InvalidInput`:** anything else, including missing fields, wrong types, and out-of-range numbers.

```ts
// AUDIT A02: a Minute must be a supported date (1970-01-01T00:00Z … 9999-12-31T23:59Z), a time issue.
const minute = z.number().int().superRefine((v, ctx) => {
  if (v < MIN_SUPPORTED_MINUTE || v > MAX_SUPPORTED_MINUTE)
    timeIssue(ctx, [], 'Dates must be between the years 1970 and 9999.');
});
const interval = z.object({ start: minute, end: minute });
const priority = z.enum(['high', 'medium', 'low']);
const categoryId = z.string().min(1);
const timeIssue = (ctx: z.RefinementCtx, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: 'custom', path, message, params: { kind: 'time' } });

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(100),
  description: z.string().max(1000, 'Description can be at most 1000 characters.'),   // shown under the field (AUDIT A09)
  categoryId, priority,
  start: minute, end: minute,
  flexible: z.boolean(),
  flexWindow: interval.nullable(),
}).superRefine((v, ctx) => {
  if (v.end <= v.start) timeIssue(ctx, ['end'], 'End time must be after the start time.');
  else if (v.end - v.start > MAX_EVENT_MIN) timeIssue(ctx, ['end'], 'Events can be at most 24 hours long.');
  if (v.flexible && v.flexWindow === null)
    ctx.addIssue({ code: 'custom', path: ['flexWindow'], message: 'Flexible events need a flex window.' }); // shape
  if (v.flexWindow) {
    if (v.flexWindow.end <= v.flexWindow.start) timeIssue(ctx, ['flexWindow', 'end'], 'Window end must be after its start.');
    else if (v.flexWindow.end - v.flexWindow.start < v.end - v.start)
      timeIssue(ctx, ['flexWindow'], 'The flex window must be at least as long as the event.');
  }
});

export const taskInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100),
  description: z.string().max(1000, 'Description can be at most 1000 characters.'),
  categoryId, priority,
  durationMin: z.number({ message: 'Duration must be a number.' }).int()
    .min(5, 'Duration must be at least 5 minutes.').max(1440, 'Duration can be at most 24 hours.'),
  window: interval,
  useWorkingHours: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.window.end <= v.window.start) timeIssue(ctx, ['window', 'end'], 'Window end must be after its start.');
});

export const settingsSchema = z.object({ /* §3.2 of PROJECT_SCHEMA; workEndMin > workStartMin and
  barred endMin > startMin are time issues; workDays nonempty; bufferMin int 0..120 */ });

export const exportFileSchema = z.object({
  format: z.literal('feature-creatures-calendar'), version: z.literal(EXPORT_VERSION), exportedAt: z.string(),
  categories: z.array(categorySchema),
  events: z.array(storedEventSchema), tasks: z.array(storedTaskSchema), settings: settingsSchema,
}); // plus engine-side checks in importData (§7.4.6)
```

`storedEventSchema` and `storedTaskSchema` extend the input schemas with `id`, `taskId`, `status`, `scheduledEventId`, `createdAt` and `updatedAt`.

WI-48 adds `keptInBarred` to stored events and `doneAt` to stored tasks. `categorySchema` validates `{id, name, colour, createdAt}`; hex colours normalise to lowercase. `parseCategorisedInput(schema, input, categories)` validates new/edited event and task inputs, including that `categoryId` exists. `linkIssues(events, tasks, categories)` additionally checks category identity/name/colour uniqueness and every reference on import/init/reload. `shared/legacy.ts` is the only enum-to-id mapping, shared by Dexie upgrades and v1 import.

WI-49: `categoryInputSchema` picks name/colour from `categorySchema`; `parseCategoryInput(input, categories, editingId?) → Result<CategoryInput>` checks the shape, case-insensitive name uniqueness, and `categoryColourIssue` against other ids. `categoryColourIssue(hex, otherCategories) → string | null` checks reserved and occupied colours at OKLab distance `< MIN_CATEGORY_COLOUR_DISTANCE` (0.04), then both tag backgrounds at `MIN_NON_TEXT_CONTRAST` (3). `shared/colours.ts` supplies pure `colourDistance` and `contrastRatio`; standard sRGB/OKLab coefficients, palette and reserved colours are named in `constants.ts`. Imports/init/reload run the same colour checks through `linkIssues`. The twelve swatches include the five seeded colours; reserved neutral event fills are `#363631` and `#ebe6d9` for WI-57, plus both themes' current danger and priority colours. `tokens.test.ts` ties tag backgrounds to CSS `surface` in both themes and tests every swatch and text pair.

`storedDataSchema = {categories: Category[], events: storedEvent[], tasks: storedTask[], settings: storedSettings | null}` validates `Repository.load()` in `engine.init()` and `engine.reload()`; `storedRevisionSchema = {revision: int ≥ 0}` validates its revision (WI-40). `searchOptionsSchema = {bufferMin?: int 0–120}` validates the `bufferMin` override of `findSlots`, `suggestAlternatives` and `planReplan`; it shares one `bufferMinSchema` with `settingsSchema`. `slotSchema = {slot: interval}` (AUDIT A06) validates the slot of `scheduleTask` and `applyAlternative` through `requireValidSlot` in `search.ts`.

- Zod 4 cannot `.extend()` a refined object, so each schema is a plain object shape plus a named refine function (`refineEventTiming`, `refineTaskWindow`), and the stored schemas extend the shape and re-apply the same refinements.
- `storedTaskSchema` also checks `(status = 'scheduled') ⟺ (scheduledEventId ≠ null)` as a shape issue at `scheduledEventId`: "A task has an event id exactly when it is scheduled."
- A non-integer duration gives "Duration must be a whole number of minutes." (T31's 2.5 case).
- `settingsSchema` messages: "Pick at least one working day." · "Working hours must end after they start." (time, `workEndMin`) · "Buffer must be between 0 and 120 minutes." · barred label "Label is required." / "Labels can be at most 40 characters." · "A barred slot must end after it starts." (time, `barredSlots.N.endMin`) · "Overlaps barred slot N (Lunch) on Mon, Tue." (shape, at each later overlapping slot's Days; first earlier shared-day positive overlap, D-09). `workStartMin` and barred `startMin` are 0–1439; `workEndMin` and barred `endMin` are 0–1440. A buffer that is not a number (a blank form field becomes `NaN`) also gets the buffer message.

**Shared validator helpers** (also in `schemas.ts`):

```ts
export function toFieldIssues(zodError: z.ZodError): FieldIssue[];   // path segments joined by '.', '' for the root
export function parseInput<Output>(schema: z.ZodType<Output>, input: unknown): Result<Output>;
  // ok(parsed) | err(InvalidTime) if every issue has params.kind === 'time' | err(InvalidInput) otherwise
```

The facade validates every command with `parseInput`. `importData` uses `toFieldIssues` to build `InvalidImport`.

**UI forms.** Forms keep strings (`datetime-local`, number inputs). `src/ui/forms/eventForm.ts` exports two things:

- `toEventInput(form)`, which converts the form into an `EventInput` (using `atLocal` from `shared/time`).
- `eventResolver`, a React Hook Form resolver. It runs `toEventInput` and then `eventInputSchema.safeParse`, and maps each issue path back to its form field:

  | Schema path | Form field |
  |---|---|
  | `start` | `start` |
  | `end` | `end` |
  | `flexWindow.start` | `flexStart` |
  | `flexWindow.end` | `flexEnd` |
  | `flexWindow` | `flexEnd` |

`taskForm.ts` does the same for tasks. Its form has two duration fields (`hours`, `minutes`), so `durationMin = hours*60 + minutes`. An empty or non-numeric value becomes `NaN`, and the schema rejects `NaN` with "Duration must be a number."

---

## 7. Engine

### 7.1 State (`src/engine/state.ts`)

```ts
export interface EngineState {
  readonly categories: readonly Category[];
  readonly version: number;
  readonly revision: number;                   // repository revision it was loaded from or last wrote (WI-40)
  readonly events: readonly CalendarEvent[];   // ALWAYS sorted by compareEvents (start, end, id)
  readonly tasks: readonly Task[];
  readonly settings: Settings;
  readonly conflicts: readonly Conflict[];
  readonly barredOverlaps: readonly BarredOverlap[];
  readonly undo: readonly Change[];            // ≤ HISTORY_LIMIT, newest last
  readonly redo: readonly Change[];
}
export interface RecordChange<T> { readonly id: string; readonly before: T | null; readonly after: T | null }
export interface Change {
  readonly label: string;
  readonly categories?: readonly RecordChange<Category>[];
  readonly events: readonly RecordChange<CalendarEvent>[];
  readonly tasks: readonly RecordChange<Task>[];
}
```

**Undo model.** A `Change` stores before- and after-images of every record it touches.

- Applying it *forward* writes the `after` images. A `null` image means delete.
- Applying it *backward* writes the `before` images.
- So each command's inverse falls out of the record (this realises A2's "each command returns its inverse").

**`applyChange(state, change, direction)`** is pure. For each record change it:

- removes the old copy, with `removeById`
- inserts the new copy, if it is non-null, with `insertSorted` for events, or by replacing in place / appending for tasks

It returns the new `{categories, events, tasks}`. Categories use the same in-place replacement/append rule as tasks; absent category changes mean an empty list.

**`commit(state, change, mode, repo)`**, where `mode` is `'do' | 'undo' | 'redo'`:

1. Set `direction` to `'backward'` when `mode === 'undo'`, and to `'forward'` otherwise.
2. Compute `next = applyChange(state, change, direction)`.
3. Build `changeSet` (§9.1) from the images for that direction, and `await repo.apply(changeSet, state.revision)`. On a throw, return `err(repositoryError(error))`: `ConcurrentModification` (ER8) for a `ConcurrentModificationError`, otherwise `{code:'StorageError', message}`. The state is untouched.
4. Compute `conflicts = detectConflicts(next.events)` (§8.4) and `barredOverlaps = barredOverlapsFor(next.events, settings)` (§8.4a).
5. `introduced` = new conflicts whose key is not among the old keys. `resolved` = the reverse.
6. Update the history:
   - `do`: push to `undo` (dropping the oldest beyond 50) and clear `redo`.
   - `undo`: move the change to `redo`.
   - `redo`: move the change back to `undo`.
7. Set `version + 1` and `revision + 1`, and return the new state and the `MutationResult` parts.

**`changedEventIds`** are the IDs of records whose image in that direction is non-null.

`commit` resolves to `Result<CommitOutcome, EngineError>`, where `CommitOutcome = {state, label, changedEventIds, introducedConflicts, resolvedConflicts}`. The facade adds the `snapshot` and `suggestion` to make the `MutationResult`. **`createState({categories, events, tasks, settings}, revision = INITIAL_REVISION)`** builds version 0 at `revision`: it sorts the events, detects their conflicts and starts with empty history. `engine.init()` and `engine.reload()` use it after `load()`, with the loaded revision.

### 7.2 Engine interface (`src/engine/facade.ts`) — frozen contract

```ts
export interface EngineDeps {
  repo: Repository; now: () => Minute; newId: () => string;
  onCommit?: () => void;   // WI-40: after every write the repository accepted (commit, settings, import, first-run settings)
}
export function createEngine(deps: EngineDeps): Engine;

export interface Engine {
  init(): Promise<Result<Snapshot>>;
  reload(): Promise<Result<Snapshot>>;   // WI-40: adopt what is stored now (another tab's change)
  snapshot(): Snapshot;

  createCategory(input: CategoryInput): Promise<Result<MutationResult>>;
  updateCategory(id: string, input: CategoryInput): Promise<Result<MutationResult>>;
  deleteCategory(id: string): Promise<Result<MutationResult>>;

  // ── Event CRUD pipeline (FR1–FR3) ──
  createEvent(input: EventInput): Promise<Result<MutationResult>>;
  updateEvent(id: string, input: EventInput): Promise<Result<MutationResult>>;
  moveEvent(id: string, to: Interval): Promise<Result<MutationResult>>;      // drag / resize
  deleteEvent(id: string): Promise<Result<MutationResult>>;
  setBarredKept(request: { eventId: string; slotId: string; kept: boolean }): Promise<Result<MutationResult>>;

  // ── Conflict Resolution pipeline (FR4 is automatic inside commit; FR7) ──
  suggestAlternatives(req: { eventId: string; otherEventId?: string; bufferMin?: number; useWorkingHours?: boolean; allowMoving?: boolean; range?: Interval }): Result<SlotSearchResult>;
  applyAlternative(req: { eventId: string; slot: Interval; baseVersion: number }): Promise<Result<MutationResult>>;

  // ── Task Scheduler pipeline (FR5, FR8, FR9) ──
  createTask(input: TaskInput): Promise<Result<MutationResult>>;
  updateTask(id: string, input: TaskInput): Promise<Result<MutationResult>>;
  deleteTask(id: string): Promise<Result<MutationResult>>;
  unscheduleTask(id: string): Promise<Result<MutationResult>>;
  markTaskDone(id: string): Promise<Result<MutationResult>>;
  reopenTask(id: string): Promise<Result<MutationResult>>;
  previewDoneBefore(before: Minute): Result<DoneTasksPreview>;
  applyDoneBefore(request: {before: Minute; baseVersion: number}): Promise<Result<MutationResult>>;
  orderForScheduling(taskIds: readonly string[]): string[];                 // BR-11; drops non-unscheduled/unknown
  findSlots(req: { taskId: string; criterion?: UserCriterion; bufferMin?: number }): Result<SlotSearchResult>;
  scheduleTask(req: { taskId: string; slot: Interval; baseVersion: number }): Promise<Result<MutationResult>>;

  // ── Replan pipeline (FR10) ──
  explainWindow(req: { taskId: string; bufferMin?: number } | { eventId: string; useWorkingHours?: boolean; bufferMin?: number; allowMoving?: boolean; range?: Interval }): Result<WindowExplanation>;
  planReplan(req: { range: Interval; bufferMin?: number; strategy?: ReplanStrategy }): Result<ReplanResult>;
  applyReplan(req: { baseVersion: number; planId: ReplanPlan['id'] }): Promise<Result<MutationResult>>;

  // ── services ──
  updateSettings(settings: Settings): Promise<Result<Snapshot>>;            // not undoable; bumps version
  undo(): Promise<Result<MutationResult>>;                                  // no-op ok() with same snapshot if empty
  redo(): Promise<Result<MutationResult>>;
  exportData(): string;                                                     // JSON of ExportFile
  importData(json: string): Promise<Result<Snapshot>>;                      // replace-all; clears history
}
```

- **Queries** (`snapshot`, `suggestAlternatives`, `findSlots`, `orderForScheduling`, `planReplan`, `exportData`) are **synchronous** and pure reads of the current state.
- **Mutations** are `async`, because they write to IndexedDB.
- **`bufferMin` overrides** must be integers from 0 to 120. Anything else gives `InvalidInput`.

### 7.3 Command queue

Category commands run through this queue and `pipelines/categories.ts`. Create trims/normalises before assigning `newId()`/`now`; edit keeps the id/time and all referring rows; delete counts every referring event/task (done included) before committing. Every accepted change is one history entry and one revision-checked repository apply, including categories in the Dexie transaction. `CategoryInUse` contains event/task counts and writes nothing; labels are `Create/Edit/Delete category "<name>"`.

The facade serialises mutations, so two quick drags can never interleave:

```ts
private chain: Promise<unknown> = Promise.resolve();
private run<T>(fn: () => Promise<T>): Promise<T> {
  const p = this.chain.then(fn, fn);
  this.chain = p.catch(() => undefined);
  return p;
}
```

Every mutating method is `run(() => pipeline.x(...))`. A version check for a mutation (ER7) happens *inside* `fn`, so it sees the latest state.

### 7.4 Pipelines

Every mutation pipeline follows the same skeleton: validate → look up → build a `Change` → `commit` → post-process.

`now` is `deps.now()`, and `notBefore = ceilTo(now, SNAP_MIN)`.

#### 7.4.1 Event CRUD (`pipelines/eventCrud.ts`)

- **`createEvent(input)`**
  1. Validate with `eventInputSchema`, giving `InvalidInput` or `InvalidTime`.
  2. Build `event = {...parsed, id: newId(), taskId: null, createdAt: now, updatedAt: now}`.
  3. Use the change `{label: 'Create "<title>"', events: [{id, before: null, after: event}]}`.
  4. Commit.
  5. If any introduced conflict involves `event.id`, set `suggestion = top1(suggestAlternatives({eventId}))`. If that returns an error, `suggestion` is `null`.
- **`updateEvent(id, input)`**
  1. Look up the event, or return `NotFound`.
  2. Validate the input.
  3. Build `next = {...old, ...parsed, updatedAt: now}`.
  4. If `old.taskId` is set:
     - force `flexible = true`
     - if `flexWindow` is `null`, set it to `task.window`
     - build the task mirror `{name: title, priority, durationMin: end − start, window: flexWindow, updatedAt}` (BR-9)
     - add the task's record change to the same `Change`
     - the mirror is validated with `taskInputSchema`, so an edit that would make the task invalid (e.g. a 3 min duration) is rejected
  5. Use the label `Edit "<title>"`. Then commit and compute the suggestion as in `createEvent`.
- **`moveEvent(id, to)`** is the same as `updateEvent(id, {...old, start: to.start, end: to.end})`, with the label `Move "<title>"`.
- **`deleteEvent(id)`**
  1. Look up the event.
  2. Add `{before: event, after: null}`.
  3. If it has a `taskId`, also add the task change setting `status: 'unscheduled', scheduledEventId: null`.
  4. Use the label `Delete "<title>"`.

#### 7.4.2 Conflict Resolution (`pipelines/conflictResolution.ts`)

**Detection (FR4)** is not a command. It runs inside every `commit` (§8.4), and `Conflict.targetId` is filled by `chooseTarget` (§8.11).

**`suggestAlternatives({eventId, otherEventId, bufferMin, useWorkingHours, allowMoving, range})`**

1. Look up the event, or return `NotFound`.
2. Choose the search window:
   - flexible event: `searchWindow = event.flexWindow`
   - fixed event with `allowMoving !== true`: return an empty success (zero segments/fitting count, no free gaps/options), without running a search. Its `searchWindow` identifies the event's original interval only; it is not a stored window. `explainWindow` returns empty allowed/free stretches.
   - fixed event with `allowMoving = true`: `searchWindow = range`; `parseAlternativeRange(range)` returns InvalidTime with range-prefixed issues for missing, malformed or reversed ranges. No hidden three-day fallback exists. Flexible searches retain their own window.
3. Return `search({durationMin: event.end − event.start, priority: event.priority, window: searchWindow, useWorkingHours: useWorkingHours ?? true, excludeIds: [eventId], originalStart: event.start, criterion: 'nearest', bufferMin: bufferMin ?? settings.bufferMin, subject: {kind: 'event', eventId, title, otherEventId: otherEventId ?? null}})` (§7.5). Omitting `useWorkingHours` gives exactly the pre-WI-41 results; barred slots apply either way.
4. When that search fails with `TaskLongerThanWindow` and `longestStretchMin = 0`, add `emptyCause = emptyWindowCause(state, searchWindow, useWorkingHours, notBefore)` (`search.ts`): `'past'` when `searchWindow.end ≤ notBefore`; else `'barred'` when the same segments built with no barred slots are non-empty; else `'noWorkingHours'`. `findSlots` does not add it, so task errors are unchanged.

**`applyAlternative({eventId, slot, baseVersion})`**

1. If `baseVersion !== state.version`, return `StaleResult`.
2. Check the slot with `requireValidSlot(slot, event.end − event.start)`: `slotSchema` issues (AUDIT A06), or `InvalidTime` at `slot` when the length differs.
3. Otherwise behave as `moveEvent(eventId, slot)`, with the label `Move "<title>"`.

**`explainWindow` (WI-45, report #7).** `alternativesSearch(state, request)` builds the exact `SearchRequest` that `suggestAlternatives` runs (and `taskSearch` the one `findSlots` runs), so `explainAlternativesWindow` / `explainTaskWindow` return `explainSearch(state, request, notBefore)` (`search.ts`) over the same window, hours, buffer and exclusions. `explainSearch` shares `allowedFor` / `freeGapsFor` with `search` and returns `{allowed, free}`: each a `WindowStretches` of intervals plus `WindowSplit`s (`{kind: 'barred' | 'event', label, interval}`) found where one stretch ends and the next starts at the same barred slot or event. It writes nothing; error objects (ER2/ER3) are unchanged.

#### 7.4.3 Task Scheduler (`pipelines/taskScheduler.ts`)

- **`createTask(input)`** validates the input and creates `{...parsed, id, status: 'unscheduled', doneAt: null, scheduledEventId: null, createdAt, updatedAt}`. The label is `Create task "<name>"`.
- **`updateTask(id, input)`** validates the input and updates the task.
  - If the task is scheduled, mirror the change into the linked event: `title = name`, `priority`, `end = event.start + durationMin` (the start is kept) and `flexWindow = window`. Both records go in one `Change`.
  - The mirrored event is validated with `eventInputSchema`, so a window shorter than the task gives `InvalidTime` at `flexWindow` and nothing changes.
  - The label is `Edit task "<name>"`.
  - Introduced conflicts and the suggestion are handled as in `updateEvent`.
- **`deleteTask(id)`** removes the task, and its linked event if it is scheduled. The label is `Delete task "<name>"`.
- **`unscheduleTask(id)`**
  - If the task is scheduled: delete the event and set the task to `unscheduled`. The label is `Unschedule "<name>"`.
  - If the task is already unscheduled: return `ok` with an unchanged snapshot, no history entry, and the label `''`.
- **`orderForScheduling(ids)`** keeps the existing unscheduled tasks and sorts them with `compareTasksForQueue` (§8.12).
- **`findSlots({taskId, criterion, bufferMin})`**
  1. Look up the task. If it is scheduled, return `InvalidInput` with the issue `{path: 'status', message: 'Task is already scheduled.'}`.
  2. Return `search({durationMin: task.durationMin, priority: task.priority, window: task.window, useWorkingHours: task.useWorkingHours, excludeIds: [], originalStart: null, criterion: criterion ?? settings.defaultCriterion, bufferMin: bufferMin ?? settings.bufferMin, subject: {kind: 'task', taskId, name}})`.
- **`scheduleTask({taskId, slot, baseVersion})`**
  1. Check the version (ER7), look up the task (it must be unscheduled, else the `status` issue of `findSlots`), check that `slot.start ≥ notBeforeFor(now)` with `requireNotPast` or return `StaleResult` (AUDIT A07; also in `applyAlternative`), and check the slot with `requireValidSlot` (shared with `applyAlternative`): its ends must pass `slotSchema` (supported integer Minutes, issues at `slot.start` / `slot.end`, AUDIT A06), and `slot.end − slot.start === durationMin`, or return `InvalidTime` with the issue `{path: 'slot', message: 'The slot must be exactly as long as the duration.'}`. Whether the slot is still free is guaranteed by the version check against the search it came from (ER7).
  2. Build `event = {id: newId(), title: name, description, categoryId, priority, keptInBarred: [], start, end, flexible: true, flexWindow: task.window, taskId, createdAt, updatedAt}`.
  3. Update the task with `{status: 'scheduled', scheduledEventId: event.id}`.
  4. Put both in one `Change` with the label `Schedule "<name>"`.

**Done task commands (WI-54, D-07).** `markTaskDone(id)` deletes any linked event and sets `status: done, scheduledEventId: null, doneAt: now, updatedAt: now` in one revision-checked Change (`Mark done "<name>"`), one undo step. Already done is a no-op. `reopenTask(id)` changes only a done task to unscheduled, clears doneAt, creates no event, and is one undo step; open tasks are no-ops. Missing ids give NotFound. `unscheduleTask` leaves done tasks unchanged. Search/explain/schedule reject done tasks with InvalidInput at status: "Reopen this task before finding time." Queue ordering excludes them.

**Bulk completion.** Derived `DoneTasksPreview = {readonly before: Minute; readonly baseVersion: number; readonly tasks: readonly Task[]}` is never stored/exported. `doneBeforeSchema` validates supported integer cutoff Minutes; `doneBeforeApplySchema` also requires a nonnegative integer baseVersion. `previewDoneBefore(before)` returns detached eligible rows in stored task order, without writes: scheduled event.end ≤ before, unscheduled window.end ≤ before, excluding done. `applyDoneBefore({before, baseVersion})` validates and checks the current version inside the mutation queue (ER7), derives membership again, and atomically completes all with the same apply-time now (`Mark N tasks done`). Empty sets are no-ops. Repository failures/ER8 preserve every row and history; undo restores tasks and linked events together.

**Second-plan strategies (WI-55, D-15).** `ReplanStrategy` is `balanced | clusterByCategory | varyCategories | frontLoad | fewerFragments`; `REPLAN_STRATEGIES`, `DEFAULT_REPLAN_STRATEGY` (balanced) and `REPLAN_STRATEGY_LABELS` are shared constants. `replanOptionsSchema` validates optional strategy together with bufferMin. The facade/pipeline request and pure `ReplanInput` gain optional strategy; `ReplanResult.strategy` is required and records the effective choice. Plan ids stay `minimalChange` and `balanced` (the stable second-plan identity), as do diagnostics/apply keys. Minimal change is independent of the selector, and omitted strategy is identical to the previous Balanced week.

`rankReplanOptions(fitting, context, strategy, occupied, categoryId): SlotOption[]` shares existing `rankOptions` for Balanced, Front-load (earliest) and Fewer fragments (bestFit). Front-load/Fewer fragments pass originalStart=null so each gap candidate starts at its earliest edge. Category strategies clamp nearest within each gap, then rank **all** candidates before MAX_OPTIONS. Their ascending keys are Cluster `[-sameCategoryMin, distance, start]` and Vary `[sameCategoryMin, dayLoadMin, distance, start]`. Same-category minutes reuse `computeDayLoads` over matching category ids: sums of each event's overlap with effective working time, including separately overlapping bookings and excluding the event being placed. Occupied includes static, pinned and already placed events, so counts refresh after each placement/pass. No category label has functional meaning. `optionFor` becomes exported for reuse; `rankCandidates(options, keyFor?)` accepts a numeric-key Strategy callback, defaulting to its unchanged BR-7 key and stable input-order tie-break. No picker generation or Minimal-change rules change.

When a selected nondefault strategy moves a valid event, MoveReason adds `{kind: 'strategy'; strategy: Exclude<ReplanStrategy, 'balanced'>}`. Existing Minimal-change reasons take precedence; Balanced retains its existing numeric balance reason. Unchanged intervals count as zero moves. Processing order, pinned-unplaced busy handling, metrics, safety and one-step apply/undo remain unchanged. All five strategies run the retained T35 checks at 10,000 runs each (ten full property cases project-wide).

#### 7.4.4 Replan (`pipelines/replan.ts`)

**`planReplan({range, bufferMin})`**

1. Validate `bufferMin` with `searchOptionsSchema`. Validate the range as BR-12 states it (AUDIT contract note): `start` and `end` are local midnights (`startOfLocalDay(x) === x`), `end > start` and `end ≤ addLocalDays(start, MAX_REPLAN_DAYS)`, so DST days count as whole days. (Before WI-36 only `0 < end − start ≤ 14 × 1440 + REPLAN_DST_SLACK_MIN` was checked, which accepted a one-minute range; the UI still uses that span to decide whether the visible range can be the default.) Otherwise return `InvalidTime` with the issue `{path: 'range', message: 'The replan range must be 1 to 14 days long.'}`.
2. Build the inputs:
   - `frames = buildDayFrames(range, settings)`
   - `notBefore = notBeforeFor(now)`; the internal pipeline receives raw `now` from the facade (WI-52, D-08)
   - `buffer = bufferMin ?? settings.bufferMin`
3. Call `planReplan(...)` from `algorithms/replanHeuristics.ts` (§8.13) with `state.events`, `state.conflicts`, `frames`, `range`, `buffer`, `notBefore` and `segmentsFor` (§7.5).
4. Derive `notMoved` independently for each plan with `engine/replanDiagnostics.ts`: project its moves, reuse the conflict sweep and barred-overlap detector, and retain unchanged events with problems whose overlaps intersect the range and end after raw `now`, plus all unplaced events. Past means overlap end ≤ now, even if an involved event is still running. `diagnoseReplan(events, frames, range, now, plan)` receives the unrounded current Minute; its fourth argument no longer means notBefore (WI-52, D-08). Deduplicate by event ID; order by original event order. Reasons follow PROJECT_SCHEMA BR-12 (fixed, started only when `start ≤ now < end`, outsideFlexWindow, noSlot); carry distinct non-past barred labels and conflicting titles. A future static event before the rounded placement cutoff falls through to noSlot. No placement, schema or metric changes. This extra projection/sort/sweep costs O(N log N + k log k + q) per plan, where k and q are projected conflicts and barred-overlap records (plus the barred detector's frame scan, §8.4a).
5. Store `{baseVersion, range, bufferMin, movableCount, plans, notMoved}` as `lastReplan` (a private engine field, not part of `EngineState`) and return it. `notMoved` is keyed by plan ID and is derived, never persisted/exported.

**`applyReplan({baseVersion, planId})`**

1. Return `StaleResult` unless `lastReplan` exists and `lastReplan.baseVersion === baseVersion === state.version`.
2. Look up the plan.
3. If it has no moves, return `ok` with an unchanged snapshot and the label `''`.
   Otherwise, if any move's `from.start` or `to.start` is before `notBeforeFor(now)`, return `StaleResult` (`requireNotPast`, AUDIT A07): time passing does not change the version, but it can start an event or put a target in the past.
4. Otherwise build one `Change` with `before = current event` and `after = {...event, start: to.start, end: to.end, updatedAt: now}` for each move. The label is `Replan: <n> event(s) moved`. Durations are unchanged, so no task mirroring is needed.
5. Commit.

#### 7.4.5 Settings

WI-32: after a successful settings save, recompute `barredOverlapsFor(events, settings)` and bump the version. BR-3 conflicts remain unchanged. Initialization, import and every successful commit (including undo/redo) also populate `barredOverlaps`. Neither repository nor JSON export schemas change, since warnings are derived.

`updateSettings(s)`:

1. `parseSettingsChange(input, previous)` always validates shape/time with `storedSettingsSchema`; edited barred content also passes overlap-rejecting `settingsSchema`. Unchanged legacy overlaps do not block unrelated saves.
2. Find deleted or timing/day-changed slot IDs with `invalidatedBarredIds`; label changes and day-array reordering do not invalidate keeps. Clear those IDs on live events and pass the changed rows to `repo.saveSettings(s, revision, clearedEvents)` in one transaction. A failure leaves state/history/storage unchanged.
3. Adopt settings/events and recomputed raw overlaps, increment version/revision once, and clear invalid IDs from undo/redo before/after images without discarding other history.

There is no history entry, and the conflicts are unchanged.

**D-09 Keep here.** `setBarredKept({eventId, slotId, kept})` validates with `barredKeepSchema`, requires an existing event/slot and an actual overlap for keeping, then records one metadata-only event change through commit. Repeated values are no-ops. Raw overlaps retain the slot ID and stay in snapshots. Replan ignores only kept barred reasons/diagnostics; conflicts and other reasons still apply. For every new data command, commit clears keeps in the after-image when start or end changes (including task mirroring, alternatives and Replan); Undo restores the before-image. Settings-triggered clearing also sanitizes history so old keeps cannot return for a changed slot.

#### 7.4.6 Import / export

**`exportData()`** returns `JSON.stringify(exportFile, null, 2)` with `exportedAt` = `deps.now()` as an ISO string (the injected clock keeps exports deterministic in tests).

**`importData(json)`**

1. Parse the JSON. A failure gives `InvalidImport [{path: '', message: 'Not valid JSON.'}]`.
2. Validate the discriminated v1/v2 import schema; v1 records are mapped to v3 before cross-record checks. Any issue gives `InvalidImport`, and **all** issues are kept.
3. Run the cross-record checks. Each one gives `InvalidImport`:
   - unique event IDs
   - unique task IDs
   - unique category IDs, case-insensitive names and colours; every event/task categoryId exists
   - every scheduled task's `scheduledEventId` exists and points back with `taskId`
   - that event mirrors the task (BR-9, AUDIT A04): it is flexible, `title = name`, the same priority, `end − start = durationMin`, `flexWindow = window` (description and category may differ); path `tasks.N.scheduledEventId`
   - every event `taskId` points to a scheduled task
   - these checks are `linkIssues(events, tasks, categories)` in `schemas.ts`; `parseExportFile(json)` runs steps 1–3, and `engine.init()` runs `linkIssues` on stored data too
4. Then:
   1. `await repo.replaceAll(data)`
   2. sort the events
   3. run the sweep
   4. clear `undo` and `redo`
   5. clear `lastReplan`
   6. set `version + 1`

**Samples.** `src/data/samples/*` build an `ExportFile` relative to the current week's Monday. The UI calls `engine.importData(JSON.stringify(buildSample(id, now)))`.

### 7.5 Shared search helper (`src/engine/search.ts`)

This is used by `findSlots`, `suggestAlternatives` and (through `segmentsFor`) Replan. It is the only place the slot pipeline is assembled.

```ts
interface SearchRequest {
  durationMin: number; priority: Priority; window: Interval; useWorkingHours: boolean;
  excludeIds: readonly string[]; originalStart: Minute | null; criterion: Criterion;
  bufferMin: number; subject: SearchSubject;
}
function search(state: EngineState, req: SearchRequest, notBefore: Minute): Result<SlotSearchResult> {
  const frames = buildDayFrames(req.window, state.settings);                         // shared/time
  const segments = allowedSegments(req.window, frames, { useWorkingHours: req.useWorkingHours, notBefore });
  const longest = maxLength(segments);
  if (req.durationMin > longest)
    return err({ code: 'TaskLongerThanWindow', durationMin: req.durationMin, longestStretchMin: longest });   // ER2
  const near = eventsIntersecting(state.events, expand(req.window, req.bufferMin))
                 .filter(e => !req.excludeIds.includes(e.id));
  const busy = mergeBusy(near, req.bufferMin);
  const gaps = freeGaps(segments, busy);
  const fitting = gaps.filter(g => g.end - g.start >= req.durationMin);
  if (fitting.length === 0) {
    const largest = largestGap(gaps);                                                 // first one on ties
    return err({ code: 'NoSlotFound', durationMin: req.durationMin, bufferMin: req.bufferMin,
                 largestGapMin: largest ? largest.end - largest.start : 0, largestGap: largest });  // ER3
  }
  // AUDIT A05: loads cover the frames' whole days, not just the window (a window starting at 17:00
  // must still see that day's 09:00–17:00 events); gaps above still use the narrow `near` slice.
  const loads = computeDayLoads(eventsIntersecting(state.events, {start: frames[0].dayStart, end: frames.at(-1).dayEnd})
                                  .filter(e ⇒ !req.excludeIds.includes(e.id)), frames);
  const rankContext = { durationMin: req.durationMin, criterion: req.criterion,
                     priority: req.priority, originalStart: req.originalStart, dayLoads: loads, frames };
  const options = rankCandidates(fitting.flatMap(gap => generateCandidates(gap, rankContext)));
  return ok({ baseVersion: state.version, subject: req.subject, durationMin: req.durationMin,
              priority: req.priority, criterion: req.criterion, bufferMin: req.bufferMin,
              searchWindow: req.window, segmentCount: segments.length, freeGaps: gaps,
              fittingCount: fitting.length, options });
}
```

`segmentsFor(window)` is a closure passed into Replan. It does `allowedSegments(window, frames, {useWorkingHours: true, notBefore})`, so the replan algorithm stays pure.

---

## 8. Algorithms (`src/engine/algorithms/`) — pure, frozen signatures

All of these functions follow the same rules:

- They are pure, with no I/O, no `Date` and no randomness.
- They never mutate their inputs. They return new arrays.
- Time inputs are integer Minutes.
- "Sorted" always means sorted by `compareEvents` for events, and by `start` for intervals.

### 8.1 `interval.ts`

```ts
export const length = (i: Interval) => i.end - i.start;
export const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;      // BR-2
export const overlapOf = (a: Interval, b: Interval): Interval | null => {
  const s = Math.max(a.start, b.start), e = Math.min(a.end, b.end); return s < e ? { start: s, end: e } : null; };
export const contains = (outer: Interval, inner: Interval) => outer.start <= inner.start && inner.end <= outer.end;
export const intersect = overlapOf;
export const expand = (i: Interval, by: number): Interval => ({ start: i.start - by, end: i.end + by });
export const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
export const maxLength = (xs: readonly Interval[]) => xs.reduce((m, x) => Math.max(m, length(x)), 0);
```

### 8.2 `sortedArray.ts`

```ts
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number;   // start, then end, then id
/** First index i in [0, arr.length] where pred(arr[i]) is true; pred must be monotone (false…false true…true). */
export function lowerBound<T>(arr: readonly T[], pred: (x: T) => boolean): number;       // O(log n)
export function insertSorted(arr: readonly CalendarEvent[], e: CalendarEvent): CalendarEvent[]; // O(log n + n)
export function removeById<T extends { id: string }>(arr: readonly T[], id: string): T[];      // O(n)
/** Events with e.start < w.end && e.end > w.start. Relies on BR-4 (duration ≤ MAX_EVENT_MIN). O(log n + n_w). */
export function eventsIntersecting(arr: readonly CalendarEvent[], w: Interval): CalendarEvent[] {
  const lo = lowerBound(arr, e => e.start >= w.start - MAX_EVENT_MIN);
  const hi = lowerBound(arr, e => e.start >= w.end);
  return arr.slice(lo, hi).filter(e => e.end > w.start);
}
```

### 8.3 `minHeap.ts`

This is a generic binary min-heap over an array. It is an array-backed data structure, consistent with the arrays-only rule.

```ts
export class MinHeap<T> {
  constructor(private readonly key: (x: T) => number) {}
  get size(): number;
  peek(): T | undefined;
  push(x: T): void;          // O(log n) sift-up
  pop(): T | undefined;      // O(log n) sift-down
  items(): readonly T[];     // backing array (any order) — used to enumerate all open intervals
}
```

### 8.4 `sweep.ts` — conflict detection (FR4, BR-3)

```ts
export function detectConflicts(sorted: readonly CalendarEvent[]): Conflict[];
```

```text
heap ← MinHeap keyed by end                       // the set of "open" events
out ← []
for e in sorted (by start, end, id):
    while heap.size > 0 and heap.peek().end ≤ e.start:   // half-open: touching ≠ overlap
        heap.pop()
    for h in heap.items():                         // every open h has h.start ≤ e.start < h.end
        overlap ← [e.start, min(h.end, e.end))     // non-empty because e.end > e.start
        out.push(conflict(h, e, overlap, targetId = chooseTarget(h, e)))
    heap.push(e)
sort out by (overlap.start, key)                   // presentation order, BR-3
return out
```

**Correctness.**
- When `e` is processed, every event that started earlier and has not yet ended is still in the heap (pops only remove events with `end ≤ e.start`).
- Each such event overlaps `e`, because it started no later than `e` and ends after `e.start`.
- Conversely, an earlier event that has ended (`end ≤ e.start`) cannot overlap `e`, or any later event.
- So every overlapping pair is emitted exactly once, at its later-starting member.

This fixes the A1/A2 running-max version, which only compared against the single latest end. In T3 that version misses (B,C).

**Complexity.**
- Pushes and pops cost O(N log N). Enumerating the heap costs O(k).
- The final ordering costs O(k log k).
- Total time: **O(N log N + k log k)**, and **O(N + k)** space.
- For a personal calendar k is small, so this behaves as O(N log N).

`countOverlaps(candidate: Interval, events: readonly Interval[]): number` is also exported. It counts the events that overlap `candidate` (BR-2). It is an O(n) linear check, used only by the optional drag preview (§11.3); the caller leaves the dragged event out of `events`.

### 8.4a `barred.ts` — barred-slot warnings (BR-15), frozen contract

`detectBarredOverlaps(events: readonly CalendarEvent[], frames: readonly DayFrame[]): BarredOverlap[]` is pure. PRE: events are valid; frames are ordered, disjoint local days covering each event's touched days, with their applicable slots pre-expanded by shared/time. POST: returns one record per positive event/slot intersection, in event input order, then frame order, then slot order. It ignores `frame.work`, does not mutate inputs and uses half-open intersection. No warning enters `detectConflicts` or replan metrics.

Use `lowerBound` to start at the first frame whose `dayEnd > event.start`, visit intersecting frames until `dayStart >= event.end`, and reuse interval intersection/length helpers. Cost: `O(N log(D+1) + F·B + q)` time, `O(q)` output space, where F is visited event/day pairs, B is the maximum slot count per frame and q is returned records.

`state.barredOverlapsFor(events, settings)` builds DayFrames separately for each event through `buildDayFrames(event, settings)` and calls the pure algorithm. This avoids expanding empty years between sparse events. BR-4 bounds each event to at most three local days across DST; including frame slot sorting, cost is `O(N·B log(B+1) + q)` time and `O(B + q)` space. Return immediately when no barred slots exist.

### 8.5 `merge.ts` — busy blocks (BR-6)

```ts
export function mergeBusy(sortedEvents: readonly CalendarEvent[], bufferMin: number): BusyBlock[];
```

```text
blocks ← []
for e in sortedEvents:                      // expanding every interval by the same b keeps start-order
    s ← e.start − b ; t ← e.end + b
    if blocks nonempty and s ≤ last.end:    // overlapping OR touching → same block
        if t > last.end: last.end ← t ; last.endEvent ← {e.id, e.title, end: e.end}
    else: blocks.push({start: s, end: t, startEvent: {e.id, e.title, start: e.start}, endEvent: {e.id, e.title, end: e.end}})
```

This costs O(n) time and O(n) space. Blocks are built as new objects; inputs are not mutated.

### 8.6 `src/shared/time.ts` — local-time boundary (not in `algorithms/`)

```ts
export const toMinute = (d: Date): Minute => Math.floor(d.getTime() / 60000);
export const fromMinute = (m: Minute): Date => new Date(m * 60000);
export const ceilTo = (m: Minute, step: number) => Math.ceil(m / step) * step;
export function startOfLocalDay(m: Minute): Minute;            // date-fns startOfDay
export function addLocalDays(m: Minute, n: number): Minute;    // date-fns addDays (DST-safe)
export function atLocal(date: string /* YYYY-MM-DD */, time: string /* HH:mm */): Minute;
export function localMinuteOfDay(m: Minute): number;           // hours*60+minutes in local time
/** One DayFrame per local day intersecting `window`, in order. Work and barred times are built with
 *  date-fns `set(day, {hours, minutes})`, never by adding minutes to midnight — so DST days are correct. */
export function buildDayFrames(window: Interval, s: Settings): DayFrame[];
export function onLocalDay(day: Minute, minuteOfDay: number): Minute;  // day's local HH:mm (1440 = next midnight)
export function startOfLocalWeek(m: Minute): Minute;                    // Monday 00:00 of m's week
```

`buildDayFrames` works as follows:

1. Start from `d = startOfLocalDay(window.start)`.
2. While `d < window.end`, emit a frame:

   ```text
   { dayStart: d,
     dayEnd: addLocalDays(d, 1),
     weekday,
     work: !settings.useWorkingHours ? [d, addLocalDays(d, 1)] :
           workDays.includes(weekday) ? [set(d, workStart), set(d, workEnd)] : null,
     barred: for each slot whose days include weekday, sorted by start → {label, [set(d, s), set(d, e)]} }
   ```

3. If `workEndMin === 1440`, the work end is `dayEnd`.

It costs O(D·B), for D days and B barred slots.

### 8.7 `segments.ts` — allowed segments (BR-5)

```ts
export function allowedSegments(window: Interval, frames: readonly DayFrame[],
  opts: { useWorkingHours: boolean; notBefore: Minute }): Segment[];
```

```text
if useWorkingHours:
    pieces ← []
    for f in frames with f.work ≠ null:
        seg ← intersect(f.work, window)            // skip if empty
        edges: workStart/workEnd, or windowStart/windowEnd where the window cuts strictly inside f.work
        pieces.push(subtractBarred(seg, f.barred))
else:                                              // BR-5: the window minus barred slots, in one pass
    pieces ← subtractBarred(window (edges windowStart/windowEnd), concat of every f.barred)
clip every piece to start ≥ notBefore (edge 'now' where clipped); drop pieces ending at or before it
return pieces (sorted, disjoint)

subtractBarred(seg, barred sorted by start; slots may overlap):
    cursor ← seg.start with seg.startEdge
    for b in barred, skipping those ending ≤ cursor or starting ≥ seg.end:
        if b.start > cursor: emit [cursor, b.start) with end edge barred {b.label, b.start}
        cursor ← b.end with edge barred {b.label, b.end}
    if cursor < seg.end: emit [cursor, seg.end) with seg.endEdge
```

Without working hours the window is never split per day, so consecutive days join across midnight and no unlabelled day boundary can appear. A barred slot ending at 24:00 leaves a `barred` edge at midnight.

This costs O(D·B) time.

### 8.8 `gaps.ts` — free gaps (BR-6)

```ts
export function freeGaps(segments: readonly Segment[], busy: readonly BusyBlock[]): FreeGap[];
export function largestGap(gaps: readonly FreeGap[]): FreeGap | null;   // first maximal on ties
```

```text
gaps ← [] ; j ← 0
for seg in segments:
    while j < busy.length and busy[j].end ≤ seg.start: j++   // blocks entirely before this segment
    cur ← seg.start ; curB ← seg.startEdge ; k ← j
    while k < busy.length and busy[k].start < seg.end:
        b ← busy[k]
        if b.start > cur: gaps.push({cur, b.start, before: curB, after: eventBoundary(b.startEvent, b.start)})
        if b.end > cur:   cur ← b.end ; curB ← eventBoundary(b.endEvent, b.end)
        k++
    if cur < seg.end: gaps.push({cur, seg.end, before: curB, after: seg.endEdge})
    // j is NOT advanced to k: a block may continue into the next segment
```

`eventBoundary` builds `{kind: 'event', eventId, title, at: event.start or event.end (unbuffered), bufferMin}`. `bufferMin` is read back from the block (`startEvent.start − block.start`, or `block.end − endEvent.end`), because `mergeBusy` grows every event by the same buffer.

**Complexity.** O(n + s) time, where s is the number of segments. A block is revisited only by the segments it spans, which is bounded because events are at most 24 h long. Space is O(m).

### 8.9 `dayLoad.ts`

```ts
/** Map dayStart → minutes of events clipped to that day's working interval (summed, BR glossary "Day load"). */
export function computeDayLoads(sortedEvents: readonly CalendarEvent[], frames: readonly DayFrame[]): Map<Minute, number>;
export function frameOf(frames: readonly DayFrame[], m: Minute): DayFrame | undefined;   // binary search on dayStart
export function loadSpread(loads: Map<Minute, number>, frames: readonly DayFrame[]): number; // max−min over work days; 0 if none
```

For each event, find the frames it touches by binary search (at most 3, since events are at most 24 h). Add the event's overlap with `frame.work` to that day's load.

This costs O(n log D + D) time.

### 8.10 `rank.ts` (BR-7)

```ts
export interface RankContext {
  durationMin: number; criterion: Criterion; priority: Priority;
  originalStart: Minute | null; dayLoads: Map<Minute, number>; frames: readonly DayFrame[];
}
export function effectiveCriterion(c: Criterion, p: Priority): EffectiveCriterion;
//   priorityAware → high: 'earliest', medium: 'bestFit', low: 'leastLoaded'; others unchanged
export function rankOptions(fitting: readonly FreeGap[], ctx: RankContext): SlotOption[];
export function optionAt(gap: FreeGap, start: Minute, ctx: RankContext): Omit<SlotOption, 'rank'>;
export function optionFor(gap: FreeGap, context: RankContext): Omit<SlotOption, 'rank'>;
export function rankCandidates(options: readonly Omit<SlotOption, 'rank'>[], keyFor?: (option: Omit<SlotOption, 'rank'>) => readonly number[]): SlotOption[];
```

```text
eff ← effectiveCriterion(ctx.criterion, ctx.priority)
cands ← for each gap g (index gi):
    start ← ctx.originalStart ≠ null ? clamp(originalStart, g.start, g.end − d) : g.start
    dist  ← originalStart ≠ null ? |start − originalStart| : null
    load  ← dayLoads.get(frameOf(frames, start).dayStart) ?? 0
    key   ← eff = earliest    → [start]
            eff = bestFit     → [len(g) − d, start]
            eff = leastLoaded → [load, dist ?? 0, start]
            eff = nearest     → [dist, start]
    → {slot: [start, start+d), gap: g, gapMin, leftoverMin, dayLoadMin: load, criterion, eff, dist, key, gi}
sort cands lexicographically by (key…, gi)
return first MAX_OPTIONS, with rank = 1..k
```

This costs O(m log m) time and O(m) space. When `eff = nearest` with no original start, it falls back to `earliest`; this never happens in practice.

WI-51 shares `optionAt`'s explanation construction and `rankCandidates`' criterion ordering with the picker generator. `optionAt` requires `gap.start ≤ start ≤ gap.end − durationMin`, positive integer duration, and frames covering the gap. `rankCandidates` returns all supplied options ranked 1…k, without a limit; they share one effective criterion, and ties retain input order after the existing start tie-break. `rankOptions` still constructs one candidate per gap and takes `MAX_OPTIONS`; its Replan behaviour and T10/T34 contracts are unchanged.

### 8.10a `suggestions.ts` — picker candidate generation (WI-51, D-06)

```ts
export function generateCandidates(gap: FreeGap, context: RankContext): Omit<SlotOption, 'rank'>[];
```

The caller supplies one fitting gap and a context with positive integer duration and frames covering it. The pure generator returns candidates in time order, each carrying the complete BR-8 explanation. Starts are `gap.start`, `gap.end − durationMin`, the clamped `originalStart` when present, and all multiples of `SUGGESTION_STEP_MIN = 30` within those bounds. A Set removes duplicates. If C candidates are produced, time is O(C log C + C log D) and space O(C), including shared option construction's frame lookup. No date, UI or storage dependency is introduced. Both picker pipelines use this generator through `search`, followed by `rankCandidates`; Replan calls `rankOptions` directly and keeps its prior contract.

### 8.11 `target.ts` (BR-10)

```ts
export function chooseTarget(a: CalendarEvent, b: CalendarEvent): string;   // returns the id to move
```

The rule is the first one that differs between the two events:

1. Pick the flexible one over the fixed one.
2. Pick the lower `PRIORITY_RANK`.
3. Pick the shorter duration.
4. Pick the later start.
5. Pick the larger ID.

This is O(1).

### 8.12 `taskOrder.ts` (BR-11)

```ts
export function compareTasksForQueue(a: Task, b: Task): number;
// PRIORITY_RANK desc, window.end asc, durationMin desc, name (localeCompare) asc, id asc
```

Sorting T tasks costs O(T log T).

### 8.13 `replanHeuristics.ts` (BR-12)

```ts
export interface ReplanInput {
  events: readonly CalendarEvent[];        // all, sorted
  conflicts: readonly Conflict[];          // current, for conflictsBefore
  frames: readonly DayFrame[];             // for the range
  range: Interval; bufferMin: number; notBefore: Minute;
  useWorkingHours: boolean;                   // global working-time switch
  strategy?: ReplanStrategy;                  // omitted = Balanced week; first plan unchanged
  segmentsFor: (window: Interval) => Segment[]; // injected allowedSegments with the global switch
}
export function planReplan(input: ReplanInput): { movableCount: number; plans: [ReplanPlan, ReplanPlan] };
export function rankReplanOptions(fitting: readonly FreeGap[], context: RankContext, strategy: ReplanStrategy, occupied: readonly CalendarEvent[], categoryId: string): SlotOption[];
export function replanSortKey(option: Pick<SlotOption, 'slot' | 'distanceMin' | 'dayLoadMin'>, strategy: 'clusterByCategory' | 'varyCategories', sameCategoryMin: number): number[];
```

```text
inRange  ← eventsIntersecting(events, range)
movable  ← inRange.filter(e ⇒ e.flexible ∧ e.start ≥ notBefore)
           sorted by PRIORITY_RANK desc, duration desc, start asc, id asc
staticEv ← eventsIntersecting(events, expand(range, bufferMin)).filter(e ∉ movable)

plans ← [run('minimalChange'), run('balanced')]

run(kind):                                             // AUDIT A01: repeat until no new event is unplaced
  pinned ← {}                                          // id → unplaced entry; these stay where they are
  repeat:
     (moves, newlyUnplaced) ← pass(kind, pinned)
     add newlyUnplaced to pinned
  until newlyUnplaced is empty                         // ≤ c + 1 passes: pinned only grows
  unplaced ← pinned entries in movable order

pass(kind, pinned):
  occupied ← staticEv ∪ pinned events, sorted ; moves ← [] ; unplaced ← []
  for e in movable, skipping pinned ones:
     d   ← e.end − e.start
     win ← e.flexWindow ∩ range                         // may be null
     segs ← win ? segmentsFor(win) : []
     busy ← mergeBusy(occupied, bufferMin)
     gaps ← freeGaps(segs, busy) ; fitting ← gaps with length ≥ d
     why  ← invalidReason(e, win, segs, occupied, bufferMin, frames)   // null ⇒ current spot is valid
     if kind = minimalChange and why = null:            place ← e                       // keep
     else if fitting empty:                             place ← e ; unplaced.push({e, why})
     else:
        crit ← kind = balanced ? 'leastLoaded' : 'nearest'
        loads ← computeDayLoads(occupied, frames)
        context ← {d, crit, e.priority, originalStart: e.start, loads, frames}
        best ← kind = minimalChange ? rankOptions(fitting, context)[0]
                                    : rankReplanOptions(fitting, context, strategy, occupied, e.categoryId)[0]
        place ← {...e, start: best.slot.start, end: best.slot.end}
        if place.start ≠ e.start:
           moves.push({e, from: e, to: place,
                       reason: why ?? (strategy = balanced
                         ? {balance, fromDayLoad: load(day(e)), toDayLoad: best.dayLoadMin}
                         : {strategy, strategy})})
     occupied ← insertSorted(occupied, place)
  after ← inRange with moved events replaced, re-sorted
  metrics ← moved = |moves|, totalShiftMin = Σ|to.start − from.start|,
            conflictsBefore = |{c ∈ conflicts : overlaps(c.overlap, range)}|,
            conflictsAfter  = |{c ∈ detectConflicts(after) : overlaps(c.overlap, range)}|,
            loadSpreadBefore/After = loadSpread(computeDayLoads(inRange | after, frames), frames),
            unplaced = |unplaced|

invalidReason(e, win, segs, occupied, b, frames):   // first failing check, in this order
  win null or ¬contains(win, e)                          → outsideFlexWindow
  useWorkingHours and no frame f with f.work containing e → outsideWorkingHours
  e overlaps some barred interval of its frame(s)        → barred{label}
  e overlaps some o ∈ occupied (raw)                     → conflict{o}
  e overlaps some o ∈ occupied expanded by b             → buffer{o}
  else null
```

**Design notes for the viva.**
- **Greedy and priority order:** high-priority events are placed first, so they get the best spots. This is a one-pass greedy with no backtracking, which keeps every move explainable.
- **Unplaced events** stay where they are and remain busy for every other event, including those processed before them. One greedy pass cannot know in advance which events will fail, so a plan repeats the pass with each newly unplaced event pinned in place until no new event fails (AUDIT A01: a high-priority event used to move onto a low-priority event's spot, and that event then could not move, turning 0 conflicts into 1).
- **`staticEv`** uses the range expanded by the buffer, so an event just outside the range still pushes its buffer into it.

**Complexity.**
- Sorting the c movable events costs O(c log c).
- Each one costs O(n + c + s + m log m), from merge, gaps, rank and the sorted insert.
- One pass: **O(c·(n + c + s + m log m))**. This is A3's O(c(n + m log m)), with the s and c terms made explicit.
- A plan runs at most c + 1 passes (each extra pass pins ≥ 1 more event), so the worst case is **O(c²·(n + c + s + m log m))**; with no unplaced event it is one pass, as before.

---

## 9. Data layer (`src/data/`)

### 9.1 Repository interface — frozen contract

```ts
export interface StoredData { categories: Category[]; events: CalendarEvent[]; tasks: Task[]; settings: Settings | null; revision: number }
export interface ChangeSet {
  putCategories?: Category[]; deleteCategoryIds?: string[];
  putEvents: CalendarEvent[]; deleteEventIds: string[];
  putTasks: Task[];           deleteTaskIds: string[];
}
export interface Repository {
  load(): Promise<StoredData>;
  apply(changes: ChangeSet, expectedRevision: number): Promise<void>;          // MUST be atomic (all or nothing)
  saveSettings(settings: Settings, expectedRevision: number, clearedEvents?: readonly CalendarEvent[]): Promise<void>;
  replaceAll(data: { categories: Category[]; events: CalendarEvent[]; tasks: Task[]; settings: Settings }, expectedRevision: number): Promise<void>; // atomic
}
export class ConcurrentModificationError extends Error { … }
export function requireRevision(storedRevision: number, expectedRevision: number): void; // throws ConcurrentModificationError
```

**Revision (WI-40, peer report #14).** The repository counts the writes it has accepted (`INITIAL_REVISION = 0` when nothing was written). Every write names the revision its caller last loaded or wrote. Inside the write's own transaction the repository compares it with the stored revision: equal → it writes and stores `expectedRevision + 1`; different → it throws `ConcurrentModificationError` and writes nothing. The engine keeps the revision in `EngineState.revision` and maps the error to `ConcurrentModification` (ER8). So a tab whose view is out of date can never overwrite another tab's change, even when the cross-tab message (§4) has not arrived yet.

`engine.init()` calls `load()`, validates it with `storedDataSchema` and `storedRevisionSchema`, sorts the events, and uses `DEFAULT_SETTINGS` when `settings` is `null`. It also saves those defaults (at the loaded revision). A failing `load()` or `saveSettings()`, or damaged stored data, gives `StorageError` (message "Saved data is damaged." for the latter), which the App shows as the full-page error of §4.

`engine.reload()` (queued like a command) loads and validates the same way, then replaces the state as an import does: events sorted, conflicts and barred overlaps detected, undo/redo and `lastReplan` cleared (they describe data another tab replaced) and `version + 1`, so open options and plans give `StaleResult` (ER7). It never writes and never calls `onCommit`.

### 9.2 `dexieRepository.ts`

```ts
class CalendarDb extends Dexie {
  categories!: Table<Category, string>;
  events!: Table<CalendarEvent, string>;
  tasks!: Table<Task, string>;
  settings!: Table<{ key: 'app'; value: Settings }, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ events: 'id, start, taskId', tasks: 'id, status', settings: 'key' });
    this.version(2).stores({ meta: 'key' })                     // WI-40: { key: 'revision', value }
      .upgrade((tx) => tx.table('meta').put({ key: 'revision', value: INITIAL_REVISION }));
    this.version(3).stores({ categories: 'id' }).upgrade(/* validated legacy mapping; revision kept */);
  }
}
// apply(): db.transaction('rw', db.events, db.tasks, async () => { bulkDelete…; bulkPut… })
// replaceAll(): one 'rw' transaction over all three tables: clear() ×3 then bulkPut.
// static open(name): new CalendarDb(name).open() — throws if IndexedDB is unavailable (→ degraded mode).
```

Schema changes add the next version with its upgrade; never edit a shipped version in place. Version 2 (WI-40) only adds the `meta` table: Dexie keeps the tables a later version does not name, so a version-1 database keeps every event, task and settings row (tested by opening a real version-1 database in fake-indexeddb). `load()` reads the revision in its read transaction; `apply`, `saveSettings` and `replaceAll` each check and bump it first inside their `'rw'` transaction, which now includes `meta`. IndexedDB serialises overlapping `'rw'` transactions across tabs, so the check and the write are atomic.

### 9.3 `memoryRepository.ts`

This keeps `Map`s of events and tasks plus the settings and the revision, and has the same semantics (including the revision check, which cannot interleave because each write runs synchronously). It deep-copies data on load and apply, so tests cannot alias engine state.

It is used for:
- all engine and integration tests
- degraded mode in the app
- the "storage unavailable" banner path

`tests/helpers/failingRepository.ts` wraps it. It rejects `apply` on demand, for ER5 tests; otherwise it forwards the expected revision.

### 9.4 Export file

The export file is the `ExportFile` type in §5. It is pretty-printed JSON. The file name is `calendar-export-YYYY-MM-DD.json`.

WI-48 / D-17: export format version 2 contains categories. Import accepts v1 via `legacyExportSchema` and v2 via `exportFileSchema`, discriminated by version. `shared/legacy.ts` holds typed pure mappings after `legacyStoredDataSchema` validation. V1 enum ids map to the same stable seed ids; missing fields get the new defaults. The v3 Dexie upgrade bulk-writes mapped records and seeded categories in its upgrade transaction without touching the meta revision; fresh databases populate categories too. MemoryRepository seeds the same independent records. `replaceAll` atomically replaces categories with events/tasks/settings, including rollback and revision checking.

`storedSettingsSchema` validates individual slots and working-time bounds while preserving legacy overlaps/duplicates. The new-settings and v2-import schemas still apply the current duplicate rule; v1 imports use the legacy settings schema. `storedTaskSchema` requires `doneAt != null` exactly for `done`, and the existing event-link check still requires an event id exactly for `scheduled`.

The UI downloads it via `Blob` + `URL.createObjectURL`. It reads imports via `<input type="file" accept="application/json">` and `file.text()`.

### 9.5 Samples (`src/data/samples/`)

```ts
export type SampleId = 'sparseWeek' | 'backToBack' | 'overlapCluster' | 'fullyBooked' | 'midnight' | 'stress';
export const SAMPLES: Record<SampleId, { label: string; build: (weekMonday: Minute) => ExportFile }>;
```

Each sample uses `atLocal` relative to `weekMonday`. The UI passes `startOfLocalWeek(now)`, where Monday is the start of the week.

`buildStress(weekMonday, seed = 42)` also accepts an integer seed so T15 reuses the same jittered-grid generator with seed 7. The registered stress sample continues to use its default seed 42. `tests/helpers/performance.ts` shares the initialized fixture and combined query between `bench/engine.bench.ts` and the gated eleven-run assertion in `tests/integration/perf.test.ts`. `npm run test:perf` sets `PERF=1` portably on Windows and Unix; setup is outside the measured query.

`npm run samples:export` regenerates the six committed `docs/samples/*.json` files for Monday 2 November 2026 in UTC. `scripts/exportSamples.mjs` uses Vite's module loader for the existing TypeScript/alias configuration and validates each generated file with `parseExportFile`; it adds no dependency and starts no listening server. In-app samples still use the current local week.

| Sample | Contents (must exist so demos D1–D5 work) |
|---|---|
| `sparseWeek` | 8 events Mon–Fri. Classes are fixed; "Meeting" (Medium) and "Study" (Low) are flexible with whole-week flex windows, so alternatives and Replan have something to do. 1 conflict: Tue Lecture (fixed, High) 10:00–11:30 ↔ Meeting 11:00–12:00. Lunch barred 13:00–14:00 Mon–Fri. 4 unscheduled tasks, windowed to the sample week: "Write report" 90 min High, "Read chapter 4" 45 min Medium, "Gym" 60 min Low, and "Thesis draft" 600 min Medium (shows ER2). |
| `backToBack` | Mon 09:00–17:00 as 8 consecutive 1 h events; 0 conflicts |
| `overlapCluster` | Wed: 6 events all overlapping 10:00–12:00, so 15 conflicts |
| `fullyBooked` | Thu 09:00–18:00 fully booked, except one 15-minute gap at 12:00–12:15, plus a 30 min task windowed to Thu (shows ER3) |
| `midnight` | Mon 23:00–Tue 01:00 and Tue 00:30–01:30 (shows T4 on screen) |
| `stress` | 5,000 events over 100 weeks from a seeded `mulberry32(42)`: about 10 per working day, 20–60 min, on a jittered grid, so conflicts stay rare (k small, as assumed in A3) |

---

## 10. Complexity summary

**Notation.**

| Symbol | Meaning |
|---|---|
| N | total events |
| n | events intersecting the search window |
| s | allowed segments |
| m | free gaps |
| k | conflicting pairs |
| c | movable events in a replan |
| C | generated picker candidates across all fitting gaps |
| T | tasks |
| D | days in a window |
| B | barred slots |
| q | barred event/slot overlap records |
| W | barred-warning derivation cost: N·B log(B+1) + q (constant when no slots exist) |

| Operation | Time | Space |
|---|---|---|
| Barred warnings, including per-event local frames | O(N·B log(B+1) + q) | O(B + q) |
| Validate a command (Zod) | O(1) | O(1) |
| Boot: load + sort + sweep + barred warnings | O(N log N + k log k + W) | O(N + T + k + B + q) |
| Insert / move / delete in the sorted array | O(log N + N) | O(N) (new array) |
| Conflict sweep after a change (global) | O(N log N + k log k) | O(N + k) |
| Window slice `eventsIntersecting` | O(log N + n) | O(n) |
| Day frames + allowed segments | O(D·B) | O(D·B) |
| Merge into busy blocks | O(n) | O(n) |
| Free gaps | O(n + s) | O(m) |
| Rank | O(m log m) | O(m) |
| **findSlots / suggestAlternatives (end to end)** | **O(log N + n + D·B + C log(C+1) + C log(D+1))** | O(n + s + m + C) |
| orderForScheduling | O(T log T) | O(T) |
| **planReplan** | **O(c·(n + c + s + m log m))** per pass; ≤ c + 1 passes (A01), so O(c²·(…)) worst case; plus per-plan diagnostics below | O(n + c + s + m) plus diagnostics below |
| Replan diagnostics, each plan (WI-38) | O(N log N + k log k + N log(D+1) + N·D·B + q), reusing §8.4/§8.4a | O(N + k + q) |
| Commit (excluding IndexedDB I/O) | O(N log N + k log k + W) | O(N + k + B + q) |
| Undo / redo | same as commit | O(changed records) per history entry |
| Export / import | O(N + T) / O((N + T) log N + W) | O(N + T + B + q) |
| Drag preview `countOverlaps` | O(n) | O(1) |

Compared with A1–A3:
- The searches no longer need an O(n log n) sort, because the store is kept sorted.
- The sweep's k term is explicit.

---

## 11. UI layer (`src/ui/`)

### 11.1 Store (`store/appStore.ts`, zustand)

```ts
interface AppState {
  currentMinute: Minute;                     // presentation clock; no domain/repository write
  status: 'loading' | 'ready' | 'fatal';
  fatalError: EngineError | null;
  storageWarning: boolean;
  busy: string | null;                        // loading message while replacing a sample/large import
  snapshot: Snapshot;                          // the ONLY copy of domain data in the UI
  view: { type: 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'listWeek'; date: Minute;
          activeRange: Interval | null };      // activeRange from FullCalendar datesSet
  eventPriorityFilter: Priority[];             // calendar filter (FR6), default all
  hiddenCategoryIds: string[];                // calendar only; default [] shows new categories too
  calendarLocked: boolean;                   // initial events.length > 0; session only
  lastCalendarView: 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth';
  lastCategoryId: string | null;             // session choice; missing id falls back to first
  taskPanel: { sort: 'priority' | 'windowEnd'; priorities: Priority[]; status: 'open' | 'unscheduled' | 'scheduled' | 'done' | 'all';
               selectedIds: string[] };
  dialog: null
    | { kind: 'event'; mode: 'create'; defaults: Partial<EventInput> }
    | { kind: 'event'; mode: 'edit'; id: string }
    | { kind: 'task'; mode: 'create' } | { kind: 'task'; mode: 'edit'; id: string }
    | { kind: 'replan' } | { kind: 'doneBefore' } | { kind: 'settings' } | { kind: 'shortcuts' }
    | { kind: 'confirm'; title: string; body: string; confirmLabel: string; onConfirm: () => void;
        cancelLabel?: string; onCancel?: () => void };   // WI-42: onCancel runs on the cancel button, Esc or close
  picker: PickerState | null;                  // store/pickerSlice.ts
  emphasisIds: string[];                       // briefly highlighted after a change (1.5 s)
  panelsOpen: boolean;                         // UI-only narrow drawer state
  barredViewRequest: number;                   // UI-only focus/scroll request counter
  toasts: Toast[];                             // store/toastSlice.ts
  actions: AppActions;
}
type PickerState =
  | { mode: 'task'; queue: string[]; index: number; criterion: UserCriterion; bufferMin: number;
      result: Result<SlotSearchResult>; selected: number; scheduled: number; skipped: number }
  | { mode: 'alternatives'; eventId: string; otherEventId: string | null; bufferMin: number;
      allowMoving: boolean; range: Interval;
      useWorkingHours: boolean;   // WI-41 Search hours; default overlapsWorkingHours(target, settings)
      order: readonly [string, string] | null;   // WI-45: Move radio order, the conflict's [aId, bId]
      result: Result<SlotSearchResult>; explanation: WindowExplanation | null; selected: number };
  // both modes carry explanation (WI-45): engine.explainWindow after an ER2 / ER3 result, else null
interface Toast { id: string; tone: 'success' | 'info' | 'warning' | 'error'; text: string;
                  actions?: { label: string; run: () => void }[]; sticky?: boolean }
```

`createAppStore(engine, {storageWarning, init, now, resetStorage, initialView?})` builds the store; `now` dates the samples and `resetStorage` empties the repository for the fatal screen's *Reset local data*. `initialView` is the view remembered in `localStorage['fc-view']` (`storedView()` in `hooks/preferences.ts`); `main.tsx` calls `rememberView(store)` so later view changes are remembered too. `onDatesSet` records `view.type` and `view.date` (the shown period's first day, for the toolbar title) as well as `activeRange`. `StoreProvider`, `useAppStore(selector)` and `useAppStoreApi()` live in `appStore.ts`; the API hook exposes the provided store without a render subscription for handlers that need current state (WI-39).

**Alternatives search hours (WI-41).** Opening the alternatives picker sets `useWorkingHours = overlapsWorkingHours(target, settings)` (`shared/time.ts`: the start's local day is a working day and the event overlaps its working hours). `pickerSetWorkingHours(value)` re-runs the search; `pickerToggleTarget` keeps the choice. `forms/eventForm.ts` `defaultFlexWindow(start, settings, end = start)` returns the whole local day when `overlapsWorkingHours({start, end})` is false.

**Other tabs (WI-40).** `actions.reloadFromOtherTab()` runs `engine.reload()`, adopts its snapshot, closes an event or task edit dialog whose record no longer exists, and shows the info toast "Calendar updated in another tab." Every command's error goes through `handleError`: ER8 reloads the same way and shows the ER8 text as a warning toast with no Retry; every other error goes to `showError` as before. A failed reload shows its StorageError toast, whose Retry reloads again.

`SidePanel` renders the panels once: an `aside` at 1024 px and wider, a native `Modal` drawer below it. `useNarrowLayout` listens for media-query changes. The UI store owns the drawer's open state; App wires its toolbar trigger. Nested dialogs keep the drawer open; native Esc closes only the top dialog. Modal cleanup returns focus to the connected trigger, with the page trigger retained across confirmation replacements.

All sample loads and imports with more than `IMPORT_SPINNER_THRESHOLD` events plus tasks set `busy`. `BusyOverlay` is a non-dismissible native modal with a polite status and a reduced-motion-aware spinner. Sample generation is deferred until after a rendering frame and task so the feedback can paint first. The shared replace-all helper clears `busy` in `finally`, including storage failures; Retry repeats the same loading feedback.

**Rules for actions.**

- **Barred warnings (WI-32).** `openEventAlternatives(eventId)` opens the existing alternatives picker with `otherEventId: null`, reusing `suggestAlternatives`. Settings compares old/new warning tuples `(eventId, label, overlap.start, overlap.end)` and counts distinct event IDs among introduced tuples whose overlap ends after raw now; after the normal success toast it adds the BR-15 info toast and **View** action. UI-only `panelsOpen: boolean` controls the drawer and `barredViewRequest: number` requests focus/scroll to the separate section; neither belongs to the persisted model. Event text and accessible names include distinct ongoing/future `In <label>` tags. `ConflictPanel` renders both sections; its conflict heading/count remains event-pair-only and upcoming-only.

- **Mutations.** Every mutating action does `const r = await engine.x(...)`.
  - **On `ok`:** set `snapshot` and `emphasisIds`, then push a success toast built by `format/*`. If `introducedConflicts` is non-empty, push the ER4 warning toast instead. Its actions are *Move to …* (when there is a `suggestion`), which calls `engine.applyAlternative` with the **suggestion's own** `snapshot.version` as `baseVersion` and, on `StaleResult`, opens the alternatives picker for that event instead (AUDIT A03), and *View conflict*.
  - **On `err`:** push the toast from `format/errors.ts` and return the error, so dialogs can show field issues.
- **Picker.**
  - `openTaskPicker(ids)` calls `engine.orderForScheduling(ids)`. If any IDs were dropped, it shows an info toast. Then it runs `findSlots` for `queue[0]`.
  - `pickerApply()` calls `scheduleTask`. **On `ok`**, it increments `scheduled`, moves `index` forward, and runs `findSlots` for the next task. At the end of the queue it shows a summary toast and closes. **On `StaleResult`**, it re-runs `findSlots` for the same task and shows an info toast.
  - `pickerSkip()` increments `skipped` and moves to the next task.
  - `pickerStop()` closes the picker and shows the summary.
  - Changing the criterion or buffer re-runs the current search.
- **Alternatives.** `openAlternatives(conflict)` uses `eventId = conflict.targetId` and `otherEventId = the other id`. The "Move: (●) A ( ) B" toggle swaps the two and re-runs the search.
- **Undo / redo.** The toast reads `Undid: <label>` or `Redid: <label>`.

### 11.2 Components

WI-53 / D-10: Settings registers the native `Use working hours` switch. `useWatch` disables the retained Working days and hours fieldset while off; RHF keeps its values for Save and re-enabling. TaskForm omits Scheduling hours while globally off, preserving the stored task preference. Alternatives omits Search hours; its initial UI choice is false while globally off. Task-picker Details describes the effective rule as any time. CalendarView sets FullCalendar `businessHours` to false while off, removing non-working shading without changing barred backgrounds or now guides. D-09 uses the separate BarredSlotsPanel editor described below; enabled-hours shading uses a tested nonwork-pattern dot texture.

**Presentation clock (WI-52, D-08).** `currentMinute` starts at `AppStoreOptions.now()`. `actions.refreshCurrentMinute()` changes only that UI field when needed. StoreProvider refreshes immediately, once per `MS_PER_MINUTE`, and on window focus/document visibilitychange; cleanup removes the timer/listeners, including StrictMode remounts. Shared `upcomingOverlaps(records, now)` preserves ordered records with `overlap.end > now`; App status, both panels and event barred tags use it. Settings feedback also excludes entirely past newly introduced tuples. ConflictList keeps the upcoming accessible name `Conflict list`; expanded history is `Past conflict list` with no actions. Limits/remainder counts apply separately to each group. Snapshot detection, history, version and metrics remain unchanged.

| Component | Responsibility | Reads | Calls |
|---|---|---|---|
| `App` | Layout grid, empty state, banners, fatal screen, mounts dialogs/toasts, `useShortcuts`, `useTheme` | `status`, `dialog`, `picker` | — |
| `Toolbar` | Navigation, view switch, priority filters, + Event/+ Task/Replan, labelled Undo/Redo, theme, `?` button labelled Keyboard shortcuts (opens the existing help), settings, drawer toggle (< 1024 px) | `view`, `snapshot.canUndo…`, dialog state | store actions |
| `CalendarView` | FullCalendar wrapper (§11.3) | `snapshot.events`, `conflicts`, `settings`, `eventPriorityFilter`, `emphasisIds` | `moveEvent`, open dialogs |
| `EventContent` | Renders an event block: title, time, `[H]/[M]/[L]` tag, `Fixed`/`Task` tag, `⚠ Conflict N min` | props | — |
| `TaskPanel` | Sort/filter controls, task rows with checkbox, status, *Find time*, context menu; "Find time for N selected" | `snapshot.tasks`, `taskPanel` | `openTaskPicker`, dialogs |
| `ConflictPanel` | Upcoming and collapsed Past groups (first 50 + "and N more" in each), overlap/date/minutes and hidden-filter notes; only Upcoming offers Suggest alternatives; upcoming-empty text "No conflicts" | `snapshot.conflicts`, `events`, `currentMinute` | `openAlternatives` |
| `EventDialog` | RHF form with `eventResolver`, shared priority radios and CategorySelect/inline creation; new events Fixed independent of category; full-width flex-window group below End, delete with confirm | `dialog`, event | `createEvent/updateEvent/deleteEvent` |
| `TaskDialog` | RHF form with `taskResolver`; shared priority radios; Controller maps Working hours only / Any time to boolean useWorkingHours; Find time / Unschedule / Delete in edit mode | task | task actions |
| `PriorityRadioGroup` | Native radios in a Priority fieldset; [H]/[M]/[L] tags use existing priority tokens; browser provides arrow-key navigation | RHF registration | registration callbacks |
| `SlotPicker` | Both picker modes (Figure 2), summary line, options as a radio group, ER2/ER3 blocks with suggestions + "Edit task" | `picker` | picker actions |
| `ReplanDialog` | Range (date inputs, default `view.activeRange` when it is at most 14 days, else the first full Monday–Sunday week from `view.date` (Month, AUDIT A10), or the week of `view.date` before the first `datesSet`), inputs that drop computed plans when edited (A08), buffer override, Compute, two plan cards (metrics + moves + unplaced), Apply | engine via action | `planReplan`, `applyReplan` |
| `SettingsDialog` | Four sections: Working time, Scheduling defaults, Categories and Data; barred editing lives in BarredSlotsPanel | `snapshot.settings` | `updateSettings`, `importData` |
| `ConfirmDialog`, `ShortcutHelp`, `Toasts`, `Modal`, `EmptyState` | as named; `Toasts` is the ARIA live region; `Modal` wraps native `<dialog>` + `showModal()` and, when `dismissible`, renders a last-in-DOM `.dialog-close` × button (`aria-label="Close"`, calls `onClose` like Cancel/Esc; CSS puts it top-right; WI-45). `ShortcutHelp` relies on it instead of its own Close button | | |

WI-55 / D-15: `computeReplan(range, bufferMin, strategy?)` forwards the validated strategy. ReplanForm keeps default Balanced and Details=false in per-dialog state; changing dates, strategy or Buffer invalidates plans. `.replan-inputs` puts From/To/Strategy/Compute on one row at all desktop widths. PlanCard shows the move/conflict headline; `ReplanMoves` groups destination-day rows with title, shared `PRIORITY_TAGS`, CategoryTag, compact start movement and reason chips. Details adds existing exact metrics and `moveText` explanations. `combinedNotMoved` unions diagnostics by event id, retains affected plan names and deduplicates barred/conflict labels. `NotMovedList` appears once below both cards, collapsed, with a reason chip and one alternatives action per event; an issue affecting just one plan names it. Details adds full problem text. Zero-move cards still count their own remaining entries, and diagnostics appear even with zero movable events. Existing `openEventAlternatives` and stale-result recomputation are retained. Shared priority tag labels replace the identical local mappings in EventContent and TaskPanel. Per-plan engine diagnostics and apply ids remain unchanged.

WI-51 / D-06: `SlotPicker` uses a wide scrollable native Modal. `SuggestionOptions` renders one Available slots fieldset and native radio name spanning Top picks and All options by day. `picks.ts` derives named picks from complete options, omits duplicate slots in pick order, and groups remaining slots by local start day/time. Rank by refreshes the criterion-ranked result and selects index 0, without changing chip order. Pick radios/chips select `option.rank - 1`, so `pickerApply` still applies the correct result option. `DayOptions` initially shows `SUGGESTION_CHIPS_PER_DAY`, then expands the rest. Cross-midnight chip names include both days. Local Details state starts false and is never persisted; it conditionally renders the summary, search window, buffer, task window and selected gap/boundary/leftover/load. ER2/ER3 explanations remain outside Details. Task header/Rank by, alternatives Move/consent/range/Search hours, and all apply/queue/version/history behaviour remain in their existing store paths. Picks/chips reuse tested text/surface/muted and accent/focus tokens; no dependency is added.


**WI-53 / D-09 UI.** BarredSlotsPanel is a separate named region containing the editor and BarredOverlapPanel; it is currently mounted beside the conflict groups pending WI-56 layout. BarredSlotRow and WeekdayCheckboxes are extracted from Settings, retaining all labels/controls. The editor uses the existing SettingsFormValues/settingsResolver for nested errors, with saved settings as defaults; pending edits expose Save barred slots and Cancel barred slot changes, and Add focuses Label. Save passes only edited barred rows on the current settings. Settings keeps four sections and uses settingsDefaultsResolver (shape/time without editing legacy bars). Shared unkeptBarredOverlaps filters tags, warnings and settings-toast counts; raw snapshots retain every overlap. BarredRows offers Keep here/Stop keeping through actions.setBarredKept and the engine command; Kept starts collapsed, with past records excluded. Legacy clash banners use compact Monday-first day ranges. Calendar backgrounds merge only positive overlaps, retaining all titles in stackedLabels rendered as vertical labelled spans; touching slots remain separate. This grouping is presentation-only and never changes stored slots or search intervals. Token nonwork-pattern has ≥ 3:1 contrast against working/past/non-working backgrounds in both themes; CSS dots make enabled non-working time distinct, with whole shading removed when off. Every time input in the region has a fixed 8.5rem width for 12-hour locales.

**Done task UI (WI-54).** The default Show filter is Open (unscheduled + scheduled); other choices are Unscheduled, Scheduled, Done and All. Rows and the task dialog expose ✓ Mark done for open tasks and Reopen for done. Done rows use a struck title and existing tested muted text, show ✓ Done, and offer only Reopen/Edit/Delete (no Find time). Row/dialog deletion shares `confirmDeleteTask`. Store completion actions use `runMutation`; `previewDoneBefore` is read-only. The Tasks ⋯ disclosure menu opens `DoneBeforeDialog`: date/time Before, Preview, count/list, Apply, Cancel. Apply is disabled before a nonempty preview, after cutoff edits, while pending or when snapshot.version changes; the changed-snapshot message asks for a new preview. Errors leave the dialog open. App mounts it through the `doneBefore` dialog kind. Broader five-region layout stays in WI-56.

### 11.3 FullCalendar integration (`CalendarView/`)

WI-50 / D-01–D-05: EventDialog's flexible boolean is a controlled Fixed/Flexible native radio pair (task-linked events keep Flexible and both controls disabled). Calendar/List is a separate Presentation group, with Day/Week/Month in View. `lastCalendarView` updates only for non-List views. `fc-view` remembers the active side/view, and `fc-calendar-view` remembers its return Calendar view; `storedCalendarView()` supplies `initialCalendarView`. L toggles the two sides, D/W/M switch to Calendar, K calls `toggleCalendarLock()`.

`calendarLocked` initialises from the loaded snapshot's event count and never changes automatically later in the session. CalendarView sets editable/selectable to !locked. `createCalendarHandlers(actions, isLocked = () => false)` also checks the latest lock before mutations/selection (reverting a blocked mutation), retaining event clicks. A DOM container keeps calendar sizing and hosts `useCalendarPan(rootRef, locked)`: primary-pointer time-grid dragging over `CALENDAR_PAN_THRESHOLD_PX = 5` captures the pointer, scrolls from its initial coordinates and suppresses the resulting click; an ordinary event click remains intact. Cleanup releases capture and removes listeners/classes. Fixed confirmations describe destination or new duration, with Move/Change versus Keep it; all remain ordinary undoable moveEvent commands.

The alternatives picker stores `allowMoving = false` and a temporary `range`; `FIXED_ALTERNATIVE_RANGE_DAYS = 2` prepopulates the event day through the following day, clipped to now. Date To is inclusive and maps to next midnight. A target change resets consent and range, preserving Search hours; reopening starts off. `alternativesOptionsSchema` validates consent/hours/buffer. `parseAlternativeRange` is the shared range validator; no consent/range is persisted or exported. ER4's automatic suggestion for fixed events is now null; View conflict still opens the opt-in flow.

WI-49: shared CategoryEditor/CategorySelect/CategoryTag components serve Settings and both item dialogs. The editor is an inline fieldset with type=button actions so it never submits the enclosing item form. Unavailable swatches stay visible but disabled; free-picker/name errors use shared validators and field descriptions. New item forms resolve `lastCategoryId` when it exists, otherwise the first current id or empty; item save requires a category. Selection remembers the id for this store session only. `eventFormValues` defaults flexible=false; there is no `flexibleByDefault`.

`toFullCalendar(snapshot, priorityFilter, activeRange, emphasisIds, now, hiddenCategoryIds = [])` resolves current Category records by id for tags and appends the name to the accessible label/tooltip. Category chips sit beside H/M/L. Both filters apply to calendar rendering and status counts; ConflictPanel's hidden note uses both, while detection/searches/tasks remain independent. Show all and Reset filters clear both. With categories hidden, empty List says "All events in this range are hidden by the calendar filters"; the priority-only wording remains for priority-only filtering. Categories created later are visible automatically.

WI-52 adds `is-past` for events whose end ≤ raw now, and omits barred labels whose overlap ends ≤ now. Snapshot conflicts/barred overlaps retain history. CalendarView passes currentMinute as FullCalendar's `now` and appends decorative `nowGuideEntries(activeRange, now)`: one background event at that local wall-clock time in each visible day. Local-day conversions preserve DST semantics. The faint one-pixel dashed guides are hidden in Month; FullCalendar retains today's stronger two-pixel line. Past days/events use neutral `past-bg`, `past-text`, `past-edge` tokens, with text ≥ 4.5:1 and guide/edge ≥ 3:1 in both themes; opacity is not reduced.

FullCalendar is a **controlled, render-only view**. Its `events` prop is always derived from `snapshot`, and it is never the source of truth.

```tsx
<FullCalendar
  plugins={[timeGridPlugin, dayGridPlugin, listPlugin, interactionPlugin]}
  initialView="timeGridWeek" firstDay={1} headerToolbar={false} height="100%"
  views={{ timeGrid: { dayHeaderContent: ({date}) => <><span className="day-name">{weekdayName(date)}</span>{' '}<span className="day-number">{date.getDate()}</span></> } }}
  // two spans so the week header can set the numeral large (§11.4); the header text stays "Mon 2"
  allDaySlot={false}   // events are never all-day; Month retains weekday-only headers
  slotDuration="00:30:00" snapDuration="00:05:00" scrollTime="08:00:00" nowIndicator
  slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
  eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
  editable selectable selectMirror eventOverlap   // overlaps allowed (ER4: allow with warning)
  businessHours={{ daysOfWeek: settings.workDays, startTime: hhmm(workStartMin), endTime: hhmm(workEndMin) }}
  events={fcEvents}                                // toFullCalendar(snapshot, filter) — memoised
  eventContent={(arg) => renderEventContent(arg, (id) => actions.openDialog({ kind: 'event', mode: 'edit', id }))}
  // renderEventContent: background → stacked barred labels (or no text for a decorative guide); no block props (the select mirror) → time only; else <EventContent/>
  eventDrop={handlers.onDrop} eventResize={handlers.onResize}
  select={handlers.onSelect} eventClick={handlers.onClick} datesSet={handlers.onDatesSet}
/>
```

**`toFullCalendar.ts`** maps each visible event (after priority and category filters) to:

```ts
{
  id, title, start: fromMinute(start), end: fromMinute(end),
  classNames: ['ev', `prio-${p}`, conflicted && 'is-conflict', emphasised && 'is-emphasised'],
  extendedProps: { priority, categoryId, flexible, isTask: taskId !== null, conflictMinutes },
}
```

- `conflictMinutes` is the largest overlap minutes among the event's conflicts.
- **Filter and List (WI-44).** `App` counts `snapshot.events` whose priority is in `eventPriorityFilter` and shows `eventCountText(visible, hidden)` ("N events" plus "(M hidden by filter)" when M > 0). `CalendarView` passes `noEventsContent`: when the filter hides at least one event intersecting `view.activeRange`, `HiddenByFilterNotice` shows "All events in this range are hidden by the priority filter" and a Show all button (`actions.showAllEventPriorities`); otherwise FullCalendar's "No events to display". `fullcalendar.css`: `.fc-list-sticky .fc-list-day > *` gets `z-index: 2` and `background: var(--bg)`; list cells are `vertical-align: middle`; `.event-list-button` is `display: flex` with `flex-wrap: wrap` (block-level, so it is not lifted off the cell's text baseline); below 640 px the time cell may wrap and padding shrinks.
- Each entry also carries a complete accessible `label` from `format/explain.ts`: title, date/time range, priority, kind and conflict. `EventContent` updates the FullCalendar button's accessible name and native tooltip whenever the label changes. List custom content supplies a native button to retain the keyboard activation that would otherwise be lost with FullCalendar's default anchor. Short blocks keep a 32 px minimum target; the complete text remains available in List view and the dialog.
- WI-32 adds `barredLabels: readonly string[]` to event extended props: distinct labels grouped in O(N+q) mapping time. Text tags and the accessible label include `In <label>`; no conflict class is added for a barred warning alone.
- Barred slots for the visible range are added as `{display: 'background', classNames: ['barred'], title: label}` entries, one per day, built with `buildDayFrames(activeRange, settings)`.
- The function is pure and memoised on `snapshot.version`, the filter, `activeRange` and `emphasisIds`.

**`calendarHandlers.ts`** contains plain functions (not hooks), so tests can call them with fake `info` objects (T14):

- **`onDrop(info)` / `onResize(info)`:** a locked gesture or missing endpoints call `info.revert()` and do nothing else. Otherwise call `actions.dragEvent(info.event.id, {start, end}, info.revert)`. The store's fixed confirmation names destination (Move) or new duration/times (Change), with Keep it; confirmation calls `moveEvent`, cancellation calls `revert`. Flexible changes run immediately. Engine errors revert. Other mutation paths never ask. The Fixed tag's tooltip and hidden accessible description explain the lock and opt-in alternatives.
- **`onSelect(info)`:** open the create dialog with `defaults.start/end` from the selection, then call `info.view.calendar.unselect()`. A plain click selects one `SNAP_MIN` step; a selection that short gets `end = start + CLICK_EVENT_MIN` instead (WI-35).
- **`onClick(info)`:** do nothing for background events. Otherwise open the edit dialog.
- **`onDatesSet(info)`:** store `activeRange = {start: toMinute(info.start), end: toMinute(info.end)}`.

**Optional drag preview (WI-26, drop it if it gets awkward).** FullCalendar's `eventAllow(dropInfo, ev)` callback can run `countOverlaps` against `eventsIntersecting(dropInfo range)`. It updates a "⚠ would overlap N" badge in the toolbar through `requestAnimationFrame` throttling, and always returns `true`.

### 11.4 Theming (`styles/tokens.css`)

Every colour lives in `tokens.css`; the two themes differ only there. Light is a warm "paper notebook", dark a "night desk"; Fern / Mint is the single accent (WI-34 design plan in `PROGRESS.md`). Washes and shadows are derived from these tokens with `color-mix`, inside `tokens.css`, so they follow the theme without repeating it.

```css
:root {
  --bg:#fcfbf8; --surface:#f4f1ea; --text:#22201c; --muted:#5f5a52; --border:#e4dfd5;
  --accent:#1f6b52; --on-accent:#ffffff; --focus:#1f6b52;
  --danger:#b3302a; --warning:#9a5a06; --success:#2f7a4a;
  --prio-high:#b0281f; --prio-high-bg:#fbe9e4; --prio-medium:#8f5506; --prio-medium-bg:#fbefd6;
  --prio-low:#395883; --prio-low-bg:#e6edf6; --barred:#ece7dd; --nonwork:#f1ede5;
  --backdrop:rgb(34 32 28 / 38%); --shadow:rgb(34 32 28 / 16%);
  /* derived: --accent-strong (hover), --accent-wash (today, selected option, empty state),
     --selection-wash, --nonwork-wash, --hover-wash, --shadow-dialog, --shadow-toast */
}
:root[data-theme="dark"] {
  --bg:#151614; --surface:#1c1e1b; --text:#ebece8; --muted:#a6aba3; --border:#30332e;
  --accent:#7fd3ab; --on-accent:#0f1411; --focus:#7fd3ab;
  --danger:#ff8076; --warning:#f0b356; --success:#74cf98;
  --prio-high:#ff978c; --prio-high-bg:#3b1f1c; --prio-medium:#f0b356; --prio-medium-bg:#372a14;
  --prio-low:#9cb9e8; --prio-low-bg:#1f2a3b; --barred:#262924; --nonwork:#1c1e1b;
  --backdrop:rgb(0 0 0 / 55%); --shadow:rgb(0 0 0 / 50%);
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* same values as [data-theme="dark"] */ } }
```

**Scales (theme-independent, in `:root`).** Stylesheets use these steps instead of raw px.

| Group | Tokens |
|---|---|
| Spacing | `--space-1`…`--space-7` = 4 / 8 / 12 / 16 / 24 / 32 / 48 px |
| Type (system font stack, `--font-family`) | `--text-xs` 12, `--text-sm` 13, `--text-base` 15, `--text-md` 17, `--text-lg` 20, `--text-xl` 26 px; weights `--weight-regular` 400, `--weight-medium` 500, `--weight-bold` 600; `--leading-tight` 1.25, `--leading-normal` 1.55 |
| Shape | `--radius-sm` 6 (events), `--radius` 8 (controls), `--radius-md` 12 (toasts, plan cards), `--radius-lg` 16 (dialogs), `--radius-pill` (tags, chips), `--edge` 4 px (priority / state edge) |
| Sizes | `--target-min` 32 px (PROJECT_SCHEMA §7.7), `--control-height` 36 px, `--check-size` 18 px, `--slot-height` 32 px (one half-hour row), `--side-width` 384 px (336 px from 1024 to 1279 px) |

No web font is loaded: the system stack needs no dependency, causes no font flash and works offline.

**Event and slot styles.**
- `App.module.css` scopes the application layout (the header is a grid of the title and the toolbar's period / controls / utilities groups). `global.css` shares control, tag, panel, dialog and toast rules; `fullcalendar.css` overrides FullCalendar's injected styles. `main.tsx` imports the three global stylesheets in tokens → controls → calendar order.
- The accent is used only for primary actions (`button.primary`, submit buttons: + Event, + Task, Save, Apply, Load sample week), the selected view, today's column and header, the now line and focus rings. `--on-accent` is the text over it.
- An event block has `background: var(--prio-X-bg)`, a `var(--edge)` inset left edge in `var(--prio-X)` and `color: var(--text)`; in the time grid its title leads, then the time and tags, with the conflict and barred tags first.
- `.is-conflict` adds `outline: 2px dashed var(--danger)` and `outline-offset: -2px`.
- `.barred` uses a 45° repeating-linear-gradient hatch over `var(--barred)`.
- The week header (the one bold element) is left-aligned: a small muted weekday over a `--text-xl` date numeral; today's numeral is the accent and sits on a 3 px accent bar. Side-column rows are hairline-separated with a short rounded state edge, not boxed cards; only dialogs and toasts float, each with its own radius and shadow.

**Theme toggle.** `useTheme` cycles `system → light → dark`:
- It sets `document.documentElement.dataset.theme`. For `system`, it deletes the attribute.
- It persists the choice to `localStorage['fc-theme']`, inside `try/catch`.

### 11.5 Shortcuts (`hooks/useShortcuts.ts`)

- There is one `keydown` listener on `window`, registered for the mounted store/calendar ref and removed on unmount. It reads `store.getState()` at keypress time for dialog, picker, busy and actions. It must not capture their render-time values: a shortcut immediately after a store change can arrive before React's passive effects (WI-39).
- It returns early while busy. Except for Escape, shortcuts are off when `event.target` is an `input`, `textarea`, `select` or `[contenteditable]`, or when a store dialog, picker or native dialog is open. Native Escape handling keeps control of the top native dialog.
- The key map is exactly PROJECT_SCHEMA §7.6. `mod = e.metaKey || e.ctrlKey`.
- Navigation keys call FullCalendar's API through a ref exposed by `CalendarView` (`calendarRef.current.getApi().prev()` and so on).

### 11.6 Formatting (`format/`)

- **`format/time.ts`:**
  - `fmtTime(m)` gives `HH:mm`.
  - `fmtDay(m)` gives `EEE d MMM`.
  - `fmtRange(i)` gives "Tue 3 Nov 11:00–11:30", or the full date on both sides when the range crosses midnight.
  - `fmtDuration(min)` gives "45 min", "1 h" or "1 h 30 min".
- **`format/explain.ts`** turns a `SlotOption` / `SlotSearchResult` / `ReplanMove` into the strings in PROJECT_SCHEMA BR-7, BR-8 and Figure 2. Every user-visible sentence is built here, which keeps the engine free of UI text.
- **`format/errors.ts`** maps an `EngineError` to toast text, using the strings in PROJECT_SCHEMA §5.

---

## 12. Config files

**`vite.config.ts`**

```ts
export default defineConfig({ plugins: [react()], resolve: { alias: { '@': '/src' } } });
```

**`tsconfig.json`**
- `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noFallthroughCasesInSwitch": true`
- `"paths": {"@/*": ["src/*"]}`
- `"types": ["vitest/globals", "@testing-library/jest-dom"]`
- `include` covers `src`, `tests`, `bench`, `e2e` and the config files.

**`vitest.config.ts`**

```ts
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    globals: true, environment: 'node', setupFiles: ['tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    exclude: ['**/*.dst.test.ts', 'node_modules', 'e2e'],
    benchmark: { include: ['bench/**/*.bench.ts'] },
    coverage: {
      provider: 'v8', include: ['src/**'], exclude: ['src/main.tsx', 'src/**/*.test.*', 'src/data/samples/**', 'src/ui/styles/**'],
      thresholds: { lines: 70, branches: 70, functions: 70, statements: 70,
        'src/engine/algorithms/**': { lines: 90, branches: 90, functions: 90, statements: 90 } },
    },
  },
});
```

**`vitest.dst.config.ts`** is the same config with `include: ['**/*.dst.test.ts']`.

**UI test files** start with `// @vitest-environment jsdom`.

**`tests/setup.ts`**
- Imports `@testing-library/jest-dom/vitest`.
- When `HTMLDialogElement` exists but lacks them, polyfills `showModal()` and `close()` (they set and clear `open`). Like the browser, `close()` queues the `close` event as a task instead of firing it synchronously, so StrictMode tests see the same race as `npm run dev` (WI-35).
- Stubs `ResizeObserver` and `window.matchMedia`.

**`playwright.config.ts`**
- `testDir: 'e2e'`
- `retries: process.env.CI ? 1 : 0`; `use.trace: 'retain-on-failure'` keeps the first failed attempt's trace even when its retry passes. CI uses GitHub plus HTML reporters (`open: 'never'`); local runs use the list reporter.
- Two `webServer`s: the built app (`npm run build && npm run preview -- --port 4173 --strictPort`) and the StrictMode dev server (`npm run dev -- --port 5174 --strictPort`), both with `reuseExistingServer: !process.env.CI`.
- Project `chromium` runs every spec against `http://localhost:4173`; project `chromium-dev` runs only `smoke.spec.ts` against `http://localhost:5174`, because StrictMode's double mount happens only in development (WI-35).

---

## 13. CI and deployment

### 13.1 GitHub Actions (`.github/workflows/ci.yml`)

```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] }, workflow_dispatch: {} }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test:coverage        # fails under thresholds
      - run: npm run test:dst
      - run: npm run build
  e2e:
    if: github.event_name != 'pull_request'   # main + manual only (saves CI minutes)
    needs: check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci && npx playwright install --with-deps chromium
      - run: npm run e2e
      - name: Upload browser failure diagnostics
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-failure-diagnostics
          path: |
            test-results/
            playwright-report/
          if-no-files-found: ignore
```

`main` is protected: it requires the `check` job and one review.

### 13.2 Hosting on Vercel

This is a static SPA with no environment variables and no server.

- **Option A (preferred): Git integration.**
  1. In the Vercel dashboard, choose "Add New → Project" and import the repo.
  2. Vercel auto-detects the framework preset **Vite**. The build command is `npm run build` and the output is `dist`.
  3. Every push to `main` deploys to production, and every PR gets a preview URL.
- **Option B (fallback, if the GitHub Classroom org blocks the Vercel GitHub app).** Deploy from a laptop with no repo permissions needed:

  ```bash
  npx vercel login
  npx vercel link
  npx vercel --prod
  ```

  `link` creates a project once. Run `vercel --prod` again at every milestone.

The production URL `https://<project>.vercel.app` goes at the top of `README.md`, and is the URL you submit.

`vercel.json` is not needed: there is one route, and the default `base: '/'` is used.

**Last resort, GitHub Pages:** set `base: '/<repo>/'` in `vite.config.ts` and deploy `dist` with `actions/deploy-pages`. This needs Pages to be enabled on the org repo.

Data lives in each visitor's own browser. A grader opening the URL sees the empty state with **Load sample week** (W10).

---

## 14. Build plan (work items)

Phases match A3 §7. Owners follow A3: **S** = Samar, **Dv** = Divyam. Each WI is done only when its tests pass and `docs/progress/PROGRESS.md` is updated.

**Follow dependencies: WI-32 and WI-33 are change requests that must finish before WI-30 and WI-31.**

| WI | Phase | Title | Owner | Files | Depends | Done when |
|---|---|---|---|---|---|---|
| 01 | 1 | Scaffold & tooling | Dv | Vite app, all configs §12, `eslint.config.js` §3.2, CI §13.1, README stub | — | `npm run typecheck`, `lint`, `test` (one trivial test) and `build` pass locally; CI workflow file present. The first Vercel deploy is a human step (§13.2), recorded in `PROGRESS.md` when done. |
| 02 | 2 | Shared types, result, errors, constants | S | `src/shared/{types,result,errors,constants}.ts` | 01 | Compiles; matches §5 |
| 03 | 2 | Schemas | Dv | `src/shared/schemas.ts` | 02 | T5 and T31 schema-level cases pass |
| 04 | 2 | Local-time module | S | `src/shared/time.ts` | 02 | `time.test.ts` + T29 (`npm run test:dst`) pass |
| 05 | 2 | Interval / sortedArray / minHeap | S | `algorithms/{interval,sortedArray,minHeap}.ts` | 02 | Unit tests incl. `eventsIntersecting` edge cases |
| 06 | 2 | Repositories | Dv | `src/data/{repository,memoryRepository,dexieRepository}.ts` | 02 | Round-trip and atomicity tests (fake-indexeddb) |
| 07 | 2 | Test helpers & oracles | S | `tests/helpers/*` | 02, 04 | Used by the next WIs |
| 08 | 3 | Conflict sweep | S | `algorithms/{sweep,target}.ts` | 05, 07 | T1–T4, T12 pass |
| 09 | 3 | Merge, segments, gaps | S | `algorithms/{merge,segments,gaps}.ts` | 05, 07 | Unit tests + T33 |
| 10 | 3 | Day load + ranking | S | `algorithms/{dayLoad,rank}.ts` | 09 | Unit tests + T34 |
| 11 | 3 | Task order + replan heuristics | S | `algorithms/{taskOrder,replanHeuristics}.ts` | 10 | Unit tests + T35 |
| 12 | 3 | Engine state & commit & history | Dv | `src/engine/state.ts` | 06, 08 | Unit tests on applyChange/commit |
| 13 | 3 | Facade + Event CRUD | Dv | `facade.ts`, `index.ts`, `pipelines/eventCrud.ts`, `search.ts` | 12, 10 | T5, T13, T21, T26 |
| 14 | 3 | Task Scheduler pipeline | Dv | `pipelines/taskScheduler.ts` | 13 | T6–T11, T16–T19, T27, T28, T31 |
| 15 | 3 | Conflict Resolution pipeline | Dv | `pipelines/conflictResolution.ts` | 13 | T20 |
| 16 | 3 | Replan pipeline | S | `pipelines/replan.ts` | 11, 13 | T22, T23 |
| 17 | 3 | Undo/redo, import/export, samples | Dv | facade services, `src/data/samples/*` | 13 | T24, T25, T36 |
| 18 | 4 | Store, bootstrap, App shell, toasts, empty state | Dv | `main.tsx`, `ui/store/*`, `App.tsx`, `Toasts`, `EmptyState`, `Modal` | 17 | App loads; sample loads |
| 19 | 4 | Calendar view + EventDialog | Dv | `CalendarView/*`, `EventDialog/*`, `forms/eventForm.ts`, `format/*` | 18 | T14 + EventDialog UI tests |
| 20 | 4 | Task panel + TaskDialog | S | `TaskPanel/*`, `TaskDialog/*`, `forms/taskForm.ts` | 18 | T30 + TaskDialog UI tests |
| 21 | 4 | Conflict panel + SlotPicker (both modes) | S | `ConflictPanel/*`, `SlotPicker/*`, `pickerSlice.ts`, `format/explain.ts` | 19, 20 | Picker UI tests (T17-UI, T20-UI) |
| 22 | 4 | Replan dialog | S | `ReplanDialog/*` | 21 | Replan UI test |
| 23 | 4 | Settings dialog + data section | S | `SettingsDialog/*` | 18 | Settings UI test; import/export via UI |
| 24 | 4 | Toolbar, theme, shortcuts, help | Dv | `Toolbar/*`, `useTheme`, `useShortcuts`, `ShortcutHelp` | 19 | T32 |
| 25 | 4 | Styles & tokens | Dv | `styles/*` | 19 | Both themes pass the contrast checklist (TEST_PLAN §7) |
| 26 | 4 | Responsive drawer + a11y pass (+ optional drag preview) | S | various | 21–25 | Accessibility checklist (TEST_PLAN §7) |
| 27 | 5 | Playwright E1–E3 | Dv | `e2e/*` | 26 | `npm run e2e` green |
| 28 | 5 | Benchmarks | S | `bench/engine.bench.ts` | 17 | T15 median < 100 ms |
| 29 | 5 | Coverage & bug bash | S + Dv | — | 27, 28 | Thresholds met; `test:props:full` green |
| 30 | 6 | README & demo scripts | S + Dv | `README.md`, TEST_PLAN §8 | 29, 32, 33 | D1–D5 production results recorded; change requests pass locally; humans redeploy afterwards |
| 31 | 6 | Final docs sync | S + Dv | these three docs | 30 | Change logs synchronized; release checklist accurately records verified checks and remaining human push/redeploy/viva steps |
| 32 | Change | Barred-slot overlap warnings | S + Dv | `shared/types`, `algorithms/barred`, state/facade, store, calendar/panel | 29 | T37 algorithm/snapshot and T38 UI pass; BR-3 conflicts and replan metrics unchanged |
| 33 | Change | Shortcuts button | S + Dv | `Toolbar` | 29 | Toolbar `?` button labelled Keyboard shortcuts opens the existing help; `?` key still works |
| 34 | Change | Visual refresh (spacing, type, colour) | S + Dv | `styles/*`, `App.module.css`, class-only markup, `scripts/screenshots/*`, `docs/screenshots/*` | 33 | Appearance only: spacing/type tokens used instead of raw px, §11.4 updated to the final values, contrast test green in both themes, PROJECT_SCHEMA §7.5/§7.7 still true, full gate incl. `npm run e2e` green, screenshots committed and linked from README |
| 35 | Change | Crash fixes (mirror events, StrictMode dialogs, error boundary) | S + Dv | `CalendarView/*`, `Modal`, `ErrorBoundary`, `main.tsx`, `e2e/*`, `playwright.config.ts` | 34 | A select-mirror event without extendedProps renders (regression test); Modal stays open under `<StrictMode>` and Esc still closes it; the error boundary shows "Something went wrong" with Reload / Export data (UI test); E4 (click and drag-select open New event with times prefilled) and the smoke flow fail on any uncaught page error, on both the built app and the StrictMode dev server |
| 36 | Change | Audit findings A01–A10 | S + Dv | per finding, see `docs/extras/AUDIT.md` | 35 | `docs/extras/AUDIT.md` committed; every finding re-verified against `main` with a failing test first and a resolution line (fixed in <commit> / not reproducible / deferred with reason); full gate incl. `npm run e2e` green |
| 37 | Change | Dialog form polish | S + Dv | EventDialog, TaskDialog, shared PriorityRadioGroup, styles, RTL, e2e, dialog screenshots | 36 | Flex window is a full-width group below End; browser geometry checks at 1440, 1024 and drawer width in both themes; shared tagged/coloured native priority radios support arrow keys; task Working hours only (default) / Any time radios preserve useWorkingHours; schemas/engine unchanged; §7.1 and screenshots refreshed |
| 38 | Change | Replan vs barred-slot overlaps | S + Dv | replan diagnostics, ReplanDialog, ConflictPanel, engine/UI tests, TEST_PLAN D4 | 37 | T39/T40: Minimal change moves future flexible barred events with reason barred and leaves fixed/started events static; classify unresolved conflicts/barred overlaps with per-event reasons and reused alternatives; no bare No changes needed when problems remain; fixed/flexible panel tags; FR10/BR-12 UX wording and D4 updated; full gate and browser suite green |
| 39 | Change | Fix intermittent CI failures | S + Dv | useShortcuts, store context hook, RTL, Playwright config, ci.yml, test documentation | 38 | A deterministic close-then-immediate-shortcut regression fails on the old closure; one listener reads current dialog/picker/busy/actions at keypress time; 10 repeats with 2 workers pass warm and after deleting node_modules/.vite and restarting dev; CI has one retry, retained failure traces, HTML report and failure artifact; results recorded in PROGRESS/TEST_PLAN; gate and local merge green |
| 40 | Peer bugs (A) | Multi-tab integrity (#14) | S + Dv | Dexie v2 revision, `Repository` §9.1, MemoryRepository, engine facade (ER8, reload), BroadcastChannel, store toasts, e2e two pages | 39 | Two engines on one repository: delete in A then move in B → ER8, event stays deleted and repository unchanged by B; undo is empty after a cross-tab reload; v1 → v2 upgrade keeps events, tasks and settings (fake-indexeddb); Playwright two-page reproduction green; single-tab undo/redo, import/export and ER5 rollback unchanged |
| 41 | Peer bugs (B) | Alternatives outside working hours (#3, #4, #9) | S + Dv | `conflictResolution` request field, SlotPicker radio, `forms/eventForm.ts` `defaultFlexWindow`, empty-result causes, fixed-target note | 40 | Working-hours events give identical alternatives; night / non-working-day events default to Any time and a 00:00–24:00 flex window; empty results name the cause; BR-5, FR7 and PROJECT_SCHEMA §3.2 updated |
| 42 | Peer bugs (C) | Fixed events ask before a manual drag (#1) | S + Dv | `calendarHandlers`, ConfirmDialog, Fixed tag tooltip, e2e | 41 | Fixed drag/resize asks "<title> is fixed. Move it anyway?" (Move / Keep it); cancel reverts with nothing written; flexible drags unchanged; dialog edits, alternatives, undo/redo and Replan never ask |
| 43 | Peer bugs (D) | Duplicate barred slots (#6) | S + Dv | `settingsSchema`, SettingsDialog inline error | 42 | Same days/startMin/endMin rejected in `settingsSchema` (imports too) with "Duplicate of barred slot N"; all six samples and `docs/samples` still import |
| 44 | Peer bugs (E) | Filter vs count, List layout (#10, #12, #13) | S + Dv | status line, List empty state, list CSS, e2e at 420 px | 43 | Status line counts visible events plus "(N hidden by filter)"; empty state with Show all; sticky day header above outlines; rows aligned; no list row wider than its container at 420 px; FR6 unchanged |
| 45 | Peer bugs (F) | Small UX (#5, #7, #11) | S + Dv | Modal × close, alternatives Move radio order, ER2/ER3 explanation | 44 | Every dialog has a × (aria-label Close) acting like Cancel/Esc with focus trap/return kept; Move radios in aId, bId order; ER2/ER3 explanation lists available stretches and what splits them |
| 46 | Peer bugs (G) | Settings panel redesign | S + Dv | SettingsDialog markup/CSS, screenshots | 45 | Sections Working time / Scheduling defaults / Barred slots / Data; one-line barred rows with focus on a new slot's label; every accessible name tests use kept; both themes ≥ 4.5:1 at 1440/1024/900 px; settings screenshots refreshed |

### Round 2 overhaul (WI-47–59)

Binding design: `extras/AUDIT_2.md` §7. Each WI depends on the previous one; update the behaviour/contracts/tests in the WI that implements them. The Round 2 full gate is typecheck, lint, coverage, DST, all ten 10,000-case property cases, build, then Playwright with three repeats and two workers, on both the branch and main. UI WIs also capture and review both-theme screenshots at 1440, 1280 and 1024 px. WI-59's final comparison uses five browser repeats and the baseline recorded in the progress file.

| WI | Phase | Title | Owner | Files | Depends | Done when |
|---|---|---|---|---|---|---|
| 47 | Round 2 | Docs restructure | S + Dv | Docs, references (D-18) | 46 | Files moved with `git mv`; a grep for the old paths finds nothing outside change logs; the gate is green |
| 48 | Round 2 | Data model v3 and migration | S + Dv | Shared types/schemas, repositories, engine I/O/state, samples, mechanical UI/fixtures (D-17) | 47 | Dexie v2→v3 upgrade test; v1/v2 import tests; samples re-exported; all existing tests pass (fixtures updated mechanically) |
| 49 | Round 2 | Categories | S + Dv | Category engine commands, Settings/dialogs, tags/filters (D-11) | 48 | New tests for CRUD, delete blocking, uniqueness, undo, filters |
| 50 | Round 2 | Scheduling model and lock | S + Dv | Calendar gestures/lock, alternatives, scheduling controls (D-01–D-05) | 49 | T43 updated to the new wording; tests for the lock's gestures and grab-to-pan; D-02 search tests |
| 51 | Round 2 | Suggestion pickers | S + Dv | Candidate algorithm, pickers, RTL/property/e2e (D-06) | 50 | Generator unit and property tests; picker RTL tests; e2e apply flows |
| 52 | Round 2 | Past time | S + Dv | Conflicts/counts, calendar tokens, Replan diagnostics (D-08) | 51 | Panel grouping and counts; muted past styling; Replan wording |
| 53 | Round 2 | Barred slots and working hours | S + Dv | Validation, overlaps/kept state, search frames/settings UI (D-09, D-10) | 52 | Overlap rejection; older-data banner; Keep here behaviour and its automatic clearing; the switch behaviour across all three searches |
| 54 | Round 2 | Done tasks | S + Dv | Task commands, bulk preview/apply, task UI (D-07) | 53 | Atomic mark-done and unschedule; Reopen; bulk preview and apply; undo |
| 55 | Round 2 | Replan strategies and dialog | S + Dv | Ranking strategies, Replan engine/dialog (D-15) | 54 | Strategy keys unit-tested; properties for each strategy; dialog RTL tests |
| 56 | Round 2 | Layout | S + Dv | App regions/drawers, controls, e2e (D-14, D-05) | 55 | Five regions at 1440, 1280 and 1024 (drawers) in both themes; no duplicate controls; e2e updated |
| 57 | Round 2 | Visual system | S + Dv | Appearance/preferences, tags/fills/tokens, screenshots (D-12, D-13) | 56 | `tokens.test.ts` covers fills, tags, accents and shading; screenshots refreshed and reviewed |
| 58 | Round 2 | Dialog and format polish | S + Dv | Dialogs, formatting/List/Month, cancellation (D-16) | 57 | Field-order and format tests; U9/U19/U20/U23 checks |
| 59 | Round 2 | Docs, smoke test and final gate | S + Dv | Main docs, smoke test/history, README (D-19) | 58 | Full gate against the baseline; smoke test written; human steps listed |

**`docs/progress/PROGRESS.md` format** (already created during repo setup):

```markdown
# Progress
Production URL: https://…vercel.app
- [ ] WI-01 Scaffold & tooling — Dv
  - note: …
- [ ] WI-02 Shared types … — S
…
## Decisions log (append-only)
- 2026-10-25: …
```

---

## 15. Conventions

**Code.**
- Use named exports only.
- Name files: `camelCase.ts` for modules and `PascalCase.tsx` for components, with one component per folder plus its `*.module.css`.
- Do not use `any` or non-null `!`, except on FullCalendar `info.event.start` / `end`, which are always set for timed events.
- Engine functions never throw for expected failures. They return `err(...)`. Following the skill's "PRE decides who validates" rule, algorithms do not re-check preconditions they state (e.g. "sorted"); the facade validates everything that comes from outside, and the tests prove the callers keep the PREs.

**Git.**
- Commit prefixes are `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`. Messages say *why*.
- Commit tests with, or before, the code.
- A PR title includes its WI number (for example `WI-08: heap sweep`). The PR body lists the T-numbers it adds or changes.
- Each phase ends with a tag (`m1`…`m6`) and a short summary in `PROGRESS.md`.

**Docs.** Any change to a frozen contract updates this file and adds a change-log line in the same PR.

---

## 16. Change log

| Date | Change |
|---|---|
| 2026-11-13 | WI-50 pan verification: `useCalendarPan` observes pointerup/pointercancel on window, so a release outside the grid before capture clears its pending start. Cleanup removes both global listeners. T50 reproduces the stale-start failure before the fix. |
| 2026-10-25 | v1.0: unified technical spec (Dexie, heap sweep, four pipelines, B1–B4). |
| 2026-10-25 | v1.1: aligned with the `disciplined-coding` skill and `AGENTS.md` (local `--no-ff` merges, no function length cap, no `assertSorted`, scaffold via a temp folder, `PROGRESS.md` pre-created, Vercel deploy is a human step). |
| 2026-10-25 | v1.2 (WI-01): `@hookform/resolvers` pinned to `^5` (§1.2); CI e2e step passes with no tests until WI-27 (§13.1). |
| 2026-10-25 | v1.3 (WI-03): §6 gains `toFieldIssues` / `parseInput`, the shape/refine split, the stored-task link check, the integer-duration message and the settings messages; §5 constants gain the schema limits (`MINUTES_PER_DAY`, `MAX_TITLE_LENGTH`, …). |
| 2026-10-26 | v1.4 (WI-08): §8.4 gives `countOverlaps` its typed signature (`Interval` candidate and events, returns a count). |
| 2026-10-26 | v1.5 (WI-09): §8.7 pseudocode builds no-working-hours segments as the window minus barred slots in one pass (as BR-5 says), replacing the per-day pieces plus merge, whose "none yet" edge could survive next to a barred slot ending at 24:00; work edges win ties with the window. §8.8 says where `bufferMin` comes from. |
| 2026-10-26 | v1.6 (WI-12): §7.1 names `commit`'s result (`CommitOutcome`) and adds `createState` for `engine.init()`. |
| 2026-10-26 | v1.7 (WI-13): §6 adds `storedDataSchema` and `searchOptionsSchema`; §7.4.1 validates the BR-9 task mirror; §9.1 says how `init()` treats damaged stored data. |
| 2026-10-26 | v1.8 (WI-14): §7.4.3 validates the mirrored event of `updateTask` with `eventInputSchema` (a task window may be shorter than the task, a flex window may not), and names the `slot` issue of a wrong-length `scheduleTask`. |
| 2026-10-26 | v1.9 (WI-16): §5 constants gain `REPLAN_DST_SLACK_MIN = 120`; §7.4.4 validates `bufferMin` and gives the range message. |
| 2026-10-26 | v1.10 (WI-17): §2 adds `samples/build.ts`; §5 constants gain `EXPORT_FORMAT` / `EXPORT_VERSION`; §7.4.6 names `linkIssues` / `parseExportFile`, runs the link checks in `init()`, and takes `exportedAt` from `deps.now()`; §8.6 adds `onLocalDay` and `startOfLocalWeek`. |
| 2026-10-26 | v1.11 (WI-18): §5 constants gain `TOAST_MS`, `WARNING_TOAST_MS`, `EMPHASIS_MS`; §11.1 gives `createAppStore` its `now` and `resetStorage` options; §2 lists `tests/helpers/render.tsx`. |
| 2026-10-26 | v1.12 (WI-19): §1.2 pins `@fullcalendar/react` to `^6.1.22`, matching `@fullcalendar/core` and the plugins. v7 is incompatible with the v6 plugin API that §11.3 uses. |
| 2026-10-26 | v1.13 (WI-23): §6 `bufferMinSchema` gives a non-number the buffer range message, so a blank buffer field in a form reads "Buffer must be between 0 and 120 minutes.". |
| 2026-10-26 | v1.14 (WI-24): §2 lists `forms/settingsForm.ts` and `hooks/preferences.ts`; §11.1 gives `createAppStore` an optional `initialView` (last view, PROJECT_SCHEMA §3.2) and says what `onDatesSet` records. |
| 2026-10-26 | v1.15 (WI-25): §1.1 and §11.4 clarify CSS Module layout and global shared styles; primary-control foreground, backdrop and shadow tokens are explicit. §11.3 uses short day headers and omits the all-day row because every event is timed. |
| 2026-10-26 | v1.16 (WI-26): §5 adds drawer, target and import-feedback constants; §11.1 documents `busy`, responsive panels, native dialog focus and loading feedback; §11.3 documents complete event names/tooltips and minimum target height. |
| 2026-10-26 | v1.17 (WI-27): §13.1 removes the CI no-tests escape hatch now that E1–E3 and accessibility smoke tests exist. Focusable FullCalendar event anchors also receive a button role. |
| 2026-10-26 | v1.18 (WI-28): §1.3 adds portable `test:perf`; §9.5 documents optional stress-generator seed and the shared T15 fixture/query used by benchmark and gated assertion. |
| 2026-10-26 | v1.19 (WI-30): §1.3/§9.5 document reproducible, validated sample-file generation through the existing Vite module loader. |
| 2026-10-26 | v1.20 (WI-32/33): §5/§7 add derived BarredOverlap records to state/snapshots; §8.4a/§10 freeze the pure algorithm and complexity; §11 defines settings toast/View and reused alternatives; §14 adds both change requests before WI-30. Production rehearsal is reported complete by Divyam; human push/redeploy follow local completion. |
| 2026-10-26 | v1.21 (WI-31): final layout/UI contract sync; §10 includes warning derivation in boot/commit/import complexity. All local WIs complete, with user-owned push/redeploy and viva checks explicitly retained in the release record. |
| 2026-10-26 | v1.22 (WI-34): visual refresh, appearance only. §11.4 has the final light/dark token values, the spacing, type and shape scales, and where the single accent is used; §11.3 splits the week-header text into weekday and numeral spans; §1.3/§2 add the `screenshots` script, its config and `docs/screenshots/`; §14 adds WI-34. No new dependency (system font stack). |
| 2026-10-26 | v1.23 (WI-35): §4 adds the top-level `ErrorBoundary`; §11.3 `onSelect` gives a click-sized selection `CLICK_EVENT_MIN` (new §5 constant) and `renderEventContent` renders an event without block props (FullCalendar's select mirror) as its time only; §12 polyfill queues `close` like the browser, and Playwright adds the `chromium-dev` project on the StrictMode dev server; §2 lists the new files; §14 adds WI-35 and WI-36. |
| 2026-10-26 | v1.24 (WI-36, `docs/extras/AUDIT.md`): §8.13/§10 replan plans repeat greedy passes with unplaced events pinned (A01, ≤ c + 1 passes); §5/§6 `MIN/MAX_SUPPORTED_MINUTE` bound every Minute (A02) and `slotSchema` validates slots via `requireValidSlot` (A06); §7.4.6 `linkIssues` checks the BR-9 mirror (A04); §7.5 day loads cover whole days (A05); §7.4.3/§7.4.4 `requireNotPast` makes overtaken results stale (A07) and the replan range is 1–14 whole local days; §11.1/§11.2 ER4 Move to uses its own version (A03), Replan inputs drop old plans (A08) and Month defaults to its first full week (A10); §6 description message (A09); §2 lists `docs/extras/AUDIT.md`. |
| 2026-10-26 | v1.25 (WI-37/38): §14 adds dialog form polish and Replan diagnostics change requests, with regression checks and unchanged scheduling contracts. |
| 2026-10-26 | v1.26 (WI-38): §5 ReplanResult adds derived notMoved by plan ID and ReplanNotMoved; §7.4.4/§11.2 document post-plan diagnostics and reused alternatives; §14 completion uses T39/T40. Heuristic, schemas and metrics unchanged; regression confirms barred moves work. |
| 2026-10-26 | v1.27 (WI-39): §11.1/§11.5 expose useAppStoreApi and read current store state per keypress with one listener; §12/§13.1 add one CI retry, retained failure traces, GitHub/HTML reporters and failure artifacts; §14 adds the test-first race repair and warm/cold 10-repeat browser verification. |
| 2026-11-12 | v1.28: §14 plans the peer bug fixes batch (WI-40–46, items A–G from 14 peer reports); later rows of this log record each item's contract changes. |
| 2026-11-12 | v1.29 (WI-40, peer report #14): frozen §9.1 Repository contract changed — `load()` returns the stored `revision`, and `apply` / `saveSettings` / `replaceAll` take the expected revision and throw `ConcurrentModificationError` inside the same transaction when it differs. §9.2 Dexie version 2 adds `meta` (upgrade keeps v1 data); §5 adds ER8 `ConcurrentModification` and `INITIAL_REVISION` / `TAB_CHANNEL_NAME`; §6 `storedRevisionSchema`; §7.1 `EngineState.revision`, `createState(…, revision)`, `repositoryError`; §7.2 `Engine.reload()` and `EngineDeps.onCommit`; §4 and §11.1 the BroadcastChannel reload. Export format v1 unchanged. |
| 2026-11-12 | v1.30 (WI-41, peer reports #3, #4, #9): §7.2/§7.4.2 `suggestAlternatives` takes optional `useWorkingHours` (omitted = true) and an empty search adds `emptyCause`; §5 `EmptyWindowCause`; §11.1 picker `useWorkingHours`, `pickerSetWorkingHours`, `overlapsWorkingHours` and the whole-day default flex window. Algorithms unchanged. |
| 2026-11-12 | v1.31 (WI-42, peer report #1): §11.1 confirm dialogs take `cancelLabel` / `onCancel` and the store gains `dragEvent(id, to, revert)`; §11.3 drops and resizes go through it, so a fixed event asks before moving; `components/FixedTag` adds the tag's tooltip and description. Engine unchanged. |
| 2026-11-12 | v1.32 (WI-43, peer report #6): §6 `settingsSchema` rejects duplicate barred slots (same days, start and end) with "Duplicate of barred slot N." at the later slot's `days`; imports use the same schema. Export format v1 unchanged; existing samples still valid. |
| 2026-11-12 | v1.33 (WI-44, peer reports #10, #12, #13): §11.3 status line and List empty content follow the priority filter (`eventCountText`, `HiddenByFilterNotice`, store `showAllEventPriorities`); List CSS for the sticky header, row alignment and narrow wrapping. FR6 conflicts unchanged. |
| 2026-11-12 | v1.34 (WI-45, peer reports #5, #7, #11): §7.2 frozen Engine interface gains read-only `explainWindow` (user decision: ER2/ER3 objects unchanged); §5 `WindowSplit` / `WindowStretches` / `WindowExplanation`, constant `MAX_LISTED_STRETCHES = 6`; §7.4.2/§7.4.3 shared request builders and `explainSearch`; §11.1 picker `order` and `explanation`; §11.2 the Modal × close button. Algorithms unchanged. |
| 2026-11-12 | v1.35 (WI-46): §11.2 the Settings dialog markup (headed sections, compact barred rows, day chips, `.visually-hidden`); `global.css` Settings block; `playwright.screenshots.config.ts` gets its own Chrome project so captures use the screenshot server (fix found here); new settings screenshots. |
| 2026-11-12 | v1.36: §14 plans Round 2 WI-47–59 from `extras/AUDIT_2.md` §7, in order, with the full branch/main gate and final baseline comparison. Behaviour and frozen contracts change in their implementing WIs. |
| 2026-11-12 | v1.37 (WI-47, D-18): §0/§2/§14 and references use `docs/progress/PROGRESS.md` and `docs/extras/`; main specs, samples and screenshots stay in place. All local links and references checked, full Round 2 gate required before and after merge. |
| 2026-11-12 | v1.38 (WI-48, D-17): frozen §5 types/constants gain Category, `categoryId`, kept ids, done/doneAt, global working-time switch and export v2. §6 legacy/stored/category schemas and category-reference validation; §7 state/snapshot/import/export carry categories; §9 repositories load/replace categories atomically and Dexie v3 migrates without editing v1/v2 or changing the revision. T48 retains v1 compatibility and six samples are v2. |
| 2026-11-12 | v1.39 (WI-49, D-11): CategoryInput and queued category CRUD; CategoryInUse/NotFound category; optional category before/after images and repository puts/deletes share the revision-checked transaction and history. Shared OKLab/contrast validators, twelve swatches, CategoryEditor/Select/Tag, Settings section, session default and calendar filters. New events Fixed (C-01); removed flexibleByDefault. |
| 2026-11-12 | v1.40 (WI-50, D-01–D-05): alternatives request/explanation gain allowMoving/range with shared validation, opted-out empty results and no fixed fallback window. Store/picker gain lock, last Calendar view and dialog-only consent/range; persisted presentation/return view, scheduling radios, action-specific fixed questions and pointer-based grid panning. Frozen engine signatures updated with implementation. |
| 2026-11-13 | v1.41 (WI-51 generator checkpoint): §8.10 shares optionAt/rankCandidates, retaining rankOptions' one-per-gap/MAX_OPTIONS Replan contract; §8.10a freezes pure generateCandidates over one fitting gap with SUGGESTION_STEP_MIN = 30. Five unit cases and an independent minute-oracle property cover D-06 generation. Picker integration and final BR-7/result/UI documentation remain in progress. |
| 2026-11-13 | v1.42 (WI-51, D-06): SlotSearchResult.options contains every ranked picker candidate; §7.5 wires generation, §8.10a/§10 document contracts/cost, and §11.2 documents shared named picks/day chips/native radio selection and hidden Details. Replan's rankOptions/MAX_OPTIONS and assertions remain unchanged. |
| 2026-11-13 | v1.43 (WI-52 engine checkpoint, D-08): Replan pipeline receives raw now and computes the unchanged rounded placement cutoff internally. diagnoseReplan's fourth Minute argument means raw now; past problem overlaps are excluded and started means currently running. T52 raw-clock boundary regressions pass; UI grouping/clock/styling remains in progress. |
| 2026-11-13 | v1.44 (WI-52, D-08): currentMinute/refreshCurrentMinute and provider timer/focus/visibility lifecycle; upcomingOverlaps shared by panels/status/tags/toast; toFullCalendar takes raw now and marks ended events; local-day nowGuideEntries and tested past/guide tokens. Snapshot/repository/metric contracts remain unchanged. |
| 2026-11-13 | v1.45 (WI-53 D-10 engine checkpoint): DayFrame.work is the whole local day when globally off. Shared search/empty-cause/Replan segments use effective global/request working-time rules. ReplanInput gains required useWorkingHours; false skips the working-day containment check, while reused detectBarredOverlaps checks every touched day. Unit/property fixtures explicitly pass true without assertion changes. UI and D-09 remain in progress. |
| 2026-11-13 | v1.46 (WI-53 D-10 UI checkpoint): Settings switch/useWatch disables a retained fieldset; TaskForm and alternatives hide their hours choices while off, task Details uses effective any-time wording, picker defaults to any time, and FullCalendar businessHours=false removes shading. Three RTL regressions and a browser persistence flow fail first. |
| 2026-11-13 | v1.47 (WI-53 D-09 engine checkpoint): BarredOverlap/DayFrame bars carry slotId; shared clash/day formatting and settings-change validation preserve legacy data but reject edited overlaps. Engine.setBarredKept validates/idempotently records metadata, commit clears on time changes, Replan skips kept barred reasons, and settings sanitizes affected history. Repository.saveSettings gains optional cleared event rows in one revision-checked transaction; Memory/Dexie/failing adapter updated. |
| 2026-11-13 | v1.48 (WI-53 D-09/D-10): extracted shared form controls, region editor and legacy-readable Settings resolver, unkept warning/tag/toast filtering and store action, collapsed Kept groups, grouped background stackedLabels, fixed 12-hour field width and tested non-working pattern token. T53 browser flows cover persistence and legacy label geometry. |
| 2026-11-13 | v1.49 (WI-54 D-07 engine checkpoint): frozen DoneTasksPreview, cutoff/apply schemas and four completion commands; scheduled completion/bulk use one atomic revision-checked Change; Reopen, idempotence and done-search guards. Twelve T54 cases first red then green. |
| 2026-11-13 | v1.50 (WI-54 D-07 UI): completion store actions, Open/Done filtering, row/dialog lifecycle, shared delete confirmation and version-aware bulk preview dialog. Four UI regressions first red, plus empty/invalid/storage-retry coverage; browser persistence and keyboard menu cases added. |
| 2026-11-13 | v1.51 (WI-55 D-15 engine checkpoint): ReplanStrategy/constants/options validation, optional request/input and required result.strategy, stable second-plan ids, category ranking with shared optionFor/rankCandidates key callback, named strategy reasons and ten full property cases. Fourteen ranking/facade cases preserve old defaults and prove new sort keys/apply/undo. UI remains in progress. |
| 2026-11-13 | v1.52 (WI-55 D-15 UI): strategy action/selector, compact day-grouped cards and shared priority tags, Details metrics/buffer/explanations, one collapsed deduplicated diagnostics list with per-plan hints. Four initially red RTL cases and all nineteen older dialog cases pass; old detailed assertions now open Details/shared diagnostics. Browser all-strategy/apply/undo and six desktop geometry checks added. |
