import { describe, it, expect } from 'vitest';
import YAML from 'yaml';
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

  it('sets up pnpm before setup-node in the TS setup (matches project ci.yml)', () => {
    const result = generateCIConfig({ platform: 'github', language: 'typescript' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.value.content;
    const pnpmIdx = c.indexOf('pnpm/action-setup@v4');
    const nodeIdx = c.indexOf('actions/setup-node@v4');
    expect(pnpmIdx).toBeGreaterThan(-1);
    expect(nodeIdx).toBeGreaterThan(-1);
    expect(pnpmIdx).toBeLessThan(nodeIdx);
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

  it('installs the harness CLI immediately before the gate (language-independent)', () => {
    const r = generateCIConfig({ platform: 'github', language: 'typescript' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.value.content;
    expect(c).toContain('npm install -g @harness-engineering/cli');
    const installIdx = c.indexOf('npm install -g @harness-engineering/cli');
    const gateIdx = c.indexOf('harness ci check --json');
    expect(installIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(installIdx);
  });

  it('installs the harness CLI for a non-Node language (python)', () => {
    const r = generateCIConfig({ platform: 'github', language: 'python' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.value.content;
    expect(c).toContain('npm install -g @harness-engineering/cli');
    const installIdx = c.indexOf('npm install -g @harness-engineering/cli');
    const gateIdx = c.indexOf('harness ci check --json');
    expect(gateIdx).toBeGreaterThan(installIdx);
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

describe('generateCIConfig — trunk concurrency (#2050)', () => {
  // Regression: #2050. The adopter-facing GitHub template emitted a per-ref group
  // (`harness-${{ github.ref }}`) with an unconditional `cancel-in-progress: true`.
  // The template triggers on BOTH push-to-main and pull_request, and on a push
  // `github.ref` is `refs/heads/main` for every commit — so every trunk push shared
  // one concurrency bucket and each new merge cancelled the previous commit's
  // still-running verification. The run concluded `cancelled`, not `failure`, so the
  // adopter's board stayed green while the commit went unverified.
  //
  // Same defect class as #1865 (this repo's hand-written workflows) and #1867 /
  // PR #2049 (the persona generator). These two tests mirror the pair added there.
  it('does not emit a cancelling concurrency group for the push-to-trunk path', () => {
    const result = generateCIConfig({ platform: 'github' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const workflow = YAML.parse(result.value.content) as {
      on: Record<string, unknown>;
      concurrency: { group: string; 'cancel-in-progress': unknown };
    };

    // Both triggers are present — the exact pair that produced the defect.
    expect(workflow.on.push).toBeDefined();
    expect(workflow.on.pull_request).toBeDefined();

    // `cancel-in-progress` must be conditional on the event, never a bare `true`.
    // A literal true here is the defect: it cancels main's own verification.
    const cancel = workflow.concurrency['cancel-in-progress'];
    expect(cancel).not.toBe(true);
    expect(cancel).toBe("${{ github.event_name == 'pull_request' }}");

    // The group must key on github.sha (per-commit) off the PR path, so two main
    // commits never share a bucket. A bare `github.ref` group is the defect.
    const group = workflow.concurrency.group;
    expect(group).toBe(
      "harness-${{ github.event_name == 'pull_request' && github.ref || github.sha }}"
    );
    expect(group).toContain('github.sha');
    expect(group).not.toBe('harness-${{ github.ref }}');
  });

  it('still cancels superseded runs on the pull_request path', () => {
    // The fix must not disable PR supersession — that would be a runner-spend
    // regression, and per-ref cancellation is correct behaviour for a PR.
    const result = generateCIConfig({ platform: 'github' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const workflow = YAML.parse(result.value.content) as {
      concurrency: { group: string; 'cancel-in-progress': unknown };
    };
    // Both halves of the expression are present, so a pull_request event resolves to
    // the per-ref group with cancellation ON.
    expect(workflow.concurrency.group).toContain(
      "github.event_name == 'pull_request' && github.ref"
    );
    expect(workflow.concurrency['cancel-in-progress']).toBe(
      "${{ github.event_name == 'pull_request' }}"
    );
  });

  it('applies the trunk-safe concurrency shape for every language variant', () => {
    // The concurrency block lives in the shared template, not the per-language step
    // mapping — every language variant must carry the fix.
    for (const language of ['typescript', 'python', 'go', 'rust', 'java']) {
      const result = generateCIConfig({ platform: 'github', language });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const workflow = YAML.parse(result.value.content) as {
        concurrency: { group: string; 'cancel-in-progress': unknown };
      };
      expect(workflow.concurrency.group).toContain('github.sha');
      expect(workflow.concurrency['cancel-in-progress']).not.toBe(true);
    }
  });
});
