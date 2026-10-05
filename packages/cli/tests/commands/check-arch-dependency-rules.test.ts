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
import { runCheckArch } from '../../src/commands/check-arch';
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

async function recordedBaseline(root: string): Promise<Record<string, { value: number }>> {
  const result = await runCheckArch({
    cwd: root,
    configPath: path.join(root, 'harness.config.json'),
    updateBaseline: true,
  });
  expect(result.ok).toBe(true);
  const baseline = JSON.parse(
    fs.readFileSync(path.join(root, '.harness', 'arch', 'baselines.json'), 'utf-8')
  ) as { metrics: Record<string, { value: number }> };
  return baseline.metrics;
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

    const metrics = await recordedBaseline(root);

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

    const metrics = await recordedBaseline(root);

    expect(metrics['layer-violations']!.value).toBe(0);
    expect(metrics['circular-deps']!.value).toBe(0);
    expect(metrics['forbidden-imports']!.value).toBe(0);
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
