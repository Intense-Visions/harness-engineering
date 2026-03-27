import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  readSessionSection,
  readSessionSections,
  appendSessionEntry,
  updateSessionEntryStatus,
} from '../../src/state/session-sections';
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

describe('appendSessionEntry', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-append-test-'));
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('appends entry to empty section and returns it with generated id and timestamp', async () => {
    const result = await appendSessionEntry(
      tmpDir,
      'test-session',
      'decisions',
      'harness-brainstorming',
      'We chose TypeScript'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBeTruthy();
      expect(result.value.timestamp).toBeTruthy();
      expect(result.value.authorSkill).toBe('harness-brainstorming');
      expect(result.value.content).toBe('We chose TypeScript');
      expect(result.value.status).toBe('active');
    }
  });

  it('appends without overwriting existing entries', async () => {
    await appendSessionEntry(tmpDir, 'test-session', 'risks', 'skill-a', 'Risk 1');
    await appendSessionEntry(tmpDir, 'test-session', 'risks', 'skill-b', 'Risk 2');

    const result = await readSessionSection(tmpDir, 'test-session', 'risks');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0].content).toBe('Risk 1');
      expect(result.value[1].content).toBe('Risk 2');
    }
  });

  it('does not affect other sections when appending', async () => {
    await appendSessionEntry(tmpDir, 'test-session', 'terminology', 'skill-a', 'Term A');

    const result = await readSessionSections(tmpDir, 'test-session');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.terminology).toHaveLength(1);
      expect(result.value.decisions).toHaveLength(0);
      expect(result.value.constraints).toHaveLength(0);
      expect(result.value.risks).toHaveLength(0);
      expect(result.value.openQuestions).toHaveLength(0);
      expect(result.value.evidence).toHaveLength(0);
    }
  });

  it('persists entries to disk (read-before-write verified)', async () => {
    await appendSessionEntry(tmpDir, 'test-session', 'evidence', 'skill-a', 'Evidence 1');

    // Read directly from file to verify persistence
    const filePath = path.join(
      tmpDir,
      '.harness',
      'sessions',
      'test-session',
      'session-state.json'
    );
    expect(fs.existsSync(filePath)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(raw.evidence).toHaveLength(1);
    expect(raw.evidence[0].content).toBe('Evidence 1');
  });
});

describe('updateSessionEntryStatus', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-status-test-'));
    const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
    fs.mkdirSync(sessionDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('updates entry status from active to resolved', async () => {
    const appendResult = await appendSessionEntry(
      tmpDir,
      'test-session',
      'openQuestions',
      'skill-a',
      'What about X?'
    );
    expect(appendResult.ok).toBe(true);
    if (!appendResult.ok) return;

    const entryId = appendResult.value.id;
    const updateResult = await updateSessionEntryStatus(
      tmpDir,
      'test-session',
      'openQuestions',
      entryId,
      'resolved'
    );
    expect(updateResult.ok).toBe(true);
    if (updateResult.ok) {
      expect(updateResult.value.status).toBe('resolved');
      expect(updateResult.value.id).toBe(entryId);
    }
  });

  it('returns error when entry id does not exist', async () => {
    const result = await updateSessionEntryStatus(
      tmpDir,
      'test-session',
      'decisions',
      'nonexistent-id',
      'superseded'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('nonexistent-id');
      expect(result.error.message).toContain('not found');
    }
  });

  it('does not affect other entries in the same section', async () => {
    await appendSessionEntry(tmpDir, 'test-session', 'constraints', 'skill-a', 'Constraint 1');
    const second = await appendSessionEntry(
      tmpDir,
      'test-session',
      'constraints',
      'skill-b',
      'Constraint 2'
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    await updateSessionEntryStatus(
      tmpDir,
      'test-session',
      'constraints',
      second.value.id,
      'superseded'
    );

    const allResult = await readSessionSection(tmpDir, 'test-session', 'constraints');
    expect(allResult.ok).toBe(true);
    if (allResult.ok) {
      expect(allResult.value[0].status).toBe('active');
      expect(allResult.value[1].status).toBe('superseded');
    }
  });
});
