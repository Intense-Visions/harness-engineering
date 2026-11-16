import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createCheckDepsCommand, runCheckDeps } from '../../src/commands/check-deps';
import { ExitCode } from '../../src/utils/errors';

/**
 * Regression coverage for #2073 — "Layer-boundary check silently drops
 * unparseable files and still passes".
 *
 * Two layers, `domain` allowed to depend on nothing, and a real
 * `domain -> infra` import. Append one line of invalid syntax to the offending
 * file and the parser fails on it; `buildDependencyGraph` used to `continue`
 * without a word, so the violation vanished, `modulesAnalyzed` still counted
 * the dropped file (and every directory the layer glob matched), and the
 * command printed `v validation passed` and exited 0.
 *
 * Fixtures are written to a temp dir: a checked-in `.ts` file with a syntax
 * error would trip the repo's own prettier/eslint/tsc gates.
 */
const VIOLATING = "import { db } from '../infra/db';\nexport const order = db;\n";
const BROKEN_LINE = 'function broken( {\n';

function scaffold(fallbackBehavior?: 'warn'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-2073-cli-'));
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
  fs.writeFileSync(path.join(root, 'src/domain/order.ts'), VIOLATING);
  fs.writeFileSync(
    path.join(root, 'harness.config.json'),
    JSON.stringify({
      version: 1,
      rootDir: '.',
      layers: [
        { name: 'domain', pattern: 'src/domain/**', allowedDependencies: [] },
        { name: 'infra', pattern: 'src/infra/**', allowedDependencies: ['domain'] },
      ],
      ...(fallbackBehavior ? { deps: { fallbackBehavior } } : {}),
    })
  );
  return root;
}

function breakOrder(root: string): void {
  fs.appendFileSync(path.join(root, 'src/domain/order.ts'), BROKEN_LINE);
}

describe('check-deps does not pass over files it could not parse (#2073)', () => {
  let root: string;

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function run() {
    const result = await runCheckDeps({
      cwd: root,
      configPath: path.join(root, 'harness.config.json'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    return result.value;
  }

  it('baseline: finds the violation and counts only the two source files', async () => {
    root = scaffold();
    const value = await run();
    expect(value.layerViolations).toHaveLength(1);
    expect(value.valid).toBe(false);
    expect(value.unavailableChecks).toBeUndefined();
    // Directories matched by `src/domain/**` are not modules.
    expect(value.modulesAnalyzed).toBe(2);
  });

  it('refuses a clean verdict and names the skipped file', async () => {
    root = scaffold();
    breakOrder(root);
    const value = await run();

    expect(value.valid).toBe(false);
    expect(value.unavailableChecks).toBeDefined();
    const files = value.unavailableChecks!.map((u) => u.file);
    expect(files).toEqual(['src/domain/order.ts']);
    expect(value.unavailableChecks![0]!.reason).toMatch(/could not be parsed/);
    // The real denominator: one file parsed, not "2 analysed".
    expect(value.modulesAnalyzed).toBe(1);
  });

  it('deps.fallbackBehavior "warn" keeps the report but downgrades the verdict', async () => {
    root = scaffold('warn');
    breakOrder(root);
    const value = await run();

    expect(value.unavailableChecks).toHaveLength(1);
    expect(value.abstentionDowngraded).toBe(true);
    expect(value.valid).toBe(true);
  });

  describe('process exit code and rendered output', () => {
    let logs: string[];
    let exitCode: number | null;

    beforeEach(() => {
      logs = [];
      exitCode = null;
      vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        logs.push(a.map(String).join(' '));
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        exitCode = c ?? 0;
        throw new Error(`__exit__:${exitCode}`);
      }) as never);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    async function runAction(): Promise<void> {
      vi.spyOn(process, 'cwd').mockReturnValue(root);
      const program = new Command();
      program.option('--config <path>');
      program.option('--json');
      program.option('--verbose');
      program.option('--quiet');
      program.addCommand(createCheckDepsCommand());
      await program
        .parseAsync(['--config', path.join(root, 'harness.config.json'), 'check-deps'], {
          from: 'user',
        })
        .catch((e: Error) => {
          if (!e.message.startsWith('__exit__')) throw e;
        });
    }

    it('exits non-zero, never prints "validation passed", and names the file', async () => {
      root = scaffold();
      breakOrder(root);
      await runAction();

      const out = logs.join('\n');
      expect(exitCode).not.toBe(ExitCode.SUCCESS);
      expect(exitCode).toBe(ExitCode.ZERO_DENOMINATOR);
      expect(out).not.toMatch(/validation passed/);
      expect(out).toContain('src/domain/order.ts');
      expect(out).toContain('Analyzed 1 module(s)');
    });

    it('exits VALIDATION_FAILED on a plain layer violation (#2473 item 1)', async () => {
      root = scaffold();
      await runAction();
      expect(exitCode).toBe(ExitCode.VALIDATION_FAILED);
    });
  });
});
