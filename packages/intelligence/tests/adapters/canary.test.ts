import { describe, it, expect } from 'vitest';
import {
  createCanaryAdapter,
  resolveTestCommand,
  canaryFrameworkInfoSchema,
  type CanaryExec,
} from '../../src/adapters/canary.js';

// Inject a fake exec seam — no node:child_process mocking. The adapter's
// degrade-classification still runs, since we resolve/reject the raw seam exactly
// as the real execFile would.
function execResolves(stdout: string): CanaryExec {
  return () => Promise.resolve({ stdout });
}

function execRejects(err: { code?: number | string; stderr?: string }): CanaryExec {
  return () => Promise.reject(Object.assign(new Error('exec'), err));
}

describe('CanaryAdapter.probe', () => {
  it('returns available with version on success', async () => {
    const probe = await createCanaryAdapter(execResolves('canary 5.4.0\n')).probe();
    expect(probe.status).toBe('available');
    expect(probe.version).toBe('5.4.0');
  });

  it('returns available even when stdout has no parseable version', async () => {
    const probe = await createCanaryAdapter(execResolves('canary ok\n')).probe();
    expect(probe.status).toBe('available');
    expect(probe.version).toBeUndefined();
  });

  it('degrades not-installed when binary cannot be spawned (ENOENT)', async () => {
    const probe = await createCanaryAdapter(execRejects({ code: 'ENOENT' })).probe();
    expect(probe).toEqual({ status: 'degraded', reason: 'not-installed' });
  });

  it('degrades binary-missing when launcher exits 1 with "canary binary not found"', async () => {
    const probe = await createCanaryAdapter(
      execRejects({ code: 1, stderr: 'canary binary not found' })
    ).probe();
    expect(probe).toEqual({ status: 'degraded', reason: 'binary-missing' });
  });

  it('degrades exec-failed on other non-zero exit', async () => {
    const probe = await createCanaryAdapter(execRejects({ code: 2, stderr: 'boom' })).probe();
    expect(probe).toEqual({ status: 'degraded', reason: 'exec-failed' });
  });

  it('degrades bad-output when a zero-exit run produces empty stdout', async () => {
    const probe = await createCanaryAdapter(execResolves('   \n')).probe();
    expect(probe).toEqual({ status: 'degraded', reason: 'bad-output' });
  });
});

describe('CanaryAdapter.recommendFramework', () => {
  // Captured from the Phase 0 spike: `canary recommend "<prompt>" --json`.
  const RECOMMEND_FIXTURE = {
    status: 'success',
    test_type: 'e2e_ui',
    framework: 'playwright',
    file_extension: 'spec.ts',
    reasoning: ['UI flow detected'],
    alternatives: ['cypress'],
  };

  it('returns a validated FrameworkRecommendation on success', async () => {
    const adapter = createCanaryAdapter(execResolves(JSON.stringify(RECOMMEND_FIXTURE)));
    const rec = await adapter.recommendFramework('login flow');
    expect(rec.framework).toBe('playwright');
    expect(rec.test_type).toBe('e2e_ui');
    expect(rec.reasoning).toEqual(['UI flow detected']);
  });

  it('returns a degraded sentinel on bad JSON (no throw)', async () => {
    const rec = await createCanaryAdapter(execResolves('not json')).recommendFramework('x');
    expect(rec.status).toBe('degraded');
    expect(rec.alternatives).toEqual([]);
  });

  it('returns a degraded sentinel on schema mismatch (no throw)', async () => {
    const rec = await createCanaryAdapter(
      execResolves(JSON.stringify({ framework: 123 }))
    ).recommendFramework('x');
    expect(rec.status).toBe('degraded');
  });

  it('returns a degraded sentinel when canary is absent', async () => {
    const rec = await createCanaryAdapter(execRejects({ code: 'ENOENT' })).recommendFramework('x');
    expect(rec.status).toBe('degraded');
  });

  it('returns a fresh sentinel each call (no shared mutable state)', async () => {
    const adapter = createCanaryAdapter(execResolves('not json'));
    const a = await adapter.recommendFramework('x');
    a.reasoning.push('mutated');
    const b = await adapter.recommendFramework('y');
    expect(b.reasoning).toEqual([]); // not corrupted by the mutation above
  });
});

describe('CanaryAdapter.reviewTest', () => {
  // Captured from the Phase 0 spike: `canary review-test <path> --json`.
  const REVIEW_FIXTURE = [
    {
      file: 'tests/login.spec.ts',
      line: 12,
      rule: 'LINT-005',
      severity: 'warning',
      message: 'Hardcoded sleep',
      suggestion: 'Use a wait condition',
    },
  ];

  it('returns validated CanaryFinding[] on success', async () => {
    const findings = await createCanaryAdapter(
      execResolves(JSON.stringify(REVIEW_FIXTURE))
    ).reviewTest('tests/login.spec.ts');
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('LINT-005');
    expect(findings[0].severity).toBe('warning');
  });

  it('returns [] on bad JSON (no throw)', async () => {
    expect(await createCanaryAdapter(execResolves('not json')).reviewTest('x')).toEqual([]);
  });

  it('returns [] on schema mismatch (no throw)', async () => {
    expect(
      await createCanaryAdapter(execResolves(JSON.stringify([{ rule: 1 }]))).reviewTest('x')
    ).toEqual([]);
  });

  it('returns [] when canary is degraded/absent', async () => {
    expect(await createCanaryAdapter(execRejects({ code: 'ENOENT' })).reviewTest('x')).toEqual([]);
  });

  it('preserves findings with an unmodeled severity instead of dropping the whole array', async () => {
    const mixed = [
      { ...REVIEW_FIXTURE[0], severity: 'info' },
      { ...REVIEW_FIXTURE[0], severity: 'critical' }, // not in the spike's observed set
    ];
    const findings = await createCanaryAdapter(execResolves(JSON.stringify(mixed))).reviewTest('x');
    expect(findings).toHaveLength(2);
    expect(findings[1].severity).toBe('critical');
  });
});

describe('resolveTestCommand (pure)', () => {
  // Build inputs through the schema so permissive defaults fill in.
  const fw = (over: Record<string, unknown>) =>
    canaryFrameworkInfoSchema.parse({ name: 'x', ...over });

  it('fills the {file} placeholder', () => {
    const playwright = fw({ execution_command: 'npx --yes playwright test {file}' });
    expect(resolveTestCommand(playwright, 'login.spec.ts')).toBe(
      'npx --yes playwright test login.spec.ts'
    );
  });

  it('appends joined ci_flags only under ci', () => {
    const playwright = fw({
      execution_command: 'npx --yes playwright test {file}',
      ci_flags: ['--reporter=list'],
    });
    expect(resolveTestCommand(playwright, 'a.spec.ts', { ci: true })).toBe(
      'npx --yes playwright test a.spec.ts --reporter=list'
    );
    expect(resolveTestCommand(playwright, 'a.spec.ts')).toBe(
      'npx --yes playwright test a.spec.ts'
    );
  });

  it('returns null when execution_command is null (catalog-tier framework)', () => {
    expect(resolveTestCommand(fw({ execution_command: null }), 'a.ts')).toBeNull();
  });

  it('returns null for {target}-only security scanners', () => {
    const semgrep = fw({ execution_command: 'semgrep --config auto {target}' });
    expect(resolveTestCommand(semgrep, 'rules.yaml')).toBeNull();
  });

  it('returns null for whole-suite commands with no {file} placeholder', () => {
    const stryker = fw({ execution_command: 'npx --yes stryker run' });
    expect(resolveTestCommand(stryker, 'a.ts')).toBeNull();
  });

  it('applies permissive schema defaults for a bare entry', () => {
    const parsed = canaryFrameworkInfoSchema.parse({ name: 'bare', category: 'ignored' });
    expect(parsed).toEqual({
      name: 'bare',
      languages: [],
      file_extensions: [],
      execution_command: null,
      ci_flags: [],
      status: '',
      tier: '',
    });
  });
});

describe('CanaryAdapter.listFrameworks', () => {
  // Captured from the live CLI (`canary frameworks --json`): the detail objects live
  // directly under `frameworks` (no `details[]` key); each carries extra ignored keys.
  const FRAMEWORKS_FIXTURE = {
    frameworks: [
      {
        name: 'playwright',
        category: 'e2e_ui',
        categories: ['e2e_ui', 'api'],
        languages: ['typescript', 'javascript'],
        file_extensions: ['spec.ts', 'spec.js', 'test.ts', 'test.js'],
        execution_command: 'npx --yes playwright test {file}',
        ci_flags: ['--reporter=list'],
        status: 'preferred',
        capabilities: { scaffold: true, execute: true, tier: 'full' },
        tier: 'full',
      },
      {
        name: 'opentelemetry',
        file_extensions: [],
        execution_command: null,
        ci_flags: [],
        status: 'supported',
        tier: 'catalog',
      },
    ],
  };

  it('parses the top-level frameworks array on success', async () => {
    const list = await createCanaryAdapter(
      execResolves(JSON.stringify(FRAMEWORKS_FIXTURE))
    ).listFrameworks();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('playwright');
    expect(list[0].execution_command).toBe('npx --yes playwright test {file}');
    expect(list[1].execution_command).toBeNull(); // catalog-tier preserved, not dropped
  });

  it('returns [] on bad JSON (no throw)', async () => {
    expect(await createCanaryAdapter(execResolves('not json')).listFrameworks()).toEqual([]);
  });

  it('returns [] on schema mismatch (no throw)', async () => {
    expect(
      await createCanaryAdapter(execResolves(JSON.stringify({ frameworks: [{ name: 123 }] }))).listFrameworks()
    ).toEqual([]);
  });

  it('returns [] when canary is not installed (ENOENT)', async () => {
    expect(await createCanaryAdapter(execRejects({ code: 'ENOENT' })).listFrameworks()).toEqual([]);
  });

  it('returns [] when the native binary is missing', async () => {
    expect(
      await createCanaryAdapter(
        execRejects({ code: 1, stderr: 'canary binary not found' })
      ).listFrameworks()
    ).toEqual([]);
  });

  it('returns [] on other non-zero exit', async () => {
    expect(
      await createCanaryAdapter(execRejects({ code: 2, stderr: 'boom' })).listFrameworks()
    ).toEqual([]);
  });
});
