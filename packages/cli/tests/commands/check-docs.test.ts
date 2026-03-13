import { describe, it, expect } from 'vitest';
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
  });

  describe('createCheckDocsCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createCheckDocsCommand();
      expect(cmd.name()).toBe('check-docs');
    });
  });
});
