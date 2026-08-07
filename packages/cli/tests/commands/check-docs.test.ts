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
