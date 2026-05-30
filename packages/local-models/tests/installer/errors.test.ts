import { describe, expect, it } from 'vitest';

import { InstallError, isInstallError } from '../../src/installer/errors.js';

describe('InstallError', () => {
  it('exposes the code, message, and optional fields on construction', () => {
    const err = new InstallError('failed_target_missing', 'gone', {
      status: 404,
      target: 'qwen3:32b',
    });
    expect(err.name).toBe('InstallError');
    expect(err.code).toBe('failed_target_missing');
    expect(err.message).toBe('gone');
    expect(err.status).toBe(404);
    expect(err.target).toBe('qwen3:32b');
  });

  it('omits absent optional fields from the JSON payload', () => {
    const err = new InstallError('installer_unavailable', 'down');
    expect(err.toJSON()).toEqual({
      name: 'InstallError',
      code: 'installer_unavailable',
      message: 'down',
    });
  });

  it('round-trips the code through JSON.stringify', () => {
    const err = new InstallError('install_failed', 'truncated', { target: 'qwen3:32b' });
    const round = JSON.parse(JSON.stringify(err.toJSON())) as Record<string, unknown>;
    expect(round.code).toBe('install_failed');
    expect(round.target).toBe('qwen3:32b');
    expect(round.status).toBeUndefined();
  });

  it('preserves the cause on the standard Error cause field', () => {
    const cause = new Error('socket hang up');
    const err = new InstallError('installer_unavailable', 'down', { cause });
    expect(err.cause).toBe(cause);
  });

  it('is recognised by isInstallError', () => {
    expect(isInstallError(new InstallError('parse_failed', 'nope'))).toBe(true);
    expect(isInstallError(new Error('not me'))).toBe(false);
    expect(isInstallError(null)).toBe(false);
    expect(isInstallError({ code: 'parse_failed' })).toBe(false);
  });
});
