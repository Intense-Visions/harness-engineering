import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readSessionSection, readSessionSections } from '../../src/state/session-sections';
import type { SessionSections } from '@harness-engineering/types';

describe('readSessionSections', () => {
  let tmpDir: string;
  let sessionDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-sections-test-'));
    sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty sections when session-state.json does not exist', async () => {
    const result = await readSessionSections(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.terminology).toEqual([]);
      expect(result.value.decisions).toEqual([]);
      expect(result.value.constraints).toEqual([]);
      expect(result.value.risks).toEqual([]);
      expect(result.value.openQuestions).toEqual([]);
      expect(result.value.evidence).toEqual([]);
    }
  });

  it('loads existing session sections from file', async () => {
    const sections: SessionSections = {
      terminology: [
        {
          id: 'entry-1',
          timestamp: '2026-03-27T14:00:00Z',
          authorSkill: 'harness-brainstorming',
          content: 'Term A means X',
          status: 'active',
        },
      ],
      decisions: [],
      constraints: [],
      risks: [],
      openQuestions: [],
      evidence: [],
    };
    fs.writeFileSync(
      path.join(sessionDir, 'session-state.json'),
      JSON.stringify(sections, null, 2)
    );
    const result = await readSessionSections(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.terminology).toHaveLength(1);
      expect(result.value.terminology[0].content).toBe('Term A means X');
    }
  });

  it('returns error for corrupted JSON', async () => {
    fs.writeFileSync(path.join(sessionDir, 'session-state.json'), 'not valid json{{');
    const result = await readSessionSections(tmpDir, 'test-session');
    expect(result.ok).toBe(false);
  });
});

describe('readSessionSection', () => {
  let tmpDir: string;
  let sessionDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-section-test-'));
    sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns empty array for nonexistent section file', async () => {
    const result = await readSessionSection(tmpDir, 'test-session', 'decisions');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });

  it('returns entries for a populated section', async () => {
    const sections: SessionSections = {
      terminology: [],
      decisions: [
        {
          id: 'dec-1',
          timestamp: '2026-03-27T14:00:00Z',
          authorSkill: 'harness-planning',
          content: 'Use Result type',
          status: 'active',
        },
      ],
      constraints: [],
      risks: [],
      openQuestions: [],
      evidence: [],
    };
    fs.writeFileSync(
      path.join(sessionDir, 'session-state.json'),
      JSON.stringify(sections, null, 2)
    );
    const result = await readSessionSection(tmpDir, 'test-session', 'decisions');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].content).toBe('Use Result type');
    }
  });
});
