// packages/cli/tests/commands/fix-drift.test.ts
import { describe, it, expect } from 'vitest';
import { createFixDriftCommand, runFixDrift } from '../../src/commands/fix-drift';
import * as path from 'path';

describe('fix-drift command', () => {
  const validProjectPath = path.join(__dirname, '../fixtures/valid-project');

  describe('runFixDrift', () => {
    it('runs in dry-run mode by default', async () => {
      const result = await runFixDrift({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dryRun).toBe(true);
      }
    });

    it('respects dryRun=false option', async () => {
      const result = await runFixDrift({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
        dryRun: false,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dryRun).toBe(false);
      }
    });

    it('returns fixes and suggestions arrays', async () => {
      const result = await runFixDrift({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveProperty('fixes');
        expect(result.value).toHaveProperty('suggestions');
        expect(Array.isArray(result.value.fixes)).toBe(true);
        expect(Array.isArray(result.value.suggestions)).toBe(true);
      }
    });
  });

  describe('createFixDriftCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createFixDriftCommand();
      expect(cmd.name()).toBe('fix-drift');
    });

    it('has correct description', () => {
      const cmd = createFixDriftCommand();
      expect(cmd.description()).toContain('entropy');
    });

    it('has no-dry-run option', () => {
      const cmd = createFixDriftCommand();
      const dryRunOption = cmd.options.find((opt) => opt.long === '--no-dry-run');
      expect(dryRunOption).toBeDefined();
    });
  });
});
