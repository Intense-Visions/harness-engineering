import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { serializeShard, serializeMeta, parseRoadmap } from '@harness-engineering/core';
import type { Shard, RoadmapMeta } from '@harness-engineering/core';
import { runRoadmapRegen, ALLOW_UNREADABLE_HISTORY_ENV } from '../../../src/commands/roadmap/regen';

let cwd: string;
let shardDir: string;
let roadmapPath: string;

const META: RoadmapMeta = {
  frontmatter: {
    project: 'test',
    version: 1,
    lastSynced: '2026-05-09T00:00:00Z',
    lastManualEdit: '2026-05-09T00:00:00Z',
  },
  milestones: ['MVP Release', 'Backlog'],
};

const SHARD_A: Shard = {
  slug: 'alpha',
  milestone: 'MVP Release',
  order: 0,
  feature: {
    name: 'Alpha',
    status: 'planned',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'Alpha summary',
    assignee: null,
    priority: 'P1',
    externalId: 'github:o/r#7',
    updatedAt: null,
  },
};

const SHARD_B: Shard = {
  slug: 'beta',
  milestone: 'Backlog',
  order: 0,
  feature: {
    name: 'Beta',
    status: 'backlog',
    spec: null,
    plans: [],
    blockedBy: [],
    summary: 'Beta summary',
    assignee: null,
    priority: null,
    externalId: null,
    updatedAt: null,
  },
};

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'roadmap-regen-'));
  shardDir = path.join(cwd, 'docs', 'roadmap.d');
  roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
  fs.mkdirSync(shardDir, { recursive: true });
  fs.writeFileSync(path.join(shardDir, 'alpha.md'), serializeShard(SHARD_A));
  fs.writeFileSync(path.join(shardDir, 'beta.md'), serializeShard(SHARD_B));
  fs.writeFileSync(path.join(shardDir, '_meta.md'), serializeMeta(META));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('runRoadmapRegen()', () => {
  it('writes a parseable docs/roadmap.md from the shard directory', async () => {
    const r = await runRoadmapRegen({ cwd });
    expect(r.ok).toBe(true);
    const md = fs.readFileSync(roadmapPath, 'utf-8');
    const parsed = parseRoadmap(md);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.milestones.map((m) => m.name)).toEqual(['MVP Release', 'Backlog']);
    }
  });

  it('is byte-stable: a second consecutive regen produces an identical file', async () => {
    await runRoadmapRegen({ cwd });
    const first = fs.readFileSync(roadmapPath, 'utf-8');
    await runRoadmapRegen({ cwd });
    const second = fs.readFileSync(roadmapPath, 'utf-8');
    expect(second).toBe(first);
  });

  it('errors when docs/roadmap.d is absent', async () => {
    fs.rmSync(shardDir, { recursive: true, force: true });
    const r = await runRoadmapRegen({ cwd });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/roadmap\.d|not sharded|not found/i);
  });

  it('--dry-run reports the size without writing the aggregate', async () => {
    const r = await runRoadmapRegen({ cwd, dryRun: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.bytes).toBeGreaterThan(0);
    expect(fs.existsSync(roadmapPath)).toBe(false);
  });

  it('--format json emits a single machine-readable object', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((m?: unknown) => {
      logs.push(String(m));
    });
    await runRoadmapRegen({ cwd, format: 'json' });
    spy.mockRestore();
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.bytes).toBe('number');
    expect(parsed.dryRun).toBe(false);
  });
});

// --- Recovery from an unreadable `## Assignment History` section (#1862) --------
//
// The parser refuses to report an empty history for a section it cannot read, so a
// regen over such a `_meta.md` fails. That refusal fails READS as well as writes,
// and the pre-commit hook `harness roadmap install-hook` installs blocks every
// shard-touching commit on a failed regen — including the commit that would repair
// the file. Without a hatch the only way out is `--no-verify`.

/** A history section in a grammar this build cannot read. */
const UNREADABLE_HISTORY_LINES = [
  '',
  '## Assignment History',
  '',
  '- **Item:** Alpha',
  '- **Owner:** alice',
  '- **Event:** assigned',
  '- **On:** 2026-05-09',
  '',
];

function writeUnreadableHistoryMeta(): void {
  fs.writeFileSync(
    path.join(shardDir, '_meta.md'),
    serializeMeta(META) + UNREADABLE_HISTORY_LINES.join('\n')
  );
}

describe('runRoadmapRegen() recovery hatch for an unreadable history section', () => {
  beforeEach(writeUnreadableHistoryMeta);

  it('refuses by default, naming the section and the hatch', async () => {
    const r = await runRoadmapRegen({ cwd });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toContain('## Assignment History');
      expect(r.error.message).toContain('--allow-unreadable-history');
    }
    expect(fs.existsSync(roadmapPath)).toBe(false);
  });

  it('--allow-unreadable-history regenerates and preserves the section verbatim', async () => {
    const r = await runRoadmapRegen({ cwd, allowUnreadableHistory: true });
    expect(r.ok).toBe(true);
    const md = fs.readFileSync(roadmapPath, 'utf-8');
    // Lossless: the hatch must not reintroduce the deletion the guard exists for.
    expect(md).toContain('## Assignment History');
    expect(md).toContain('- **Item:** Alpha');
    expect(md).toContain('- **On:** 2026-05-09');
    // And the rest of the aggregate is regenerated normally.
    expect(md).toContain('### Alpha');
    expect(md).toContain('### Beta');
  });

  it("honours the env var, which is what reaches the hook's bare invocation", async () => {
    // `buildRegenBlock` runs `harness roadmap regen` with no flags, so the env var
    // is the ONLY hatch a wedged pre-commit can be given.
    vi.stubEnv(ALLOW_UNREADABLE_HISTORY_ENV, '1');
    try {
      const r = await runRoadmapRegen({ cwd });
      expect(r.ok).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(fs.readFileSync(roadmapPath, 'utf-8')).toContain('- **Item:** Alpha');
  });

  it('an explicit option false beats a set env var', async () => {
    vi.stubEnv(ALLOW_UNREADABLE_HISTORY_ENV, '1');
    try {
      const r = await runRoadmapRegen({ cwd, allowUnreadableHistory: false });
      expect(r.ok).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('treats "0" and "false" as not set', async () => {
    for (const value of ['0', 'false', '']) {
      vi.stubEnv(ALLOW_UNREADABLE_HISTORY_ENV, value);
      try {
        const r = await runRoadmapRegen({ cwd });
        expect(r.ok, `env value ${JSON.stringify(value)} must not enable the hatch`).toBe(false);
      } finally {
        vi.unstubAllEnvs();
      }
    }
  });
});
