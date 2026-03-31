import { describe, it, expect } from 'vitest';
import { resolveOutputMode } from '../../src/utils/output';

describe('resolveOutputMode', () => {
  it('returns json when json flag is set', () => {
    expect(resolveOutputMode({ json: true })).toBe('json');
  });

  it('returns quiet when quiet flag is set', () => {
    expect(resolveOutputMode({ quiet: true })).toBe('quiet');
  });

  it('returns verbose when verbose flag is set', () => {
    expect(resolveOutputMode({ verbose: true })).toBe('verbose');
  });

  it('returns text when no flags are set', () => {
    expect(resolveOutputMode({})).toBe('text');
  });

  it('json takes precedence over quiet and verbose', () => {
    expect(resolveOutputMode({ json: true, quiet: true, verbose: true })).toBe('json');
  });

  it('quiet takes precedence over verbose', () => {
    expect(resolveOutputMode({ quiet: true, verbose: true })).toBe('quiet');
  });
});
