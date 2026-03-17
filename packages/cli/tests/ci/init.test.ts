import { describe, it, expect } from 'vitest';
import { generateCIConfig } from '../../src/commands/ci/init';

describe('generateCIConfig', () => {
  it('generates GitHub Actions workflow content', () => {
    const result = generateCIConfig({ platform: 'github' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.filename).toBe('.github/workflows/harness.yml');
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
