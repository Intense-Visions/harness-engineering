import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runInit, createInitCommand } from '../../src/commands/init';

describe('runInit — additional coverage', () => {
  it('returns error when framework language conflicts', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-conflict-'));
    try {
      // nextjs is a typescript framework, specifying python should conflict
      const result = await runInit({
        cwd: tmpDir,
        name: 'test-project',
        framework: 'nextjs',
        language: 'python',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('typescript');
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('scaffolds a go project with language flag', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-go-'));
    try {
      const result = await runInit({ cwd: tmpDir, name: 'go-project', language: 'go' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
      const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
      expect(config.template.language).toBe('go');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('scaffolds a rust project with language flag', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-rust-'));
    try {
      const result = await runInit({ cwd: tmpDir, name: 'rust-project', language: 'rust' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('force overwrites existing project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-force-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), '{}');
      const result = await runInit({ cwd: tmpDir, name: 'test-project', force: true });
      expect(result.ok).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates a .gitignore file during init', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-gitignore-'));
    try {
      const result = await runInit({ cwd: tmpDir, name: 'test-project' });
      expect(result.ok).toBe(true);
      const gitignorePath = path.join(tmpDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(true);
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      // Should contain standard Node ignores
      expect(content).toContain('node_modules');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('createInitCommand', () => {
  it('creates command with correct name', () => {
    const cmd = createInitCommand();
    expect(cmd.name()).toBe('init');
  });

  it('has expected options', () => {
    const cmd = createInitCommand();
    const optionNames = cmd.options.map((o) => o.long);
    expect(optionNames).toContain('--name');
    expect(optionNames).toContain('--level');
    expect(optionNames).toContain('--framework');
    expect(optionNames).toContain('--language');
    expect(optionNames).toContain('--force');
  });
});
