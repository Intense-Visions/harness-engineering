import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runMigrationPlan } from '../../../src/roadmap/migrate/run';
import type { RunDeps } from '../../../src/roadmap/migrate/run';
import type { MigrationPlan } from '../../../src/roadmap/migrate/types';
import { Ok, Err } from '@harness-engineering/types';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
  FeaturePatch,
  HistoryEvent,
} from '../../../src/roadmap/tracker';

interface RecordedCall {
  method: string;
  args: unknown[];
  order: number;
}

function recordingClient(
  scripted: {
    create?: (
      input: NewFeatureInput
    ) => Promise<{ ok: boolean; value?: TrackedFeature; error?: Error }>;
    update?: (
      id: string,
      patch: FeaturePatch
    ) => Promise<{ ok: boolean; value?: TrackedFeature; error?: Error }>;
    appendHistory?: (id: string, e: HistoryEvent) => Promise<{ ok: boolean; error?: Error }>;
  } = {}
): { client: RoadmapTrackerClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let order = 0;
  const baseFeature = (name: string, externalId: string): TrackedFeature => ({
    externalId,
    name,
    status: 'backlog',
    summary: `${name} summary`,
    spec: null,
    plans: [],
    blockedBy: [],
    assignee: null,
    priority: null,
    milestone: null,
    createdAt: '2026-05-09T00:00:00Z',
    updatedAt: null,
  });
  const client: RoadmapTrackerClient = {
    fetchAll: async () => Ok({ features: [], etag: null }),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    create: async (input: NewFeatureInput) => {
      calls.push({ method: 'create', args: [input], order: order++ });
      if (scripted.create) {
        const r = await scripted.create(input);
        if (!r.ok) return Err(r.error!);
        return Ok(r.value!);
      }
      const externalId = `github:o/r#${order}`;
      return Ok(baseFeature(input.name, externalId));
    },
    update: async (id: string, patch: FeaturePatch) => {
      calls.push({ method: 'update', args: [id, patch], order: order++ });
      if (scripted.update) {
        const r = await scripted.update(id, patch);
        if (!r.ok) return Err(r.error!);
        return Ok(r.value!);
      }
      return Ok(baseFeature('Existing', id));
    },
    claim: async () => Ok(baseFeature('x', 'github:o/r#1')),
    release: async () => Ok(baseFeature('x', 'github:o/r#1')),
    complete: async () => Ok(baseFeature('x', 'github:o/r#1')),
    appendHistory: async (id: string, e: HistoryEvent) => {
      calls.push({ method: 'appendHistory', args: [id, e], order: order++ });
      if (scripted.appendHistory) {
        const r = await scripted.appendHistory(id, e);
        if (!r.ok) return Err(r.error!);
        return Ok(undefined);
      }
      return Ok(undefined);
    },
    fetchHistory: async () => Ok([]),
  };
  return { client, calls };
}

function tmpRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-run-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), '# Roadmap\n');
  fs.writeFileSync(
    path.join(dir, 'harness.config.json'),
    JSON.stringify(
      { docsDir: 'docs', roadmap: { tracker: { kind: 'github', repo: 'o/r' } } },
      null,
      2
    )
  );
  return dir;
}

function makeDeps(projectRoot: string, client: RoadmapTrackerClient): RunDeps {
  return {
    client,
    readFile: (p) => fs.readFileSync(p, 'utf-8'),
    writeFile: (p, b) => fs.writeFileSync(p, b),
    renameFile: (from, to) => fs.renameSync(from, to),
    existsFile: (p) => fs.existsSync(p),
  };
}

const EMPTY_PLAN: MigrationPlan = {
  toCreate: [],
  toUpdate: [],
  unchanged: [],
  historyToAppend: [],
  ambiguous: [],
};

describe('runMigrationPlan', () => {
  it('happy path: 2 creates + 1 update + 1 history append; archive + config rewrite happen last', async () => {
    const projectRoot = tmpRoot();
    const { client, calls } = recordingClient();
    const plan: MigrationPlan = {
      toCreate: [
        { name: 'A', input: { name: 'A', summary: 'A summary' } },
        { name: 'B', input: { name: 'B', summary: 'B summary' } },
      ],
      toUpdate: [
        { externalId: 'github:o/r#9', name: 'C', patch: { summary: 'C summary' }, diff: 'spec' },
      ],
      unchanged: [],
      historyToAppend: [
        {
          externalId: 'github:o/r#9',
          event: { type: 'claimed', actor: 'alice', at: '2026-05-01' },
          hash: 'aabbccdd',
        },
      ],
      ambiguous: [],
    };
    const result = await runMigrationPlan(plan, makeDeps(projectRoot, client), {
      projectRoot,
      dryRun: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const report = result.value;
    expect(report.mode).toBe('applied');
    expect(report.created).toBe(2);
    expect(report.updated).toBe(1);
    expect(report.historyAppended).toBe(1);
    expect(report.archivedFrom).toBe(path.join(projectRoot, 'docs', 'roadmap.md'));
    expect(report.archivedTo).toBe(path.join(projectRoot, 'docs', 'roadmap.md.archived'));
    expect(report.configBackup).toBe(path.join(projectRoot, 'harness.config.json.pre-migration'));

    // Call order: creates → update → appendHistory.
    const methodOrder = calls.map((c) => c.method);
    expect(methodOrder).toEqual(['create', 'create', 'update', 'appendHistory']);

    // Archive happened.
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md.archived'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md'))).toBe(false);

    // Config has mode: 'file-less'.
    const cfg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'harness.config.json'), 'utf-8'));
    expect(cfg.roadmap.mode).toBe('file-less');
    // Backup exists.
    expect(fs.existsSync(path.join(projectRoot, 'harness.config.json.pre-migration'))).toBe(true);
  });

  it('dryRun: zero writes; no archive; no config rewrite', async () => {
    const projectRoot = tmpRoot();
    const scriptedThrowing = {
      create: async () => ({
        ok: false,
        error: new Error('create should not be called in dry-run'),
      }),
      update: async () => ({
        ok: false,
        error: new Error('update should not be called in dry-run'),
      }),
      appendHistory: async () => ({
        ok: false,
        error: new Error('appendHistory should not be called in dry-run'),
      }),
    };
    const { client, calls } = recordingClient(scriptedThrowing);
    const plan: MigrationPlan = {
      toCreate: [{ name: 'A', input: { name: 'A', summary: 'A' } }],
      toUpdate: [{ externalId: 'github:o/r#9', name: 'C', patch: { summary: 'C' }, diff: 'spec' }],
      unchanged: [],
      historyToAppend: [
        {
          externalId: 'github:o/r#9',
          event: { type: 'claimed', actor: 'alice', at: '2026-05-01' },
          hash: 'aabbccdd',
        },
      ],
      ambiguous: [],
    };
    const result = await runMigrationPlan(plan, makeDeps(projectRoot, client), {
      projectRoot,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('dry-run');
    expect(calls).toEqual([]);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md.archived'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'harness.config.json.pre-migration'))).toBe(false);
  });

  it('partial failure at step 3 (create): abort before archive + config; report which were created', async () => {
    const projectRoot = tmpRoot();
    let createCount = 0;
    const scripted = {
      create: async (input: NewFeatureInput) => {
        createCount++;
        if (createCount === 3) {
          return { ok: false, error: new Error(`boom on ${input.name}`) };
        }
        return {
          ok: true,
          value: {
            externalId: `github:o/r#${createCount}`,
            name: input.name,
            status: 'backlog' as const,
            summary: input.summary,
            spec: null,
            plans: [],
            blockedBy: [],
            assignee: null,
            priority: null,
            milestone: null,
            createdAt: '2026-05-09T00:00:00Z',
            updatedAt: null,
          },
        };
      },
    };
    const { client } = recordingClient(scripted);
    const plan: MigrationPlan = {
      toCreate: [
        { name: 'A', input: { name: 'A', summary: 'A' } },
        { name: 'B', input: { name: 'B', summary: 'B' } },
        { name: 'C', input: { name: 'C', summary: 'C' } },
      ],
      toUpdate: [],
      unchanged: [],
      historyToAppend: [],
      ambiguous: [],
    };
    const result = await runMigrationPlan(plan, makeDeps(projectRoot, client), {
      projectRoot,
      dryRun: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('aborted');
    expect(result.value.abortReason).toContain('C');
    expect(result.value.created).toBe(2);
    expect(result.value.createdSoFar).toHaveLength(2);
    expect(result.value.createdSoFar![0]!.name).toBe('A');
    expect(result.value.createdSoFar![1]!.name).toBe('B');

    // docs/roadmap.md still exists; no archive; no backup.
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'roadmap.md.archived'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'harness.config.json.pre-migration'))).toBe(false);
  });

  it('config rewrite preserves all other fields and ends with newline', async () => {
    const projectRoot = tmpRoot();
    // Add extra fields to the config.
    const extra = {
      docsDir: 'docs',
      project: { name: 'demo' },
      roadmap: { tracker: { kind: 'github', repo: 'o/r' }, extra: 42 },
      misc: ['a', 'b'],
    };
    fs.writeFileSync(path.join(projectRoot, 'harness.config.json'), JSON.stringify(extra, null, 2));
    const { client } = recordingClient();
    const result = await runMigrationPlan(EMPTY_PLAN, makeDeps(projectRoot, client), {
      projectRoot,
      dryRun: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('applied');
    const cfgText = fs.readFileSync(path.join(projectRoot, 'harness.config.json'), 'utf-8');
    expect(cfgText.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(cfgText);
    expect(parsed.project).toEqual({ name: 'demo' });
    expect(parsed.misc).toEqual(['a', 'b']);
    expect(parsed.roadmap.tracker).toEqual({ kind: 'github', repo: 'o/r' });
    expect(parsed.roadmap.extra).toBe(42);
    expect(parsed.roadmap.mode).toBe('file-less');
  });
});
