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

  it('ships a default .agnix.toml for harness validate --agent-configs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const result = await runInit({ cwd: tmpDir, name: 'test-project' });
    expect(result.ok).toBe(true);
    const agnixPath = path.join(tmpDir, '.agnix.toml');
    expect(fs.existsSync(agnixPath)).toBe(true);
    const contents = fs.readFileSync(agnixPath, 'utf-8');
    expect(contents).toContain('target = "claude-code"');
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
    const result = await runInit({
      cwd: tmpDir,
      name: 'test-project',
      level: 'basic',
      framework: 'nextjs',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fs.existsSync(path.join(tmpDir, 'next.config.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'src', 'app', 'page.tsx'))).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.next).toBeDefined();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns detected framework when no --framework or --language specified on existing project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-detect-'));
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'fastapi==0.100.0\nuvicorn\n');
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[project]\ndependencies = ["fastapi"]\n'
    );

    const result = await runInit({ cwd: tmpDir, name: 'detect-test' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.detectedFrameworks).toBeDefined();
    expect(result.value.detectedFrameworks!.length).toBeGreaterThan(0);
    expect(result.value.detectedFrameworks![0].framework).toBe('fastapi');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not run detection when --framework is specified', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const result = await runInit({ cwd: tmpDir, name: 'test', language: 'python' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.detectedFrameworks).toBeUndefined();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('persists tooling metadata in harness.config.json for JS/TS framework overlay', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const result = await runInit({
      cwd: tmpDir,
      name: 'test',
      level: 'basic',
      framework: 'react-vite',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
    expect(config.template.framework).toBe('react-vite');
    expect(config.tooling).toBeDefined();
    expect(config.tooling.linter).toBe('eslint');
    expect(config.tooling.buildTool).toBe('vite');
    expect(config.tooling.testRunner).toBe('vitest');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('persists tooling for non-JS framework in harness.config.json', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const result = await runInit({
      cwd: tmpDir,
      name: 'test',
      framework: 'fastapi',
      language: 'python',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
    expect(config.template.framework).toBe('fastapi');
    expect(config.template.language).toBe('python');
    expect(config.tooling.linter).toBe('ruff');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not include level:null in config for non-JS languages', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const result = await runInit({ cwd: tmpDir, name: 'test', language: 'go' });
    expect(result.ok).toBe(true);
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'harness.config.json'), 'utf-8'));
    expect(config.template.level).toBeUndefined();
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('appends framework section to existing AGENTS.md', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Existing Project\n\nSome content.\n');

    const result = await runInit({
      cwd: tmpDir,
      name: 'test',
      level: 'basic',
      framework: 'express',
      force: true,
    });
    expect(result.ok).toBe(true);

    const agents = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('## Express Conventions');
    expect(agents).toContain('<!-- harness:framework-conventions:express -->');

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not duplicate framework section on re-init', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const existingContent =
      '# Project\n\n<!-- harness:framework-conventions:express -->\n## Express Conventions\nstuff\n<!-- /harness:framework-conventions:express -->\n';
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), existingContent);

    const result = await runInit({
      cwd: tmpDir,
      name: 'test',
      level: 'basic',
      framework: 'express',
      force: true,
    });
    expect(result.ok).toBe(true);

    const agents = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    const markerCount = (agents.match(/<!-- harness:framework-conventions:express -->/g) || [])
      .length;
    expect(markerCount).toBe(1);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('scaffolds a sharded roadmap (_meta.md, no monolith) for a new project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const result = await runInit({ cwd: tmpDir, name: 'demo' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const metaPath = path.join(tmpDir, 'docs', 'roadmap.d', '_meta.md');
    expect(fs.existsSync(metaPath)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'docs', 'roadmap.md'))).toBe(false);
    // _meta.md carries the empty-roadmap frontmatter (no milestones yet).
    const meta = fs.readFileSync(metaPath, 'utf-8');
    expect(meta).toContain('project: "demo"');
    expect(meta).toContain('milestones:');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not scaffold a roadmap for an existing project', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    // A project marker makes this an existing project (no scaffold).
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"existing"}\n');
    const result = await runInit({ cwd: tmpDir, name: 'existing' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fs.existsSync(path.join(tmpDir, 'docs', 'roadmap.d', '_meta.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'docs', 'roadmap.md'))).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not orphan a populated aggregate behind empty shards on --force', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    // A populated aggregate already exists in an initialized project.
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    const aggregate = '# Roadmap\n\n## Current Work\n\n- **Thing** — status: planned\n';
    fs.writeFileSync(path.join(tmpDir, 'docs', 'roadmap.md'), aggregate);
    fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), '{}');

    const result = await runInit({ cwd: tmpDir, name: 'existing', force: true });
    expect(result.ok).toBe(true);
    // No empty shards scaffolded over the populated aggregate.
    expect(fs.existsSync(path.join(tmpDir, 'docs', 'roadmap.d'))).toBe(false);
    // The populated aggregate is untouched (not clobbered).
    expect(fs.readFileSync(path.join(tmpDir, 'docs', 'roadmap.md'), 'utf-8')).toBe(aggregate);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not re-scaffold when a shard directory already exists on --force', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-init-'));
    const shardDir = path.join(tmpDir, 'docs', 'roadmap.d');
    fs.mkdirSync(shardDir, { recursive: true });
    const existingMeta = '---\nproject: "kept"\n---\n';
    fs.writeFileSync(path.join(shardDir, '_meta.md'), existingMeta);
    fs.writeFileSync(path.join(tmpDir, 'harness.config.json'), '{}');

    const result = await runInit({ cwd: tmpDir, name: 'kept', force: true });
    expect(result.ok).toBe(true);
    // The existing shard meta is preserved, not overwritten with empty scaffold.
    expect(fs.readFileSync(path.join(shardDir, '_meta.md'), 'utf-8')).toBe(existingMeta);
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
