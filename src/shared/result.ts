// Engine functions return a Result instead of throwing for expected failures (TECH_SPEC §15).

import type { EngineError } from './errors';

export type Result<T, E = EngineError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

// PRE:  value is any value of type T
// POST: returns the success Result { ok: true, value }
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

// PRE:  error is any value of type E
// POST: returns the failure Result { ok: false, error }
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
