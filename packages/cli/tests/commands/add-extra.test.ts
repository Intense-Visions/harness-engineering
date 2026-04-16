import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runAdd } from '../../src/commands/add';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('add command — additional component types', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-add-extra-'));
    fs.writeFileSync(
      path.join(tempDir, 'harness.config.json'),
      JSON.stringify({ version: 1, name: 'test' })
    );
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('persona component', () => {
    it('creates persona yaml file', async () => {
      const result = await runAdd('persona', 'myAgent', { cwd: tempDir });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.created).toContain('agents/personas/myAgent.yaml');
      const personaPath = path.join(tempDir, 'agents', 'personas', 'myAgent.yaml');
      expect(fs.existsSync(personaPath)).toBe(true);
      const content = fs.readFileSync(personaPath, 'utf-8');
      expect(content).toContain('name: myAgent');
    });

    it('rejects duplicate persona', async () => {
      await runAdd('persona', 'dupAgent', { cwd: tempDir });
      const result = await runAdd('persona', 'dupAgent', { cwd: tempDir });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('already exists');
      }
    });
  });

  describe('skill component', () => {
    it('creates skill files (requires kebab-case name)', async () => {
      const result = await runAdd('skill', 'my-skill', { cwd: tempDir });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.created.some((f: string) => f.includes('my-skill/skill.yaml'))).toBe(
        true
      );
      expect(result.value.created.some((f: string) => f.includes('my-skill/SKILL.md'))).toBe(true);
    });
  });

  describe('doc component with custom config', () => {
    it('creates doc in configured docs directory', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'harness.config.json'),
        JSON.stringify({ version: 1, name: 'test', docsDir: './documentation' })
      );
      const result = await runAdd('doc', 'setup', {
        cwd: tempDir,
        configPath: path.join(tempDir, 'harness.config.json'),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(fs.existsSync(path.join(tempDir, 'documentation', 'setup.md'))).toBe(true);
    });

    it('rejects duplicate doc', async () => {
      await runAdd('doc', 'existing', { cwd: tempDir });
      const result = await runAdd('doc', 'existing', { cwd: tempDir });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('already exists');
      }
    });
  });

  describe('layer component idempotency', () => {
    it('does not re-create existing layer directory', async () => {
      await runAdd('layer', 'services', { cwd: tempDir });
      // Add again — should not error but may not re-add files
      const result = await runAdd('layer', 'services', { cwd: tempDir });
      expect(result.ok).toBe(true);
    });
  });

  describe('name validation', () => {
    it('rejects names with special characters', async () => {
      const result = await runAdd('module', 'bad@name', { cwd: tempDir });
      expect(result.ok).toBe(false);
    });

    it('accepts names with hyphens and underscores', async () => {
      const result = await runAdd('module', 'my-module_v2', { cwd: tempDir });
      expect(result.ok).toBe(true);
    });
  });
});
