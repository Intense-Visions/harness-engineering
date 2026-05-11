import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ok, Err } from '@harness-engineering/core';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
} from '@harness-engineering/core';
import { runRoadmapMigrate } from '../../../src/commands/roadmap/migrate';

const THREE_FEATURE_ROADMAP = `---
project: test
version: 1
last_synced: 2026-05-09T00:00:00Z
last_manual_edit: 2026-05-09T00:00:00Z
---

# Roadmap

## Backlog

### Alpha

- **Status:** backlog
- **Spec:** —
- **Summary:** Alpha summary
- **Blockers:** —
- **Plan:** —

### Beta

- **Status:** backlog
- **Spec:** —
- **Summary:** Beta summary
- **Blockers:** —
- **Plan:** —

### Gamma

- **Status:** backlog
- **Spec:** —
- **Summary:** Gamma summary
- **Blockers:** —
- **Plan:** —
`;

function baseFeature(name: string, externalId: string): TrackedFeature {
  return {
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
  };
}

function happyClient(): RoadmapTrackerClient {
  let n = 0;
  return {
    fetchAll: async () => Ok({ features: [] as TrackedFeature[], etag: null }),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    fetchHistory: async () => Ok([]),
    create: async (input: NewFeatureInput) => {
      n++;
      return Ok(baseFeature(input.name, `github:o/r#${n}`));
    },
    update: async (id) => Ok(baseFeature('x', id)),
    claim: async (id) => Ok(baseFeature('x', id)),
    release: async (id) => Ok(baseFeature('x', id)),
    complete: async (id) => Ok(baseFeature('x', id)),
    appendHistory: async () => Ok(undefined),
  };
}

function throwingClient(): RoadmapTrackerClient {
  const fail = (msg: string) => {
    throw new Error(`tracker write should not be invoked: ${msg}`);
  };
  return {
    fetchAll: async () => Ok({ features: [] as TrackedFeature[], etag: null }),
    fetchById: async () => Ok(null),
    fetchByStatus: async () => Ok([]),
    fetchHistory: async () => Ok([]),
    create: async () => fail('create'),
    update: async () => fail('update'),
    claim: async () => fail('claim'),
    release: async () => fail('release'),
    complete: async () => fail('complete'),
    appendHistory: async () => fail('appendHistory'),
  };
}

/**
 * Client that fails on the Nth create call (1-indexed). Subsequent fields
 * (update/claim/etc) are inert success returns; not exercised in these tests.
 */
function createFailsOnNth(nth: number): {
  client: RoadmapTrackerClient;
  createdNames: string[];
  callCount: () => number;
} {
  let n = 0;
  const createdNames: string[] = [];
  return {
    createdNames,
    callCount: () => n,
    client: {
      fetchAll: async () => Ok({ features: [] as TrackedFeature[], etag: null }),
      fetchById: async () => Ok(null),
      fetchByStatus: async () => Ok([]),
      fetchHistory: async () => Ok([]),
      create: async (input: NewFeatureInput) => {
        n++;
        if (n === nth) {
          return Err(new Error(`simulated tracker failure on create #${n}`));
        }
        createdNames.push(input.name);
        return Ok(baseFeature(input.name, `github:o/r#${n}`));
      },
      update: async (id) => Ok(baseFeature('x', id)),
      claim: async (id) => Ok(baseFeature('x', id)),
      release: async (id) => Ok(baseFeature('x', id)),
      complete: async (id) => Ok(baseFeature('x', id)),
      appendHistory: async () => Ok(undefined),
    },
  };
}

function makeProject(opts: { roadmap?: string } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-migrate-idem-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), opts.roadmap ?? THREE_FEATURE_ROADMAP);
  fs.writeFileSync(
    path.join(dir, 'harness.config.json'),
    JSON.stringify(
      {
        docsDir: 'docs',
        roadmap: { tracker: { kind: 'github', repo: 'o/r' } },
      },
      null,
      2
    )
  );
  return dir;
}

describe('runRoadmapMigrate — re-run after success (idempotent)', () => {
  let cwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cwd = '';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
    cwd = '';
    logSpy.mockRestore();
  });

  it('a second run after a successful migration is a no-op', async () => {
    cwd = makeProject();

    // First run: mutate the fixture.
    const first = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: false,
      cwd,
      client: happyClient(),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.mode).toBe('applied');
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md.archived'))).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(false);

    // Second run: short-circuit. The throwing client guarantees that NO tracker
    // method is invoked. The runner must early-return on `mode === 'file-less'`.
    const second = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: false,
      cwd,
      client: throwingClient(),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.mode).toBe('already-migrated');
  });
});

describe('runRoadmapMigrate — re-run after partial failure', () => {
  let cwd: string;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cwd = '';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (cwd) fs.rmSync(cwd, { recursive: true, force: true });
    cwd = '';
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('aborts on the 3rd create; re-run after hand-recording External-IDs only creates the missing one', async () => {
    cwd = makeProject();

    // First run: client errors on 3rd create. Features 1 + 2 land; feature 3 fails.
    const failing = createFailsOnNth(3);
    const first = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: false,
      cwd,
      client: failing.client,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.mode).toBe('aborted');
    expect(first.value.createdSoFar?.length).toBe(2);
    // Hand-recordable identifiers surface for the operator.
    const createdNames = (first.value.createdSoFar ?? []).map((c) => c.name).sort();
    expect(createdNames).toEqual(['Alpha', 'Beta']);
    // Failure happened before archive / config rewrite.
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md.archived'))).toBe(false);
    expect(fs.existsSync(path.join(cwd, 'harness.config.json.pre-migration'))).toBe(false);
    const cfgPostAbort = JSON.parse(
      fs.readFileSync(path.join(cwd, 'harness.config.json'), 'utf-8')
    ) as { roadmap?: { mode?: string } };
    expect(cfgPostAbort.roadmap?.mode).toBeUndefined();

    // Operator action (simulated): record the two created External-IDs in roadmap.md.
    const createdById = new Map(
      (first.value.createdSoFar ?? []).map((c) => [c.name, c.externalId] as const)
    );
    const alphaId = createdById.get('Alpha');
    const betaId = createdById.get('Beta');
    expect(alphaId).toBeTruthy();
    expect(betaId).toBeTruthy();
    const updated = THREE_FEATURE_ROADMAP.replace(
      '### Alpha\n\n- **Status:** backlog',
      `### Alpha\n\n- **External-ID:** ${alphaId}\n- **Status:** backlog`
    ).replace(
      '### Beta\n\n- **Status:** backlog',
      `### Beta\n\n- **External-ID:** ${betaId}\n- **Status:** backlog`
    );
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), updated);

    // Second run: client where create() no longer fails. The two recorded features
    // are already known to the tracker (returned from fetchAll), so only Gamma
    // triggers a create. We assert exactly one create call.
    let createCallsSecondRun = 0;
    let secondId = 0;
    const knownFeatures: TrackedFeature[] = [
      baseFeature('Alpha', alphaId!),
      baseFeature('Beta', betaId!),
    ];
    const recoveringClient: RoadmapTrackerClient = {
      fetchAll: async () => Ok({ features: knownFeatures, etag: null }),
      fetchById: async () => Ok(null),
      fetchByStatus: async () => Ok([]),
      fetchHistory: async () => Ok([]),
      create: async (input: NewFeatureInput) => {
        createCallsSecondRun++;
        secondId++;
        return Ok(baseFeature(input.name, `github:o/r#10${secondId}`));
      },
      update: async (id) => Ok(baseFeature('x', id)),
      claim: async (id) => Ok(baseFeature('x', id)),
      release: async (id) => Ok(baseFeature('x', id)),
      complete: async (id) => Ok(baseFeature('x', id)),
      appendHistory: async () => Ok(undefined),
    };

    const second = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: false,
      cwd,
      client: recoveringClient,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.mode).toBe('applied');
    expect(createCallsSecondRun).toBe(1);
    expect(second.value.created).toBe(1);
  });
});
