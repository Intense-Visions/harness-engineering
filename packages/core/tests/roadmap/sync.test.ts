import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { syncRoadmap } from '../../src/roadmap/sync';
import type { Roadmap } from '@harness-engineering/types';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-sync-'));
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function baseRoadmap(overrides?: Partial<Roadmap>): Roadmap {
  return {
    frontmatter: {
      project: 'test',
      version: 1,
      lastSynced: '2026-03-21T10:00:00Z',
      lastManualEdit: '2026-03-21T09:00:00Z',
    },
    milestones: [
      {
        name: 'M1',
        isBacklog: false,
        features: [
          {
            name: 'Feature A',
            status: 'planned',
            spec: null,
            plans: ['docs/plans/feature-a-plan.md'],
            blockedBy: [],
            summary: 'Test feature A',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('syncRoadmap()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('state.json-based inference', () => {
    it('proposes done when all tasks in state.json are complete', () => {
      writeJson(path.join(tmpDir, '.harness', 'state.json'), {
        schemaVersion: 1,
        position: { phase: 'complete' },
        progress: { 'Task 1': 'complete', 'Task 2': 'complete' },
      });
      // Create an empty plan file so the plan path resolves
      const planPath = path.join(tmpDir, 'docs', 'plans', 'feature-a-plan.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# Plan\n');

      const roadmap = baseRoadmap();
      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([{ feature: 'Feature A', from: 'planned', to: 'done' }]);
    });

    it('proposes in-progress when some tasks are complete', () => {
      writeJson(path.join(tmpDir, '.harness', 'state.json'), {
        schemaVersion: 1,
        position: {},
        progress: { 'Task 1': 'complete', 'Task 2': 'pending' },
      });
      const planPath = path.join(tmpDir, 'docs', 'plans', 'feature-a-plan.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# Plan\n');

      const roadmap = baseRoadmap();
      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([{ feature: 'Feature A', from: 'planned', to: 'in-progress' }]);
    });

    it('proposes in-progress when a task is in_progress', () => {
      writeJson(path.join(tmpDir, '.harness', 'state.json'), {
        schemaVersion: 1,
        position: {},
        progress: { 'Task 1': 'in_progress' },
      });
      const planPath = path.join(tmpDir, 'docs', 'plans', 'feature-a-plan.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# Plan\n');

      const roadmap = baseRoadmap();
      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([{ feature: 'Feature A', from: 'planned', to: 'in-progress' }]);
    });

    it('returns no changes when feature has no linked plans', () => {
      const roadmap = baseRoadmap();
      roadmap.milestones[0]!.features[0]!.plans = [];

      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });

    it('returns no changes when no state files exist', () => {
      const planPath = path.join(tmpDir, 'docs', 'plans', 'feature-a-plan.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# Plan\n');

      const roadmap = baseRoadmap();
      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });

    it('does not propose change when status is already correct', () => {
      writeJson(path.join(tmpDir, '.harness', 'state.json'), {
        schemaVersion: 1,
        position: { phase: 'complete' },
        progress: { 'Task 1': 'complete' },
      });
      const planPath = path.join(tmpDir, 'docs', 'plans', 'feature-a-plan.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# Plan\n');

      const roadmap = baseRoadmap();
      roadmap.milestones[0]!.features[0]!.status = 'done';

      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });
  });
});
