import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { saveHandoff, loadHandoff } from '../../src/state/state-manager';
import type { Handoff } from '../../src/state/types';

describe('saveHandoff', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-handoff-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should write handoff.json', async () => {
    const handoff: Handoff = {
      timestamp: '2026-03-14T10:30:00Z',
      fromSkill: 'harness-execution',
      phase: 'EXECUTE',
      summary: 'Completed tasks 1-3',
      completed: ['Task 1', 'Task 2', 'Task 3'],
      pending: ['Task 4'],
      concerns: ['Database migration needed'],
      decisions: [{ what: 'Used Zod', why: 'Existing pattern' }],
      blockers: [],
      contextKeywords: ['auth', 'middleware'],
    };

    const result = await saveHandoff(tmpDir, handoff);
    expect(result.ok).toBe(true);

    const content = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.harness', 'handoff.json'), 'utf-8')
    );
    expect(content.fromSkill).toBe('harness-execution');
    expect(content.completed).toEqual(['Task 1', 'Task 2', 'Task 3']);
  });
});

describe('loadHandoff', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-handoff-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('should return null when no handoff file exists', async () => {
    const result = await loadHandoff(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('should parse existing handoff.json', async () => {
    const handoff: Handoff = {
      timestamp: '2026-03-14T10:30:00Z',
      fromSkill: 'harness-planning',
      phase: 'VALIDATE',
      summary: '5 tasks planned',
      completed: [],
      pending: ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5'],
      concerns: [],
      decisions: [],
      blockers: [],
      contextKeywords: [],
    };

    await saveHandoff(tmpDir, handoff);
    const result = await loadHandoff(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
      expect(result.value!.fromSkill).toBe('harness-planning');
      expect(result.value!.pending.length).toBe(5);
    }
  });
});
