// mulberry32: a tiny seeded pseudo-random generator, so the stress sample and the benchmark (T15)
// build the same data on every run. The shift and multiply constants are mulberry32's own.

const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 2 ** 32;

// PRE:  seed is an integer
// POST: returns a generator whose calls yield a fixed sequence of numbers in [0, 1) for that seed
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

// PRE:  random comes from mulberry32; low ≤ high are integers
// POST: returns the next integer of random's sequence in [low, high]
export function nextInt(random: () => number, low: number, high: number): number {
  return low + Math.floor(random() * (high - low + 1));
}
