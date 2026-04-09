// packages/core/tests/state/state-manager.test.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadState, saveState, appendLearning } from '../../src/state';

describe('loadState', () => {
  it('returns default state when .harness/state.json missing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    const result = await loadState(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(1);
      expect(result.value.decisions).toEqual([]);
    }
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('loads existing state', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(
      path.join(harnessDir, 'state.json'),
      JSON.stringify({
        schemaVersion: 1,
        position: { phase: 'test' },
        decisions: [],
        blockers: [],
        progress: { 'task-1': 'complete' },
      })
    );
    const result = await loadState(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.progress['task-1']).toBe('complete');
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns error for corrupted JSON', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    const harnessDir = path.join(tmpDir, '.harness');
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(path.join(harnessDir, 'state.json'), 'not json{{{');
    const result = await loadState(tmpDir);
    expect(result.ok).toBe(false);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('saveState', () => {
  it('creates .harness directory and writes state', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    const state = {
      schemaVersion: 1 as const,
      position: { phase: 'test' },
      decisions: [],
      blockers: [],
      progress: {},
    };
    const result = await saveState(tmpDir, state);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.harness', 'state.json'))).toBe(true);
    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe('appendLearning', () => {
  it('creates learnings.md and appends', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'state-test-'));
    await appendLearning(tmpDir, 'First learning');
    await appendLearning(tmpDir, 'Second learning');
    const content = fs.readFileSync(path.join(tmpDir, '.harness', 'learnings.md'), 'utf-8');
    expect(content).toContain('First learning');
    expect(content).toContain('Second learning');
    fs.rmSync(tmpDir, { recursive: true });
  });
});
