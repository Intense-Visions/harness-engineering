/**
 * #2619: an invalid `status` on add/update must be rejected BEFORE anything is
 * written. The JSON-schema enum is advisory (the MCP Server does not validate
 * input), and the parser that rejects the value used to run only on the
 * read-back after persist, so the bad row landed on disk and every later
 * read of the roadmap failed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  parseRoadmap,
  roadmapToShards,
  serializeShard,
  serializeMeta,
} from '@harness-engineering/core';
import { handleManageRoadmap } from '../../../src/mcp/tools/roadmap';
import * as autoSync from '../../../src/mcp/tools/roadmap-auto-sync';

const FIXTURE = `---
project: test-project
version: 1
last_synced: 2026-01-01T00:00:00Z
last_manual_edit: 2026-01-01T00:00:00Z
---

# Project Roadmap

## Milestone: MVP Release

### Feature: Auth System
- **Status:** planned
- **Spec:** —
- **Plans:** —
- **Blocked by:** —
- **Summary:** Authentication and authorization
`;

let dir: string;

function writeSharded(root: string): void {
  const parsed = parseRoadmap(FIXTURE);
  if (!parsed.ok) throw parsed.error;
  const { shards, meta } = roadmapToShards(parsed.value);
  const d = path.join(root, 'docs', 'roadmap.d');
  fs.mkdirSync(d, { recursive: true });
  for (const shard of shards) {
    fs.writeFileSync(path.join(d, `${shard.slug}.md`), serializeShard(shard), 'utf-8');
  }
  fs.writeFileSync(path.join(d, '_meta.md'), serializeMeta(meta), 'utf-8');
}

function writeMonolith(root: string): void {
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'roadmap.md'), FIXTURE, 'utf-8');
}

/** Every file under docs/, path -> content, for a byte-level no-write check. */
function snapshotDocs(root: string): Map<string, string> {
  const snap = new Map<string, string>();
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else snap.set(path.relative(root, p).split(path.sep).join('/'), fs.readFileSync(p, 'utf-8'));
    }
  };
  walk(path.join(root, 'docs'));
  return snap;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-invalid-status-'));
  vi.spyOn(autoSync, 'triggerExternalSync').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const layouts: Array<[string, (root: string) => void]> = [
  ['sharded', writeSharded],
  ['monolith', writeMonolith],
];

describe.each(layouts)('manage_roadmap invalid status (%s)', (_layout, write) => {
  beforeEach(() => write(dir));

  const writes: Array<[string, Record<string, unknown>]> = [
    [
      'add',
      {
        action: 'add',
        feature: 'New Row',
        milestone: 'MVP Release',
        status: 'bogus',
        summary: 's',
      },
    ],
    [
      'add with external_id',
      {
        action: 'add',
        feature: 'Linked Row',
        milestone: 'MVP Release',
        status: 'bogus',
        summary: 's',
        external_id: 'github:o/r#9005',
      },
    ],
    ['update', { action: 'update', feature: 'Auth System', status: 'bogus' }],
  ];

  it.each(writes)(
    '%s rejects it, writes nothing, and the roadmap stays readable',
    async (_n, args) => {
      const before = snapshotDocs(dir);
      const res = await handleManageRoadmap({ path: dir, ...args } as never);
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('bogus');
      expect(snapshotDocs(dir)).toEqual(before);

      const show = await handleManageRoadmap({ path: dir, action: 'show' });
      expect(show.isError).toBeFalsy();
    }
  );

  it('positive control: a valid status still writes', async () => {
    const res = await handleManageRoadmap({
      path: dir,
      action: 'update',
      feature: 'Auth System',
      status: 'needs-human',
    });
    expect(res.isError).toBeFalsy();
    const show = await handleManageRoadmap({ path: dir, action: 'show' });
    expect(show.isError).toBeFalsy();
    expect(show.content[0].text).toContain('needs-human');
  });
});
