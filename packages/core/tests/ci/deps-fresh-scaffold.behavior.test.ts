/**
 * `harness ci check`'s deps step on a freshly scaffolded project (#2671).
 *
 * `harness init` scaffolds the layer directories with only a `.gitkeep` in
 * each. The deps step reported `status: 'pass'` there — a pass over zero
 * analysed modules — while `harness check-deps` refused to report clean on the
 * same tree. A gate that examined nothing has abstained (#2071), so it must
 * report `skip` with a reason, and the positive controls must be unchanged: a
 * real layer violation still fails, real source with no violation still passes.
 *
 * No mocks: the real parser runs over a tmp-dir fixture.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCIChecks } from '../../src/ci/check-orchestrator';
import type { CICheckName, CICheckResult } from '@harness-engineering/types';

const ONLY_DEPS: CICheckName[] = [
  'validate',
  'docs',
  'entropy',
  'security',
  'perf',
  'phase-gate',
  'arch',
  'traceability',
];

/** The layer model `harness init` writes for a TypeScript project. */
const CONFIG = {
  version: 1,
  rootDir: '.',
  layers: [
    { name: 'types', pattern: 'src/types/**', allowedDependencies: [] },
    { name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['types'] },
    { name: 'services', pattern: 'src/services/**', allowedDependencies: ['types', 'domain'] },
    { name: 'api', pattern: 'src/api/**', allowedDependencies: ['types', 'domain', 'services'] },
  ],
};

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-2671-ci-'));
  for (const layer of ['types', 'domain', 'services']) {
    fs.mkdirSync(path.join(root, 'src', layer), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', layer, '.gitkeep'), '');
  }
  // Entry points outside every layer, as the scaffold writes them.
  fs.writeFileSync(path.join(root, 'src/index.ts'), "export * from './app';\n");
  fs.writeFileSync(path.join(root, 'src/app.ts'), 'export const app = 1;\n');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

async function depsCheck(): Promise<CICheckResult> {
  const result = await runCIChecks({ projectRoot: root, config: CONFIG, skip: ONLY_DEPS });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('runCIChecks failed');
  const deps = result.value.checks.find((c) => c.name === 'deps');
  if (!deps) throw new Error('deps check missing from report');
  return deps;
}

describe('ci check deps step on a fresh scaffold (#2671)', () => {
  it('abstains — never passes — when the layers contain no source modules yet', async () => {
    const deps = await depsCheck();
    expect(deps.status).toBe('skip');
    expect(deps.skipReason ?? '').toMatch(/no source modules yet/i);
  });

  it('positive control: a real layer violation still fails', async () => {
    fs.writeFileSync(path.join(root, 'src/services/svc.ts'), 'export const svc = 1;\n');
    fs.writeFileSync(
      path.join(root, 'src/types/t.ts'),
      "import { svc } from '../services/svc';\nexport const t = svc;\n"
    );
    const deps = await depsCheck();
    expect(deps.status).toBe('fail');
  });

  it('positive control: real source with no violation passes', async () => {
    fs.writeFileSync(path.join(root, 'src/types/t.ts'), 'export type T = number;\n');
    fs.writeFileSync(
      path.join(root, 'src/domain/d.ts'),
      "import type { T } from '../types/t';\nexport const d: T = 1;\n"
    );
    const deps = await depsCheck();
    expect(deps.status).toBe('pass');
  });
});
