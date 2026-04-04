import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSnapshotCommand, runSnapshotCapture } from '../../src/commands/snapshot';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('snapshot command', () => {
  describe('createSnapshotCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createSnapshotCommand();
      expect(cmd.name()).toBe('snapshot');
    });

    it('has capture subcommand', () => {
      const cmd = createSnapshotCommand();
      const sub = cmd.commands.find((c) => c.name() === 'capture');
      expect(sub).toBeDefined();
    });

    it('has trends subcommand', () => {
      const cmd = createSnapshotCommand();
      const sub = cmd.commands.find((c) => c.name() === 'trends');
      expect(sub).toBeDefined();
    });

    it('has list subcommand', () => {
      const cmd = createSnapshotCommand();
      const sub = cmd.commands.find((c) => c.name() === 'list');
      expect(sub).toBeDefined();
    });

    it('trends subcommand has --last and --since options', () => {
      const cmd = createSnapshotCommand();
      const trends = cmd.commands.find((c) => c.name() === 'trends');
      const opts = trends!.options.map((o) => o.long);
      expect(opts).toContain('--last');
      expect(opts).toContain('--since');
    });
  });

  describe('runSnapshotCapture', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-'));
      // Create minimal harness.config.json
      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('captures a snapshot and writes timeline.json', async () => {
      const result = await runSnapshotCapture({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
      });

      expect(result.snapshot).toBeDefined();
      expect(result.snapshot.stabilityScore).toBeGreaterThanOrEqual(0);
      expect(result.snapshot.stabilityScore).toBeLessThanOrEqual(100);
      expect(result.snapshot.commitHash).toBeDefined();
      expect(result.snapshot.capturedAt).toBeDefined();
      expect(result.previous).toBeUndefined();

      // Verify timeline file was created
      const timelinePath = path.join(tmpDir, '.harness', 'arch', 'timeline.json');
      expect(fs.existsSync(timelinePath)).toBe(true);

      const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'));
      expect(timeline.version).toBe(1);
      expect(timeline.snapshots).toHaveLength(1);
    });

    it('returns previous snapshot on second capture', async () => {
      // First capture
      const first = await runSnapshotCapture({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
      });

      // Modify the timeline to have a different commit so dedup does not replace
      const timelinePath = path.join(tmpDir, '.harness', 'arch', 'timeline.json');
      const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'));
      timeline.snapshots[0].commitHash = 'previous123';
      fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));

      // Second capture
      const second = await runSnapshotCapture({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
      });

      expect(second.previous).toBeDefined();
      expect(second.previous!.commitHash).toBe('previous123');
    });

    it('snapshot contains all 7 metric categories', async () => {
      const result = await runSnapshotCapture({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
      });

      const categories = Object.keys(result.snapshot.metrics);
      expect(categories).toContain('circular-deps');
      expect(categories).toContain('layer-violations');
      expect(categories).toContain('complexity');
      expect(categories).toContain('coupling');
      expect(categories).toContain('forbidden-imports');
      expect(categories).toContain('module-size');
      expect(categories).toContain('dependency-depth');
      expect(categories).toHaveLength(7);
    });

    it('throws CLIError for invalid config path', async () => {
      await expect(
        runSnapshotCapture({
          configPath: '/nonexistent/harness.config.json',
        })
      ).rejects.toThrow();
    });
  });

  describe('trends and list via TimelineManager', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-trends-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const makeSnapshot = (score: number, hash: string, date: string) => ({
      capturedAt: date,
      commitHash: hash,
      stabilityScore: score,
      metrics: {
        'circular-deps': { value: 0, violationCount: 0 },
        'layer-violations': { value: 0, violationCount: 0 },
        complexity: { value: 0, violationCount: 0 },
        coupling: { value: 0, violationCount: 0 },
        'forbidden-imports': { value: 0, violationCount: 0 },
        'module-size': { value: 0, violationCount: 0 },
        'dependency-depth': { value: 0, violationCount: 0 },
      },
    });

    it('trends returns empty result when no snapshots exist', async () => {
      const { TimelineManager } = await import('@harness-engineering/core');
      const manager = new TimelineManager(tmpDir);
      const trends = manager.trends();

      expect(trends.snapshotCount).toBe(0);
      expect(trends.stability.direction).toBe('stable');
    });

    it('trends respects --last option', async () => {
      const { TimelineManager } = await import('@harness-engineering/core');
      const manager = new TimelineManager(tmpDir);

      const timeline = {
        version: 1 as const,
        snapshots: [
          makeSnapshot(60, 'aaa', '2026-01-01T00:00:00.000Z'),
          makeSnapshot(65, 'bbb', '2026-01-08T00:00:00.000Z'),
          makeSnapshot(70, 'ccc', '2026-01-15T00:00:00.000Z'),
          makeSnapshot(75, 'ddd', '2026-01-22T00:00:00.000Z'),
          makeSnapshot(80, 'eee', '2026-01-29T00:00:00.000Z'),
        ],
      };
      manager.save(timeline);

      const trends = manager.trends({ last: 3 });
      expect(trends.snapshotCount).toBe(3);
      expect(trends.stability.previous).toBe(70);
      expect(trends.stability.current).toBe(80);
    });

    it('trends respects --since option', async () => {
      const { TimelineManager } = await import('@harness-engineering/core');
      const manager = new TimelineManager(tmpDir);

      const timeline = {
        version: 1 as const,
        snapshots: [
          makeSnapshot(60, 'aaa', '2026-01-01T00:00:00.000Z'),
          makeSnapshot(70, 'bbb', '2026-02-01T00:00:00.000Z'),
          makeSnapshot(80, 'ccc', '2026-03-01T00:00:00.000Z'),
        ],
      };
      manager.save(timeline);

      const trends = manager.trends({ since: '2026-02-01' });
      expect(trends.snapshotCount).toBe(2);
      expect(trends.stability.previous).toBe(70);
      expect(trends.stability.current).toBe(80);
    });

    it('list loads empty timeline when no snapshots exist', async () => {
      const { TimelineManager } = await import('@harness-engineering/core');
      const manager = new TimelineManager(tmpDir);
      const timeline = manager.load();
      expect(timeline.snapshots).toHaveLength(0);
    });
  });
});
