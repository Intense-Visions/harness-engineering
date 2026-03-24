import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  });
});
