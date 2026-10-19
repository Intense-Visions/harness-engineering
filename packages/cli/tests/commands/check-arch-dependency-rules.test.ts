/**
 * Issue #2235: `check-arch` recorded `layer-violations`, `circular-deps` and
 * `forbidden-imports` as 0 whatever the code did, because the collectors never
 * received the project's `layers` / `forbiddenImports` rules (and circular-deps
 * parsed with a stub). These tests plant one violation of each kind in a
 * fixture project and assert the baseline `check-arch --update-baseline` writes
 * actually counts them — and that a clean twin still records 0.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCheckArch, abstainedMeasurements } from '../../src/commands/check-arch';
import type { ArchMeasurement } from '../../src/commands/check-arch';
import { withDependencyRules } from '../../src/config/arch-dependency-rules';
import { ArchConfigSchema } from '@harness-engineering/core';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(files: Record<string, string>, config: Record<string, unknown>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-2235-')));
  dirs.push(root);
  fs.writeFileSync(path.join(root, 'harness.config.json'), JSON.stringify(config));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

async function recordedBaseline(root: string): Promise<{
  metrics: Record<string, { value: number }>;
  /** Per-category denominators, keyed by category (see `ArchMeasurement`). */
  denominators: Record<string, Record<string, unknown>>;
}> {
  const result = await runCheckArch({
    cwd: root,
    configPath: path.join(root, 'harness.config.json'),
    updateBaseline: true,
  });
  expect(result.ok).toBe(true);
  const baseline = JSON.parse(
    fs.readFileSync(path.join(root, '.harness', 'arch', 'baselines.json'), 'utf-8')
  ) as { metrics: Record<string, { value: number }> };
  const denominators: Record<string, Record<string, unknown>> = {};
  if (result.ok) {
    for (const m of result.value.measurements) {
      denominators[m.category] = { ...(denominators[m.category] ?? {}), ...(m.metadata ?? {}) };
    }
  }
  return { metrics: baseline.metrics, denominators };
}

const projectConfig = {
  version: 1,
  layers: [
    { name: 'ui', pattern: 'src/ui/**', allowedDependencies: ['domain'] },
    { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
  ],
  forbiddenImports: [
    { from: 'src/domain/**', disallow: ['node:child_process'], message: 'domain stays pure' },
  ],
};

describe('check-arch measures the configured dependency rules (issue #2235)', () => {
  it('records planted layer, cycle and forbidden-import violations in the baseline', async () => {
    const root = fixture(
      {
        'src/ui/view.ts': "import { model } from '../domain/model';\nexport const view = model;\n",
        'src/domain/model.ts':
          "import { view } from '../ui/view';\n" +
          "import { exec } from 'node:child_process';\n" +
          'export const model = [view, exec];\n',
      },
      projectConfig
    );

    const { metrics } = await recordedBaseline(root);

    expect(metrics['layer-violations']!.value).toBe(1);
    expect(metrics['circular-deps']!.value).toBe(1);
    expect(metrics['forbidden-imports']!.value).toBe(1);
  });

  it('records 0 for the same project when every rule is respected', async () => {
    const root = fixture(
      {
        'src/ui/view.ts': "import { model } from '../domain/model';\nexport const view = model;\n",
        'src/domain/model.ts': 'export const model = 1;\n',
      },
      projectConfig
    );

    const { metrics, denominators } = await recordedBaseline(root);

    expect(metrics['layer-violations']!.value).toBe(0);
    expect(metrics['circular-deps']!.value).toBe(0);
    expect(metrics['forbidden-imports']!.value).toBe(0);

    // A 0 is only coverage if something was actually analysed. The pre-#2235
    // collectors produced exactly these three zeros while measuring nothing, so
    // without the denominators this test passed against the defect it guards.
    expect(denominators['layer-violations']).toMatchObject({ layersConfigured: 2 });
    expect(denominators['layer-violations']!.modulesAnalyzed as number).toBeGreaterThan(0);
    expect(denominators['layer-violations']!.skipped).toBeUndefined();
    expect(denominators['circular-deps']!.filesAnalyzed as number).toBeGreaterThan(0);
    expect(denominators['circular-deps']!.edgeCount as number).toBeGreaterThan(0);
    expect(denominators['forbidden-imports']).toMatchObject({ rulesConfigured: 1 });
    expect(denominators['forbidden-imports']!.filesAnalyzed as number).toBeGreaterThan(0);
  });
});

describe('withDependencyRules', () => {
  const arch = ArchConfigSchema.parse({});

  it('passes layers and forbiddenImports through unchanged for the default rootDir', () => {
    const merged = withDependencyRules(
      arch,
      {
        rootDir: '.',
        layers: projectConfig.layers,
        forbiddenImports: projectConfig.forbiddenImports,
      },
      '/project'
    );

    expect(merged.layers).toEqual(projectConfig.layers);
    expect(merged.forbiddenImports).toEqual(projectConfig.forbiddenImports);
    expect(merged.thresholds).toEqual(arch.thresholds);
  });

  it('folds a non-default rootDir into layer patterns, as check-deps resolves them', () => {
    const merged = withDependencyRules(
      arch,
      {
        rootDir: './app',
        layers: [{ name: 'ui', pattern: 'src/ui/**', allowedDependencies: [] }],
      },
      '/project'
    );

    expect(merged.layers![0]!.pattern).toBe('app/src/ui/**');
    expect(merged.forbiddenImports).toEqual([]);
  });
});

describe('abstainedMeasurements (issue #2235)', () => {
  function measurement(overrides: Partial<ArchMeasurement>): ArchMeasurement {
    return {
      category: 'layer-violations',
      scope: 'project',
      value: 0,
      violationCount: 0,
      ...overrides,
    };
  }

  it('flags a collector that abstained because the parser was unavailable', () => {
    // `layer-violations` passes `fallbackBehavior: 'skip'`, so an unhealthy
    // parser yields value 0 with `skipped` set. That 0 must not read as clean.
    const flagged = abstainedMeasurements([
      measurement({
        metadata: { layersConfigured: 2, modulesAnalyzed: 0, skipped: 'Parser unavailable' },
      }),
    ]);

    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.metadata!.skipped).toBe('Parser unavailable');
  });

  it('flags a collector that threw (runAll substitutes value 0)', () => {
    const flagged = abstainedMeasurements([
      measurement({ category: 'circular-deps', metadata: { error: 'Error: boom' } }),
    ]);

    expect(flagged).toHaveLength(1);
  });

  it('flags a zero denominator — no rules configured means nothing was measured', () => {
    const flagged = abstainedMeasurements([
      measurement({
        category: 'forbidden-imports',
        metadata: { rulesConfigured: 0, filesAnalyzed: 12 },
      }),
    ]);

    expect(flagged).toHaveLength(1);
  });

  it('does NOT flag a genuine clean result', () => {
    expect(
      abstainedMeasurements([
        measurement({ metadata: { layersConfigured: 2, modulesAnalyzed: 14 } }),
        measurement({
          category: 'circular-deps',
          metadata: { filesAnalyzed: 14, edgeCount: 9, cycleCount: 0, largestCycle: 0 },
        }),
      ])
    ).toEqual([]);
  });
});
