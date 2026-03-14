import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runInit } from '../../src/commands/init';

describe('runInit', () => {
  it('scaffolds a basic project by default', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const result = await runInit({ cwd: tmpDir, name: 'test-project' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fs.existsSync(path.join(tmpDir, 'harness.config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'package.json'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('scaffolds an intermediate project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const result = await runInit({ cwd: tmpDir, name: 'test-project', level: 'intermediate' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fs.existsSync(path.join(tmpDir, 'eslint.config.mjs'))).toBe(true);
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
    expect(config.template.level).toBe('intermediate');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('scaffolds with nextjs overlay', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const result = await runInit({ cwd: tmpDir, name: 'test-project', level: 'basic', framework: 'nextjs' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fs.existsSync(path.join(tmpDir, 'next.config.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'src', 'app', 'page.tsx'))).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.next).toBeDefined();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('rejects already initialized project without --force', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), '{}');
    const result = await runInit({ cwd: tmpDir, name: 'test-project' });
    expect(result.ok).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
