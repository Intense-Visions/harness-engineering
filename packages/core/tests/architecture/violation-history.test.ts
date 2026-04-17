import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ViolationHistoryManager } from '../../src/architecture/violation-history';
import type { Violation } from '../../src/architecture/types';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('node:fs');

const TEST_DIR = '/tmp/test-project/.harness/arch';
const HISTORY_PATH = path.join(TEST_DIR, 'violation-history.json');

function makeViolation(id: string, file: string): Violation {
  return {
    id,
    file,
    category: 'layer-violations',
    detail: 'core -> cli: test detail',
    severity: 'error',
  };
}

describe('ViolationHistoryManager', () => {
  let manager: ViolationHistoryManager;

  beforeEach(() => {
    vi.resetAllMocks();
    manager = new ViolationHistoryManager(HISTORY_PATH);
  });

  describe('load', () => {
    it('returns empty history when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const history = manager.load();
      expect(history).toEqual({ version: 1, snapshots: [] });
    });

    it('loads existing history from file', () => {
      const stored = {
        version: 1,
        snapshots: [
          {
            timestamp: '2026-04-01T00:00:00.000Z',
            violations: [makeViolation('v1', 'src/a.ts')],
          },
        ],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(stored));
      const history = manager.load();
      expect(history.snapshots).toHaveLength(1);
      expect(history.snapshots[0]!.violations[0]!.id).toBe('v1');
    });
  });

  describe('append', () => {
    it('appends a timestamped snapshot to history', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const violations = [makeViolation('v1', 'src/a.ts')];
      manager.append(violations);

      expect(fs.writeFileSync).toHaveBeenCalledOnce();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.snapshots).toHaveLength(1);
      expect(written.snapshots[0].violations).toHaveLength(1);
      expect(written.snapshots[0].timestamp).toBeDefined();
    });

    it('appends to existing history', () => {
      const existing = {
        version: 1,
        snapshots: [
          {
            timestamp: '2026-04-01T00:00:00.000Z',
            violations: [makeViolation('v1', 'src/a.ts')],
          },
        ],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      manager.append([makeViolation('v2', 'src/b.ts')]);

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.snapshots).toHaveLength(2);
    });
  });

  describe('prune', () => {
    it('removes snapshots older than retention days', () => {
      const now = Date.now();
      const old = new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString();
      const recent = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
      const existing = {
        version: 1,
        snapshots: [
          { timestamp: old, violations: [makeViolation('v1', 'src/a.ts')] },
          { timestamp: recent, violations: [makeViolation('v2', 'src/b.ts')] },
        ],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      manager.prune(90);

      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string);
      expect(written.snapshots).toHaveLength(1);
      expect(written.snapshots[0].violations[0].id).toBe('v2');
    });

    it('does nothing when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      manager.prune(90);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });
});
