import { describe, it, expect, afterEach } from 'vitest';

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
    const host = process.env['HOST'] ?? '127.0.0.1';
    expect(host).toBe('127.0.0.1');
  });

  it('uses HOST env var when set to 0.0.0.0', () => {
    process.env['HOST'] = '0.0.0.0';
    const host = process.env['HOST'] ?? '127.0.0.1';
    expect(host).toBe('0.0.0.0');
  });
});
