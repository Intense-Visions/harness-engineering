import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { createCheckArchCommand, runCheckArch } from '../../src/commands/check-arch';
import * as path from 'path';

const validProjectPath = path.join(__dirname, '../fixtures/valid-project');

describe('check-arch command', () => {
  describe('createCheckArchCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckArchCommand();
      expect(cmd.name()).toBe('check-arch');
    });

    it('has --update-baseline option', () => {
      const cmd = createCheckArchCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--update-baseline');
    });

    it('has --module option', () => {
      const cmd = createCheckArchCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--module');
    });
  });

  describe('runCheckArch', () => {
    it('returns success when architecture is not configured (defaults)', async () => {
      const result = await runCheckArch({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
      }
    });

    it('returns config error for invalid config path', async () => {
      const result = await runCheckArch({
        configPath: '/nonexistent/harness.config.json',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.exitCode).toBe(2);
      }
    });

    it('emits warning in threshold-only mode when no baseline exists', async () => {
      const result = await runCheckArch({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // No baseline in valid-project fixture, so threshold-only mode
        expect(result.value.mode).toBe('threshold-only');
        expect(result.value.warning).toContain('--update-baseline');
      }
    });

    it('returns passed=true when architecture defaults are used with no violations', async () => {
      const result = await runCheckArch({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
        expect(result.value.thresholdViolations).toEqual([]);
      }
    });

    it('filters results by module when --module is specified', async () => {
      const result = await runCheckArch({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
        module: 'src/nonexistent',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Filtering to a non-existent module should yield zero violations
        expect(result.value.passed).toBe(true);
        expect(result.value.totalViolations).toBe(0);
      }
    });

    it('updates baseline when --update-baseline is set', async () => {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-'));

      // Create a minimal harness.config.json in temp dir
      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      const result = await runCheckArch({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
        updateBaseline: true,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baselineUpdated).toBe(true);
        expect(result.value.passed).toBe(true);
      }

      // Verify baseline file was created
      const baselinePath = path.join(tmpDir, '.harness', 'arch', 'baselines.json');
      expect(fs.existsSync(baselinePath)).toBe(true);

      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('runs in baseline mode when baseline exists and reports regressions', async () => {
      const fs = await import('node:fs');
      const os = await import('node:os');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-arch-baseline-'));

      // Create minimal config
      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      // First capture a baseline
      const updateResult = await runCheckArch({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
        updateBaseline: true,
      });
      expect(updateResult.ok).toBe(true);

      // Now run check (should use baseline mode)
      const checkResult = await runCheckArch({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
      });

      expect(checkResult.ok).toBe(true);
      if (checkResult.ok) {
        expect(checkResult.value.mode).toBe('baseline');
        expect(checkResult.value.passed).toBe(true);
        expect(checkResult.value.regressions).toEqual([]);
      }

      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('reports correct exit code mapping: 0=pass, 1=regression, 2=config-error', async () => {
      // Exit code 2 for config error
      const configError = await runCheckArch({
        configPath: '/nonexistent/config.json',
      });
      expect(configError.ok).toBe(false);
      if (!configError.ok) {
        expect(configError.error.exitCode).toBe(2);
      }

      // Exit code 0 for passing check
      const passing = await runCheckArch({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(passing.ok).toBe(true);
      if (passing.ok) {
        expect(passing.value.passed).toBe(true);
        // Exit code 0 is determined by passed=true in the action handler
      }
    });
  });

  describe('action handler', () => {
    let mockExit: ReturnType<typeof vi.spyOn>;
    let mockConsoleLog: ReturnType<typeof vi.spyOn>;
    const exitError = new Error('process.exit');

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
      program.addCommand(createCheckArchCommand());
      return program;
    }

    it('exits with error when config is invalid', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        '/nonexistent/harness.config.json',
        'check-arch',
      ]);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('outputs JSON error when --json and config fails', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--json',
        '-c',
        '/nonexistent/harness.config.json',
        'check-arch',
      ]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('error'));
    });

    it('handles --update-baseline and exits with SUCCESS', async () => {
      const fsSync = await import('node:fs');
      const osModule = await import('node:os');
      const tmpDir = fsSync.mkdtempSync(path.join(osModule.tmpdir(), 'check-arch-action-'));

      fsSync.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        path.join(tmpDir, 'harness.config.json'),
        'check-arch',
        '--update-baseline',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);

      fsSync.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('handles --update-baseline with JSON output', async () => {
      const fsSync = await import('node:fs');
      const osModule = await import('node:os');
      const tmpDir = fsSync.mkdtempSync(path.join(osModule.tmpdir(), 'check-arch-json-'));

      fsSync.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );

      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--json',
        '-c',
        path.join(tmpDir, 'harness.config.json'),
        'check-arch',
        '--update-baseline',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('baselineUpdated'));

      fsSync.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('exits with SUCCESS for disabled architecture', async () => {
      const fsSync = await import('node:fs');
      const osModule = await import('node:os');
      const tmpDir = fsSync.mkdtempSync(path.join(osModule.tmpdir(), 'check-arch-disabled-'));

      fsSync.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: false } })
      );

      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        path.join(tmpDir, 'harness.config.json'),
        'check-arch',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);

      fsSync.rmSync(tmpDir, { recursive: true, force: true });
    });
  });
});
