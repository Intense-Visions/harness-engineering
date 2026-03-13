import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createInitCommand, runInit } from '../../src/commands/init';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('init command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('runInit', () => {
    it('creates harness.config.json', async () => {
      const result = await runInit({
        cwd: tempDir,
        name: 'test-project',
      });
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'harness.config.json'))).toBe(true);
    });

    it('creates AGENTS.md', async () => {
      const result = await runInit({
        cwd: tempDir,
        name: 'test-project',
      });
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'AGENTS.md'))).toBe(true);
    });

    it('does not overwrite existing config', async () => {
      fs.writeFileSync(path.join(tempDir, 'harness.config.json'), '{}');
      const result = await runInit({
        cwd: tempDir,
        name: 'test-project',
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('createInitCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createInitCommand();
      expect(cmd.name()).toBe('init');
    });
  });
});
