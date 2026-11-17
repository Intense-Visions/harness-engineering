import { describe, it, expect, afterEach } from 'vitest';
import { serializeError, installErrorJsonSerialization } from '../../src/output/error-json';

class CodedError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CodedError';
  }
}

describe('serializeError (#2673)', () => {
  it('keeps name, message and own fields, omits stack', () => {
    const out = serializeError(new CodedError('boom', 'E_X'));
    expect(out).toEqual({ code: 'E_X', name: 'CodedError', message: 'boom', cause: undefined });
    expect(out).not.toHaveProperty('stack');
  });

  it('serializes an Error cause chain, including an ES2022 non-enumerable cause', () => {
    const inner = new Error('inner');
    const outer = new Error('outer', { cause: inner });
    expect(serializeError(outer)).toEqual({
      name: 'Error',
      message: 'outer',
      cause: { name: 'Error', message: 'inner' },
    });
  });

  it('passes a non-Error cause through unchanged', () => {
    expect(serializeError(new CodedError('m', 'C', { errno: -2 }))['cause']).toEqual({
      errno: -2,
    });
  });

  it('guards a circular cause chain', () => {
    const e = new Error('loop') as Error & { cause?: unknown };
    e.cause = e;
    expect(serializeError(e)['cause']).toBe('[Circular]');
  });
});

describe('installErrorJsonSerialization (#2673)', () => {
  afterEach(() => {
    delete (Error.prototype as unknown as { toJSON?: unknown }).toJSON;
  });

  it('makes JSON.stringify of an Error carry its message, idempotently and non-enumerably', () => {
    expect(JSON.stringify(new Error('x'))).toBe('{}');
    installErrorJsonSerialization();
    installErrorJsonSerialization();
    expect(JSON.parse(JSON.stringify({ error: new CodedError('bad', 'E') }))).toEqual({
      error: { code: 'E', name: 'CodedError', message: 'bad' },
    });
    expect(Object.keys(Error.prototype)).not.toContain('toJSON');
  });

  it('does not overwrite an existing toJSON', () => {
    const mine = () => 'mine';
    Object.defineProperty(Error.prototype, 'toJSON', {
      value: mine,
      configurable: true,
      writable: true,
    });
    installErrorJsonSerialization();
    expect(JSON.stringify(new Error('x'))).toBe('"mine"');
  });
});
