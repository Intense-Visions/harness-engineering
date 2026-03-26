import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  writeSessionSummary,
  loadSessionSummary,
  listActiveSessions,
} from '../../src/state/session-summary';

describe('session-summary', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-session-summary-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  describe('writeSessionSummary', () => {
    it('should write summary.md to the session directory', () => {
      const result = writeSessionSummary(tmpDir, 'auth-system--spec', {
        session: 'auth-system--spec',
        lastActive: '2026-03-26T14:30:00Z',
        skill: 'harness-execution',
        phase: '2 of 3',
        status: 'Task 4/6 complete, paused at CHECKPOINT',
        spec: 'docs/changes/auth-system/proposal.md',
        plan: 'docs/plans/2026-03-25-auth-phase2-plan.md',
        keyContext: 'Implementing refresh token flow.',
        nextStep: 'Resume execution at task 5',
      });

      expect(result.ok).toBe(true);

      const summaryPath = path.join(
        tmpDir,
        '.harness',
        'sessions',
        'auth-system--spec',
        'summary.md'
      );
      expect(fs.existsSync(summaryPath)).toBe(true);

      const content = fs.readFileSync(summaryPath, 'utf-8');
      expect(content).toContain('## Session Summary');
      expect(content).toContain('**Session:** auth-system--spec');
      expect(content).toContain('**Skill:** harness-execution');
      expect(content).toContain('**Status:** Task 4/6 complete, paused at CHECKPOINT');
      expect(content).toContain('**Key context:** Implementing refresh token flow.');
      expect(content).toContain('**Next step:** Resume execution at task 5');
    });

    it('should overwrite existing summary.md', () => {
      writeSessionSummary(tmpDir, 'test-session', {
        session: 'test-session',
        lastActive: '2026-03-26T10:00:00Z',
        skill: 'harness-planning',
        status: 'Plan complete',
        keyContext: 'First summary.',
        nextStep: 'Execute plan',
      });

      writeSessionSummary(tmpDir, 'test-session', {
        session: 'test-session',
        lastActive: '2026-03-26T12:00:00Z',
        skill: 'harness-execution',
        status: 'Task 2/5 complete',
        keyContext: 'Second summary.',
        nextStep: 'Continue task 3',
      });

      const summaryPath = path.join(tmpDir, '.harness', 'sessions', 'test-session', 'summary.md');
      const content = fs.readFileSync(summaryPath, 'utf-8');
      expect(content).toContain('**Skill:** harness-execution');
      expect(content).toContain('Second summary.');
      expect(content).not.toContain('First summary.');
    });

    it('should update index.md on write', () => {
      writeSessionSummary(tmpDir, 'my-session', {
        session: 'my-session',
        lastActive: '2026-03-26T14:30:00Z',
        skill: 'harness-execution',
        status: 'Task 3/5 complete',
        keyContext: 'Working on API.',
        nextStep: 'Continue task 4',
      });

      const indexPath = path.join(tmpDir, '.harness', 'sessions', 'index.md');
      expect(fs.existsSync(indexPath)).toBe(true);

      const content = fs.readFileSync(indexPath, 'utf-8');
      expect(content).toContain('my-session');
      expect(content).toContain('execution');
    });

    it('should handle optional fields gracefully', () => {
      const result = writeSessionSummary(tmpDir, 'minimal-session', {
        session: 'minimal-session',
        lastActive: '2026-03-26T14:30:00Z',
        skill: 'harness-planning',
        status: 'Plan complete',
        keyContext: 'Minimal test.',
        nextStep: 'Execute plan',
      });

      expect(result.ok).toBe(true);
      const summaryPath = path.join(
        tmpDir,
        '.harness',
        'sessions',
        'minimal-session',
        'summary.md'
      );
      const content = fs.readFileSync(summaryPath, 'utf-8');
      expect(content).not.toContain('**Phase:**');
      expect(content).not.toContain('**Spec:**');
      expect(content).not.toContain('**Plan:**');
    });
  });

  describe('loadSessionSummary', () => {
    it('should return summary contents when file exists', () => {
      writeSessionSummary(tmpDir, 'load-test', {
        session: 'load-test',
        lastActive: '2026-03-26T14:30:00Z',
        skill: 'harness-execution',
        status: 'In progress',
        keyContext: 'Test load.',
        nextStep: 'Next task',
      });

      const result = loadSessionSummary(tmpDir, 'load-test');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('## Session Summary');
        expect(result.value).toContain('**Skill:** harness-execution');
      }
    });

    it('should return null when summary does not exist', () => {
      const result = loadSessionSummary(tmpDir, 'nonexistent');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });

  describe('listActiveSessions', () => {
    it('should return index contents when file exists', () => {
      writeSessionSummary(tmpDir, 'session-a', {
        session: 'session-a',
        lastActive: '2026-03-26T14:30:00Z',
        skill: 'harness-execution',
        status: 'In progress',
        keyContext: 'Session A.',
        nextStep: 'Next task',
      });

      const result = listActiveSessions(tmpDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toContain('session-a');
      }
    });

    it('should return null when index does not exist', () => {
      const result = listActiveSessions(tmpDir);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });
  });
});
