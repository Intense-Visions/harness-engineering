// packages/cli/tests/commands/add.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAddCommand, runAdd } from '../../src/commands/add';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('add command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    // Create basic structure
    fs.writeFileSync(
      path.join(tempDir, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'test' })
    );
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('runAdd', () => {
    it('creates layer directory structure', async () => {
      const result = await runAdd('layer', 'services', { cwd: tempDir });
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'src/services'))).toBe(true);
    });

    it('creates module file', async () => {
      const result = await runAdd('module', 'myModule', { cwd: tempDir });
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'src/myModule.ts'))).toBe(true);
    });

    it('creates doc file', async () => {
      const result = await runAdd('doc', 'api-guide', { cwd: tempDir });
      expect(result.ok).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'docs/api-guide.md'))).toBe(true);
    });

    it('rejects duplicate module', async () => {
      await runAdd('module', 'existing', { cwd: tempDir });
      const result = await runAdd('module', 'existing', { cwd: tempDir });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('already exists');
      }
    });

    it('rejects invalid component type', async () => {
      const result = await runAdd('invalid' as any, 'test', { cwd: tempDir });
      expect(result.ok).toBe(false);
    });

    it('rejects invalid names', async () => {
      const result = await runAdd('layer', '../escape', { cwd: tempDir });
      expect(result.ok).toBe(false);
    });

    it('rejects empty name', async () => {
      const result = await runAdd('layer', '', { cwd: tempDir });
      expect(result.ok).toBe(false);
    });

    it('rejects name starting with number', async () => {
      const result = await runAdd('layer', '123test', { cwd: tempDir });
      expect(result.ok).toBe(false);
    });
  });

  describe('createAddCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createAddCommand();
      expect(cmd.name()).toBe('add');
    });
  });
});
