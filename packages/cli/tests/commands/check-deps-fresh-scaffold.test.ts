import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createCheckDepsCommand, runCheckDeps } from '../../src/commands/check-deps';
import { handleCheckDependencies } from '../../src/mcp/tools/architecture';
import { ExitCode } from '../../src/utils/errors';

/**
 * `harness check-deps` and the `check_dependencies` MCP tool on a freshly
 * scaffolded project (#2671).
 *
 * `harness init` writes four layers whose directories hold only a `.gitkeep`.
 * check-deps exited 1 (VALIDATION_FAILED, the code of a real violation) with a
 * finding labelled `unknown`, while the MCP tool answered `valid: true` and
 * listed `src/types/.gitkeep` as a graph node. Nothing was examined, so both
 * must abstain — check-deps with exit 3 (ZERO_DENOMINATOR) — and say so in the
 * same words. Positive controls: a real violation fails both, real clean
 * source passes both. Real engine, real tmp-dir fixtures.
 */
const LAYERS = [
  { name: 'types', pattern: 'src/types/**', allowedDependencies: [] },
  { name: 'domain', pattern: 'src/domain/**', allowedDependencies: ['types'] },
  { name: 'services', pattern: 'src/services/**', allowedDependencies: ['types', 'domain'] },
  { name: 'api', pattern: 'src/api/**', allowedDependencies: ['types', 'domain', 'services'] },
];

function scaffold(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-2671-cli-'));
  for (const layer of ['types', 'domain', 'services']) {
    fs.mkdirSync(path.join(root, 'src', layer), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', layer, '.gitkeep'), '');
  }
  // Entry points outside every layer, as the scaffold writes them.
  fs.writeFileSync(path.join(root, 'src/index.ts'), "export * from './app';\n");
  fs.writeFileSync(path.join(root, 'src/app.ts'), 'export const app = 1;\n');
  fs.writeFileSync(
    path.join(root, 'harness.config.json'),
    JSON.stringify({ version: 1, rootDir: '.', layers: LAYERS })
  );
  return root;
}

function addViolation(root: string): void {
  fs.writeFileSync(path.join(root, 'src/services/svc.ts'), 'export const svc = 1;\n');
  fs.writeFileSync(
    path.join(root, 'src/types/t.ts'),
    "import { svc } from '../services/svc';\nexport const t = svc;\n"
  );
}

function addCleanSource(root: string): void {
  fs.writeFileSync(path.join(root, 'src/types/t.ts'), 'export type T = number;\n');
  fs.writeFileSync(
    path.join(root, 'src/domain/d.ts'),
    "import type { T } from '../types/t';\nexport const d: T = 1;\n"
  );
}

interface McpPayload {
  valid: boolean;
  graph: { nodes: string[] };
  unavailableChecks?: Array<{ check: string; file?: string; reason: string }>;
}

async function mcp(root: string): Promise<McpPayload> {
  const r = await handleCheckDependencies({ path: root });
  expect(r.isError).toBeFalsy();
  return JSON.parse(r.content[0]!.text) as McpPayload;
}

describe('check-deps and check_dependencies on a fresh scaffold (#2671)', () => {
  let root: string;
  let logs: string[];
  let exitCode: number | null;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = scaffold();
    logs = [];
    exitCode = null;
    logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      logs.push(a.map(String).join(' '));
    });
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      exitCode = c ?? 0;
      throw new Error(`__exit__:${exitCode}`);
    }) as never);
  });

  afterEach(() => {
    logSpy.mockRestore();
    exitSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function runAction(globals: string[] = []): Promise<void> {
    const program = new Command();
    program.option('--config <path>');
    program.option('--json');
    program.option('--verbose');
    program.option('--quiet');
    program.addCommand(createCheckDepsCommand());
    try {
      await program.parseAsync(
        [...globals, '--config', path.join(root, 'harness.config.json'), 'check-deps'],
        { from: 'user' }
      );
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
  }

  it('check-deps abstains (exit 3) with a real label, not a failure labelled `unknown`', async () => {
    await runAction();
    expect(exitCode).toBe(ExitCode.ZERO_DENOMINATOR);
    const out = logs.join('\n');
    expect(out).toMatch(/no source modules yet/i);
    expect(out).toContain('layer validation');
    expect(out).not.toMatch(/\*\s+unknown/);
    // Incomplete, not failed: no violation was found because none was looked for.
    expect(out).not.toContain('Validation failed');
  });

  it('the MCP tool reports the same abstention as check-deps, and no .gitkeep node', async () => {
    const cli = await runCheckDeps({
      cwd: root,
      configPath: path.join(root, 'harness.config.json'),
    });
    expect(cli.ok).toBe(true);
    if (!cli.ok) return;
    expect(cli.value.valid).toBe(false);
    expect(cli.value.unavailableChecks).toHaveLength(1);

    const payload = await mcp(root);
    expect(payload.valid).toBe(false);
    expect(payload.unavailableChecks).toEqual(cli.value.unavailableChecks);
    expect(payload.graph.nodes.some((n) => n.endsWith('.gitkeep'))).toBe(false);
  });

  it('positive control: a real layer violation fails check-deps (exit 1) and the MCP tool', async () => {
    addViolation(root);
    await runAction();
    expect(exitCode).toBe(ExitCode.VALIDATION_FAILED);
    const payload = await mcp(root);
    expect(payload.valid).toBe(false);
    expect(payload.unavailableChecks).toBeUndefined();
  });

  it('positive control: real source with no violation passes check-deps (exit 0) and the MCP tool', async () => {
    addCleanSource(root);
    await runAction();
    expect(exitCode).toBe(ExitCode.SUCCESS);
    const payload = await mcp(root);
    expect(payload.valid).toBe(true);
    expect(payload.unavailableChecks).toBeUndefined();
  });
});
