import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// #2589: the health snapshot called detect_entropy in DETAILED mode, which
// overflows (`Invalid string length`) on large repos, and its parseToolResult
// turned any failed tool result into `{}`, so the failure was recorded as
// "zero entropy" and every assess check fell back to `passed: true`. A check
// that did not run must be `passed: false` with `measured: false`, and must
// raise no signal.

type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

const json = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
});
const toolError = (text: string): ToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

const CLEAN_ASSESS = json({
  healthy: true,
  checks: ['deps', 'entropy', 'security', 'perf', 'docs', 'lint'].map((name) => ({
    name,
    passed: true,
    issueCount: 0,
  })),
});
const CLEAN_DEPS = json({ valid: true, violations: [] });
const CLEAN_SECURITY = json({ findings: [] });
/** The shape `detect_entropy` returns in summary mode for a clean project. */
const CLEAN_ENTROPY_SUMMARY = json({
  mode: 'summary',
  totalIssues: 0,
  categories: {
    drift: { issueCount: 0, topIssues: [] },
    deadCode: { issueCount: 0, topIssues: [], deadExports: 0, deadFiles: 0, unusedImports: 0 },
    patterns: { issueCount: 0, topIssues: [] },
  },
});

interface Stubs {
  assess?: () => Promise<ToolResult>;
  deps?: () => Promise<ToolResult>;
  entropy?: (input: unknown) => Promise<ToolResult>;
  security?: () => Promise<ToolResult>;
}

/** Stub the four tool handlers; `entropy: undefined` keeps the REAL detect_entropy. */
function stubTools(stubs: Stubs, keepRealEntropy = false) {
  const entropy = vi.fn(stubs.entropy ?? (async () => CLEAN_ENTROPY_SUMMARY));
  vi.doMock('../../src/mcp/tools/assess-project', () => ({
    handleAssessProject: vi.fn(stubs.assess ?? (async () => CLEAN_ASSESS)),
  }));
  vi.doMock('../../src/mcp/tools/architecture', () => ({
    handleCheckDependencies: vi.fn(stubs.deps ?? (async () => CLEAN_DEPS)),
  }));
  if (!keepRealEntropy) {
    vi.doMock('../../src/mcp/tools/entropy', () => ({ handleDetectEntropy: entropy }));
  }
  vi.doMock('../../src/mcp/tools/security', () => ({
    handleRunSecurityScan: vi.fn(stubs.security ?? (async () => CLEAN_SECURITY)),
  }));
  return { entropy };
}

async function runChecks() {
  const mod = await import('../../src/skill/health-snapshot');
  const checks = await mod.runHealthChecks('/tmp/test-project');
  return { checks, signals: mod.deriveSignals(checks, mod.ZERO_METRICS) };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../../src/mcp/tools/assess-project');
  vi.doUnmock('../../src/mcp/tools/architecture');
  vi.doUnmock('../../src/mcp/tools/entropy');
  vi.doUnmock('../../src/mcp/tools/security');
});

describe('health snapshot entropy is read from detect_entropy summary mode (#2589)', () => {
  it('asks detect_entropy for the summary, never the overflowing detailed report', async () => {
    const { entropy } = stubTools({});
    await runChecks();
    expect(entropy).toHaveBeenCalledWith(expect.objectContaining({ mode: 'summary' }));
  });

  it('reads dead exports, dead files and drift from the summary counts', async () => {
    stubTools({
      entropy: async () =>
        json({
          mode: 'summary',
          totalIssues: 6,
          categories: {
            drift: { issueCount: 2, topIssues: ['Drift: api-signature in README.md'] },
            deadCode: {
              issueCount: 4,
              topIssues: ['Dead export: a in a.ts'],
              deadExports: 2,
              deadFiles: 1,
              unusedImports: 1,
            },
            patterns: { issueCount: 0, topIssues: [] },
          },
        }),
    });
    const { checks, signals } = await runChecks();
    expect(checks.entropy).toMatchObject({
      passed: false,
      deadExports: 2,
      deadFiles: 1,
      driftCount: 2,
    });
    expect(checks.entropy.measured).not.toBe(false);
    expect(signals).toEqual(expect.arrayContaining(['dead-code', 'drift']));
  });

  it('positive control: a clean summary passes and is measured', async () => {
    stubTools({});
    const { checks, signals } = await runChecks();
    expect(checks.entropy).toMatchObject({
      passed: true,
      deadExports: 0,
      deadFiles: 0,
      driftCount: 0,
    });
    expect(checks.entropy.measured).not.toBe(false);
    for (const key of ['deps', 'security', 'perf', 'docs', 'lint'] as const) {
      expect(checks[key].passed).toBe(true);
      expect(checks[key].measured).not.toBe(false);
    }
    expect(signals).toEqual([]);
  });
});

describe('a check that did not run is not measured, never clean (#2589)', () => {
  it('detect_entropy overflowing (isError) marks entropy unmeasured and failed', async () => {
    stubTools({ entropy: async () => toolError('Error: Invalid string length') });
    const { checks, signals } = await runChecks();
    expect(checks.entropy.passed).toBe(false);
    expect(checks.entropy.measured).toBe(false);
    // No fabricated entropy signal either way.
    expect(signals).not.toContain('dead-code');
    expect(signals).not.toContain('drift');
  });

  it('detect_entropy throwing marks entropy unmeasured instead of rejecting the snapshot', async () => {
    stubTools({
      entropy: async () => {
        throw new RangeError('Invalid string length');
      },
    });
    const { checks } = await runChecks();
    expect(checks.entropy.passed).toBe(false);
    expect(checks.entropy.measured).toBe(false);
    // The other checks still ran.
    expect(checks.deps.passed).toBe(true);
  });

  it('a summary with no numeric counts is unmeasured, not zero', async () => {
    stubTools({ entropy: async () => json({ mode: 'summary', categories: {} }) });
    const { checks } = await runChecks();
    expect(checks.entropy.passed).toBe(false);
    expect(checks.entropy.measured).toBe(false);
  });

  it('assess_project failing leaves its checks unmeasured, not passed', async () => {
    stubTools({ assess: async () => toolError('Error: assess exploded') });
    const { checks, signals } = await runChecks();
    for (const key of ['deps', 'security', 'perf', 'docs', 'lint'] as const) {
      expect(checks[key].passed, key).toBe(false);
      expect(checks[key].measured, key).toBe(false);
    }
    expect(signals).toEqual([]);
  });

  it('check_dependencies failing leaves deps unmeasured, not passed', async () => {
    stubTools({ deps: async () => toolError('Error: deps exploded') });
    const { checks } = await runChecks();
    expect(checks.deps.passed).toBe(false);
    expect(checks.deps.measured).toBe(false);
    expect(checks.security.passed).toBe(true);
  });

  it('run_security_scan returning non-JSON leaves security unmeasured, not passed', async () => {
    stubTools({ security: async () => ({ content: [{ type: 'text', text: 'not json' }] }) });
    const { checks } = await runChecks();
    expect(checks.security.passed).toBe(false);
    expect(checks.security.measured).toBe(false);
    expect(checks.deps.passed).toBe(true);
  });
});

describe('health snapshot over the REAL detect_entropy summary (#2589)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function fixture(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'healthsnap-entropy-'));
    dirs.push(dir);
    for (const [rel, body] of Object.entries(files)) {
      const abs = path.join(dir, ...rel.split('/'));
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    return dir;
  }

  it('counts dead exports and the dead file the analyzer finds', async () => {
    stubTools({}, true);
    const dir = fixture({
      'package.json': JSON.stringify({ name: 'fx', version: '1.0.0', main: 'src/index.ts' }),
      'src/index.ts': "import { used } from './util';\nexport const main = () => used();\n",
      'src/util.ts': 'export const used = () => 1;\nexport const neverImported = () => 2;\n',
      'src/orphan.ts': 'export const orphan = 3;\n',
    });
    const { runHealthChecks } = await import('../../src/skill/health-snapshot');
    const checks = await runHealthChecks(dir);
    expect(checks.entropy.measured).not.toBe(false);
    // neverImported + orphan (dead exports), orphan.ts (dead file)
    expect(checks.entropy.deadExports).toBe(2);
    expect(checks.entropy.deadFiles).toBe(1);
    expect(checks.entropy.passed).toBe(false);
  }, 60_000);
});
