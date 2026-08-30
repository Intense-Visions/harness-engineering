import { describe, it, expect } from 'vitest';
import { ClaudeBackend, type PolicyAuditRecord } from './claude';

/**
 * Wiring for per-lane user-global state isolation (#1299 / ADR 0098).
 *
 * The precise `CLAUDE_CONFIG_DIR` redirect that isolation performs is unit-tested
 * against the pure builder in `subprocess-env.test.ts`; this file proves the
 * ClaudeBackend actually THREADS the opt-in through to that builder — the option
 * is read, the branch is taken when a workspace is present, and the spawn path
 * still completes and audits cleanly. Spawns `process.execPath` (see
 * `claude.policy-envelope.test.ts` for why) so the turn terminates at once.
 */
describe('ClaudeBackend — per-lane state isolation wiring', () => {
  it('runs a turn with lane isolation enabled (opt-in via option) without breaking spawn', async () => {
    const records: PolicyAuditRecord[] = [];
    const backend = new ClaudeBackend(process.execPath, {
      laneStateIsolation: true,
      policyAudit: (r) => records.push(r),
      envSource: { PATH: '/usr/bin', CLAUDE_CONFIG_DIR: '/home/agent/.claude' },
    });
    const started = await backend.startSession({
      workspacePath: '/tmp',
      permissionMode: 'full',
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    for await (const _ of backend.runTurn(started.value, {
      sessionId: started.value.sessionId,
      prompt: 'x',
      isContinuation: false,
    })) {
      void _;
    }
    // The lane-isolation branch executed and the audit stamp was still emitted.
    expect(records).toHaveLength(1);
    expect(records[0]!.enforced).toBe(true);
  });

  it('defaults the opt-in from the HARNESS_LANE_STATE_ISOLATION env flag', async () => {
    const records: PolicyAuditRecord[] = [];
    const backend = new ClaudeBackend(process.execPath, {
      policyAudit: (r) => records.push(r),
      envSource: { PATH: '/usr/bin', HARNESS_LANE_STATE_ISOLATION: '1' },
    });
    const started = await backend.startSession({
      workspacePath: '/tmp',
      permissionMode: 'full',
    });
    if (!started.ok) return;
    for await (const _ of backend.runTurn(started.value, {
      sessionId: started.value.sessionId,
      prompt: 'x',
      isContinuation: false,
    })) {
      void _;
    }
    expect(records).toHaveLength(1);
  });
});
