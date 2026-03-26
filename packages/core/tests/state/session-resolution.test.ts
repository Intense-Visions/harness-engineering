import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveSessionDir, updateSessionIndex } from '../../src/state/session-resolver';

function makeTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
}

describe('resolveSessionDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmp();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns session directory path under .harness/sessions/<slug>', () => {
    const result = resolveSessionDir(tmpDir, 'my-feature--spec');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(path.join(tmpDir, '.harness', 'sessions', 'my-feature--spec'));
    }
  });

  it('creates the session directory if it does not exist', () => {
    const result = resolveSessionDir(tmpDir, 'new-session', { create: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(fs.existsSync(result.value)).toBe(true);
    }
  });

  it('rejects empty session slug', () => {
    const result = resolveSessionDir(tmpDir, '');
    expect(result.ok).toBe(false);
  });

  it('rejects slugs with path traversal', () => {
    const result = resolveSessionDir(tmpDir, '../escape');
    expect(result.ok).toBe(false);
  });

  it('accepts valid session slugs with double-dashes', () => {
    const result = resolveSessionDir(tmpDir, 'changes--auth-system--proposal');
    expect(result.ok).toBe(true);
  });
});

describe('updateSessionIndex', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmp();
    fs.mkdirSync(path.join(tmpDir, '.harness', 'sessions'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates index.md if it does not exist', () => {
    updateSessionIndex(tmpDir, 'my-session', 'execution phase 1');
    const indexPath = path.join(tmpDir, '.harness', 'sessions', 'index.md');
    expect(fs.existsSync(indexPath)).toBe(true);
    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toContain('my-session');
    expect(content).toContain('execution phase 1');
  });

  it('updates existing entry without duplicating', () => {
    updateSessionIndex(tmpDir, 'my-session', 'phase 1');
    updateSessionIndex(tmpDir, 'my-session', 'phase 2');
    const indexPath = path.join(tmpDir, '.harness', 'sessions', 'index.md');
    const content = fs.readFileSync(indexPath, 'utf-8');
    const entryLines = content.split('\n').filter((l) => l.startsWith('- [my-session]'));
    expect(entryLines).toHaveLength(1);
    expect(content).toContain('phase 2');
    expect(content).not.toContain('phase 1');
  });

  it('preserves other session entries when updating one', () => {
    updateSessionIndex(tmpDir, 'session-a', 'doing A');
    updateSessionIndex(tmpDir, 'session-b', 'doing B');
    updateSessionIndex(tmpDir, 'session-a', 'updated A');
    const indexPath = path.join(tmpDir, '.harness', 'sessions', 'index.md');
    const content = fs.readFileSync(indexPath, 'utf-8');
    expect(content).toContain('session-b');
    expect(content).toContain('doing B');
    expect(content).toContain('updated A');
  });
});
