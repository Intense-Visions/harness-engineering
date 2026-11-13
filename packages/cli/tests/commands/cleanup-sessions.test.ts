// packages/cli/tests/commands/cleanup-sessions.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  runCleanupSessions,
  runCleanupAll,
  printCleanupSessionsResult,
  printCleanupAllResult,
} from '../../src/commands/cleanup-sessions';

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

describe('cleanup-sessions --all (Hermes Phase 2)', () => {
  let tmpDir: string;

  function writeAged(targetRel: string, name: string, ageMs: number): void {
    const full = path.join(tmpDir, '.harness', targetRel, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'x');
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(full, t, t);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cleanup-all-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sweeps every registered target with their default TTLs', async () => {
    // Session entries fresh + stale, cache stale, maintenance fresh
    writeAged('sessions', 'stale.txt', 30 * 60 * 60 * 1000); // >24h
    writeAged('sessions', 'fresh.txt', 1 * 60 * 60 * 1000);
    writeAged('cache', 'old-osv.json', 10 * 24 * 60 * 60 * 1000); // >7d
    writeAged('maintenance', 'recent', 1 * 60 * 60 * 1000);
    const result = await runCleanupAll({ cwd: tmpDir, dryRun: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const map = Object.fromEntries(result.value.map((r) => [r.target, r]));
    expect(map.sessions?.removed).toContain('stale.txt');
    expect(map.sessions?.kept).toContain('fresh.txt');
    expect(map.cache?.removed).toContain('old-osv.json');
    expect(map.maintenance?.removed).not.toContain('recent');
  });

  it('honors --include to restrict targets', async () => {
    writeAged('sessions', 'stale.txt', 30 * 60 * 60 * 1000);
    writeAged('cache', 'stale.json', 10 * 24 * 60 * 60 * 1000);
    const result = await runCleanupAll({ cwd: tmpDir, dryRun: true, include: ['cache'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((r) => r.target)).toEqual(['cache']);
    expect(result.value[0]?.removed).toContain('stale.json');
  });

  it('honors --exclude to skip targets', async () => {
    writeAged('sessions', 'stale.txt', 30 * 60 * 60 * 1000);
    writeAged('cache', 'stale.json', 10 * 24 * 60 * 60 * 1000);
    const result = await runCleanupAll({ cwd: tmpDir, dryRun: true, exclude: ['sessions'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((r) => r.target)).not.toContain('sessions');
  });

  it('respects per-target ttlHours overrides', async () => {
    writeAged('cache', 'borderline.json', 2 * 60 * 60 * 1000); // 2h old
    const def = await runCleanupAll({ cwd: tmpDir, dryRun: true, include: ['cache'] });
    if (!def.ok) throw def.error;
    expect(def.value[0]?.removed).not.toContain('borderline.json');
    const override = await runCleanupAll({
      cwd: tmpDir,
      dryRun: true,
      include: ['cache'],
      ttlHours: { cache: 1 },
    });
    if (!override.ok) throw override.error;
    expect(override.value[0]?.removed).toContain('borderline.json');
  });

  it('deletes entries when dryRun=false', async () => {
    writeAged('cache', 'stale.json', 10 * 24 * 60 * 60 * 1000);
    const result = await runCleanupAll({ cwd: tmpDir, dryRun: false, include: ['cache'] });
    expect(result.ok).toBe(true);
    const filePath = path.join(tmpDir, '.harness', 'cache', 'stale.json');
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

/**
 * Review I2: the auto-decision log is the audit trail of what an agent decided on its own.
 * A TTL sweep must not delete it with the session.
 */
describe('sessions holding an auto-decision log survive the TTL sweep (review I2)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  let tmpDir: string;
  let sessionsDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    sessionsDir = path.join(tmpDir, '.harness', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  function staleSession(name: string, log?: string): void {
    const dir = path.join(sessionsDir, name);
    fs.mkdirSync(dir, { recursive: true });
    const files = ['handoff.json', ...(log !== undefined ? ['auto-decisions.jsonl'] : [])];
    fs.writeFileSync(path.join(dir, 'handoff.json'), '{}');
    if (log !== undefined) fs.writeFileSync(path.join(dir, 'auto-decisions.jsonl'), log);
    const past = new Date(Date.now() - 3 * DAY);
    for (const f of files) fs.utimesSync(path.join(dir, f), past, past);
    fs.utimesSync(dir, past, past);
  }

  it('runCleanupSessions keeps a stale session whose log is non-empty', async () => {
    staleSession('audited', '{"x":1}\n');
    staleSession('plain-stale'); // control: still removed
    const r = await runCleanupSessions({ cwd: tmpDir, dryRun: false });
    expect(r.ok && r.value.kept).toContain('audited');
    expect(r.ok && r.value.removed).toEqual(['plain-stale']);
    expect(fs.existsSync(path.join(sessionsDir, 'audited', 'auto-decisions.jsonl'))).toBe(true);
  });
  it('an empty log does not protect a stale session (control)', async () => {
    staleSession('empty-log', '');
    const r = await runCleanupSessions({ cwd: tmpDir, dryRun: false });
    expect(r.ok && r.value.removed).toEqual(['empty-log']);
  });
  it('runCleanupAll (--all) keeps it too', async () => {
    staleSession('audited', '{"x":1}\n');
    staleSession('plain-stale');
    const r = await runCleanupAll({ cwd: tmpDir, dryRun: false, include: ['sessions'] });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(sessionsDir, 'audited', 'auto-decisions.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(sessionsDir, 'plain-stale'))).toBe(false);
  });
  it('reports a stale session kept for its log as retained; a fresh one with a log is not (review N4)', async () => {
    staleSession('audited', '{"x":1}\n');
    staleSession('plain-stale');
    fs.mkdirSync(path.join(sessionsDir, 'fresh-logged'), { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'fresh-logged', 'auto-decisions.jsonl'), '{"x":1}\n');
    const r = await runCleanupSessions({ cwd: tmpDir, dryRun: true });
    expect(r.ok && r.value.retained).toEqual(['audited']);
    expect(r.ok && r.value.kept.sort()).toEqual(['audited', 'fresh-logged']);
  });
  it('--all reports retained per target (review N4)', async () => {
    staleSession('audited', '{"x":1}\n');
    const r = await runCleanupAll({ cwd: tmpDir, dryRun: true, include: ['sessions'] });
    expect(r.ok && r.value[0]?.retained).toEqual(['audited']);
  });
  it('prints retained sessions in text and JSON output (review N4)', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    printCleanupSessionsResult({ removed: ['x'], kept: ['a'], retained: ['a'] }, false, false);
    printCleanupSessionsResult({ removed: [], kept: ['a'], retained: ['a'] }, true, true);
    printCleanupAllResult(
      [{ target: 'sessions', removed: [], kept: ['a'], retained: ['a'] }],
      false,
      false
    );
    const out = log.mock.calls.map((c) => String(c[0])).join('\n');
    log.mockRestore();
    expect(out).toContain('Kept because it holds an auto-decision log (1):');
    expect(out).toContain('"retained": [');
    expect(out).toContain('1 kept for an auto-decision log');
  });
});
