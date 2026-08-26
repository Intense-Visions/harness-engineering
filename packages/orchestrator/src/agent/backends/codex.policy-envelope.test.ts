import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CodexBackend } from './codex';
import type { PolicyAuditRecord } from './claude';
import type { AgentSession, TurnParams } from '@harness-engineering/types';

/**
 * Proves the codex backend air-gaps its spawned subprocess env the same way the
 * claude backend does (#1158): it hands the audit sink the resolved
 * PolicyMetadata plus the NAMES of parent-env vars withheld from the subprocess
 * (never their values), and the process it actually spawns receives the
 * ALLOWLISTED env — not the full parent `process.env`. Before this port codex
 * spawned with `env: process.env`, leaking every host secret into a subprocess
 * that has no business seeing them.
 */

const SESSION: AgentSession = {
  sessionId: 's1',
  workspacePath: os.tmpdir(),
  backendName: 'codex',
  startedAt: new Date().toISOString(),
};

async function drain(b: CodexBackend, session: AgentSession): Promise<void> {
  const gen = b.runTurn(session, { sessionId: session.sessionId, prompt: 'do x' } as TurnParams);
  for (;;) {
    const n = await gen.next();
    if (n.done) return;
  }
}

/** POSIX `#!/bin/sh` fixture that dumps its own env to a file — the shebang path
 * is honored by shell-less spawn only on POSIX (see codex.test.ts rationale). */
const itPosix = it.skipIf(process.platform === 'win32');

describe('CodexBackend policy envelope + subprocess air-gap', () => {
  it('stamps PolicyMetadata + stripped env keys into the audit sink at spawn', async () => {
    const records: PolicyAuditRecord[] = [];
    const backend = new CodexBackend({
      // process.execPath is present on every platform; codex's fixed argv is
      // rejected by Node so it exits at once — but the audit stamp is emitted
      // BEFORE the spawn, so the record is captured regardless (mirrors the
      // claude policy-envelope test).
      command: process.execPath,
      model: 'm',
      sandboxMode: 'docker',
      networkMode: 'restricted',
      agentVersion: '9.9.9',
      policyAudit: (r) => records.push(r),
      envSource: {
        PATH: '/usr/bin',
        OLLAMA_HOST: 'http://127.0.0.1:11434',
        OPENAI_API_KEY: 'sk-openai-secret',
        DATABASE_URL: 'postgres://secret',
      },
    });

    await drain(backend, SESSION);

    expect(records).toHaveLength(1);
    const rec = records[0]!;
    expect(rec.sessionId).toBe(SESSION.sessionId);
    expect(rec.workspacePath).toBe(SESSION.workspacePath);
    expect(rec.enforced).toBe(true);
    expect(rec.policy).toEqual({
      approvalMode: 'bypass',
      sandboxMode: 'docker',
      networkMode: 'restricted',
      dangerousFlags: ['--sandbox=workspace-write'],
      agentFamily: 'codex',
      agentVersion: '9.9.9',
    });
    // Air-gap: the unrelated secret is recorded as stripped; the provider cred /
    // OLLAMA_ config / base plumbing are NOT stripped. Values never appear.
    expect(rec.strippedEnvKeys).toContain('DATABASE_URL');
    expect(rec.strippedEnvKeys).not.toContain('OPENAI_API_KEY');
    expect(rec.strippedEnvKeys).not.toContain('OLLAMA_HOST');
    expect(rec.strippedEnvKeys).not.toContain('PATH');
    expect(JSON.stringify(rec)).not.toContain('postgres://secret');
  });

  it('defaults policy posture to none/unrestricted/unknown when unset', async () => {
    const records: PolicyAuditRecord[] = [];
    const backend = new CodexBackend({
      command: process.execPath,
      model: 'm',
      policyAudit: (r) => records.push(r),
      envSource: { PATH: '/usr/bin' },
    });
    await drain(backend, SESSION);
    expect(records[0]!.policy.sandboxMode).toBe('none');
    expect(records[0]!.policy.networkMode).toBe('unrestricted');
    expect(records[0]!.policy.agentVersion).toBe('unknown');
  });

  itPosix('spawns the subprocess with the ALLOWLISTED env, not the full parent env', async () => {
    const envfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-env-')), 'env');
    // Dump the child's actual environment so we can assert what codex was spawned with.
    const cmd = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fake-codex-')), 'codex');
    fs.writeFileSync(cmd, `#!/bin/sh\nenv > "${envfile}"\nexit 0\n`, { mode: 0o755 });

    const backend = new CodexBackend({
      command: cmd,
      model: 'm',
      envSource: {
        PATH: '/usr/bin',
        OLLAMA_HOST: 'http://127.0.0.1:11434',
        OPENAI_API_KEY: 'sk-openai-secret',
        DATABASE_URL: 'postgres://secret',
        STRIPE_SECRET_KEY: 'sk-live-should-not-leak',
      },
    });

    await drain(backend, SESSION);

    const childEnv = fs.readFileSync(envfile, 'utf8');
    // Allowed: base plumbing + provider cred + provider config pass through.
    expect(childEnv).toMatch(/^PATH=/m);
    expect(childEnv).toContain('OPENAI_API_KEY=sk-openai-secret');
    expect(childEnv).toContain('OLLAMA_HOST=http://127.0.0.1:11434');
    // Air-gapped: unrelated host secrets never reach the subprocess.
    expect(childEnv).not.toContain('DATABASE_URL');
    expect(childEnv).not.toContain('postgres://secret');
    expect(childEnv).not.toContain('STRIPE_SECRET_KEY');
    expect(childEnv).not.toContain('sk-live-should-not-leak');
  });
});
