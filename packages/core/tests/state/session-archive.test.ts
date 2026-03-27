import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { archiveSession } from '../../src/state/session-archive';

describe('archiveSession', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-archive-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('moves session directory to archive with date suffix', async () => {
    // Set up a session directory with a state file
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'my-session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'state.json'), '{"schemaVersion":1}');
    fs.writeFileSync(path.join(sessionDir, 'session-state.json'), '{}');

    const result = await archiveSession(tmpDir, 'my-session');
    expect(result.ok).toBe(true);

    // Original directory should no longer exist
    expect(fs.existsSync(sessionDir)).toBe(false);

    // Archive directory should exist
    const archiveDir = path.join(tmpDir, '.harness', 'archive', 'sessions');
    expect(fs.existsSync(archiveDir)).toBe(true);

    // Should contain the archived session with date suffix
    const entries = fs.readdirSync(archiveDir);
    expect(entries.length).toBe(1);
    expect(entries[0]).toMatch(/^my-session-\d{4}-\d{2}-\d{2}$/);

    // Archived files should be preserved
    const archivedDir = path.join(archiveDir, entries[0]);
    expect(fs.existsSync(path.join(archivedDir, 'state.json'))).toBe(true);
    expect(fs.existsSync(path.join(archivedDir, 'session-state.json'))).toBe(true);
  });

  it('returns error when session directory does not exist', async () => {
    const result = await archiveSession(tmpDir, 'nonexistent-session');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('nonexistent-session');
    }
  });

  it('handles duplicate archive names with counter suffix', async () => {
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'my-session');

    // Create a pre-existing archive entry for today's date
    const date = new Date().toISOString().split('T')[0];
    const existingArchive = path.join(
      tmpDir,
      '.harness',
      'archive',
      'sessions',
      `my-session-${date}`
    );
    fs.mkdirSync(existingArchive, { recursive: true });

    // Create the session to archive
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'state.json'), '{}');

    const result = await archiveSession(tmpDir, 'my-session');
    expect(result.ok).toBe(true);

    const archiveDir = path.join(tmpDir, '.harness', 'archive', 'sessions');
    const entries = fs.readdirSync(archiveDir).sort();
    expect(entries.length).toBe(2);
    // Second entry should have a counter
    expect(entries[1]).toMatch(/^my-session-\d{4}-\d{2}-\d{2}-\d+$/);
  });
});
