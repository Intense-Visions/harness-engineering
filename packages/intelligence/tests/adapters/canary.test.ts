import { describe, it, expect } from 'vitest';
import { createCanaryAdapter, type CanaryExec } from '../../src/adapters/canary.js';

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
