import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Ok } from '@harness-engineering/core';
import type { RoadmapTrackerClient, TrackedFeature } from '@harness-engineering/core';
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

### Bar

- **Status:** backlog
- **Spec:** —
- **Summary:** Bar summary
- **Blockers:** —
- **Plan:** —
`;

/**
 * A client where every write method throws. Reads return normally so that
 * fetchAll / fetchById / fetchByStatus / fetchHistory succeed during plan
 * construction.
 */
function readsOnlyClient(): RoadmapTrackerClient {
  const fail = (msg: string) => {
    throw new Error(`write attempted in dry run: ${msg}`);
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

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-migrate-dryrun-'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'roadmap.md'), ROADMAP_MD);
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

describe('runRoadmapMigrate (dry-run zero-write assertion)', () => {
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

  it('--dry-run never invokes a tracker write and reports mode: "dry-run"', async () => {
    cwd = makeProject();
    const result = await runRoadmapMigrate({
      to: 'file-less',
      dryRun: true,
      cwd,
      client: readsOnlyClient(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mode).toBe('dry-run');

    // No archive, no backup, original file untouched.
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md'))).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'docs', 'roadmap.md.archived'))).toBe(false);
    expect(fs.existsSync(path.join(cwd, 'harness.config.json.pre-migration'))).toBe(false);

    // Plan summary appears on stdout (the "Would create" line is the canary).
    const stdout = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(stdout).toContain('Migration plan:');
    expect(stdout).toContain('Would create:');
    expect(stdout).toContain('Would update:');
    expect(stdout).toContain('Unchanged:');
  });
});
