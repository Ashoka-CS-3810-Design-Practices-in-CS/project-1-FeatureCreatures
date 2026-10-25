// fast-check settings shared by every *.props.test.ts (TEST_PLAN §1.3). `npm test` leaves the
// variables unset (1,000 runs, seed 42); `test:props:full` sets PROP_RUNS=10000 PROP_SEED=random.

const DEFAULT_PROP_RUNS = 1000;
const DEFAULT_PROP_SEED = 42;
const RANDOM_SEED = 'random';

// Generous, so the 10,000-run variant does not hit Vitest's 5 s default.
export const PROP_TIMEOUT_MS = 300_000;

export interface PropParams {
  readonly numRuns: number;
  readonly seed?: number;
}

// PRE:  name is the variable's name; raw is its untrusted value from process.env
// POST: returns raw as an integer ≥ 0; throws when raw is not one, so a typo fails loudly
function parseCount(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  }
  return value;
}

// PRE:  none (reads PROP_RUNS and PROP_SEED from process.env)
// POST: returns fast-check parameters: numRuns = PROP_RUNS (default 1,000); seed = PROP_SEED
//       (default 42), left out when PROP_SEED = 'random' so fast-check picks one and prints it on
//       failure; throws when a variable is set to anything else
export function propParams(): PropParams {
  const runs = process.env.PROP_RUNS;
  const seed = process.env.PROP_SEED;
  const numRuns = runs === undefined ? DEFAULT_PROP_RUNS : parseCount('PROP_RUNS', runs);
  if (seed === RANDOM_SEED) {
    return { numRuns };
  }
  return { numRuns, seed: seed === undefined ? DEFAULT_PROP_SEED : parseCount('PROP_SEED', seed) };
}
