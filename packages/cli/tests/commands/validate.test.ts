import { describe, it, expect } from 'vitest';
import { createValidateCommand, runValidate } from '../../src/commands/validate';
import * as path from 'path';

describe('validate command', () => {
  const validProjectPath = path.join(__dirname, '../fixtures/valid-project');

  describe('runValidate', () => {
    it('returns success for valid project', async () => {
      const result = await runValidate({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
      }
    });

    it('checks AGENTS.md exists', async () => {
      const result = await runValidate({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.checks.agentsMap).toBe(true);
      }
    });
  });

  describe('createValidateCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createValidateCommand();
      expect(cmd.name()).toBe('validate');
    });
  });
});
