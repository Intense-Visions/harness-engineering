import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveRole } from '../../src/server/identity';

const origEnv = { ...process.env };

describe('resolveRole', () => {
  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env['HARNESS_DASHBOARD_ROLE'];
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('defaults to dev when unset', () => {
    expect(resolveRole()).toBe('dev');
  });

  it('returns a valid configured role', () => {
    process.env['HARNESS_DASHBOARD_ROLE'] = 'pm-ba';
    expect(resolveRole()).toBe('pm-ba');
    process.env['HARNESS_DASHBOARD_ROLE'] = 'client';
    expect(resolveRole()).toBe('client');
  });

  it('falls back to dev for an unrecognized value', () => {
    process.env['HARNESS_DASHBOARD_ROLE'] = 'superuser';
    expect(resolveRole()).toBe('dev');
  });

  it('falls back to dev for an empty value', () => {
    process.env['HARNESS_DASHBOARD_ROLE'] = '';
    expect(resolveRole()).toBe('dev');
  });

  it('re-reads the environment on each call (not cached)', () => {
    process.env['HARNESS_DASHBOARD_ROLE'] = 'client';
    expect(resolveRole()).toBe('client');
    process.env['HARNESS_DASHBOARD_ROLE'] = 'pm-ba';
    expect(resolveRole()).toBe('pm-ba');
  });
});
