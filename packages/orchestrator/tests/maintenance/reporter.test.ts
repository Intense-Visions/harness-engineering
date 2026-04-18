import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MaintenanceReporter } from '../../src/maintenance/reporter';
import type { RunResult } from '../../src/maintenance/types';

function makeResult(taskId: string, index: number): RunResult {
  return {
    taskId,
    startedAt: `2026-01-01T00:${String(index).padStart(2, '0')}:00.000Z`,
    completedAt: `2026-01-01T00:${String(index).padStart(2, '0')}:30.000Z`,
    status: 'success',
    findings: index,
    fixed: index,
    prUrl: null,
    prUpdated: false,
  };
}

describe('MaintenanceReporter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('loads from empty/missing directory without error', async () => {
      const persistDir = path.join(tmpDir, 'nonexistent');
      const reporter = new MaintenanceReporter({ persistDir });
      await reporter.load();
      expect(reporter.getHistory(100, 0)).toEqual([]);
    });

    it('creates directory on load if missing', async () => {
      const persistDir = path.join(tmpDir, 'new-dir');
      const reporter = new MaintenanceReporter({ persistDir });
      await reporter.load();
      expect(fs.existsSync(persistDir)).toBe(true);
    });

    it('loads existing history from disk', async () => {
      const persistDir = path.join(tmpDir, 'existing');
      fs.mkdirSync(persistDir, { recursive: true });
      const results = [makeResult('task-a', 1), makeResult('task-b', 2)];
      fs.writeFileSync(path.join(persistDir, 'history.json'), JSON.stringify(results));

      const reporter = new MaintenanceReporter({ persistDir });
      await reporter.load();
      expect(reporter.getHistory(100, 0)).toEqual(results);
    });

    it('handles corrupted JSON on disk gracefully', async () => {
      const persistDir = path.join(tmpDir, 'corrupted');
      fs.mkdirSync(persistDir, { recursive: true });
      fs.writeFileSync(path.join(persistDir, 'history.json'), '{ broken json !!!');

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const reporter = new MaintenanceReporter({ persistDir });
      await reporter.load();

      expect(reporter.getHistory(100, 0)).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        'MaintenanceReporter: failed to load history',
        expect.any(SyntaxError)
      );
      consoleSpy.mockRestore();
    });

    it('handles non-array JSON on disk gracefully', async () => {
      const persistDir = path.join(tmpDir, 'non-array');
      fs.mkdirSync(persistDir, { recursive: true });
      fs.writeFileSync(path.join(persistDir, 'history.json'), '"just a string"');

      const reporter = new MaintenanceReporter({ persistDir });
      await reporter.load();

      expect(reporter.getHistory(100, 0)).toEqual([]);
    });
  });

  describe('record and getHistory', () => {
    it('records results in most-recent-first order', async () => {
      const reporter = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter.load();

      await reporter.record(makeResult('task-a', 1));
      await reporter.record(makeResult('task-b', 2));

      const history = reporter.getHistory(100, 0);
      expect(history).toHaveLength(2);
      expect(history[0]!.taskId).toBe('task-b');
      expect(history[1]!.taskId).toBe('task-a');
    });

    it('persists to disk after record', async () => {
      const reporter = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter.load();
      await reporter.record(makeResult('task-a', 1));

      const filePath = path.join(tmpDir, 'history.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(data).toHaveLength(1);
      expect(data[0].taskId).toBe('task-a');
    });
  });

  describe('pagination', () => {
    it('returns correct slice with limit and offset', async () => {
      const reporter = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter.load();

      for (let i = 0; i < 10; i++) {
        await reporter.record(makeResult(`task-${i}`, i));
      }

      const page = reporter.getHistory(3, 2);
      expect(page).toHaveLength(3);
      // History is most-recent-first: [task-9, task-8, task-7, task-6, ...]
      expect(page[0]!.taskId).toBe('task-7');
      expect(page[1]!.taskId).toBe('task-6');
      expect(page[2]!.taskId).toBe('task-5');
    });

    it('returns empty array when offset exceeds history length', async () => {
      const reporter = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter.load();
      await reporter.record(makeResult('task-a', 1));

      expect(reporter.getHistory(10, 100)).toEqual([]);
    });
  });

  describe('history cap', () => {
    it('caps history at 500 entries', async () => {
      const reporter = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter.load();

      for (let i = 0; i < 510; i++) {
        await reporter.record(makeResult(`task-${i}`, i % 60));
      }

      const history = reporter.getHistory(1000, 0);
      expect(history).toHaveLength(500);
      // Most recent should be the last recorded
      expect(history[0]!.taskId).toBe('task-509');
    });
  });

  describe('persistence roundtrip', () => {
    it('survives load -> record -> new instance -> load', async () => {
      const reporter1 = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter1.load();
      await reporter1.record(makeResult('task-a', 1));
      await reporter1.record(makeResult('task-b', 2));

      const reporter2 = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter2.load();
      const history = reporter2.getHistory(100, 0);
      expect(history).toHaveLength(2);
      expect(history[0]!.taskId).toBe('task-b');
    });
  });
});
