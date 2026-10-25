import type { EngineError } from './errors';
import { err, ok, type Result } from './result';

describe('result', () => {
  it('ok wraps a value as a success', () => {
    const result: Result<number> = ok(42);

    expect(result).toEqual({ ok: true, value: 42 });
  });

  it('err wraps an error as a failure', () => {
    const notFound: EngineError = { code: 'NotFound', entity: 'event', id: 'e1' };
    const result: Result<number> = err(notFound);

    expect(result).toEqual({ ok: false, error: notFound });
  });
});
