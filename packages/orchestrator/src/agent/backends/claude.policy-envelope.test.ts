import { describe, it, expect } from 'vitest';
import { ClaudeBackend, type PolicyAuditRecord } from './claude';

/**
 * Proves the orchestrator gateway policy envelope is stamped at spawn: the
 * ClaudeBackend hands the audit sink the resolved PolicyMetadata plus the NAMES
 * of parent-env vars withheld from the subprocess (never their values). Spawns
 * `process.execPath` (the running Node binary) as the command: it is always
 * present on every platform (unlike the Unix-only `true`, which has no
 * `true.exe` on Windows and would hang the spawn until the test timed out).
 * The backend passes its fixed Claude-CLI flags, so Node rejects the unknown
 * `--output-format` option and exits immediately with empty stdout — the turn
 * terminates at once with no stream output, exactly as `true` did. The audit
 * stamp is emitted before the spawn, so the record is captured regardless.
 */
describe('ClaudeBackend policy envelope + subprocess air-gap', () => {
  it('(c) stamps PolicyMetadata + stripped env keys into the audit sink at spawn', async () => {
    const records: PolicyAuditRecord[] = [];
    const backend = new ClaudeBackend(process.execPath, {
      sandboxMode: 'docker',
      networkMode: 'restricted',
      agentVersion: '1.2.3',
      policyAudit: (r) => records.push(r),
      envSource: {
        PATH: '/usr/bin',
        ANTHROPIC_API_KEY: 'sk-ant-secret',
        DATABASE_URL: 'postgres://secret',
      },
    });

    const started = await backend.startSession({
      workspacePath: '/tmp',
      permissionMode: 'full',
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    // Drive the turn to completion so the spawn (and thus the stamp) happens.
    const gen = backend.runTurn(started.value, {
      sessionId: started.value.sessionId,
      prompt: 'hello',
      isContinuation: false,
    });
    for await (const _ of gen) {
      void _; // consume events; `true` emits none
    }

    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.sessionId).toBe(started.value.sessionId);
    expect(rec.enforced).toBe(true);
    // Policy envelope content.
    expect(rec.policy).toEqual({
      approvalMode: 'bypass',
      sandboxMode: 'docker',
      networkMode: 'restricted',
      dangerousFlags: ['--permission-mode=bypassPermissions'],
      agentFamily: 'claude',
      agentVersion: '1.2.3',
    });
    // Air-gap: the unrelated secret is recorded as stripped; the provider cred
    // and base plumbing are NOT stripped. Values are never present in the record.
    expect(rec.strippedEnvKeys).toContain('DATABASE_URL');
    expect(rec.strippedEnvKeys).not.toContain('ANTHROPIC_API_KEY');
    expect(rec.strippedEnvKeys).not.toContain('PATH');
    expect(JSON.stringify(rec)).not.toContain('postgres://secret');
  });

  it('defaults policy posture to none/unrestricted/unknown when unset', async () => {
    const records: PolicyAuditRecord[] = [];
    const backend = new ClaudeBackend(process.execPath, {
      policyAudit: (r) => records.push(r),
      envSource: { PATH: '/usr/bin' },
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
    expect(records[0]!.policy.sandboxMode).toBe('none');
    expect(records[0]!.policy.networkMode).toBe('unrestricted');
    expect(records[0]!.policy.agentVersion).toBe('unknown');
  });
});
