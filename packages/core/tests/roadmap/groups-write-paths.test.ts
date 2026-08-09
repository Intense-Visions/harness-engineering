import { describe, it, expect } from 'vitest';
import { serializeRoadmap } from '../../src/roadmap/serialize';
import { parseRoadmap } from '../../src/roadmap/parse';
import { findUnpreservedLines } from '../../src/roadmap/preservation';
import { roadmapToShards, assertSemanticRoundTrip } from '../../src/roadmap/store/migration';
import { writeRegeneratedRoadmap } from '../../src/roadmap/store/regenerator';
import { serializeShard, parseShard } from '../../src/roadmap/store/shard';
import { serializeMeta } from '../../src/roadmap/store/meta';
import type { ShardIO } from '../../src/roadmap/store/shard-store';
import type { Shard } from '../../src/roadmap/store/roadmap-store';
import type { Roadmap } from '@harness-engineering/types';
import { GROUPED_ROADMAP, MARKER_NAMES } from './fixtures';

describe('narrative groups vs the monolith write-preservation guard', () => {
  it('reports group-body lines, so a whole-file rewrite is refused rather than destructive', () => {
    const lost = findUnpreservedLines(serializeRoadmap(GROUPED_ROADMAP));
    expect(lost.length).toBeGreaterThan(0);
    expect(lost.map((l) => l.text)).toContain('- Status: shipped in spirit, not in bytes.');
  });

  it('does not report the group marker heading itself', () => {
    const lost = findUnpreservedLines(serializeRoadmap(GROUPED_ROADMAP));
    expect(lost.map((l) => l.text)).not.toContain('### Group: Narrative arc');
  });

  it('is NOT group-aware: a modeled-bullet group body does not trip the guard', () => {
    // The guard classifies LINES, not sections. A narrative body that happens to use
    // only modeled `- **Key:**` bullets is invisible to it, so the rewrite proceeds
    // and the group is relocated after the milestone's features. Documented in
    // docs/guides/roadmap-sharding.md — pinned here so that claim cannot go stale.
    const roadmap: Roadmap = {
      ...GROUPED_ROADMAP,
      milestones: [
        {
          name: 'M1',
          isBacklog: false,
          features: GROUPED_ROADMAP.milestones[0]!.features,
          groups: [
            {
              name: 'Looks modeled',
              body: '- **Status:** shipped in spirit\n- **Summary:** all modeled-looking bullets',
            },
          ],
        },
      ],
    };
    expect(findUnpreservedLines(serializeRoadmap(roadmap))).toEqual([]);
  });
});

describe('narrative groups vs monolith → shard migration (sharded mode stays strict)', () => {
  it('aborts the shard round-trip instead of silently dropping groups', () => {
    const { shards, meta } = roadmapToShards(GROUPED_ROADMAP);
    const result = assertSemanticRoundTrip(GROUPED_ROADMAP, shards, meta);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Assert the SPECIFIC branch: all three failure paths in
    // assertRegeneratedRoundTrip mention "round-trip", so matching only that
    // would also pass if the roadmap merely failed to parse.
    expect(result.error.message).toContain(
      'does not deep-equal parse(regenerate(shards)); aborting to protect the monolith'
    );
  });

  it('emits no shard for a group section', () => {
    const { shards } = roadmapToShards(GROUPED_ROADMAP);
    expect(shards.map((s) => s.feature.name)).toEqual(['Ship the parser']);
  });
});

describe('a column-0 `### ` inside a group body ends the group (documented hazard)', () => {
  /**
   * The parser splits milestone bodies on column-0 headings and does NOT understand
   * fenced code blocks. Pinned so the blast radius cannot change silently: a
   * phantom tracked feature is fabricated, and the remainder of the group body —
   * including the closing fence — is lost from the model and from the next write.
   */
  const MD = `---
project: p
version: 1
last_synced: 2026-05-01T10:00:00Z
last_manual_edit: 2026-05-01T09:00:00Z
---

# Roadmap

## M1

### Group: Authoring guide

- Intro prose before the fence.

\`\`\`markdown
### Feature: Example

- **Status:** planned
\`\`\`

- Trailing prose AFTER the fence.
`;

  it('fabricates a phantom tracked feature from the fenced heading', () => {
    const result = parseRoadmap(MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The heading inside the fence became a REAL feature the tooling will act on.
    expect(result.value.milestones[0]?.features.map((f) => f.name)).toEqual(['Example']);
    expect(result.value.milestones[0]?.features[0]?.status).toBe('planned');
  });

  it('truncates the group body at the fence, losing the closing fence and trailing prose', () => {
    const result = parseRoadmap(MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.value.milestones[0]?.groups?.[0]?.body ?? '';
    expect(body).toBe('- Intro prose before the fence.\n\n```markdown');
    expect(body).not.toContain('Trailing prose AFTER the fence.');
  });

  it('drops the lost content from the file on the next serialize', () => {
    const result = parseRoadmap(MD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rewritten = serializeRoadmap(result.value);
    expect(rewritten).not.toContain('Trailing prose AFTER the fence.');
    // The phantom is promoted to a first-class row in the rewritten file.
    expect(rewritten).toContain('### Example');
  });
});

describe('the shard format honors the same H3 marker escaping (shared seam)', () => {
  /**
   * `serializeFeature` is shared with the shard format, but `shard.ts` re-reads the
   * heading with its OWN independently written `H3_NAME` regex. Nothing else pins
   * the two together, so a marker-prefixed name is round-tripped here to prove the
   * escaping holds in sharded mode too — a rename would also change the shard slug.
   *
   * Parameterized over the SAME shared MARKER_NAMES as the monolith seam in
   * `serialize-groups.test.ts`, so the two seams are provably symmetric.
   */
  for (const name of MARKER_NAMES) {
    it(`round-trips a shard whose feature is named ${JSON.stringify(name)}`, () => {
      const shard: Shard = {
        slug: 'row-1',
        milestone: 'M1',
        order: 0,
        feature: {
          name,
          status: 'planned',
          spec: null,
          plans: [],
          blockedBy: [],
          summary: 's',
          assignee: null,
          priority: null,
          externalId: 'github:o/r#1',
          updatedAt: null,
        },
      };
      const md = serializeShard(shard);
      const reparsed = parseShard(md);
      expect(reparsed.ok).toBe(true);
      if (!reparsed.ok) return;
      expect(reparsed.value.feature.name).toBe(name);
      expect(reparsed.value.feature.externalId).toBe('github:o/r#1');
      // Byte-stable, so the name cannot erode across repeated shard writes.
      expect(serializeShard(reparsed.value)).toBe(md);
    });
  }
});

const SHARD_DIR = '/repo/docs/roadmap.d';
const ROADMAP_PATH = '/repo/docs/roadmap.md';

/**
 * In-memory shard directory seeded from GROUPED_ROADMAP, so the regen path runs
 * against shards that were decomposed from a roadmap that DID carry groups.
 */
function makeGroupedShardIO() {
  const { shards, meta } = roadmapToShards(GROUPED_ROADMAP);
  const files = new Map<string, string>();
  for (const shard of shards) files.set(`${SHARD_DIR}/${shard.slug}.md`, serializeShard(shard));
  files.set(`${SHARD_DIR}/_meta.md`, serializeMeta(meta));
  const io: ShardIO = {
    listDir: async (dir) =>
      [...files.keys()]
        .filter((p) => p.startsWith(`${dir}/`))
        .map((p) => p.slice(p.lastIndexOf('/') + 1)),
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async (p, d) => {
      files.set(p, d);
    },
  };
  return { io, files };
}

describe('narrative groups vs the regenerated aggregate (derived, never hand-edited)', () => {
  it('drops a group from the aggregate on regen, with no guard (documented behavior)', async () => {
    const { io, files } = makeGroupedShardIO();
    const result = await writeRegeneratedRoadmap(SHARD_DIR, ROADMAP_PATH, io);
    // No preservation guard and no round-trip assertion here: the write SUCCEEDS.
    expect(result.ok).toBe(true);
    const aggregate = files.get(ROADMAP_PATH) ?? '';
    expect(aggregate).not.toContain('### Group:');
    expect(aggregate).not.toContain('> A blockquote inside a group body is captured verbatim.');
    expect(aggregate).toContain('### Ship the parser');
  });

  it('re-parses the regenerated aggregate to milestones carrying no `groups` key', async () => {
    const { io, files } = makeGroupedShardIO();
    await writeRegeneratedRoadmap(SHARD_DIR, ROADMAP_PATH, io);
    const reparsed = parseRoadmap(files.get(ROADMAP_PATH) ?? '');
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    for (const milestone of reparsed.value.milestones) {
      expect('groups' in milestone).toBe(false);
    }
  });
});
