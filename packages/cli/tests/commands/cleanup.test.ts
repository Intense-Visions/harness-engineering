// packages/cli/tests/commands/cleanup.test.ts
import { describe, it, expect } from 'vitest';
import { createCleanupCommand, runCleanup } from '../../src/commands/cleanup';
import * as path from 'path';

describe('cleanup command', () => {
  const validProjectPath = path.join(__dirname, '../fixtures/valid-project');

  describe('runCleanup', () => {
    it('returns entropy report', async () => {
      const result = await runCleanup({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveProperty('driftIssues');
        expect(result.value).toHaveProperty('deadCode');
      }
    });

    it('can filter by type', async () => {
      const result = await runCleanup({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
        type: 'drift',
      });
      expect(result.ok).toBe(true);
    });

    it('returns pattern violations when type is patterns', async () => {
      const result = await runCleanup({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
        type: 'patterns',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveProperty('patternViolations');
      }
    });

    it('returns all issues when type is all', async () => {
      const result = await runCleanup({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
        type: 'all',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveProperty('driftIssues');
        expect(result.value).toHaveProperty('deadCode');
        expect(result.value).toHaveProperty('patternViolations');
        expect(result.value).toHaveProperty('totalIssues');
        expect(typeof result.value.totalIssues).toBe('number');
      }
    });
  });

  describe('createCleanupCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCleanupCommand();
      expect(cmd.name()).toBe('cleanup');
    });

    it('has type option', () => {
      const cmd = createCleanupCommand();
      const typeOption = cmd.options.find((opt) => opt.long === '--type');
      expect(typeOption).toBeDefined();
    });

    it('has correct description', () => {
      const cmd = createCleanupCommand();
      expect(cmd.description()).toContain('entropy');
    });
  });
});
