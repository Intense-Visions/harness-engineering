import { describe, it, expect } from 'vitest';
import { parseRoadmap } from '../../../src/roadmap/parse';
import { serializeRoadmap } from '../../../src/roadmap/serialize';
import { findUnpreservedLines } from '../../../src/roadmap/preservation';
import { parseMeta, serializeMeta } from '../../../src/roadmap/store/meta';
import { roadmapToShards, assertSemanticRoundTrip } from '../../../src/roadmap/store/migration';
import { serializeShard } from '../../../src/roadmap/store/shard';
import { regenerate } from '../../../src/roadmap/store/regenerator';
import type { ShardIO } from '../../../src/roadmap/store/shard-store';

/**
 * #1328: the block between `# Roadmap` and the first `##` heading — in practice a
 * roadmap's machine-readable directives (`markdownlint-disable-file`) and the note
 * explaining why the file is formatter-exempt — entered neither `_meta.md` nor any
 * shard, so `shard` → `regen` deleted it at exit code 0.
 */
const PREAMBLE = [
  '<!-- markdownlint-disable-file MD013 -->',
  '<!-- Machine-managed by harness roadmap tooling: each feature field is a single',
  '     line by schema contract, so the 80-column rule does not apply. -->',
].join('\n');

const ROADMAP_WITH_PREAMBLE = [
  '---',
  'project: demo',
  'version: 1',
  'last_synced: 2026-08-10T00:00:00.000Z',
  'last_manual_edit: 2026-08-10T00:00:00.000Z',
  '---',
  '',
  '# Roadmap',
  '',
  PREAMBLE,
  '',
  '## MVP Release',
  '',
  '### Core foundation',
  '',
  '- **Status:** in-progress',
  '- **Spec:** —',
  '- **Summary:** Ship it.',
  '- **Blockers:** —',
  '- **Plan:** —',
  '',
].join('\n');

const SHARD_DIR = '/repo/docs/roadmap.d';

function basename(p: string): string {
  return p.slice(p.lastIndexOf('/') + 1);
}

/** In-memory shard dir written exactly as `harness roadmap shard` writes it. */
function shardToDisk(markdown: string): ShardIO {
  const parsed = parseRoadmap(markdown);
  if (!parsed.ok) throw parsed.error;
  const { shards, meta } = roadmapToShards(parsed.value);

  const files = new Map<string, string>();
  for (const shard of shards) {
    files.set(`${SHARD_DIR}/${shard.slug}.md`, serializeShard(shard));
  }
  files.set(`${SHARD_DIR}/_meta.md`, serializeMeta(meta));

  return {
    listDir: async (dir) => [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).map(basename),
    readFile: async (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async (p, d) => void files.set(p, d),
  };
}

describe('roadmap preamble round-trip (#1328)', () => {
  it('parses the block under the title as the preamble', () => {
    const parsed = parseRoadmap(ROADMAP_WITH_PREAMBLE);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.preamble).toBe(PREAMBLE);
  });

  it('omits `preamble` entirely when the roadmap has none', () => {
    const parsed = parseRoadmap(ROADMAP_WITH_PREAMBLE.replace(`${PREAMBLE}\n\n`, ''));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect('preamble' in parsed.value).toBe(false);
  });

  it('re-emits the preamble under `# Roadmap`, and re-parsing is idempotent', () => {
    const parsed = parseRoadmap(ROADMAP_WITH_PREAMBLE);
    if (!parsed.ok) throw parsed.error;

    const serialized = serializeRoadmap(parsed.value);
    expect(serialized).toContain(`# Roadmap\n\n${PREAMBLE}\n\n## MVP Release`);

    const reparsed = parseRoadmap(serialized);
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) {
      expect(reparsed.value.preamble).toBe(PREAMBLE);
      expect(serializeRoadmap(reparsed.value)).toBe(serialized);
    }
  });

  it('carries the preamble through `_meta.md`', () => {
    const parsed = parseRoadmap(ROADMAP_WITH_PREAMBLE);
    if (!parsed.ok) throw parsed.error;
    const { meta } = roadmapToShards(parsed.value);
    expect(meta.preamble).toBe(PREAMBLE);

    const reparsed = parseMeta(serializeMeta(meta));
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok) expect(reparsed.value.preamble).toBe(PREAMBLE);
  });

  it('survives shard -> regen (the reported repro)', async () => {
    const io = shardToDisk(ROADMAP_WITH_PREAMBLE);
    const regen = await regenerate(SHARD_DIR, io);
    expect(regen.ok).toBe(true);
    if (regen.ok) expect(regen.value).toContain(PREAMBLE);
  });

  it('regenerates byte-identically on rerun', async () => {
    const io = shardToDisk(ROADMAP_WITH_PREAMBLE);
    const first = await regenerate(SHARD_DIR, io);
    const second = await regenerate(SHARD_DIR, io);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.value).toBe(first.value);
  });

  it("the shard command's pre-write round-trip assertion covers the preamble", () => {
    const parsed = parseRoadmap(ROADMAP_WITH_PREAMBLE);
    if (!parsed.ok) throw parsed.error;
    const { shards, meta } = roadmapToShards(parsed.value);

    expect(assertSemanticRoundTrip(parsed.value, shards, meta).ok).toBe(true);
    // Dropping it is now a detected round-trip failure rather than a silent strip.
    const { preamble: _dropped, ...stripped } = meta;
    expect(assertSemanticRoundTrip(parsed.value, shards, stripped).ok).toBe(false);
  });

  it('no longer reports the preamble as content a monolith rewrite would drop', () => {
    // The #839 guard must not block a write the serializer now preserves.
    expect(findUnpreservedLines(ROADMAP_WITH_PREAMBLE)).toEqual([]);
  });
});
