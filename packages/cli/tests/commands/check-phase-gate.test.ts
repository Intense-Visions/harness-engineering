import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import {
  createCheckPhaseGateCommand,
  runCheckPhaseGate,
} from '../../src/commands/check-phase-gate';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-phase-gate-'));
}

function writeConfig(dir: string, config: Record<string, unknown>): string {
  const configPath = path.join(dir, 'harness.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

function mkdirp(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

describe('check-phase-gate command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('runCheckPhaseGate', () => {
    it('returns pass with skipped when phase gates disabled', async () => {
      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: { enabled: false },
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.skipped).toBe(true);
        expect(result.value.checkedFiles).toBe(0);
      }
    });

    it('returns pass with skipped when phaseGates not present in config', async () => {
      const configPath = writeConfig(tmpDir, {
        version: 1,
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.skipped).toBe(true);
      }
    });

    it('returns pass when all impl files have matching specs', async () => {
      // Create impl files
      mkdirp(path.join(tmpDir, 'src', 'auth'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'auth', 'login.ts'), 'export {}');

      // Create matching spec
      mkdirp(path.join(tmpDir, 'docs', 'changes', 'auth'));
      fs.writeFileSync(path.join(tmpDir, 'docs', 'changes', 'auth', 'proposal.md'), '# Auth Spec');

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'error',
          mappings: [
            { implPattern: 'src/**/*.ts', specPattern: 'docs/changes/{feature}/proposal.md' },
          ],
        },
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.skipped).toBe(false);
        expect(result.value.checkedFiles).toBe(1);
        expect(result.value.missingSpecs).toHaveLength(0);
      }
    });

    it('returns fail when impl files are missing specs', async () => {
      // Create impl files but no specs
      mkdirp(path.join(tmpDir, 'src', 'payments'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'payments', 'charge.ts'), 'export {}');

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'error',
          mappings: [
            { implPattern: 'src/**/*.ts', specPattern: 'docs/changes/{feature}/proposal.md' },
          ],
        },
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.skipped).toBe(false);
        expect(result.value.checkedFiles).toBe(1);
        expect(result.value.missingSpecs).toHaveLength(1);
        expect(result.value.missingSpecs[0].implFile).toContain('payments/charge.ts');
        expect(result.value.missingSpecs[0].expectedSpec).toBe('docs/changes/payments/proposal.md');
      }
    });

    it('respects severity setting (warning)', async () => {
      mkdirp(path.join(tmpDir, 'src', 'billing'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'billing', 'invoice.ts'), 'export {}');

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'warning',
          mappings: [
            { implPattern: 'src/**/*.ts', specPattern: 'docs/changes/{feature}/proposal.md' },
          ],
        },
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.severity).toBe('warning');
        expect(result.value.missingSpecs).toHaveLength(1);
      }
    });

    it('handles multiple mappings', async () => {
      // Create impl files for two patterns
      mkdirp(path.join(tmpDir, 'src', 'auth'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'auth', 'login.ts'), 'export {}');
      mkdirp(path.join(tmpDir, 'lib', 'utils'));
      fs.writeFileSync(path.join(tmpDir, 'lib', 'utils', 'hash.ts'), 'export {}');

      // Only create spec for first mapping
      mkdirp(path.join(tmpDir, 'docs', 'changes', 'auth'));
      fs.writeFileSync(path.join(tmpDir, 'docs', 'changes', 'auth', 'proposal.md'), '# Auth');

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'error',
          mappings: [
            { implPattern: 'src/**/*.ts', specPattern: 'docs/changes/{feature}/proposal.md' },
            { implPattern: 'lib/**/*.ts', specPattern: 'docs/changes/{feature}/proposal.md' },
          ],
        },
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.checkedFiles).toBe(2);
        expect(result.value.missingSpecs).toHaveLength(1);
        expect(result.value.missingSpecs[0].implFile).toContain('utils/hash.ts');
      }
    });

    it('returns error when config file does not exist', async () => {
      const result = await runCheckPhaseGate({
        configPath: path.join(tmpDir, 'nonexistent.json'),
      });
      expect(result.ok).toBe(false);
    });

    it('derives cwd from configPath when cwd not provided', async () => {
      mkdirp(path.join(tmpDir, 'src', 'feature'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'feature', 'impl.ts'), 'export {}');

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'error',
          mappings: [
            { implPattern: 'src/**/*.ts', specPattern: 'docs/changes/{feature}/proposal.md' },
          ],
        },
      });

      // No cwd - should derive from configPath
      const result = await runCheckPhaseGate({ configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.skipped).toBe(false);
        expect(result.value.checkedFiles).toBe(1);
      }
    });

    it('validates spec content when contentValidation is enabled', async () => {
      mkdirp(path.join(tmpDir, 'src', 'auth'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'auth', 'login.ts'), 'export {}');

      // Spec exists but has no required section
      mkdirp(path.join(tmpDir, 'docs', 'changes', 'auth'));
      fs.writeFileSync(
        path.join(tmpDir, 'docs', 'changes', 'auth', 'proposal.md'),
        '# Auth Spec\nSome content without criteria section.'
      );

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'error',
          mappings: [
            {
              implPattern: 'src/**/*.ts',
              specPattern: 'docs/changes/{feature}/proposal.md',
              contentValidation: true,
            },
          ],
        },
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.missingSpecs).toHaveLength(1);
        expect(result.value.missingSpecs[0].expectedSpec).toContain('missing requirements section');
      }
    });

    it('validates spec content passes with Observable Truths section and numbered items', async () => {
      mkdirp(path.join(tmpDir, 'src', 'auth'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'auth', 'login.ts'), 'export {}');

      mkdirp(path.join(tmpDir, 'docs', 'changes', 'auth'));
      fs.writeFileSync(
        path.join(tmpDir, 'docs', 'changes', 'auth', 'proposal.md'),
        '# Auth Spec\n## Observable Truths\n1. User can login\n2. Session created\n'
      );

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'error',
          mappings: [
            {
              implPattern: 'src/**/*.ts',
              specPattern: 'docs/changes/{feature}/proposal.md',
              contentValidation: true,
            },
          ],
        },
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
        expect(result.value.missingSpecs).toHaveLength(0);
      }
    });

    it('fails content validation when section has no numbered items', async () => {
      mkdirp(path.join(tmpDir, 'src', 'auth'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'auth', 'login.ts'), 'export {}');

      mkdirp(path.join(tmpDir, 'docs', 'changes', 'auth'));
      fs.writeFileSync(
        path.join(tmpDir, 'docs', 'changes', 'auth', 'proposal.md'),
        '# Auth Spec\n## Success Criteria\nSome text but no numbered items\n## Next Section\n'
      );

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'error',
          mappings: [
            {
              implPattern: 'src/**/*.ts',
              specPattern: 'docs/changes/{feature}/proposal.md',
              contentValidation: true,
            },
          ],
        },
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(false);
        expect(result.value.missingSpecs[0].expectedSpec).toContain('no numbered items');
      }
    });

    it('passes content validation with Acceptance Criteria section', async () => {
      mkdirp(path.join(tmpDir, 'src', 'auth'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'auth', 'login.ts'), 'export {}');

      mkdirp(path.join(tmpDir, 'docs', 'changes', 'auth'));
      fs.writeFileSync(
        path.join(tmpDir, 'docs', 'changes', 'auth', 'proposal.md'),
        '# Auth Spec\n## Acceptance Criteria\n1. First criterion\n'
      );

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'error',
          mappings: [
            {
              implPattern: 'src/**/*.ts',
              specPattern: 'docs/changes/{feature}/proposal.md',
              contentValidation: true,
            },
          ],
        },
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pass).toBe(true);
      }
    });

    it('handles impl files in root of pattern (no subdirectory)', async () => {
      mkdirp(path.join(tmpDir, 'src'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export {}');

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'error',
          mappings: [
            { implPattern: 'src/**/*.ts', specPattern: 'docs/changes/{feature}/proposal.md' },
          ],
        },
      });

      const result = await runCheckPhaseGate({ cwd: tmpDir, configPath });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.checkedFiles).toBe(1);
        // Feature should be derived from filename without extension
        expect(result.value.missingSpecs[0].expectedSpec).toBe('docs/changes/index/proposal.md');
      }
    });
  });

  describe('createCheckPhaseGateCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckPhaseGateCommand();
      expect(cmd.name()).toBe('check-phase-gate');
    });

    it('has correct description', () => {
      const cmd = createCheckPhaseGateCommand();
      expect(cmd.description()).toContain('spec');
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
      program.addCommand(createCheckPhaseGateCommand());
      return program;
    }

    it('exits with SUCCESS when phase gates disabled', async () => {
      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: { enabled: false },
      });

      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', '-c', configPath, 'check-phase-gate']);

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('outputs JSON when phase gates skipped and --json set', async () => {
      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: { enabled: false },
      });

      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--json',
        '-c',
        configPath,
        'check-phase-gate',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('exits with VALIDATION_FAILED when missing specs with error severity', async () => {
      mkdirp(path.join(tmpDir, 'src', 'payments'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'payments', 'charge.ts'), 'export {}');

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'error',
          mappings: [
            { implPattern: 'src/**/*.ts', specPattern: 'docs/changes/{feature}/proposal.md' },
          ],
        },
      });

      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', '-c', configPath, 'check-phase-gate']);

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('exits with SUCCESS when missing specs with warning severity', async () => {
      mkdirp(path.join(tmpDir, 'src', 'payments'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'payments', 'charge.ts'), 'export {}');

      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: {
          enabled: true,
          severity: 'warning',
          mappings: [
            { implPattern: 'src/**/*.ts', specPattern: 'docs/changes/{feature}/proposal.md' },
          ],
        },
      });

      const program = makeProgram();
      await safeParseAsync(program, ['node', 'test', '-c', configPath, 'check-phase-gate']);

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('exits with error when config is invalid', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '-c',
        '/nonexistent/config.json',
        'check-phase-gate',
      ]);

      expect(mockExit).toHaveBeenCalledWith(2);
    });

    it('outputs JSON error when config fails and --json is set', async () => {
      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--json',
        '-c',
        '/nonexistent/config.json',
        'check-phase-gate',
      ]);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('error'));
    });

    it('quiet mode suppresses skipped output', async () => {
      const configPath = writeConfig(tmpDir, {
        version: 1,
        phaseGates: { enabled: false },
      });

      const program = makeProgram();
      await safeParseAsync(program, [
        'node',
        'test',
        '--quiet',
        '-c',
        configPath,
        'check-phase-gate',
      ]);

      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });
});
