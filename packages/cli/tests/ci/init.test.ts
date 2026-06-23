import { describe, it, expect } from 'vitest';
import { generateCIConfig, createInitCommand } from '../../src/commands/ci/init';

describe('generateCIConfig', () => {
  it('generates GitHub Actions workflow content', () => {
    const result = generateCIConfig({ platform: 'github' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.filename).toBe('.github/workflows/ci.yml');
    expect(result.value.content).toContain('harness ci check');
    expect(result.value.content).toContain('on:');
  });

  it('generates GitLab CI config', () => {
    const result = generateCIConfig({ platform: 'gitlab' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.filename).toBe('.gitlab-ci-harness.yml');
    expect(result.value.content).toContain('harness ci check');
  });

  it('generates generic shell script', () => {
    const result = generateCIConfig({ platform: 'generic' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.filename).toBe('harness-ci.sh');
    expect(result.value.content).toContain('#!/usr/bin/env bash');
    expect(result.value.content).toContain('harness ci check');
  });

  it('includes skip flags when checks are limited', () => {
    const result = generateCIConfig({
      platform: 'github',
      checks: ['validate', 'deps'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toContain('--skip');
  });
});

describe('generateCIConfig — language', () => {
  it('emits TypeScript/default steps for github', () => {
    const result = generateCIConfig({ platform: 'github', language: 'typescript' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toContain('pnpm i --frozen-lockfile');
    expect(result.value.content).toContain('pnpm build');
    expect(result.value.content).toContain('pnpm lint');
    expect(result.value.content).toContain('pnpm test');
  });

  it('emits a single fail-fast ci job with checkout, setup, install, build, lint, test, gate', () => {
    const r = generateCIConfig({ platform: 'github', language: 'typescript' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.value.content;
    expect(c).toContain('actions/checkout@v4');
    expect(c).toMatch(/jobs:\s*\n\s*ci:/);
    expect(c).toContain('pnpm i --frozen-lockfile');
    expect(c).toContain('pnpm build');
    expect(c).toContain('harness ci check --json');
    // gate is the last step
    expect(c.trimEnd().endsWith('run: harness ci check --json')).toBe(true);
  });

  it('excludes any baseline-refresh or git push step', () => {
    const r = generateCIConfig({ platform: 'github' });
    if (!r.ok) return;
    expect(r.value.content).not.toMatch(/git push/);
    expect(r.value.content).not.toMatch(/refresh-baselines|baseline.*update/i);
  });

  it('python project emits pytest and ruff', () => {
    const r = generateCIConfig({ platform: 'github', language: 'python' });
    if (!r.ok) return;
    expect(r.value.content).toContain('setup-python');
    expect(r.value.content).toContain('ruff check .');
    expect(r.value.content).toContain('pytest');
  });

  it('go project emits go test and golangci-lint', () => {
    const r = generateCIConfig({ platform: 'github', language: 'go' });
    if (!r.ok) return;
    expect(r.value.content).toContain('go build ./...');
    expect(r.value.content).toContain('golangci-lint run');
    expect(r.value.content).toContain('go test ./...');
  });

  it('rust project emits cargo build/clippy/test', () => {
    const r = generateCIConfig({ platform: 'github', language: 'rust' });
    if (!r.ok) return;
    expect(r.value.content).toContain('cargo build');
    expect(r.value.content).toContain('cargo clippy');
    expect(r.value.content).toContain('cargo test');
  });

  it('java project emits mvn verify', () => {
    const r = generateCIConfig({ platform: 'github', language: 'java' });
    if (!r.ok) return;
    expect(r.value.content).toContain('setup-java');
    expect(r.value.content).toContain('mvn -B verify');
  });

  it('unknown language falls back to TypeScript defaults', () => {
    const r = generateCIConfig({ platform: 'github', language: 'cobol' });
    if (!r.ok) return;
    expect(r.value.content).toContain('pnpm test');
  });

  it('ci init command accepts --language', () => {
    const cmd = createInitCommand();
    const opt = cmd.options.find((o) => o.long === '--language');
    expect(opt).toBeDefined();
  });

  it('language option does not affect gitlab/generic output', () => {
    const g1 = generateCIConfig({ platform: 'gitlab' });
    const g2 = generateCIConfig({ platform: 'gitlab', language: 'python' });
    if (!g1.ok || !g2.ok) return;
    expect(g2.value.content).toBe(g1.value.content);
    const s1 = generateCIConfig({ platform: 'generic' });
    const s2 = generateCIConfig({ platform: 'generic', language: 'go' });
    if (!s1.ok || !s2.ok) return;
    expect(s2.value.content).toBe(s1.value.content);
  });
});
