/**
 * Planted-positive behaviour tests for the `arch` check inside `runCIChecks`
 * (issue #2235, follow-up).
 *
 * `harness ci check` is the gate `.husky/pre-commit` runs, and it builds its own
 * arch config inside core from `ArchConfigSchema`, which deliberately carries
 * neither `layers` nor `forbiddenImports`. Before this fix the layer-violation
 * collector therefore received `layers: undefined` and the forbidden-import
 * collector received no rules on this path — the exact structural zero #2235
 * fixed in `check-arch` — so one surface wrote real values into
 * `.harness/arch/baselines.json` and the other wrote 0s.
 *
 * No mocks: the real collectors run over a tmp-dir fixture with no baseline, so
 * every violation surfaces as an issue. Each planted positive has a clean twin
 * so the assertions cannot pass by always reporting a violation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCIChecks } from '../../src/ci/check-orchestrator';
import type { CICheckName } from '@harness-engineering/types';

const ONLY_ARCH: CICheckName[] = [
  'validate',
  'deps',
  'docs',
  'entropy',
  'security',
  'perf',
  'phase-gate',
  'traceability',
];

let root: string;

function plant(files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
}

function configWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    rootDir: '.',
    agentsMapPath: './AGENTS.md',
    docsDir: './docs',
    architecture: { enabled: true },
    ...overrides,
  };
}

async function archMessages(config: Record<string, unknown>): Promise<string[]> {
  const result = await runCIChecks({ projectRoot: root, config, skip: ONLY_ARCH });
  expect(result.ok).toBe(true);
  if (!result.ok) return [];
  const arch = result.value.checks.find((c) => c.name === 'arch');
  expect(arch).toBeDefined();
  return (arch?.issues ?? []).map((i) => i.message);
}

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ci-arch-rules-2235-')));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('runCIChecks arch check — layer violations', () => {
  const layers = [
    { name: 'ui', pattern: 'src/ui/**', allowedDependencies: ['domain'] },
    { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
  ];

  it('reports a planted wrong-direction import', async () => {
    plant({
      'src/ui/view.ts': "import { model } from '../domain/model';\nexport const view = model;\n",
      'src/domain/model.ts': "import { view } from '../ui/view';\nexport const model = 1;\n",
    });

    const messages = await archMessages(configWith({ layers }));

    expect(messages.some((m) => m.includes('[layer-violations]'))).toBe(true);
    expect(messages.some((m) => m.includes('domain -> ui'))).toBe(true);
  });

  it('reports nothing for the clean twin', async () => {
    plant({
      'src/ui/view.ts': "import { model } from '../domain/model';\nexport const view = model;\n",
      'src/domain/model.ts': 'export const model = 1;\n',
    });

    const messages = await archMessages(configWith({ layers }));

    expect(messages.filter((m) => m.includes('[layer-violations]'))).toEqual([]);
  });

  it('honours a non-default rootDir, as check-arch does', async () => {
    plant({
      'app/src/ui/view.ts':
        "import { model } from '../domain/model';\nexport const view = model;\n",
      'app/src/domain/model.ts': "import { view } from '../ui/view';\nexport const model = 1;\n",
    });

    const messages = await archMessages(configWith({ rootDir: 'app', layers }));

    expect(messages.some((m) => m.includes('domain -> ui'))).toBe(true);
  });
});

describe('runCIChecks arch check — forbidden imports', () => {
  const forbiddenImports = [
    {
      from: 'src/low/**',
      disallow: ['src/high/**'],
      message: 'low must not import high',
    },
  ];

  it('reports a planted forbidden import', async () => {
    plant({
      'src/low/a.ts': "import { h } from '../high/h';\nexport const a = h;\n",
      'src/high/h.ts': 'export const h = 1;\n',
    });

    const messages = await archMessages(configWith({ forbiddenImports }));

    expect(messages.some((m) => m.includes('[forbidden-imports]'))).toBe(true);
  });

  it('reports nothing for the clean twin', async () => {
    plant({
      'src/low/a.ts': 'export const a = 1;\n',
      'src/high/h.ts': "import { a } from '../low/a';\nexport const h = a;\n",
    });

    const messages = await archMessages(configWith({ forbiddenImports }));

    expect(messages.filter((m) => m.includes('[forbidden-imports]'))).toEqual([]);
  });
});
