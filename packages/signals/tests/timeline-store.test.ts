import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SignalTimelineStore } from '../src/timeline-store';

function tmpDir(): string {
  return path.join(__dirname, '__test-tmp-signals-timeline__');
}
function timelinePath(root: string): string {
  return path.join(root, '.harness', 'signals', 'timeline.json');
}

describe('SignalTimelineStore', () => {
  let root: string;
  let store: SignalTimelineStore;

  beforeEach(() => {
    root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    store = new SignalTimelineStore(root);
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('appendPoint() idempotency', () => {
    it('appends a new point and persists it', () => {
      store.appendPoint('complexity-trend-up-30d', '2026-06-20', 1.5);
      expect(store.read('complexity-trend-up-30d')).toEqual([{ date: '2026-06-20', value: 1.5 }]);
      expect(fs.existsSync(timelinePath(root))).toBe(true);
    });

    it('is a no-op when a point for the same (id, date) already exists', () => {
      store.appendPoint('complexity-trend-up-30d', '2026-06-20', 1.5);
      store.appendPoint('complexity-trend-up-30d', '2026-06-20', 9.9);
      expect(store.read('complexity-trend-up-30d')).toEqual([{ date: '2026-06-20', value: 1.5 }]);
    });

    it('has() reflects appended points', () => {
      store.appendPoint('baseline-auto-update-count', '2026-06-21', 2);
      expect(store.has('baseline-auto-update-count', '2026-06-21')).toBe(true);
      expect(store.has('baseline-auto-update-count', '2026-06-22')).toBe(false);
    });
  });

  describe('backfill() merge', () => {
    it('merges historical points without overwriting an existing (id, date)', () => {
      store.appendPoint('coverage-trend-down-30d', '2026-06-20', 80);
      store.backfill('coverage-trend-down-30d', [
        { date: '2026-06-18', value: 70 },
        { date: '2026-06-19', value: 75 },
        { date: '2026-06-20', value: 999 }, // existing — must NOT overwrite
      ]);
      expect(store.read('coverage-trend-down-30d')).toEqual([
        { date: '2026-06-18', value: 70 },
        { date: '2026-06-19', value: 75 },
        { date: '2026-06-20', value: 80 },
      ]);
    });
  });

  describe('soft-fail', () => {
    it('treats a missing file as empty', () => {
      expect(store.read('eval-fail-rate')).toEqual([]);
      expect(store.has('eval-fail-rate', '2026-06-20')).toBe(false);
    });

    it('treats a corrupt file as empty (no throw)', () => {
      fs.mkdirSync(path.dirname(timelinePath(root)), { recursive: true });
      fs.writeFileSync(timelinePath(root), '{ not valid json ');
      expect(() => store.read('eval-fail-rate')).not.toThrow();
      expect(store.read('eval-fail-rate')).toEqual([]);
      // A subsequent append recovers by re-deriving from empty.
      store.appendPoint('eval-fail-rate', '2026-06-20', 0.05);
      expect(store.read('eval-fail-rate')).toEqual([{ date: '2026-06-20', value: 0.05 }]);
    });
  });
});
