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
import {
  runCheckArch,
  abstainedMeasurements,
  classifyMeasurement,
  abstentionReason,
} from '../../src/commands/check-arch';
import type { ArchMeasurement, ConfiguredCategories } from '../../src/commands/check-arch';
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
    for (const m of result.value.measurements ?? []) {
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

  /** What the PROJECT declared, defaulting each category to "not declared". */
  function declared(over: Partial<ConfiguredCategories>): ConfiguredCategories {
    return { layers: false, forbiddenImports: false, ...over };
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

  it('flags configured rules that analysed nothing — the rules exist, so a 0 is a malfunction', () => {
    const flagged = abstainedMeasurements(
      [
        measurement({
          category: 'forbidden-imports',
          metadata: { rulesConfigured: 3, filesAnalyzed: 0 },
        }),
      ],
      declared({ forbiddenImports: true })
    );

    expect(flagged).toHaveLength(1);
    expect(classifyMeasurement(flagged[0]!, declared({ forbiddenImports: true }))).toBe(
      'abstained'
    );
  });

  it('flags rules the project declared that never reached the collector', () => {
    // The finding this parameter exists for. `layersConfigured: 0` from the
    // collector cannot distinguish "the project configured no layers" from
    // "the project configured layers that never got injected" — and the second
    // is verbatim the #2235 defect: 4,000 modules parsed, zero layers applied,
    // `layer-violations: 0` recorded as clean. Sourced from the config, it is a
    // malfunction and warns.
    const dropped = measurement({ metadata: { layersConfigured: 0, modulesAnalyzed: 4000 } });

    expect(classifyMeasurement(dropped, declared({ layers: true }))).toBe('abstained');
    expect(abstainedMeasurements([dropped], declared({ layers: true }))).toHaveLength(1);
  });

  it('falls back to the reported denominator when the config is not available', () => {
    // An external consumer classifying measurements it did not produce has only
    // the collector's own denominator to go on. Documented as best-effort:
    // `runCheckArch` always supersedes it by passing `configuredCategories`.
    const dropped = measurement({ metadata: { layersConfigured: 0, modulesAnalyzed: 4000 } });

    expect(classifyMeasurement(dropped)).toBe('not-applicable');
  });

  it('flags a run that globbed files but extracted zero functions', () => {
    // `complexity` emits `functionsAnalyzed` alongside `filesAnalyzed`; a parser
    // degradation that still walks the tree shows up here and nowhere else.
    const flagged = abstainedMeasurements([
      measurement({
        category: 'complexity',
        metadata: { filesAnalyzed: 31, functionsAnalyzed: 0 },
      }),
    ]);

    expect(flagged).toHaveLength(1);
  });

  it('does NOT flag a category the project never declared', () => {
    // `layers` and `forbiddenImports` are both optional, so having neither is a
    // policy choice with no action available. Warning here on every run would
    // make "your parser broke" look identical to "you did not configure
    // layers", which is the signal this reporting exists to add.
    const notApplicable = [
      measurement({ metadata: { layersConfigured: 0, modulesAnalyzed: 0 } }),
      measurement({
        category: 'forbidden-imports',
        metadata: { rulesConfigured: 0, filesAnalyzed: 0 },
      }),
    ];
    const none = declared({});

    expect(abstainedMeasurements(notApplicable, none)).toEqual([]);
    expect(notApplicable.map((m) => classifyMeasurement(m, none))).toEqual([
      'not-applicable',
      'not-applicable',
    ]);
  });

  it('treats an undeclared category as not-applicable even when the parser also failed', () => {
    expect(
      classifyMeasurement(
        measurement({
          metadata: { layersConfigured: 0, modulesAnalyzed: 0, skipped: 'Parser unavailable' },
        }),
        declared({})
      )
    ).toBe('not-applicable');
  });

  it('keeps an `error` loud on a category the project DID declare', () => {
    // Pins the ordering. Today every error path emits metadata containing only
    // `{error}`, so the not-applicable check cannot trip on it — but attaching a
    // denominator you already know to an error return is a natural refactor, and
    // `{layersConfigured: 0, error}` must not go quiet on a project that
    // declared layers.
    expect(
      classifyMeasurement(
        measurement({
          metadata: { layersConfigured: 0, error: 'Failed to validate dependencies' },
        }),
        declared({ layers: true })
      )
    ).toBe('abstained');
  });

  it('says the rules did not reach the collector, not `layersConfigured=0`', () => {
    // The warning text is the whole user-visible deliverable here. Printing the
    // bare denominator to a project that DID declare layers reads as "you did
    // not configure layers" — collapsing the very distinction this split exists
    // to draw, at the one place a human reads it.
    const dropped = measurement({ metadata: { layersConfigured: 0, modulesAnalyzed: 4000 } });

    const reason = abstentionReason(dropped, declared({ layers: true }));
    expect(reason).toBe(
      'rules are configured but the collector received none — they did not reach it'
    );
    expect(reason).not.toContain('layersConfigured');

    // A project that genuinely declared nothing is not-applicable and never
    // reaches this message at all.
    expect(abstainedMeasurements([dropped], declared({}))).toEqual([]);
  });

  it('keeps the existing reasons for the other abstention shapes', () => {
    expect(
      abstentionReason(
        measurement({ category: 'circular-deps', metadata: { error: 'boom' } }),
        declared({})
      )
    ).toBe('collector failed: boom');
    expect(
      abstentionReason(
        measurement({
          metadata: { layersConfigured: 2, modulesAnalyzed: 0, skipped: 'no parser' },
        }),
        declared({ layers: true })
      )
    ).toBe('abstained: no parser');
    expect(
      abstentionReason(
        measurement({
          category: 'complexity',
          metadata: { filesAnalyzed: 31, functionsAnalyzed: 0 },
        }),
        declared({})
      )
    ).toBe('nothing to measure (functionsAnalyzed=0)');
  });

  it('never silences a dead parser: the three ungated collectors still abstain', () => {
    // `circular-deps`, `complexity` and `coupling` carry no config gate at all,
    // so no `ConfiguredCategories` value can quiet them. Uses each collector's
    // REAL metadata shape — note `metadata.skipped` is set only by
    // `layer-violations`, so asserting it on circular-deps would prove nothing.
    const none = declared({});

    expect(
      classifyMeasurement(
        measurement({
          category: 'circular-deps',
          metadata: { error: 'Failed to build dependency graph' },
        }),
        none
      )
    ).toBe('abstained');
    expect(
      classifyMeasurement(
        measurement({ category: 'circular-deps', metadata: { filesAnalyzed: 0, edgeCount: 0 } }),
        none
      )
    ).toBe('abstained');
    expect(
      classifyMeasurement(
        measurement({
          category: 'complexity',
          metadata: { filesAnalyzed: 0, functionsAnalyzed: 0 },
        }),
        none
      )
    ).toBe('abstained');
    expect(
      classifyMeasurement(
        measurement({ category: 'coupling', metadata: { filesAnalyzed: 0 } }),
        none
      )
    ).toBe('abstained');
  });

  it('abstains on coupling importEdges=0 only when import syntax corroborates a hollow parse (#2304)', () => {
    const none = declared({});
    // The #2284 shape: a real file count, zero parsed import edges, and import
    // statements plainly present in the text. Must not read as a clean zero.
    const hollow = measurement({
      category: 'coupling',
      metadata: { filesAnalyzed: 1999, importEdges: 0, importStatements: 6712 },
    });
    expect(classifyMeasurement(hollow, none)).toBe('abstained');
    expect(abstentionReason(hollow, none)).toBe(
      'importEdges=0 although the analysed files contain importStatements=6712 — the parse returned none of them'
    );

    // Measured: a declaration-only package reports exactly this over real
    // files. No import syntax means nothing to couple — a clean zero, not an
    // abstention. Listing `importEdges` in WORK_DENOMINATORS would get this wrong.
    expect(
      classifyMeasurement(
        measurement({
          category: 'coupling',
          metadata: { filesAnalyzed: 2, importEdges: 0, importStatements: 0 },
        }),
        none
      )
    ).toBe('measured');

    // A collector that predates the corroborating count cannot tell the two
    // apart, so it keeps the pre-#2304 verdict rather than abstaining blindly.
    expect(
      classifyMeasurement(
        measurement({ category: 'coupling', metadata: { filesAnalyzed: 2, importEdges: 0 } }),
        none
      )
    ).toBe('measured');
    expect(
      classifyMeasurement(
        measurement({ category: 'coupling', metadata: { filesAnalyzed: 2, importEdges: 5 } }),
        none
      )
    ).toBe('measured');
  });

  it('does NOT flag a genuine clean result', () => {
    expect(
      abstainedMeasurements(
        [
          measurement({ metadata: { layersConfigured: 2, modulesAnalyzed: 14 } }),
          measurement({
            category: 'circular-deps',
            metadata: { filesAnalyzed: 14, edgeCount: 9, cycleCount: 0, largestCycle: 0 },
          }),
        ],
        declared({ layers: true })
      )
    ).toEqual([]);
  });
});

describe('abstention reporting over a real run (issue #2235)', () => {
  async function runFor(
    root: string
  ): Promise<{ measurements: ArchMeasurement[]; categories: ConfiguredCategories | undefined }> {
    const result = await runCheckArch({
      cwd: root,
      configPath: path.join(root, 'harness.config.json'),
      updateBaseline: true,
    });
    expect(result.ok).toBe(true);
    return result.ok
      ? {
          measurements: result.value.measurements ?? [],
          categories: result.value.configuredCategories,
        }
      : { measurements: [], categories: undefined };
  }

  it('stays silent about layers and forbidden imports when neither is declared', async () => {
    // The common case: a project with `architecture.enabled` and no layered
    // architecture. Both blocks are `.optional()` in the schema, so this is
    // valid — and there is no action the adopter could take in response to a
    // warning here short of inventing layer rules.
    const root = fixture(
      { 'src/thing.ts': 'export const thing = 1;\n' },
      { version: 1, architecture: { enabled: true } }
    );

    const { measurements, categories } = await runFor(root);
    const byCategory = new Map(measurements.map((m) => [m.category, m]));

    // `runCheckArch` reads this from the project config at the injection point.
    expect(categories).toEqual({ layers: false, forbiddenImports: false });
    expect(byCategory.get('layer-violations')!.metadata).toMatchObject({ layersConfigured: 0 });
    expect(byCategory.get('forbidden-imports')!.metadata).toMatchObject({ rulesConfigured: 0 });
    expect(classifyMeasurement(byCategory.get('layer-violations')!, categories)).toBe(
      'not-applicable'
    );
    expect(classifyMeasurement(byCategory.get('forbidden-imports')!, categories)).toBe(
      'not-applicable'
    );

    const flagged = abstainedMeasurements(measurements, categories).map((m) => m.category);
    expect(flagged).not.toContain('layer-violations');
    expect(flagged).not.toContain('forbidden-imports');
  });

  it('still abstains when layers ARE declared and nothing was analysed', async () => {
    // Same zero `modulesAnalyzed`, but the rules exist — so the 0 is a
    // malfunction and must keep warning. This is the half of the distinction
    // that must not regress while the undeclared case goes quiet.
    const root = fixture({ 'README.md': '# no source\n' }, projectConfig);

    const { measurements, categories } = await runFor(root);
    const layers = measurements.find((m) => m.category === 'layer-violations')!;

    expect(categories).toEqual({ layers: true, forbiddenImports: true });
    expect(layers.metadata).toMatchObject({ layersConfigured: 2, modulesAnalyzed: 0 });
    expect(classifyMeasurement(layers, categories)).toBe('abstained');
    expect(abstainedMeasurements(measurements, categories).map((m) => m.category)).toContain(
      'layer-violations'
    );
  });
});
