# TECH_SPEC.md — Interactive Calendar and Intelligent Time Planner

**Doc 2 of 3.** This file covers *how* to build it.

- Behaviour, vocabulary and business rules (`BR-*`) are defined in `PROJECT_SCHEMA.md`.
- Exact test inputs and outputs (`T*`) are in `TEST_PLAN.md`.
- Precedence rules are in `PROJECT_SCHEMA.md` §0.2.

---

## 0. How to work on this repo (humans and agents)

The session protocol for agents (start, commit, handoff, merge) lives in `AGENTS.md` at the repo root. Code style is governed by the `disciplined-coding` skill (`.agents/skills/disciplined-coding/SKILL.md`, mirrored in `.claude/skills/`). The rules below are the project-specific part.

1. **Read before coding.** Read `PROJECT_SCHEMA.md` §2, §3 and §6. Then read this file's sections for your work item (§14), and the tests that work item lists in `TEST_PLAN.md`.
2. **Progress file.** `docs/PROGRESS.md` holds one checkbox per work item (WI) from §14. It was created during repo setup, before WI-01.
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
| Styling | CSS Modules plus one global `tokens.css` | No CSS framework |

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

Pin whatever versions npm resolves on day one (`package-lock.json` is committed). Exception: `@hookform/resolvers` is pinned to `^5` (v6 has an unresolvable optional-peer conflict on `effect`; v5 supports Zod 4).

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
  "bench": "cross-env TZ=UTC vitest bench --run",
  "e2e": "playwright test"
}
```

---

## 2. Repository layout

Every file listed here exists by the end of the project. The WI column says which work item creates it.

```text
/
├─ docs/
│  ├─ PROJECT_SCHEMA.md  TECH_SPEC.md  TEST_PLAN.md   # these specs
│  └─ PROGRESS.md                                      # WI checklist + handoff notes (repo setup)
├─ .github/workflows/ci.yml                            # WI-01
├─ index.html  vite.config.ts  vitest.config.ts  vitest.dst.config.ts
├─ playwright.config.ts  eslint.config.js  tsconfig.json  .prettierrc  README.md
├─ public/favicon.svg
├─ e2e/                    # Playwright E1–E3 (WI-27)
├─ bench/engine.bench.ts   # T15 (WI-28)
├─ tests/
│  ├─ setup.ts             # jest-dom, <dialog> polyfill, ResizeObserver stub
│  ├─ helpers/             # time.ts (t(), BASE_MONDAY), builders.ts (ev(), task()), engine.ts (makeEngine()),
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
   │  ├─ search.ts         # shared "segments → busy → gaps → rank" helper used by 3 pipelines
   │  ├─ pipelines/
   │  │  ├─ eventCrud.ts           # FR1–FR3 (+ ER4 suggestion)
   │  │  ├─ conflictResolution.ts  # FR4 wiring, FR7 alternatives
   │  │  ├─ taskScheduler.ts       # FR5, FR8, FR9
   │  │  └─ replan.ts              # FR10
   │  └─ algorithms/       # PURE functions over arrays; each file has a sibling *.test.ts
   │     ├─ interval.ts  sortedArray.ts  minHeap.ts  sweep.ts  merge.ts
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
      │  ├─ Toolbar/  CalendarView/ (CalendarView.tsx, calendarHandlers.ts, toFullCalendar.ts, EventContent.tsx)
      │  ├─ TaskPanel/  ConflictPanel/  EventDialog/  TaskDialog/  SlotPicker/  ReplanDialog/
      │  ├─ SettingsDialog/  ConfirmDialog/  ShortcutHelp/  Toasts/  Modal/ (native <dialog> wrapper)
      │  └─ EmptyState/
      ├─ hooks/useShortcuts.ts  hooks/useTheme.ts
      ├─ format/time.ts  format/explain.ts  format/errors.ts   # all user-facing strings built here
      ├─ forms/eventForm.ts  forms/taskForm.ts                 # form ⇄ input converters + resolvers
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
  const engine = createEngine({
    repo,
    now: () => toMinute(new Date()),
    newId: () => crypto.randomUUID(),
  });
  const init = await engine.init();                                     // loads + sorts + sweeps
  const store = createAppStore(engine, { storageWarning, init });
  createRoot(document.getElementById('root')!).render(<StoreProvider store={store}><App /></StoreProvider>);
}
bootstrap();
```

If `init` returns an error, `App` shows a full-page error with the buttons **Retry** and **Reset local data**. Reset calls `repo.replaceAll(empty)` and then `init` again.

---

## 5. Shared types (`src/shared/types.ts`) — frozen contract

```ts
export type Minute = number;                       // integer minutes since Unix epoch (UTC)
export interface Interval { readonly start: Minute; readonly end: Minute } // half-open [start, end)

export type Priority = 'high' | 'medium' | 'low';
export type Category = 'meeting' | 'class' | 'appointment' | 'assignment' | 'personal';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0 = Sunday (JS Date convention)

export interface CalendarEvent extends Interval {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: Category;
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
  readonly category: Category;
  readonly priority: Priority;
  readonly durationMin: number;                  // 5..1440
  readonly window: Interval;                     // allowable scheduling window
  readonly useWorkingHours: boolean;
  readonly status: 'unscheduled' | 'scheduled';
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
  readonly workDays: readonly Weekday[];
  readonly workStartMin: number;   // minutes after local midnight
  readonly workEndMin: number;
  readonly bufferMin: number;      // 0..120
  readonly barredSlots: readonly BarredSlot[];
  readonly defaultCriterion: UserCriterion;
}

export type EventInput = Pick<CalendarEvent,
  'title' | 'description' | 'category' | 'priority' | 'start' | 'end' | 'flexible' | 'flexWindow'>;
export type TaskInput = Pick<Task,
  'name' | 'description' | 'category' | 'priority' | 'durationMin' | 'window' | 'useWorkingHours'>;

// ---- derived (never stored) ----
export interface Conflict {
  readonly key: string;            // `${smallerId}|${largerId}`
  readonly aId: string; readonly bId: string;   // aId < bId (string compare)
  readonly overlap: Interval;
  readonly minutes: number;
  readonly targetId: string;       // which one BR-10 suggests moving
}

export type UserCriterion = 'earliest' | 'bestFit' | 'priorityAware';
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
  readonly work: Interval | null;                          // null if not a working day
  readonly barred: readonly { readonly label: string; readonly interval: Interval }[];
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
  readonly options: readonly SlotOption[]; // ≤ MAX_OPTIONS, ranked
}

export type MoveReason =
  | { readonly kind: 'outsideFlexWindow' }
  | { readonly kind: 'outsideWorkingHours' }
  | { readonly kind: 'barred'; readonly label: string }
  | { readonly kind: 'conflict'; readonly withEventId: string; readonly withTitle: string }
  | { readonly kind: 'buffer'; readonly withEventId: string; readonly withTitle: string }
  | { readonly kind: 'balance'; readonly fromDayLoadMin: number; readonly toDayLoadMin: number };

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
  readonly baseVersion: number; readonly range: Interval; readonly bufferMin: number;
  readonly movableCount: number;
  readonly plans: readonly [ReplanPlan, ReplanPlan];      // [minimalChange, balanced]
}

export interface Snapshot {
  readonly version: number;
  readonly events: readonly CalendarEvent[];   // sorted by (start, end, id)
  readonly tasks: readonly Task[];             // creation order
  readonly settings: Settings;
  readonly conflicts: readonly Conflict[];     // sorted by (overlap.start, key)
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
  readonly version: 1;
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
  | { code: 'TaskLongerThanWindow'; durationMin: number; longestStretchMin: number } // ER2
  | { code: 'NoSlotFound'; durationMin: number; largestGapMin: number; largestGap: Interval | null; bufferMin: number } // ER3
  | { code: 'StorageError'; message: string }                                        // ER5
  | { code: 'InvalidImport'; issues: FieldIssue[] }                                  // ER6
  | { code: 'StaleResult' }                                                          // ER7
  | { code: 'NotFound'; entity: 'event' | 'task'; id: string };
```

`src/shared/constants.ts`:

```ts
export const MAX_EVENT_MIN = 1440;   // BR-4
export const MAX_OPTIONS = 5;        // BR-7
export const HISTORY_LIMIT = 50;     // B1
export const SNAP_MIN = 5;           // BR-5 notBefore rounding + UI snap
export const MAX_REPLAN_DAYS = 14;   // BR-12
export const EXPORT_FORMAT = 'feature-creatures-calendar'; // §9.4
export const EXPORT_VERSION = 1;
export const REPLAN_DST_SLACK_MIN = 120; // a 14-day replan range may span DST changes
export const CONFLICT_LIST_LIMIT = 50;
export const MINUTES_PER_DAY = 1440;
export const MAX_TITLE_LENGTH = 100;          // event title and task name
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_BARRED_LABEL_LENGTH = 40;
export const MIN_TASK_DURATION_MIN = 5;
export const MAX_TASK_DURATION_MIN = MAX_EVENT_MIN;
export const MAX_BUFFER_MIN = 120;
export const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
export const DEFAULT_SETTINGS: Settings = {
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
const minute = z.number().int();
const interval = z.object({ start: minute, end: minute });
const priority = z.enum(['high', 'medium', 'low']);
const category = z.enum(['meeting', 'class', 'appointment', 'assignment', 'personal']);
const timeIssue = (ctx: z.RefinementCtx, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: 'custom', path, message, params: { kind: 'time' } });

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(100),
  description: z.string().max(1000),
  category, priority,
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
  description: z.string().max(1000),
  category, priority,
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
  format: z.literal('feature-creatures-calendar'), version: z.literal(1), exportedAt: z.string(),
  events: z.array(storedEventSchema), tasks: z.array(storedTaskSchema), settings: settingsSchema,
}); // plus engine-side checks in importData (§7.4.6)
```

`storedEventSchema` and `storedTaskSchema` extend the input schemas with `id`, `taskId`, `status`, `scheduledEventId`, `createdAt` and `updatedAt`.

`storedDataSchema = {events: storedEvent[], tasks: storedTask[], settings: settings | null}` validates `Repository.load()` in `engine.init()`. `searchOptionsSchema = {bufferMin?: int 0–120}` validates the `bufferMin` override of `findSlots`, `suggestAlternatives` and `planReplan`; it shares one `bufferMinSchema` with `settingsSchema`.

- Zod 4 cannot `.extend()` a refined object, so each schema is a plain object shape plus a named refine function (`refineEventTiming`, `refineTaskWindow`), and the stored schemas extend the shape and re-apply the same refinements.
- `storedTaskSchema` also checks `(status = 'scheduled') ⟺ (scheduledEventId ≠ null)` as a shape issue at `scheduledEventId`: "A task has an event id exactly when it is scheduled."
- A non-integer duration gives "Duration must be a whole number of minutes." (T31's 2.5 case).
- `settingsSchema` messages: "Pick at least one working day." · "Working hours must end after they start." (time, `workEndMin`) · "Buffer must be between 0 and 120 minutes." · barred label "Label is required." / "Labels can be at most 40 characters." · "A barred slot must end after it starts." (time, `barredSlots.N.endMin`). `workStartMin` and barred `startMin` are 0–1439; `workEndMin` and barred `endMin` are 0–1440.

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
  readonly version: number;
  readonly events: readonly CalendarEvent[];   // ALWAYS sorted by compareEvents (start, end, id)
  readonly tasks: readonly Task[];
  readonly settings: Settings;
  readonly conflicts: readonly Conflict[];
  readonly undo: readonly Change[];            // ≤ HISTORY_LIMIT, newest last
  readonly redo: readonly Change[];
}
export interface RecordChange<T> { readonly id: string; readonly before: T | null; readonly after: T | null }
export interface Change {
  readonly label: string;
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

It returns the new `{events, tasks}`.

**`commit(state, change, mode, repo)`**, where `mode` is `'do' | 'undo' | 'redo'`:

1. Set `direction` to `'backward'` when `mode === 'undo'`, and to `'forward'` otherwise.
2. Compute `next = applyChange(state, change, direction)`.
3. Build `changeSet` (§9.1) from the images for that direction, and `await repo.apply(changeSet)`. On a throw, return `err({code:'StorageError', message})`. The state is untouched.
4. Compute `conflicts = detectConflicts(next.events)` (§8.4).
5. `introduced` = new conflicts whose key is not among the old keys. `resolved` = the reverse.
6. Update the history:
   - `do`: push to `undo` (dropping the oldest beyond 50) and clear `redo`.
   - `undo`: move the change to `redo`.
   - `redo`: move the change back to `undo`.
7. Set `version + 1` and return the new state and the `MutationResult` parts.

**`changedEventIds`** are the IDs of records whose image in that direction is non-null.

`commit` resolves to `Result<CommitOutcome, EngineError>`, where `CommitOutcome = {state, label, changedEventIds, introducedConflicts, resolvedConflicts}`. The facade adds the `snapshot` and `suggestion` to make the `MutationResult`. **`createState({events, tasks, settings})`** builds version 0: it sorts the events, detects their conflicts and starts with empty history. `engine.init()` uses it after `load()`.

### 7.2 Engine interface (`src/engine/facade.ts`) — frozen contract

```ts
export interface EngineDeps { repo: Repository; now: () => Minute; newId: () => string }
export function createEngine(deps: EngineDeps): Engine;

export interface Engine {
  init(): Promise<Result<Snapshot>>;
  snapshot(): Snapshot;

  // ── Event CRUD pipeline (FR1–FR3) ──
  createEvent(input: EventInput): Promise<Result<MutationResult>>;
  updateEvent(id: string, input: EventInput): Promise<Result<MutationResult>>;
  moveEvent(id: string, to: Interval): Promise<Result<MutationResult>>;      // drag / resize
  deleteEvent(id: string): Promise<Result<MutationResult>>;

  // ── Conflict Resolution pipeline (FR4 is automatic inside commit; FR7) ──
  suggestAlternatives(req: { eventId: string; otherEventId?: string; bufferMin?: number }): Result<SlotSearchResult>;
  applyAlternative(req: { eventId: string; slot: Interval; baseVersion: number }): Promise<Result<MutationResult>>;

  // ── Task Scheduler pipeline (FR5, FR8, FR9) ──
  createTask(input: TaskInput): Promise<Result<MutationResult>>;
  updateTask(id: string, input: TaskInput): Promise<Result<MutationResult>>;
  deleteTask(id: string): Promise<Result<MutationResult>>;
  unscheduleTask(id: string): Promise<Result<MutationResult>>;
  orderForScheduling(taskIds: readonly string[]): string[];                 // BR-11; drops non-unscheduled/unknown
  findSlots(req: { taskId: string; criterion?: UserCriterion; bufferMin?: number }): Result<SlotSearchResult>;
  scheduleTask(req: { taskId: string; slot: Interval; baseVersion: number }): Promise<Result<MutationResult>>;

  // ── Replan pipeline (FR10) ──
  planReplan(req: { range: Interval; bufferMin?: number }): Result<ReplanResult>;
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

**`suggestAlternatives({eventId, otherEventId, bufferMin})`**

1. Look up the event, or return `NotFound`.
2. Choose the search window:
   - flexible event: `searchWindow = event.flexWindow`
   - fixed event: `searchWindow = [addLocalDays(startOfLocalDay(event.start), −1), addLocalDays(startOfLocalDay(event.start), 2))`
3. Return `search({durationMin: event.end − event.start, priority: event.priority, window: searchWindow, useWorkingHours: true, excludeIds: [eventId], originalStart: event.start, criterion: 'nearest', bufferMin: bufferMin ?? settings.bufferMin, subject: {kind: 'event', eventId, title, otherEventId: otherEventId ?? null}})` (§7.5).

**`applyAlternative({eventId, slot, baseVersion})`**

1. If `baseVersion !== state.version`, return `StaleResult`.
2. If `slot.end − slot.start !== event.end − event.start`, return `InvalidTime`.
3. Otherwise behave as `moveEvent(eventId, slot)`, with the label `Move "<title>"`.

#### 7.4.3 Task Scheduler (`pipelines/taskScheduler.ts`)

- **`createTask(input)`** validates the input and creates `{...parsed, id, status: 'unscheduled', scheduledEventId: null, createdAt, updatedAt}`. The label is `Create task "<name>"`.
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
  1. Check the version (ER7), look up the task (it must be unscheduled, else the `status` issue of `findSlots`), and check that `slot.end − slot.start === durationMin`, or return `InvalidTime` with the issue `{path: 'slot', message: 'The slot must be exactly as long as the duration.'}`.
  2. Build `event = {id: newId(), title: name, description, category, priority, start, end, flexible: true, flexWindow: task.window, taskId, createdAt, updatedAt}`.
  3. Update the task with `{status: 'scheduled', scheduledEventId: event.id}`.
  4. Put both in one `Change` with the label `Schedule "<name>"`.

#### 7.4.4 Replan (`pipelines/replan.ts`)

**`planReplan({range, bufferMin})`**

1. Validate `bufferMin` with `searchOptionsSchema`. Validate the range: `end > start` and `end − start ≤ MAX_REPLAN_DAYS × 1440 + REPLAN_DST_SLACK_MIN` (120). Otherwise return `InvalidTime` with the issue `{path: 'range', message: 'The replan range must be 1 to 14 days long.'}`.
2. Build the inputs:
   - `frames = buildDayFrames(range, settings)`
   - `notBefore`
   - `buffer = bufferMin ?? settings.bufferMin`
3. Call `planReplan(...)` from `algorithms/replanHeuristics.ts` (§8.13) with `state.events`, `state.conflicts`, `frames`, `range`, `buffer`, `notBefore` and `segmentsFor` (§7.5).
4. Store the result as `lastReplan` (a private engine field, not part of `EngineState`) and return it.

**`applyReplan({baseVersion, planId})`**

1. Return `StaleResult` unless `lastReplan` exists and `lastReplan.baseVersion === baseVersion === state.version`.
2. Look up the plan.
3. If it has no moves, return `ok` with an unchanged snapshot and the label `''`.
4. Otherwise build one `Change` with `before = current event` and `after = {...event, start: to.start, end: to.end, updatedAt: now}` for each move. The label is `Replan: <n> event(s) moved`. Durations are unchanged, so no task mirroring is needed.
5. Commit.

#### 7.4.5 Settings

`updateSettings(s)`:

1. Validate with `settingsSchema`.
2. `await repo.saveSettings(s)`. A failure gives `StorageError`.
3. Set `state.settings = s` and `version + 1`.

There is no history entry, and the conflicts are unchanged.

#### 7.4.6 Import / export

**`exportData()`** returns `JSON.stringify(exportFile, null, 2)` with `exportedAt` = `deps.now()` as an ISO string (the injected clock keeps exports deterministic in tests).

**`importData(json)`**

1. Parse the JSON. A failure gives `InvalidImport [{path: '', message: 'Not valid JSON.'}]`.
2. Run `exportFileSchema.safeParse`. Any issue gives `InvalidImport`, and **all** issues are kept.
3. Run the cross-record checks. Each one gives `InvalidImport`:
   - unique event IDs
   - unique task IDs
   - every scheduled task's `scheduledEventId` exists and points back with `taskId`
   - every event `taskId` points to a scheduled task
   - these checks are `linkIssues(events, tasks)` in `schemas.ts`; `parseExportFile(json)` runs steps 1–3, and `engine.init()` runs `linkIssues` on stored data too
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
  const loads = computeDayLoads(near, frames);
  const options = rankOptions(fitting, { durationMin: req.durationMin, criterion: req.criterion,
                     priority: req.priority, originalStart: req.originalStart, dayLoads: loads, frames });
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
     work: workDays.includes(weekday) ? [set(d, workStart), set(d, workEnd)] : null,
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
  segmentsFor: (window: Interval) => Segment[];   // injected allowedSegments(…, useWorkingHours: true)
}
export function planReplan(input: ReplanInput): { movableCount: number; plans: [ReplanPlan, ReplanPlan] };
```

```text
inRange  ← eventsIntersecting(events, range)
movable  ← inRange.filter(e ⇒ e.flexible ∧ e.start ≥ notBefore)
           sorted by PRIORITY_RANK desc, duration desc, start asc, id asc
staticEv ← eventsIntersecting(events, expand(range, bufferMin)).filter(e ∉ movable)

plans ← [run('minimalChange'), run('balanced')]

run(kind):
  occupied ← staticEv (sorted array) ; moves ← [] ; unplaced ← []
  for e in movable:
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
        best ← rankOptions(fitting, {d, crit, e.priority, originalStart: e.start, loads, frames})[0]
        place ← {...e, start: best.slot.start, end: best.slot.end}
        if place.start ≠ e.start:
           moves.push({e, from: e, to: place,
                       reason: why ?? {balance, fromDayLoad: load(day(e)), toDayLoad: best.dayLoadMin}})
     occupied ← insertSorted(occupied, place)
  after ← inRange with moved events replaced, re-sorted
  metrics ← moved = |moves|, totalShiftMin = Σ|to.start − from.start|,
            conflictsBefore = |{c ∈ conflicts : overlaps(c.overlap, range)}|,
            conflictsAfter  = |{c ∈ detectConflicts(after) : overlaps(c.overlap, range)}|,
            loadSpreadBefore/After = loadSpread(computeDayLoads(inRange | after, frames), frames),
            unplaced = |unplaced|

invalidReason(e, win, segs, occupied, b, frames):   // first failing check, in this order
  win null or ¬contains(win, e)                          → outsideFlexWindow
  no frame f with f.work and contains(f.work, e)         → outsideWorkingHours
  e overlaps some barred interval of its frame(s)        → barred{label}
  e overlaps some o ∈ occupied (raw)                     → conflict{o}
  e overlaps some o ∈ occupied expanded by b             → buffer{o}
  else null
```

**Design notes for the viva.**
- **Greedy and priority order:** high-priority events are placed first, so they get the best spots. This is a one-pass greedy with no backtracking, which keeps every move explainable.
- **Unplaced events** stay where they are and remain busy, so later events still avoid them.
- **`staticEv`** uses the range expanded by the buffer, so an event just outside the range still pushes its buffer into it.

**Complexity.**
- Sorting the c movable events costs O(c log c).
- Each one costs O(n + c + s + m log m), from merge, gaps, rank and the sorted insert.
- Total: **O(c·(n + c + s + m log m))**. This is A3's O(c(n + m log m)), with the s and c terms made explicit.

---

## 9. Data layer (`src/data/`)

### 9.1 Repository interface — frozen contract

```ts
export interface StoredData { events: CalendarEvent[]; tasks: Task[]; settings: Settings | null }
export interface ChangeSet {
  putEvents: CalendarEvent[]; deleteEventIds: string[];
  putTasks: Task[];           deleteTaskIds: string[];
}
export interface Repository {
  load(): Promise<StoredData>;
  apply(changes: ChangeSet): Promise<void>;          // MUST be atomic (all or nothing)
  saveSettings(settings: Settings): Promise<void>;
  replaceAll(data: { events: CalendarEvent[]; tasks: Task[]; settings: Settings }): Promise<void>; // atomic
}
```

`engine.init()` calls `load()`, validates it with `storedDataSchema`, sorts the events, and uses `DEFAULT_SETTINGS` when `settings` is `null`. It also saves those defaults. A failing `load()` or `saveSettings()`, or damaged stored data, gives `StorageError` (message "Saved data is damaged." for the latter), which the App shows as the full-page error of §4.

### 9.2 `dexieRepository.ts`

```ts
class CalendarDb extends Dexie {
  events!: Table<CalendarEvent, string>;
  tasks!: Table<Task, string>;
  settings!: Table<{ key: 'app'; value: Settings }, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ events: 'id, start, taskId', tasks: 'id, status', settings: 'key' });
  }
}
// apply(): db.transaction('rw', db.events, db.tasks, async () => { bulkDelete…; bulkPut… })
// replaceAll(): one 'rw' transaction over all three tables: clear() ×3 then bulkPut.
// static open(name): new CalendarDb(name).open() — throws if IndexedDB is unavailable (→ degraded mode).
```

Schema changes later require `this.version(2).stores(...).upgrade(...)`. Never edit version 1 in place.

### 9.3 `memoryRepository.ts`

This keeps `Map`s of events and tasks plus the settings, and has the same semantics. It deep-copies data on load and apply, so tests cannot alias engine state.

It is used for:
- all engine and integration tests
- degraded mode in the app
- the "storage unavailable" banner path

`tests/helpers/failingRepository.ts` wraps it. It rejects `apply` on demand, for ER5 tests.

### 9.4 Export file

The export file is the `ExportFile` type in §5. It is pretty-printed JSON. The file name is `calendar-export-YYYY-MM-DD.json`.

The UI downloads it via `Blob` + `URL.createObjectURL`. It reads imports via `<input type="file" accept="application/json">` and `file.text()`.

### 9.5 Samples (`src/data/samples/`)

```ts
export type SampleId = 'sparseWeek' | 'backToBack' | 'overlapCluster' | 'fullyBooked' | 'midnight' | 'stress';
export const SAMPLES: Record<SampleId, { label: string; build: (weekMonday: Minute) => ExportFile }>;
```

Each sample uses `atLocal` relative to `weekMonday`. The UI passes `startOfLocalWeek(now)`, where Monday is the start of the week.

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
| T | tasks |
| D | days in a window |
| B | barred slots |

| Operation | Time | Space |
|---|---|---|
| Validate a command (Zod) | O(1) | O(1) |
| Boot: load + sort + sweep | O(N log N + k log k) | O(N + T + k) |
| Insert / move / delete in the sorted array | O(log N + N) | O(N) (new array) |
| Conflict sweep after a change (global) | O(N log N + k log k) | O(N + k) |
| Window slice `eventsIntersecting` | O(log N + n) | O(n) |
| Day frames + allowed segments | O(D·B) | O(D·B) |
| Merge into busy blocks | O(n) | O(n) |
| Free gaps | O(n + s) | O(m) |
| Rank | O(m log m) | O(m) |
| **findSlots / suggestAlternatives (end to end)** | **O(log N + n + D·B + m log m)** | O(n + s + m) |
| orderForScheduling | O(T log T) | O(T) |
| **planReplan** | **O(c·(n + c + s + m log m))** | O(n + c + s + m) |
| Commit (excluding IndexedDB I/O) | O(N log N + k log k) | O(N + k) |
| Undo / redo | same as commit | O(changed records) per history entry |
| Export / import | O(N + T) / O((N + T) log N) | O(N + T) |
| Drag preview `countOverlaps` | O(n) | O(1) |

Compared with A1–A3:
- The searches no longer need an O(n log n) sort, because the store is kept sorted.
- The sweep's k term is explicit.

---

## 11. UI layer (`src/ui/`)

### 11.1 Store (`store/appStore.ts`, zustand)

```ts
interface AppState {
  status: 'loading' | 'ready' | 'fatal';
  fatalError: EngineError | null;
  storageWarning: boolean;
  snapshot: Snapshot;                          // the ONLY copy of domain data in the UI
  view: { type: 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'listWeek'; date: Minute;
          activeRange: Interval | null };      // activeRange from FullCalendar datesSet
  eventPriorityFilter: Priority[];             // calendar filter (FR6), default all
  taskPanel: { sort: 'priority' | 'windowEnd'; priorities: Priority[]; status: 'unscheduled' | 'scheduled' | 'all';
               selectedIds: string[] };
  dialog: null
    | { kind: 'event'; mode: 'create'; defaults: Partial<EventInput> }
    | { kind: 'event'; mode: 'edit'; id: string }
    | { kind: 'task'; mode: 'create' } | { kind: 'task'; mode: 'edit'; id: string }
    | { kind: 'replan' } | { kind: 'settings' } | { kind: 'shortcuts' }
    | { kind: 'confirm'; title: string; body: string; confirmLabel: string; onConfirm: () => void };
  picker: PickerState | null;                  // store/pickerSlice.ts
  emphasisIds: string[];                       // briefly highlighted after a change (1.5 s)
  toasts: Toast[];                             // store/toastSlice.ts
  actions: AppActions;
}
type PickerState =
  | { mode: 'task'; queue: string[]; index: number; criterion: UserCriterion; bufferMin: number;
      result: Result<SlotSearchResult>; selected: number; scheduled: number; skipped: number }
  | { mode: 'alternatives'; eventId: string; otherEventId: string | null; bufferMin: number;
      result: Result<SlotSearchResult>; selected: number };
interface Toast { id: string; tone: 'success' | 'info' | 'warning' | 'error'; text: string;
                  actions?: { label: string; run: () => void }[]; sticky?: boolean }
```

**Rules for actions.**

- **Mutations.** Every mutating action does `const r = await engine.x(...)`.
  - **On `ok`:** set `snapshot` and `emphasisIds`, then push a success toast built by `format/*`. If `introducedConflicts` is non-empty, push the ER4 warning toast instead. Its actions are *Move to …* (when there is a `suggestion`), which calls `applyAlternative`, and *View conflict*.
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

| Component | Responsibility | Reads | Calls |
|---|---|---|---|
| `App` | Layout grid, empty state, banners, fatal screen, mounts dialogs/toasts, `useShortcuts`, `useTheme` | `status`, `dialog`, `picker` | — |
| `Toolbar` | Navigation, view switch, priority filter chips, + Event, + Task, Replan, Undo/Redo (disabled per `canUndo/canRedo`, tooltip = label), theme toggle, settings, drawer toggle (< 1024 px) | `view`, `snapshot.canUndo…` | store actions |
| `CalendarView` | FullCalendar wrapper (§11.3) | `snapshot.events`, `conflicts`, `settings`, `eventPriorityFilter`, `emphasisIds` | `moveEvent`, open dialogs |
| `EventContent` | Renders an event block: title, time, `[H]/[M]/[L]` tag, `Fixed`/`Task` tag, `⚠ Conflict N min` | props | — |
| `TaskPanel` | Sort/filter controls, task rows with checkbox, status, *Find time*, context menu; "Find time for N selected" | `snapshot.tasks`, `taskPanel` | `openTaskPicker`, dialogs |
| `ConflictPanel` | List conflicts (first 50 + "and N more"), each "⚠ A ↔ B · Tue 3 Nov 11:00–11:30 (30 min)" (via `fmtRange`), "(hidden by filter)" note, *Suggest alternatives*; empty state text "No conflicts" | `snapshot.conflicts`, `events` | `openAlternatives` |
| `EventDialog` | RHF form with `eventResolver`, category-based flexible default, flex window fields, delete with confirm | `dialog`, event | `createEvent/updateEvent/deleteEvent` |
| `TaskDialog` | RHF form with `taskResolver`; Find time / Unschedule / Delete in edit mode | task | task actions |
| `SlotPicker` | Both picker modes (Figure 2), summary line, options as a radio group, ER2/ER3 blocks with suggestions + "Edit task" | `picker` | picker actions |
| `ReplanDialog` | Range (date inputs, default `view.activeRange` or the current week), buffer override, Compute, two plan cards (metrics + moves + unplaced), Apply | engine via action | `planReplan`, `applyReplan` |
| `SettingsDialog` | Settings form + Data section (export, import, samples, clear) | `snapshot.settings` | `updateSettings`, `importData` |
| `ConfirmDialog`, `ShortcutHelp`, `Toasts`, `Modal`, `EmptyState` | as named; `Toasts` is the ARIA live region; `Modal` wraps native `<dialog>` + `showModal()` | | |

### 11.3 FullCalendar integration (`CalendarView/`)

FullCalendar is a **controlled, render-only view**. Its `events` prop is always derived from `snapshot`, and it is never the source of truth.

```tsx
<FullCalendar
  plugins={[timeGridPlugin, dayGridPlugin, listPlugin, interactionPlugin]}
  initialView="timeGridWeek" firstDay={1} headerToolbar={false} height="100%"
  slotDuration="00:30:00" snapDuration="00:05:00" scrollTime="08:00:00" nowIndicator
  slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
  eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
  editable selectable selectMirror eventOverlap   // overlaps allowed (ER4: allow with warning)
  businessHours={{ daysOfWeek: settings.workDays, startTime: hhmm(workStartMin), endTime: hhmm(workEndMin) }}
  events={fcEvents}                                // toFullCalendar(snapshot, filter) — memoised
  eventContent={(arg) => <EventContent {...arg.event.extendedProps} timeText={arg.timeText} title={arg.event.title} />}
  eventDrop={handlers.onDrop} eventResize={handlers.onResize}
  select={handlers.onSelect} eventClick={handlers.onClick} datesSet={handlers.onDatesSet}
/>
```

**`toFullCalendar.ts`** maps each visible event (after the priority filter) to:

```ts
{
  id, title, start: fromMinute(start), end: fromMinute(end),
  classNames: ['ev', `prio-${p}`, conflicted && 'is-conflict', emphasised && 'is-emphasised'],
  extendedProps: { priority, category, flexible, isTask: taskId !== null, conflictMinutes },
}
```

- `conflictMinutes` is the largest overlap minutes among the event's conflicts.
- Barred slots for the visible range are added as `{display: 'background', classNames: ['barred'], title: label}` entries, one per day, built with `buildDayFrames(activeRange, settings)`.
- The function is pure and memoised on `snapshot.version`, the filter, `activeRange` and `emphasisIds`.

**`calendarHandlers.ts`** contains plain functions (not hooks), so tests can call them with fake `info` objects (T14):

- **`onDrop(info)` / `onResize(info)`:** call `actions.moveEvent(info.event.id, {start: toMinute(info.event.start!), end: toMinute(info.event.end!)})`. If the result is an error, call `info.revert()`.
- **`onSelect(info)`:** open the create dialog with `defaults.start/end` from the selection, then call `info.view.calendar.unselect()`.
- **`onClick(info)`:** do nothing for background events. Otherwise open the edit dialog.
- **`onDatesSet(info)`:** store `activeRange = {start: toMinute(info.start), end: toMinute(info.end)}`.

**Optional drag preview (WI-26, drop it if it gets awkward).** FullCalendar's `eventAllow(dropInfo, ev)` callback can run `countOverlaps` against `eventsIntersecting(dropInfo range)`. It updates a "⚠ would overlap N" badge in the toolbar through `requestAnimationFrame` throttling, and always returns `true`.

### 11.4 Theming (`styles/tokens.css`)

```css
:root {
  --bg:#ffffff; --surface:#f6f7f9; --text:#1b1f24; --muted:#5b6470; --border:#d6dae0; --accent:#2f5bd3;
  --danger:#c0262d; --warning:#a85b06; --success:#1f7a3d; --focus:#2f5bd3;
  --prio-high:#b42318; --prio-high-bg:#fde8e8; --prio-medium:#a85b06; --prio-medium-bg:#fef3c7;
  --prio-low:#34558b; --prio-low-bg:#e3ebf7; --barred:#e9ecf1; --nonwork:#f3f4f6;
  --fc-border-color:var(--border); --fc-page-bg-color:var(--bg); --fc-neutral-bg-color:var(--nonwork);
  --fc-today-bg-color:color-mix(in srgb, var(--accent) 8%, transparent); --fc-now-indicator-color:var(--danger);
}
:root[data-theme="dark"] {
  --bg:#14171c; --surface:#1c2027; --text:#e7eaee; --muted:#a0a8b3; --border:#343a44; --accent:#7aa2ff;
  --danger:#ff6b6b; --warning:#f5b041; --success:#4cc38a; --focus:#7aa2ff;
  --prio-high:#ff8a8a; --prio-high-bg:#3a1f22; --prio-medium:#f5b041; --prio-medium-bg:#3a2e14;
  --prio-low:#8fb0e6; --prio-low-bg:#1f2a3d; --barred:#262b33; --nonwork:#181b21;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* same values as [data-theme="dark"] */ } }
```

**Event and slot styles.**
- An event block has `background: var(--prio-X-bg)`, `border-left: 4px solid var(--prio-X)` and `color: var(--text)`.
- `.is-conflict` adds `outline: 2px dashed var(--danger)` and `outline-offset: -2px`.
- `.barred` uses a 45° repeating-linear-gradient hatch over `var(--barred)`.

**Theme toggle.** `useTheme` cycles `system → light → dark`:
- It sets `document.documentElement.dataset.theme`. For `system`, it deletes the attribute.
- It persists the choice to `localStorage['fc-theme']`, inside `try/catch`.

### 11.5 Shortcuts (`hooks/useShortcuts.ts`)

- There is one `keydown` listener on `window`.
- It returns early when `e.target` is an `input`, `textarea`, `select` or `[contenteditable]`, or when `store.dialog !== null` (except for `Escape`).
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
- When `HTMLDialogElement` exists but lacks them, polyfills `showModal()` and `close()` (they set and clear `open`).
- Stubs `ResizeObserver` and `window.matchMedia`.

**`playwright.config.ts`**
- `testDir: 'e2e'`
- `webServer: {command: 'npm run build && npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI}`
- `use: {baseURL: 'http://localhost:4173'}`
- Only the `chromium` project.

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
      - run: npm run e2e -- --pass-with-no-tests   # flag only until WI-27 adds E1–E3; WI-27 removes it
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

Phases match A3 §7. Owners follow A3: **S** = Samar, **Dv** = Divyam. Each WI is done only when its tests pass and `docs/PROGRESS.md` is updated.

**Start at WI-01 and finish at WI-31.**

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
| 30 | 6 | README & demo scripts | S + Dv | `README.md`, TEST_PLAN §8 | 29 | D1–D5 rehearsed on the production URL |
| 31 | 6 | Final docs sync | S + Dv | these three docs | 30 | Change logs updated; the release checklist (TEST_PLAN §9) is all ticked |

**`docs/PROGRESS.md` format** (already created during repo setup):

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
