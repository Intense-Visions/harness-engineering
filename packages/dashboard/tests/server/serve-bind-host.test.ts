import { describe, it, expect, afterEach } from 'vitest';
import { getBindHost } from '../../src/shared/constants';

describe('Dashboard server bind host', () => {
  const originalEnv = process.env['HOST'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['HOST'];
    } else {
      process.env['HOST'] = originalEnv;
    }
  });

  it('defaults to 127.0.0.1 when HOST is not set', () => {
    delete process.env['HOST'];
    expect(getBindHost()).toBe('127.0.0.1');
  });

  it('uses HOST env var when set to 0.0.0.0', () => {
    process.env['HOST'] = '0.0.0.0';
    expect(getBindHost()).toBe('0.0.0.0');
  });
});
