/**
 * `deps.resolveWorkspacePackages` reaches check-arch and `harness ci check` (#2216).
 *
 * #2216 taught `check-deps` and the `check_dependencies` MCP tool to follow
 * workspace-package imports (`@scope/pkg`) behind the opt-in
 * `deps.resolveWorkspacePackages`. The layer-violation collector (check-arch)
 * and the ci-check `deps` step validated the same `layers` but never received
 * the flag, so with it on they reported 0 for a cross-package violation that
 * `check-deps` flagged — two gates disagreeing about one config.
 *
 * Each test drives the real engine (no mocks) from a raw harness config record,
 * through the same `readDependencyRules` / `withDependencyRules` injection that
 * `runCIChecks` uses. Flag off is the positive control: unchanged behaviour,
 * with a non-zero denominator so "0" is a measurement, not an abstention.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAll } from '../../../src/architecture/collectors';
import { LayerViolationCollector } from '../../../src/architecture/collectors/layer-violations';
import {
  readDependencyRules,
  withDependencyRules,
} from '../../../src/architecture/dependency-rules';
import { ArchConfigSchema } from '../../../src/architecture/types';
import { runCIChecks } from '../../../src/ci/check-orchestrator';
import type { CICheckName } from '@harness-engineering/types';

function write(root: string, rel: string, content: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const LAYERS = [
  { name: 'low', pattern: 'packages/low/src/**', allowedDependencies: [] },
  { name: 'high', pattern: 'packages/high/src/**', allowedDependencies: ['low'] },
];

function rawConfig(resolveWorkspacePackages?: boolean): Record<string, unknown> {
  return {
    version: 1,
    layers: LAYERS,
    ...(resolveWorkspacePackages !== undefined ? { deps: { resolveWorkspacePackages } } : {}),
  };
}

describe('resolveWorkspacePackages in check-arch and ci check (#2216)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'harness-2216-arch-')));
    write(root, 'pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n");
    write(
      root,
      'packages/low/package.json',
      JSON.stringify({ name: '@fx/low', exports: { '.': './dist/index.js' } })
    );
    write(
      root,
      'packages/high/package.json',
      JSON.stringify({ name: '@fx/high', exports: { '.': './dist/index.js' } })
    );
    write(
      root,
      'packages/high/src/index.ts',
      "import { base } from '@fx/low';\nexport const h = base;\n"
    );
    // The forbidden edge: the bottom layer importing the top one by bare name.
    write(
      root,
      'packages/low/src/index.ts',
      "import { h } from '@fx/high';\nexport const base = 1;\nexport const leak = h;\n"
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function archConfig(raw: Record<string, unknown>) {
    return withDependencyRules(ArchConfigSchema.parse({}), readDependencyRules(raw), root);
  }

  async function layerMetric(raw: Record<string, unknown>) {
    const results = await runAll(archConfig(raw), root, [new LayerViolationCollector()]);
    const metric = results.find((r) => r.category === 'layer-violations');
    expect(metric).toBeDefined();
    return metric!;
  }

  it('check-arch: reports the cross-package violation when the flag is on', async () => {
    const metric = await layerMetric(rawConfig(true));
    expect(metric.value).toBe(1);
    expect(metric.violations.map((v) => v.detail)).toEqual([
      'low -> high: packages/low/src/index.ts imports packages/high/src/index.ts',
    ]);
  });

  it('check-arch: flag off (absent or false) is unchanged — 0 over a real denominator', async () => {
    for (const raw of [rawConfig(), rawConfig(false)]) {
      const metric = await layerMetric(raw);
      expect(metric.value).toBe(0);
      expect(metric.metadata?.layersConfigured).toBe(2);
      expect(metric.metadata?.modulesAnalyzed).toBeGreaterThan(0);
    }
  });

  it('flag off leaves the injected arch config byte-identical (no new key)', () => {
    const off = archConfig(rawConfig());
    expect('resolveWorkspacePackages' in off).toBe(false);
    expect(JSON.stringify(archConfig(rawConfig(false)))).toBe(JSON.stringify(off));
    expect(archConfig(rawConfig(true)).resolveWorkspacePackages).toBe(true);
  });

  const ALL: CICheckName[] = [
    'validate',
    'deps',
    'docs',
    'entropy',
    'security',
    'perf',
    'phase-gate',
    'arch',
    'traceability',
  ];

  async function ciDeps(raw: Record<string, unknown>) {
    const result = await runCIChecks({
      projectRoot: root,
      config: raw,
      skip: ALL.filter((c) => c !== 'deps'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    const deps = result.value.checks.find((c) => c.name === 'deps');
    expect(deps).toBeDefined();
    return deps!;
  }

  it('ci check deps step: fails on the cross-package violation when the flag is on', async () => {
    const deps = await ciDeps(rawConfig(true));
    expect(deps.status).toBe('fail');
    expect(deps.issues.map((i) => i.message).join('\n')).toContain('(low → high)');
  });

  it('ci check deps step: flag off is unchanged — passes', async () => {
    const deps = await ciDeps(rawConfig());
    expect(deps.status).toBe('pass');
    expect(deps.issues).toEqual([]);
  });
});
