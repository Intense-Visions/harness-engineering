import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ok } from '@harness-engineering/core';
import type {
  RoadmapTrackerClient,
  TrackedFeature,
  NewFeatureInput,
} from '@harness-engineering/core';
import { runRoadmapMigrate } from '../../../src/commands/roadmap/migrate';

const ROADMAP_MD = `---
project: test
version: 1
last_synced: 2026-05-09T00:00:00Z
last_manual_edit: 2026-05-09T00:00:00Z
---

# Roadmap

## Backlog

### Foo

- **Status:** backlog
- **Spec:** —
- **Summary:** Foo summary
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

describe('runRoadmapMigrate — config preservation (D-P5-F)', () => {
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

  it('rewrites harness.config.json with mode=file-less, backs up the original byte-identically, preserves every other field', async () => {
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-migrate-config-'));
    fs.mkdirSync(path.join(cwd, 'docs'));
    fs.writeFileSync(path.join(cwd, 'docs', 'roadmap.md'), ROADMAP_MD);

    const originalConfig = {
      docsDir: 'docs',
      roadmap: { tracker: { kind: 'github', repo: 'o/r' } },
      experimental: { featureA: true },
    };
    const originalSerialized = JSON.stringify(originalConfig, null, 2);
    fs.writeFileSync(path.join(cwd, 'harness.config.json'), originalSerialized);

    const result = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: false,
      cwd,
      client: happyClient(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('applied');

    // Backup is byte-identical to the original.
    const backupPath = path.join(cwd, 'harness.config.json.pre-migration');
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.readFileSync(backupPath, 'utf-8')).toBe(originalSerialized);

    // Rewritten file: original + roadmap.mode='file-less'; every other field untouched.
    const rewrittenRaw = fs.readFileSync(path.join(cwd, 'harness.config.json'), 'utf-8');
    expect(rewrittenRaw.endsWith('\n')).toBe(true);
    const rewritten = JSON.parse(rewrittenRaw) as typeof originalConfig & {
      roadmap: { mode?: string; tracker: { kind: string; repo: string } };
    };
    expect(rewritten).toEqual({
      docsDir: 'docs',
      roadmap: {
        tracker: { kind: 'github', repo: 'o/r' },
        mode: 'file-less',
      },
      experimental: { featureA: true },
    });
  });
});
