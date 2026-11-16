/**
 * `harness ci check`'s deps step must honour the same `harness.config.json`
 * dependency settings as `harness check-deps` (#2606).
 *
 * `runDepsCheck` used to call `validateDependencies({ layers, rootDir, parser })`
 * and nothing else, so `deps.exclude`, `deps.fallbackBehavior` and the engine's
 * `unparsedFiles` were all ignored: a repo could be clean under `check-deps`
 * and dirty under `ci check` (or the reverse).
 *
 * No mocks: the real parser runs over a tmp-dir fixture. A file with a syntax
 * error is written at test time because a checked-in one would trip the repo's
 * own prettier/eslint/tsc gates.
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

/** `domain` may not import `infra`, so this file is a layer violation. */
const VIOLATING = "import { db } from '../infra/db';\nexport const order = db;\n";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-2606-'));
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
  fs.writeFileSync(path.join(root, 'src/domain/order.ts'), VIOLATING);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function config(deps?: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    rootDir: '.',
    layers: [
      { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
      { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
    ],
    ...(deps ? { deps } : {}),
  };
}

async function depsCheck(cfg: Record<string, unknown>): Promise<CICheckResult> {
  const result = await runCIChecks({ projectRoot: root, config: cfg, skip: ONLY_DEPS });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('runCIChecks failed');
  const deps = result.value.checks.find((c) => c.name === 'deps');
  if (!deps) throw new Error('deps check missing from report');
  return deps;
}

describe('ci check deps step honours harness.config.json deps settings (#2606)', () => {
  it('positive control: with no exclude the layer violation is reported', async () => {
    const deps = await depsCheck(config());
    expect(deps.status).toBe('fail');
    expect(deps.issues.map((i) => (i.file ?? '').replace(/\\/g, '/')).join('\n')).toMatch(
      /src\/domain\/order\.ts/
    );
  });

  it('deps.exclude covering the violating file passes, as it does under check-deps', async () => {
    const deps = await depsCheck(config({ exclude: ['src/domain/order.ts'] }));
    expect(deps.issues).toEqual([]);
    expect(deps.status).toBe('pass');
  });

  it('an unparseable file abstains by default (deps.fallbackBehavior: skip)', async () => {
    fs.appendFileSync(path.join(root, 'src/domain/order.ts'), 'function broken( {\n');
    const deps = await depsCheck(config());
    expect(deps.status).toBe('skip');
    expect(deps.skipReason ?? '').toMatch(/src\/domain\/order\.ts/);
  });

  it('deps.fallbackBehavior: warn reports an unparseable file as a warning, not a fail', async () => {
    fs.appendFileSync(path.join(root, 'src/domain/order.ts'), 'function broken( {\n');
    const deps = await depsCheck(config({ fallbackBehavior: 'warn' }));
    expect(deps.status).toBe('warn');
    expect(deps.issues).toHaveLength(1);
    expect(deps.issues[0]!.severity).toBe('warning');
    expect((deps.issues[0]!.file ?? '').replace(/\\/g, '/')).toMatch(/src\/domain\/order\.ts$/);
  });

  it('resolves layer patterns against config.rootDir, as check-deps does', async () => {
    const nested = path.join(root, 'app');
    fs.mkdirSync(nested);
    fs.renameSync(path.join(root, 'src'), path.join(nested, 'src'));
    const deps = await depsCheck({ ...config(), rootDir: 'app' });
    expect(deps.status).toBe('fail');
  });
});
