import { describe, it, expect } from 'vitest';
import { architecture, archModule } from '../../src/architecture/matchers';

describe('architecture() factory', () => {
  it('returns a handle with scope "project"', () => {
    const handle = architecture();
    expect(handle.kind).toBe('arch-handle');
    expect(handle.scope).toBe('project');
    expect(handle.rootDir).toBe(process.cwd());
  });

  it('accepts a custom rootDir', () => {
    const handle = architecture({ rootDir: '/custom/path' });
    expect(handle.rootDir).toBe('/custom/path');
  });

  it('accepts a config override', () => {
    const handle = architecture({ config: { enabled: false } });
    expect(handle.config).toEqual({ enabled: false });
  });
});

describe('archModule() factory', () => {
  it('returns a handle with the given module scope', () => {
    const handle = archModule('src/services');
    expect(handle.kind).toBe('arch-handle');
    expect(handle.scope).toBe('src/services');
    expect(handle.rootDir).toBe(process.cwd());
  });

  it('accepts a custom rootDir', () => {
    const handle = archModule('src/api', { rootDir: '/other' });
    expect(handle.rootDir).toBe('/other');
  });
});
