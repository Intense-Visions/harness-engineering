import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  readTaint,
  checkTaint,
  writeTaint,
  clearTaint,
  listTaintedSessions,
  getTaintFilePath,
} from '../../src/security/taint';
import type { InjectionFinding } from '../../src/security/injection-patterns';

// Use a temp directory for each test
const TEST_ROOT = join(import.meta.dirname, '../../../..', '.tmp-taint-test');

const HIGH_FINDING: InjectionFinding = {
  severity: 'high',
  ruleId: 'INJ-REROL-001',
  match: 'ignore previous instructions',
  line: 1,
};

const MEDIUM_FINDING: InjectionFinding = {
  severity: 'medium',
  ruleId: 'INJ-SOC-001',
  match: 'this is urgent',
  line: 2,
};

beforeEach(() => {
  mkdirSync(join(TEST_ROOT, '.harness'), { recursive: true });
});

afterEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('getTaintFilePath', () => {
  it('returns session-scoped path for given session ID', () => {
    const path = getTaintFilePath(TEST_ROOT, 'abc123');
    expect(path).toContain('session-taint-abc123.json');
    expect(path).toContain('.harness');
  });

  it('uses "default" when no session ID provided', () => {
    const path = getTaintFilePath(TEST_ROOT);
    expect(path).toContain('session-taint-default.json');
  });
});

describe('readTaint', () => {
  it('returns null when no taint file exists', () => {
    const result = readTaint(TEST_ROOT, 'no-such-session');
    expect(result).toBeNull();
  });

  it('returns taint state when file exists and is valid', () => {
    const taintPath = getTaintFilePath(TEST_ROOT, 'sess1');
    const state = {
      sessionId: 'sess1',
      taintedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      reason: 'test',
      severity: 'high',
      findings: [],
    };
    writeFileSync(taintPath, JSON.stringify(state));
    const result = readTaint(TEST_ROOT, 'sess1');
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe('sess1');
  });

  it('returns null and deletes file when JSON is malformed (fail-open)', () => {
    const taintPath = getTaintFilePath(TEST_ROOT, 'bad-sess');
    writeFileSync(taintPath, 'not valid json {{{');
    const result = readTaint(TEST_ROOT, 'bad-sess');
    expect(result).toBeNull();
    expect(existsSync(taintPath)).toBe(false);
  });

  it('returns null and deletes file when taint state is missing required fields', () => {
    const taintPath = getTaintFilePath(TEST_ROOT, 'partial-sess');
    writeFileSync(taintPath, JSON.stringify({ sessionId: 'partial-sess' }));
    const result = readTaint(TEST_ROOT, 'partial-sess');
    expect(result).toBeNull();
    expect(existsSync(taintPath)).toBe(false);
  });
});

describe('checkTaint', () => {
  it('returns tainted=false when no taint file exists', () => {
    const result = checkTaint(TEST_ROOT, 'no-session');
    expect(result.tainted).toBe(false);
    expect(result.expired).toBe(false);
    expect(result.state).toBeNull();
  });

  it('returns tainted=true when taint is active', () => {
    writeTaint(TEST_ROOT, 'active-sess', 'test reason', [HIGH_FINDING], 'test-source');
    const result = checkTaint(TEST_ROOT, 'active-sess');
    expect(result.tainted).toBe(true);
    expect(result.expired).toBe(false);
    expect(result.state).not.toBeNull();
  });

  it('returns expired=true and tainted=false when taint has expired', () => {
    const taintPath = getTaintFilePath(TEST_ROOT, 'expired-sess');
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const state = {
      sessionId: 'expired-sess',
      taintedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      expiresAt: pastDate,
      reason: 'old taint',
      severity: 'medium',
      findings: [],
    };
    writeFileSync(taintPath, JSON.stringify(state));

    const result = checkTaint(TEST_ROOT, 'expired-sess');
    expect(result.tainted).toBe(false);
    expect(result.expired).toBe(true);
    expect(result.state).not.toBeNull();
    // File should be deleted
    expect(existsSync(taintPath)).toBe(false);
  });
});

describe('writeTaint', () => {
  it('creates taint file with correct structure', () => {
    const state = writeTaint(TEST_ROOT, 'write-sess', 'injection detected', [HIGH_FINDING], 'hook');
    expect(state.sessionId).toBe('write-sess');
    expect(state.severity).toBe('high');
    expect(state.findings).toHaveLength(1);
    expect(state.findings[0]!.ruleId).toBe('INJ-REROL-001');
    expect(existsSync(getTaintFilePath(TEST_ROOT, 'write-sess'))).toBe(true);
  });

  it('creates .harness/ directory if it does not exist', () => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
    writeTaint(TEST_ROOT, 'new-dir-sess', 'test', [HIGH_FINDING], 'hook');
    expect(existsSync(getTaintFilePath(TEST_ROOT, 'new-dir-sess'))).toBe(true);
  });

  it('merges findings when taint already exists for session', () => {
    writeTaint(TEST_ROOT, 'merge-sess', 'first', [HIGH_FINDING], 'hook-pre');
    writeTaint(TEST_ROOT, 'merge-sess', 'second', [MEDIUM_FINDING], 'hook-post');
    const state = readTaint(TEST_ROOT, 'merge-sess');
    expect(state!.findings).toHaveLength(2);
  });

  it('preserves earlier taintedAt on subsequent writes', () => {
    writeTaint(TEST_ROOT, 'preserve-sess', 'first', [HIGH_FINDING], 'hook');
    const first = readTaint(TEST_ROOT, 'preserve-sess');
    const firstTaintedAt = first!.taintedAt;

    // Small delay to ensure time advances
    const state2 = writeTaint(TEST_ROOT, 'preserve-sess', 'second', [MEDIUM_FINDING], 'hook-post');
    expect(state2.taintedAt).toBe(firstTaintedAt);
  });

  it('severity escalates to high when any finding is high', () => {
    writeTaint(TEST_ROOT, 'escalate-sess', 'medium first', [MEDIUM_FINDING], 'hook');
    writeTaint(TEST_ROOT, 'escalate-sess', 'high second', [HIGH_FINDING], 'hook');
    const state = readTaint(TEST_ROOT, 'escalate-sess');
    expect(state!.severity).toBe('high');
  });

  it('uses "default" session ID when none provided', () => {
    writeTaint(TEST_ROOT, undefined, 'test', [HIGH_FINDING], 'hook');
    expect(existsSync(getTaintFilePath(TEST_ROOT, 'default'))).toBe(true);
  });
});

describe('clearTaint', () => {
  it('removes taint file for specific session and returns 1', () => {
    writeTaint(TEST_ROOT, 'clear-sess', 'test', [HIGH_FINDING], 'hook');
    const count = clearTaint(TEST_ROOT, 'clear-sess');
    expect(count).toBe(1);
    expect(existsSync(getTaintFilePath(TEST_ROOT, 'clear-sess'))).toBe(false);
  });

  it('returns 0 when no taint file exists for session', () => {
    const count = clearTaint(TEST_ROOT, 'nonexistent-sess');
    expect(count).toBe(0);
  });

  it('removes all taint files when no session specified', () => {
    writeTaint(TEST_ROOT, 'sess-a', 'test', [HIGH_FINDING], 'hook');
    writeTaint(TEST_ROOT, 'sess-b', 'test', [MEDIUM_FINDING], 'hook');
    const count = clearTaint(TEST_ROOT);
    expect(count).toBe(2);
    expect(existsSync(getTaintFilePath(TEST_ROOT, 'sess-a'))).toBe(false);
    expect(existsSync(getTaintFilePath(TEST_ROOT, 'sess-b'))).toBe(false);
  });

  it('does not remove non-taint files from .harness/', () => {
    writeFileSync(join(TEST_ROOT, '.harness', 'other-file.json'), '{}');
    writeTaint(TEST_ROOT, 'sess-c', 'test', [HIGH_FINDING], 'hook');
    clearTaint(TEST_ROOT);
    expect(existsSync(join(TEST_ROOT, '.harness', 'other-file.json'))).toBe(true);
  });

  it('returns 0 gracefully when .harness/ does not exist', () => {
    rmSync(join(TEST_ROOT, '.harness'), { recursive: true, force: true });
    const count = clearTaint(TEST_ROOT);
    expect(count).toBe(0);
  });
});

describe('listTaintedSessions', () => {
  it('returns empty array when no taint files exist', () => {
    const sessions = listTaintedSessions(TEST_ROOT);
    expect(sessions).toHaveLength(0);
  });

  it('returns active session IDs', () => {
    writeTaint(TEST_ROOT, 'list-sess-1', 'test', [HIGH_FINDING], 'hook');
    writeTaint(TEST_ROOT, 'list-sess-2', 'test', [MEDIUM_FINDING], 'hook');
    const sessions = listTaintedSessions(TEST_ROOT);
    expect(sessions).toContain('list-sess-1');
    expect(sessions).toContain('list-sess-2');
  });

  it('excludes expired sessions and cleans up their files', () => {
    // Active session
    writeTaint(TEST_ROOT, 'active', 'test', [HIGH_FINDING], 'hook');
    // Expired session
    const expiredPath = getTaintFilePath(TEST_ROOT, 'expired');
    writeFileSync(
      expiredPath,
      JSON.stringify({
        sessionId: 'expired',
        taintedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        reason: 'old',
        severity: 'medium',
        findings: [],
      })
    );

    const sessions = listTaintedSessions(TEST_ROOT);
    expect(sessions).toContain('active');
    expect(sessions).not.toContain('expired');
    expect(existsSync(expiredPath)).toBe(false);
  });
});

describe('SC17: concurrent sessions maintain independent taint state', () => {
  it('taint files for two session IDs are independent', () => {
    writeTaint(TEST_ROOT, 'concurrent-a', 'test', [HIGH_FINDING], 'hook');
    writeTaint(TEST_ROOT, 'concurrent-b', 'test', [MEDIUM_FINDING], 'hook');

    // Clear one
    clearTaint(TEST_ROOT, 'concurrent-a');

    // Other remains
    const resultA = checkTaint(TEST_ROOT, 'concurrent-a');
    const resultB = checkTaint(TEST_ROOT, 'concurrent-b');

    expect(resultA.tainted).toBe(false);
    expect(resultB.tainted).toBe(true);
  });
});
