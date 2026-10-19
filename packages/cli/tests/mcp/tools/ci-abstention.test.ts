import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #2071 third copy. `harness ci check` (CLI) and `run_ci_checks` (MCP) are two
 * front ends over one orchestrator. The CLI got an explicit abstention verdict
 * line; this surface must not quietly drop the abstention on its way out, which
 * is the failure mode for a tool that summarises instead of passing through.
 */

const mockRunCIChecks = vi.fn();
vi.mock('@harness-engineering/core', () => ({
  runCIChecks: mockRunCIChecks,
}));

vi.mock('../../../src/mcp/utils/config-resolver.js', () => ({
  resolveProjectConfig: vi.fn().mockReturnValue({ ok: true, value: { version: 1 } }),
}));

import { runCIChecksDefinition, handleRunCIChecks } from '../../../src/mcp/tools/ci';

const ABSTAINING_REPORT = {
  checks: [
    { name: 'validate', status: 'pass', issues: [], durationMs: 1 },
    {
      name: 'traceability',
      status: 'skip',
      issues: [],
      durationMs: 2,
      skipReason: 'No knowledge graph was found, so traceability coverage was never computed.',
    },
  ],
  summary: { total: 2, passed: 1, failed: 0, warnings: 0, skipped: 1, abstained: 1 },
  exitCode: 1,
};

describe('run_ci_checks — abstention reaches the MCP surface (#2071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunCIChecks.mockResolvedValue({ ok: true, value: ABSTAINING_REPORT });
  });

  it('passes the abstention through without laundering it', async () => {
    const result = await handleRunCIChecks({ path: process.cwd() });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.summary.abstained).toBe(1);
    expect(parsed.exitCode).not.toBe(0);
    const traceability = parsed.checks.find((c: { name: string }) => c.name === 'traceability');
    expect(traceability.status).toBe('skip');
    expect(traceability.skipReason).toMatch(/never computed/);
  });

  it('tells the caller in its description that a skipReason is not a pass', () => {
    expect(runCIChecksDefinition.description).toMatch(/abstain/i);
    expect(runCIChecksDefinition.description).toMatch(/skipReason/);
    expect(runCIChecksDefinition.description).toMatch(/exitCode/);
  });
});
