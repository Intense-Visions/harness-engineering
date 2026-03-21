import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  });

  describe('createCheckPhaseGateCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckPhaseGateCommand();
      expect(cmd.name()).toBe('check-phase-gate');
    });
  });
});
