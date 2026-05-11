import { describe, it, expect, vi } from 'vitest';
import { runSyncMain } from '../../src/commands/sync-main';
import type { SyncMainResult } from '@harness-engineering/orchestrator';

interface StdoutCapture {
  lines: string[];
  restore: () => void;
}

function captureStdout(): StdoutCapture {
  const original = process.stdout.write.bind(process.stdout);
  const lines: string[] = [];
  (process.stdout as unknown as { write: (s: string) => boolean }).write = (s: string): boolean => {
    lines.push(s);
    return true;
  };
  return {
    lines,
    restore: () => {
      (process.stdout as unknown as { write: typeof original }).write = original;
    },
  };
}

describe('harness sync-main CLI', () => {
  it('prints human-readable summary on updated and exits 0', async () => {
    const cap = captureStdout();
    const result: SyncMainResult = {
      status: 'updated',
      from: 'aaaaaaa1234567',
      to: 'bbbbbbb1234567',
      defaultBranch: 'main',
    };
    const exitCode = await runSyncMain({
      json: false,
      cwd: '/fake',
      syncMainFn: vi.fn().mockResolvedValue(result),
    });
    cap.restore();
    expect(exitCode).toBe(0);
    const out = cap.lines.join('');
    expect(out).toMatch(/updated/);
    expect(out).toMatch(/main/);
  });

  it('emits JSON when --json is set and exits 0 on no-op', async () => {
    const cap = captureStdout();
    const result: SyncMainResult = { status: 'no-op', defaultBranch: 'main' };
    const exitCode = await runSyncMain({
      json: true,
      cwd: '/fake',
      syncMainFn: vi.fn().mockResolvedValue(result),
    });
    cap.restore();
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(cap.lines.join('').trim()) as SyncMainResult;
    expect(parsed).toEqual(result);
  });

  it('exits 0 on skipped:* (skips are not failures)', async () => {
    const cap = captureStdout();
    const result: SyncMainResult = {
      status: 'skipped',
      reason: 'wrong-branch',
      detail: 'on topic',
      defaultBranch: 'main',
    };
    const exitCode = await runSyncMain({
      json: false,
      cwd: '/fake',
      syncMainFn: vi.fn().mockResolvedValue(result),
    });
    cap.restore();
    expect(exitCode).toBe(0);
  });

  it('exits non-zero on error', async () => {
    const cap = captureStdout();
    const result: SyncMainResult = { status: 'error', message: 'git missing' };
    const exitCode = await runSyncMain({
      json: false,
      cwd: '/fake',
      syncMainFn: vi.fn().mockResolvedValue(result),
    });
    cap.restore();
    expect(exitCode).toBe(2); // ExitCode.ERROR
  });
});
