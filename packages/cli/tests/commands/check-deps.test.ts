import { describe, it, expect } from 'vitest';
import { createCheckDepsCommand, runCheckDeps } from '../../src/commands/check-deps';
import * as path from 'path';

describe('check-deps command', () => {
  const validProjectPath = path.join(__dirname, '../fixtures/valid-project');

  describe('runCheckDeps', () => {
    it('returns success when no layers configured', async () => {
      const result = await runCheckDeps({
        cwd: validProjectPath,
        configPath: path.join(validProjectPath, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.valid).toBe(true);
      }
    });
  });

  describe('createCheckDepsCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckDepsCommand();
      expect(cmd.name()).toBe('check-deps');
    });
  });
});
