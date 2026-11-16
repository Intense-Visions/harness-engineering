/**
 * `resolveDepsSettings` is the one mapping from `harness.config.json` to a
 * `LayerConfig`, shared by `harness check-deps` and the `harness ci check` deps
 * step so the two cannot disagree about the same repo (#2606).
 */
import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { resolveDepsSettings, toLayerConfig } from '../../src/constraints/layer-config';
import { TypeScriptParser } from '../../src/shared/parsers/typescript';

const ROOT = path.resolve('/project');

describe('resolveDepsSettings (#2606)', () => {
  it('applies the schema defaults when no deps block is configured', () => {
    const settings = resolveDepsSettings({}, ROOT);
    expect(settings).toEqual({
      layers: [],
      rootDir: ROOT,
      exclude: [],
      fallbackBehavior: 'skip',
      resolveWorkspacePackages: false,
    });
  });

  it('reads layers, rootDir and every deps field from the config', () => {
    const settings = resolveDepsSettings(
      {
        rootDir: 'app',
        layers: [
          { name: 'a', pattern: 'src/a/**', allowedDependencies: ['b'] },
          { name: 'b', patterns: ['src/b/**', 'lib/b/**'], allowedDependencies: [] },
        ],
        deps: {
          exclude: ['**/gen/**'],
          fallbackBehavior: 'warn',
          resolveWorkspacePackages: true,
        },
      },
      ROOT
    );
    expect(settings.rootDir).toBe(path.resolve(ROOT, 'app'));
    expect(settings.layers).toEqual([
      { name: 'a', patterns: ['src/a/**'], allowedDependencies: ['b'] },
      { name: 'b', patterns: ['src/b/**', 'lib/b/**'], allowedDependencies: [] },
    ]);
    expect(settings.exclude).toEqual(['**/gen/**']);
    expect(settings.fallbackBehavior).toBe('warn');
    expect(settings.resolveWorkspacePackages).toBe(true);
  });

  it('ignores an unknown fallbackBehavior instead of passing it to the engine', () => {
    expect(
      resolveDepsSettings({ deps: { fallbackBehavior: 'ignore' } }, ROOT).fallbackBehavior
    ).toBe('skip');
  });

  it('toLayerConfig carries every setting into the engine input', () => {
    const parser = new TypeScriptParser();
    const settings = resolveDepsSettings(
      { deps: { exclude: ['x/**'], fallbackBehavior: 'error', resolveWorkspacePackages: true } },
      ROOT
    );
    expect(toLayerConfig(settings, parser)).toEqual({
      layers: [],
      rootDir: ROOT,
      parser,
      fallbackBehavior: 'error',
      extraIgnore: ['x/**'],
      resolveWorkspacePackages: true,
    });
  });
});
