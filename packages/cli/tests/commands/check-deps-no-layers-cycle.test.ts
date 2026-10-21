import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { runCheckDeps } from '../../src/commands/check-deps';

/**
 * Regression coverage for the reachable half of #2098.
 *
 * `runCheckDeps` opened with:
 *
 * ```ts
 * if (!config.layers || config.layers.length === 0) return Ok(result);
 * ```
 *
 * which returned `valid: true` over `modulesAnalyzed: 0` the moment a project
 * had no `layers` block. That early return also skipped
 * **circular-dependency detection, which needs no layers at all** — so
 * `harness check-deps && deploy` proceeded on a project with a real import
 * cycle, printing `Analyzed 0 module(s) across 0 layer(s).` and
 * `v validation passed`.
 *
 * This is the same bug class as the parser-abstention half of #2098 (report a
 * result that does not reflect what ran), on the configuration most adopters
 * are on rather than one that is currently unreachable in production.
 */
describe('check-deps without layers (#2098)', () => {
  const fixtures = path.join(__dirname, '../fixtures');

  /** No `layers`, two source files, a genuine `a.ts -> b.ts -> a.ts` cycle. */
  const noLayersCycle = path.join(fixtures, 'deps-no-layers-cycle');

  /** No `layers`, no source files at all. */
  const noLayersEmpty = path.join(fixtures, 'deps-no-layers');

  /** No `layers`, source exists, `deps.exclude` discards all of it. */
  const noLayersExcludeAll = path.join(fixtures, 'deps-no-layers-exclude-all');

  function config(fixture: string): string {
    return path.join(fixture, 'harness.config.json');
  }

  it('detects a first-party cycle with no layers configured', async () => {
    const result = await runCheckDeps({ configPath: config(noLayersCycle), cwd: noLayersCycle });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The defect: all three of these were `true` / `0` / `[]`.
    expect(result.value.modulesAnalyzed).toBe(2);
    expect(result.value.circularDeps.length).toBeGreaterThan(0);
    expect(result.value.valid).toBe(false);
  });

  it('reports no layers configured without claiming layer validation ran', async () => {
    const result = await runCheckDeps({ configPath: config(noLayersCycle), cwd: noLayersCycle });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Layer validation is genuinely not applicable, so it contributes nothing —
    // but it must not suppress the half that IS applicable.
    expect(result.value.layersConfigured).toBe(0);
    expect(result.value.layerViolations).toEqual([]);
  });

  it('treats a project with no analysable source as not applicable', async () => {
    const result = await runCheckDeps({ configPath: config(noLayersEmpty), cwd: noLayersEmpty });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Nothing was scoped away — there is simply no source. "No imports to
    // check" is a true statement, so this stays clean rather than abstaining,
    // and the four existing no-layers CLI tests keep their exit 0.
    expect(result.value.modulesAnalyzed).toBe(0);
    expect(result.value.valid).toBe(true);
    expect(result.value.analysisNote).toBeUndefined();
  });

  it('abstains when deps.exclude discards every source file', async () => {
    const result = await runCheckDeps({
      configPath: config(noLayersExcludeAll),
      cwd: noLayersExcludeAll,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Source exists and the configured scope threw all of it away: the command
    // analysed nothing after being asked to analyse something.
    expect(result.value.modulesAnalyzed).toBe(0);
    expect(result.value.valid).toBe(false);
    expect(result.value.analysisNote).toContain('deps.exclude');
  });
});
