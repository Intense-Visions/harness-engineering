import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveSessionDir, updateSessionIndex } from '../../src/state/session-resolver';
import { appendLearning, loadRelevantLearnings } from '../../src/state';
import { saveState, loadState } from '../../src/state';
import { saveHandoff, loadHandoff } from '../../src/state';
import { appendFailure, loadFailures } from '../../src/state';

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

describe('session-scoped state round-trip', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmp();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('appendLearning writes to session directory', async () => {
    const result = await appendLearning(
      tmpDir,
      'session learning',
      'test-skill',
      'success',
      undefined,
      'my-session'
    );
    expect(result.ok).toBe(true);
    const learningsPath = path.join(tmpDir, '.harness', 'sessions', 'my-session', 'learnings.md');
    expect(fs.existsSync(learningsPath)).toBe(true);
    const content = fs.readFileSync(learningsPath, 'utf-8');
    expect(content).toContain('session learning');
  });

  it('loadRelevantLearnings reads from session directory', async () => {
    await appendLearning(
      tmpDir,
      'session learning',
      'test-skill',
      'success',
      undefined,
      'my-session'
    );
    const result = await loadRelevantLearnings(tmpDir, undefined, undefined, 'my-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value[0]).toContain('session learning');
    }
  });

  it('saveState and loadState use session directory', async () => {
    const state = {
      schemaVersion: 1 as const,
      position: { phase: 'execute', task: 'Task 1' },
      progress: {},
      decisions: [],
      blockers: [],
    };
    const saveResult = await saveState(tmpDir, state, undefined, 'my-session');
    expect(saveResult.ok).toBe(true);

    const loadResult = await loadState(tmpDir, undefined, 'my-session');
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value.position?.task).toBe('Task 1');
    }
  });

  it('saveHandoff and loadHandoff use session directory', async () => {
    const handoff = {
      timestamp: new Date().toISOString(),
      fromSkill: 'harness-execution',
      phase: 'VALIDATE',
      summary: 'test handoff',
      completed: [],
      pending: [],
      concerns: [],
      decisions: [],
      contextKeywords: [],
    };
    const saveResult = await saveHandoff(tmpDir, handoff, undefined, 'my-session');
    expect(saveResult.ok).toBe(true);

    const loadResult = await loadHandoff(tmpDir, undefined, 'my-session');
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value?.summary).toBe('test handoff');
    }
  });

  it('appendFailure writes to session directory', async () => {
    const result = await appendFailure(
      tmpDir,
      'session failure',
      'test-skill',
      'test-error',
      undefined,
      'my-session'
    );
    expect(result.ok).toBe(true);
    const failuresPath = path.join(tmpDir, '.harness', 'sessions', 'my-session', 'failures.md');
    expect(fs.existsSync(failuresPath)).toBe(true);
  });

  it('session and global state are isolated', async () => {
    await appendLearning(tmpDir, 'global learning', 'test-skill', 'success');
    await appendLearning(
      tmpDir,
      'session learning',
      'test-skill',
      'success',
      undefined,
      'my-session'
    );

    const globalResult = await loadRelevantLearnings(tmpDir);
    const sessionResult = await loadRelevantLearnings(tmpDir, undefined, undefined, 'my-session');

    expect(globalResult.ok).toBe(true);
    expect(sessionResult.ok).toBe(true);
    if (globalResult.ok && sessionResult.ok) {
      expect(globalResult.value.some((e) => e.includes('global learning'))).toBe(true);
      expect(globalResult.value.some((e) => e.includes('session learning'))).toBe(false);
      expect(sessionResult.value.some((e) => e.includes('session learning'))).toBe(true);
      expect(sessionResult.value.some((e) => e.includes('global learning'))).toBe(false);
    }
  });
});
