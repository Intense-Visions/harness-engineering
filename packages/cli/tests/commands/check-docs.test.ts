import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createCheckDocsCommand, runCheckDocs } from '../../src/commands/check-docs';
import * as path from 'path';

describe('check-docs command', () => {
  const validProjectPath = path.join(__dirname, '../fixtures/valid-project');

  describe('runCheckDocs', () => {
    it('returns documentation coverage report', async () => {
      const result = await runCheckDocs({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.coveragePercent).toBe('number');
      }
    });

    it('returns error when config is invalid', async () => {
      const result = await runCheckDocs({
        configPath: '/nonexistent/harness.config.json',
      });
      expect(result.ok).toBe(false);
    });

    it('uses default minCoverage of 80', async () => {
      const result = await runCheckDocs({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
    });

    it('uses custom minCoverage', async () => {
      const result = await runCheckDocs({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
        minCoverage: 0,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
      }
    });

    it('reports the denominator scanned on a real project', async () => {
      const result = await runCheckDocs({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.scanned).toBeGreaterThan(0);
        expect(result.value.scannedNothing).toBe(false);
      }
    });

    // #1146: a scan that read zero source files abstained — it must never pass
    // at min-coverage 0, and must report the abstention explicitly.
    describe('zero source files scanned (#1146)', () => {
      let root: string;

      beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'harness-checkdocs-'));
        // docs/ present, but no source files at all.
        await mkdir(path.join(root, 'docs'), { recursive: true });
        await writeFile(path.join(root, 'docs/readme.md'), '# Docs\n');
        await writeFile(
          path.join(root, 'harness.config.json'),
          JSON.stringify({ version: 1, name: 'empty', rootDir: '.', docsDir: './docs' })
        );
      });

      afterEach(async () => {
        await rm(root, { recursive: true, force: true });
      });

      it('abstains (valid false, scannedNothing) instead of reporting 100%', async () => {
        const result = await runCheckDocs({
          cwd: root,
          configPath: path.join(root, 'harness.config.json'),
          minCoverage: 0,
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.scanned).toBe(0);
          expect(result.value.scannedNothing).toBe(true);
          expect(result.value.coveragePercent).not.toBe(100);
          expect(result.value.valid).toBe(false);
        }
      });
    });
  });

  describe('createCheckDocsCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckDocsCommand();
      expect(cmd.name()).toBe('check-docs');
    });

    it('has --min-coverage option with default 80', () => {
      const cmd = createCheckDocsCommand();
      const opt = cmd.options.find((o) => o.long === '--min-coverage');
      expect(opt).toBeDefined();
      expect(opt?.defaultValue).toBe('80');
    });
  });

  describe('action handler', () => {
    const exitError = new Error('process.exit');
    let mockExit: ReturnType<typeof vi.spyOn>;
    let mockConsoleLog: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
        throw exitError;
      }) as never);
      mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      mockExit.mockRestore();
      mockConsoleLog.mockRestore();
    });

    async function safeParseAsync(program: Command, args: string[]) {
      try {
        await program.parseAsync(args);
      } catch (e) {
        if (e !== exitError) throw e;
      }
    }

    function makeProgram(): Command {
      const program = new Command();
      program.option('--json', 'JSON output');
      program.option('--quiet', 'Quiet output');
      program.option('--verbose', 'Verbose');
      program.option('-c, --config <path>', 'Config');
      program.addCommand(createCheckDocsCommand());
      return program;
    }

    it('exits with error when config is invalid', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        '/nonexistent/config.json',
        'check-docs',
      ]);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('outputs JSON error when config fails and --json set', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--json',
        '-c',
        '/nonexistent/config.json',
        'check-docs',
      ]);

      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('runs check and exits with appropriate code', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        path.join(validProjectPath, 'harness.config.json'),
        'check-docs',
        '--min-coverage',
        '0',
      ]);

      // With 0% min coverage, should pass
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    /**
     * Exit-code mapping over a real scan, run from the REAL `process.cwd()`.
     *
     * This block used to install a `vi.spyOn(process, 'cwd')` pointing at the
     * fixture, because the action handler called `runCheckDocs` without a `cwd`
     * and `runCheckDocs` fell back to `process.cwd()` — so `-c` chose the
     * config file while the scan measured the current directory. The spy was
     * papering over that defect (the production bug `check-arch` was fixed out
     * of under #911 / 9f322084c). `runCheckDocs` now roots on the project that
     * owns the config, so the spy is gone and these cases prove the root is
     * honoured rather than assuming it.
     *
     * The failure exit matters on its own: before #2282 every `mockExit`
     * assertion in this file asserted 0 and nothing anywhere asserted 1, so
     * mutating the final `process.exit(result.value.valid ? SUCCESS :
     * VALIDATION_FAILED)` to a bare `process.exit(ExitCode.SUCCESS)` left the
     * file green. Reaching the `valid` exit needs a scan that read something and
     * still fell short — one source file, no docs page linking it, default 80%
     * floor.
     */
    describe('exit-code mapping over a real scan', () => {
      let root: string;

      beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'harness-checkdocs-exit-'));
        await mkdir(path.join(root, 'docs'), { recursive: true });
        await mkdir(path.join(root, 'src'), { recursive: true });
        await writeFile(
          path.join(root, 'harness.config.json'),
          JSON.stringify({ version: 1, name: 'uncovered', rootDir: '.', docsDir: './docs' })
        );
      });

      afterEach(async () => {
        await rm(root, { recursive: true, force: true });
      });

      it('exits VALIDATION_FAILED (1) when coverage is below the floor', async () => {
        // Scanned something (so not an abstention), documented nothing.
        await writeFile(path.join(root, 'docs/readme.md'), '# Docs\n\nNothing linked here.\n');
        await writeFile(path.join(root, 'src/thing.ts'), 'export const thing = 1;\n');

        const program = makeProgram();
        await safeParseAsync(program, [
          'node',
          'test',
          '-c',
          path.join(root, 'harness.config.json'),
          'check-docs',
        ]);

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(mockExit).not.toHaveBeenCalledWith(0);
      });

      it('exits SUCCESS (0) over the same fixture once the file is documented', async () => {
        // The falsifying twin: identical shape, coverage above the floor. Without
        // it, the assertion above would also pass if the command exited 1 always.
        await writeFile(
          path.join(root, 'docs/readme.md'),
          // Coverage is LINK-based: a markdown link to the basename is what
          // marks a source file documented. Prose mentioning the filename is not.
          '# Docs\n\nSee [the thing](../src/thing.ts).\n'
        );
        await writeFile(path.join(root, 'src/thing.ts'), 'export const thing = 1;\n');

        const program = makeProgram();
        await safeParseAsync(program, [
          'node',
          'test',
          '-c',
          path.join(root, 'harness.config.json'),
          'check-docs',
        ]);

        expect(mockExit).toHaveBeenCalledWith(0);
      });

      it('exits ZERO_DENOMINATOR (3), not 0 or 1, when the scan read nothing (#1146)', async () => {
        // The abstention contract: "read nothing" must be distinguishable from
        // "verified and passed" (0) and "verified and failed" (1) at the exit
        // code, which is the only thing a CI step sees.
        await writeFile(path.join(root, 'docs/readme.md'), '# Docs\n');

        const program = makeProgram();
        await safeParseAsync(program, [
          'node',
          'test',
          '-c',
          path.join(root, 'harness.config.json'),
          'check-docs',
          '--min-coverage',
          '0',
        ]);

        expect(mockExit).toHaveBeenCalledWith(3);
      });

      /**
       * `-c` must select the project root, not just the config FILE (#911's class,
       * fixed for `check-arch` in 9f322084c and reported for `check-docs` while
       * reviewing #2282).
       *
       * This runs from the REAL `process.cwd()` — vitest's cwd for this package is
       * `packages/cli` — and points `-c` at a tmpdir fixture. No `process.cwd`
       * spy: the whole point is that none is needed.
       *
       * FIXTURE CHOICE. The wrong answer must be arithmetically unreachable from
       * the right one, because an exit code alone is not a discriminator here:
       * `packages/cli` itself sits below the 80% floor, so a scan of the WRONG
       * directory also exits 1 (measured in #2282). So this asserts the
       * denominator and the numerator, not the verdict:
       *
       *   right answer (the fixture) -> scanned 1, documented 1, 100%
       *   wrong answer (packages/cli) -> scanned in the thousands, well under 80%
       *
       * `scanned: 1` is the load-bearing assertion. No real package tree has one
       * source file, so it cannot be satisfied by coincidence, and it is also
       * immune to the #1146 abstention masking the result (scanned 0).
       */
      it('measures the project implied by -c, not process.cwd()', async () => {
        await writeFile(path.join(root, 'src/thing.ts'), 'export const thing = 1;\n');
        await writeFile(
          path.join(root, 'docs/readme.md'),
          // Coverage is LINK-based: a markdown link to the basename is what marks
          // a source file documented.
          '# Docs\n\nSee [the thing](../src/thing.ts).\n'
        );

        // Guard the premise: if the test process ever ran from the fixture, this
        // assertion would be vacuous.
        expect(process.cwd()).not.toBe(root);

        const program = makeProgram();
        await safeParseAsync(program, [
          'node',
          'test',
          '--json',
          '-c',
          path.join(root, 'harness.config.json'),
          'check-docs',
        ]);

        const jsonCall = mockConsoleLog.mock.calls.find(
          (c) => typeof c[0] === 'string' && c[0].includes('coveragePercent')
        );
        expect(jsonCall).toBeDefined();
        const payload = JSON.parse(jsonCall![0] as string) as {
          scanned: number;
          coveragePercent: number;
          documented: string[];
          undocumented: string[];
        };

        expect(payload.scanned).toBe(1);
        expect(payload.documented).toEqual(['src/thing.ts']);
        expect(payload.undocumented).toEqual([]);
        expect(payload.coveragePercent).toBe(100);
      });
    });

    it('outputs JSON when --json is set', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--json',
        '-c',
        path.join(validProjectPath, 'harness.config.json'),
        'check-docs',
        '--min-coverage',
        '0',
      ]);

      expect(mockConsoleLog).toHaveBeenCalled();
      // Find the JSON output call (it contains coveragePercent)
      const jsonCall = mockConsoleLog.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('coveragePercent')
      );
      expect(jsonCall).toBeDefined();
    });

    it('suppresses output in quiet mode', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--quiet',
        '-c',
        path.join(validProjectPath, 'harness.config.json'),
        'check-docs',
        '--min-coverage',
        '0',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('shows verbose output with undocumented files', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--verbose',
        '-c',
        path.join(validProjectPath, 'harness.config.json'),
        'check-docs',
        '--min-coverage',
        '0',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });
});
