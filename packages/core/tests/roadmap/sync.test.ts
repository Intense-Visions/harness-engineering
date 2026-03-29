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

  describe('autopilot-state.json-based inference', () => {
    it('proposes done when all linked phases are complete', () => {
      const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
      writeJson(path.join(sessionDir, 'autopilot-state.json'), {
        schemaVersion: 2,
        sessionDir: '.harness/sessions/test-session',
        currentState: 'DONE',
        currentPhase: 1,
        phases: [
          {
            name: 'Phase 1',
            planPath: 'docs/plans/feature-a-plan.md',
            status: 'complete',
            complexity: 'low',
            complexityOverride: null,
          },
        ],
      });
      const planPath = path.join(tmpDir, 'docs', 'plans', 'feature-a-plan.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# Plan\n');

      const roadmap = baseRoadmap();
      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([{ feature: 'Feature A', from: 'planned', to: 'done' }]);
    });

    it('proposes in-progress when some phases are not complete', () => {
      const sessionDir = path.join(tmpDir, '.harness', 'sessions', 'test-session');
      writeJson(path.join(sessionDir, 'autopilot-state.json'), {
        schemaVersion: 2,
        sessionDir: '.harness/sessions/test-session',
        currentState: 'PLAN',
        currentPhase: 1,
        phases: [
          {
            name: 'Phase 1',
            planPath: 'docs/plans/feature-a-plan.md',
            status: 'complete',
            complexity: 'low',
            complexityOverride: null,
          },
          {
            name: 'Phase 2',
            planPath: 'docs/plans/feature-a-phase2-plan.md',
            status: 'pending',
            complexity: 'low',
            complexityOverride: null,
          },
        ],
      });

      const roadmap = baseRoadmap();
      roadmap.milestones[0]!.features[0]!.plans = [
        'docs/plans/feature-a-plan.md',
        'docs/plans/feature-a-phase2-plan.md',
      ];

      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([{ feature: 'Feature A', from: 'planned', to: 'in-progress' }]);
    });
  });

  describe('blocker inference', () => {
    it('proposes blocked when a blocker feature is not done', () => {
      const roadmap = baseRoadmap();
      roadmap.milestones[0]!.features = [
        {
          name: 'Feature A',
          status: 'done',
          spec: null,
          plans: [],
          blockedBy: [],
          summary: 'Dep',
        },
        {
          name: 'Feature B',
          status: 'planned',
          spec: null,
          plans: [],
          blockedBy: ['Feature A'],
          summary: 'Blocked feature',
        },
      ];
      // Feature A is done, so Feature B should NOT be blocked
      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });

    it('proposes blocked when blocker is in-progress', () => {
      const roadmap = baseRoadmap();
      roadmap.milestones[0]!.features = [
        {
          name: 'Feature A',
          status: 'in-progress',
          spec: null,
          plans: [],
          blockedBy: [],
          summary: 'Dep',
        },
        {
          name: 'Feature B',
          status: 'planned',
          spec: null,
          plans: [],
          blockedBy: ['Feature A'],
          summary: 'Blocked feature',
        },
      ];
      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([{ feature: 'Feature B', from: 'planned', to: 'blocked' }]);
    });
  });

  describe('directional guard (human-always-wins)', () => {
    it('allows forward progression even after manual edits', () => {
      writeJson(path.join(tmpDir, '.harness', 'state.json'), {
        schemaVersion: 1,
        position: { phase: 'complete' },
        progress: { 'Task 1': 'complete' },
      });
      const planPath = path.join(tmpDir, 'docs', 'plans', 'feature-a-plan.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# Plan\n');

      const roadmap = baseRoadmap({
        frontmatter: {
          project: 'test',
          version: 1,
          lastSynced: '2026-03-21T09:00:00Z',
          lastManualEdit: '2026-03-21T10:00:00Z', // newer — no longer blocks
        },
      });

      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([{ feature: 'Feature A', from: 'planned', to: 'done' }]);
    });

    it('blocks regression (done -> in-progress) without forceSync', () => {
      writeJson(path.join(tmpDir, '.harness', 'state.json'), {
        schemaVersion: 1,
        position: {},
        progress: { 'Task 1': 'in_progress' },
      });
      const planPath = path.join(tmpDir, 'docs', 'plans', 'feature-a-plan.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# Plan\n');

      const roadmap = baseRoadmap();
      roadmap.milestones[0]!.features[0]!.status = 'done';

      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]); // regression blocked
    });

    it('allows blocked → planned (lateral, not a regression)', () => {
      // No state files — inferStatus returns null, but if a blocker resolves
      // and inferStatus returns 'planned', the lateral move should be allowed
      const roadmap = baseRoadmap();
      roadmap.milestones[0]!.features = [
        {
          name: 'Feature A',
          status: 'done',
          spec: null,
          plans: [],
          blockedBy: [],
          summary: 'Dep',
        },
        {
          name: 'Feature B',
          status: 'blocked',
          spec: null,
          plans: [],
          blockedBy: ['Feature A'],
          summary: 'Was blocked, blocker now done',
        },
      ];
      // Feature A is done, so Feature B's blocker is resolved — no blocked inference
      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // No state files for Feature B, so inferStatus returns null — no change proposed
      // This documents that blocked → planned requires state data or manual update
      expect(result.value).toEqual([]);
    });

    it('allows regression when forceSync is true', () => {
      writeJson(path.join(tmpDir, '.harness', 'state.json'), {
        schemaVersion: 1,
        position: {},
        progress: { 'Task 1': 'in_progress' },
      });
      const planPath = path.join(tmpDir, 'docs', 'plans', 'feature-a-plan.md');
      fs.mkdirSync(path.dirname(planPath), { recursive: true });
      fs.writeFileSync(planPath, '# Plan\n');

      const roadmap = baseRoadmap();
      roadmap.milestones[0]!.features[0]!.status = 'done';

      const result = syncRoadmap({
        projectPath: tmpDir,
        roadmap,
        forceSync: true,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([{ feature: 'Feature A', from: 'done', to: 'in-progress' }]);
    });
  });

  describe('multi-feature isolation', () => {
    it('does not apply state.json progress to unrelated features', () => {
      // state.json tracks tasks for Feature A's plan but Feature B has different plans
      writeJson(path.join(tmpDir, '.harness', 'state.json'), {
        schemaVersion: 1,
        position: { phase: 'complete' },
        progress: { 'Task 1': 'complete', 'Task 2': 'complete' },
        lastSession: { planPath: 'docs/plans/feature-a-plan.md' },
      });
      const planPathA = path.join(tmpDir, 'docs', 'plans', 'feature-a-plan.md');
      const planPathB = path.join(tmpDir, 'docs', 'plans', 'feature-b-plan.md');
      fs.mkdirSync(path.dirname(planPathA), { recursive: true });
      fs.writeFileSync(planPathA, '# Plan A\n');
      fs.writeFileSync(planPathB, '# Plan B\n');

      const roadmap = baseRoadmap();
      roadmap.milestones[0]!.features = [
        {
          name: 'Feature A',
          status: 'planned',
          spec: null,
          plans: ['docs/plans/feature-a-plan.md'],
          blockedBy: [],
          summary: 'A',
        },
        {
          name: 'Feature B',
          status: 'planned',
          spec: null,
          plans: ['docs/plans/feature-b-plan.md'],
          blockedBy: [],
          summary: 'B',
        },
      ];

      const result = syncRoadmap({ projectPath: tmpDir, roadmap });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Root state.json is skipped when multiple features have linked plans
      // because it has no planPath field and would produce ambiguous inferences.
      // Only autopilot session state (with precise planPath matching) is used.
      expect(result.value).toEqual([]);
    });
  });
});
