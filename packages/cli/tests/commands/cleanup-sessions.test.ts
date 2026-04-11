// packages/cli/tests/commands/cleanup-sessions.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runCleanupSessions } from '../../src/commands/cleanup-sessions';

describe('cleanup-sessions command', () => {
  let tmpDir: string;
  let sessionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    sessionsDir = path.join(tmpDir, '.harness', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createSession(name: string, ageMs: number): void {
    const sessionDir = path.join(sessionsDir, name);
    fs.mkdirSync(sessionDir, { recursive: true });
    const handoffPath = path.join(sessionDir, 'handoff.json');
    fs.writeFileSync(handoffPath, JSON.stringify({ fromSkill: 'harness-planning' }));
    // Backdate the mtime
    const pastTime = new Date(Date.now() - ageMs);
    fs.utimesSync(handoffPath, pastTime, pastTime);
    fs.utimesSync(sessionDir, pastTime, pastTime);
  }

  it('returns empty result when no sessions exist', async () => {
    const result = await runCleanupSessions({ cwd: tmpDir, dryRun: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.removed).toEqual([]);
      expect(result.value.kept).toEqual([]);
    }
  });

  it('identifies stale sessions (older than 24h) in dry-run mode', async () => {
    createSession('stale-session', 25 * 60 * 60 * 1000); // 25 hours ago
    createSession('fresh-session', 1 * 60 * 60 * 1000); // 1 hour ago
    const result = await runCleanupSessions({ cwd: tmpDir, dryRun: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.removed).toContain('stale-session');
      expect(result.value.kept).toContain('fresh-session');
      // dry-run: directory should still exist
      expect(fs.existsSync(path.join(sessionsDir, 'stale-session'))).toBe(true);
    }
  });

  it('deletes stale sessions when not in dry-run mode', async () => {
    createSession('stale-session', 25 * 60 * 60 * 1000);
    createSession('fresh-session', 1 * 60 * 60 * 1000);
    const result = await runCleanupSessions({ cwd: tmpDir, dryRun: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.removed).toContain('stale-session');
      expect(result.value.kept).toContain('fresh-session');
      expect(fs.existsSync(path.join(sessionsDir, 'stale-session'))).toBe(false);
      expect(fs.existsSync(path.join(sessionsDir, 'fresh-session'))).toBe(true);
    }
  });

  it('returns ok with empty result when sessions directory does not exist', async () => {
    fs.rmSync(sessionsDir, { recursive: true, force: true });
    const result = await runCleanupSessions({ cwd: tmpDir, dryRun: false });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.removed).toEqual([]);
      expect(result.value.kept).toEqual([]);
    }
  });
});
