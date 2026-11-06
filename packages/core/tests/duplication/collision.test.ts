import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { body } from './fixtures';

// A 64-bit digest collision cannot be produced from real source at this scale
// (~1.7e-12 expected), so the only way to reach the collision path is to force
// every stream to one digest. `normalizeTokens` stays real, so token COUNTS
// remain the genuine per-unit lengths.
//
// Note what no test can pin: a collision between two EQUAL-length streams
// agrees on `tokenCount`, so it groups normally and is invisible to the
// recorder by construction. The second case below shows that same-length
// streams under one digest still group — which is exactly the blind spot
// `FingerprintCollision` documents.
vi.mock('../../src/duplication/tokens', async () => {
  const actual = await vi.importActual<typeof import('../../src/duplication/tokens')>(
    '../../src/duplication/tokens'
  );
  return { ...actual, fingerprintStream: () => 'deadbeefdeadbeef' };
});

const { buildCloneIndex, MAX_EVIDENCE_ENTRIES } = await import('../../src/duplication/index');

/** Deliberately far shorter than `body`, so the token counts cannot agree. */
const tiny = (fn: string) => `export function ${fn}(a: number) {\n  return a + 1;\n}\n`;

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dup-collide-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'long.ts'), body('sumAlpha', 'items', 'total', 'item'), 'utf8');
  await writeFile(join(root, 'src', 'short.ts'), tiny('bump'), 'utf8');
  await writeFile(join(root, 'src', 'a.ts'), body('addBeta', 'rows', 'acc', 'row'), 'utf8');
  await writeFile(join(root, 'src', 'b.ts'), body('tallyGamma', 'entries', 'sum', 'entry'), 'utf8');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('buildCloneIndex — observed digest collisions', () => {
  it('keeps length-differing units out of one class and records the collision', async () => {
    const result = await buildCloneIndex(
      ['src/long.ts', 'src/short.ts'].map((f) => join(root, f)),
      // minTokens 1 so the short unit is fingerprinted; minInstances 2 so a
      // two-member class WOULD be reported if the two ever grouped.
      { rootDir: root, ignorePatterns: [], minTokens: 1, minInstances: 2 }
    );
    if (!result.ok) throw new Error(`expected ok: ${result.error.message}`);
    const index = result.value;

    // Both units carry the same digest, so grouping on the digest alone would
    // have produced one 2-member class (and, previously, an Err that discarded
    // the whole scan). Keyed on `${fingerprint}:${tokenCount}` they cannot meet.
    expect(index.stats.unitsFingerprinted).toBe(2);
    expect(index.classes).toEqual([]);
    expect(index.byMember.size).toBe(0);

    // The scan still completed, and the collision is carried as evidence.
    expect(index.stats.collisionsObserved).toBe(1);
    expect(index.collisions).toHaveLength(index.stats.collisionsObserved);
    const [collision] = index.collisions;
    expect(collision!.fingerprint).toBe('deadbeefdeadbeef');
    expect(collision!.members.map((m) => m.file)).toEqual(['src/long.ts', 'src/short.ts']);
    // Positional correspondence with `members`: long.ts is first-seen, so its
    // (larger) count is first.
    expect(collision!.tokenCounts[0]).toBeGreaterThan(collision!.tokenCounts[1]);
  });

  it('still groups same-length streams under one digest, observing no collision', async () => {
    // The composite key must not over-split: three real Type-2 clones share
    // both digest and token count, so they remain one class.
    const result = await buildCloneIndex(
      ['src/long.ts', 'src/a.ts', 'src/b.ts'].map((f) => join(root, f)),
      { rootDir: root, ignorePatterns: [] }
    );
    if (!result.ok) throw new Error(`expected ok: ${result.error.message}`);
    expect(result.value.classes.map((c) => c.members.length)).toEqual([3]);
    expect(result.value.stats.collisionsObserved).toBe(0);
    expect(result.value.collisions).toEqual([]);
  });

  it('caps the collision evidence array while keeping the count exact', async () => {
    // `collisions` is an evidence array on the index like `skipped`, so it gets
    // the same bound — otherwise a deliberately collision-rich input would grow
    // it without limit, which is the unboundedness S1 objected to.
    const files = MAX_EVIDENCE_ENTRIES + 3;
    const dir = await mkdtemp(join(tmpdir(), 'dup-collide-cap-'));
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      const names: string[] = [];
      for (let i = 0; i < files; i += 1) {
        const name = `u${String(i).padStart(4, '0')}.ts`;
        names.push(name);
        // A distinct token count per file: every unit after the first
        // disagrees with the first-seen count under the one mocked digest.
        const tail = Array.from({ length: i + 1 }, () => '1').join(' + ');
        await writeFile(
          join(dir, 'src', name),
          `export function f${i}(a: number) {\n  return a + ${tail};\n}\n`,
          'utf8'
        );
      }
      const result = await buildCloneIndex(
        names.map((n) => join(dir, 'src', n)),
        { rootDir: dir, ignorePatterns: [], minTokens: 1 }
      );
      if (!result.ok) throw new Error(`expected ok: ${result.error.message}`);
      const stats = result.value.stats;
      expect(stats.collisionsObserved).toBe(files - 1);
      expect(result.value.collisions).toHaveLength(MAX_EVIDENCE_ENTRIES);
      expect(stats.collisionsTruncated).toBe(files - 1 - MAX_EVIDENCE_ENTRIES);
      expect(stats.collisionsTruncated).toBe(
        stats.collisionsObserved - result.value.collisions.length
      );
      // Every file was read and reported on: the scan completed.
      expect(stats.filesScanned).toBe(files);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('breaks a priority tie under ONE digest by tokenCount, ascending', async () => {
    // The comparator's LAST key, and the spec recorded it as a "known-unkillable
    // mutant rather than as coverage" on the grounds that it is consulted only
    // when two fingerprints are equal, which needs a real sha1 collision.
    // Production-unreachable was right; UNTESTABLE was wrong. The digest is
    // already mocked in this file, which makes the tie constructible.
    //
    // Two structurally distinct bodies measured at 60 and 80 normalized tokens,
    // four and three copies: 60 x 4 === 80 x 3 === 240, so priority ties; both
    // are plain duplicates, so `signal` ties; the mock makes `fingerprint` tie.
    // Only `tokenCount` is left, and it orders them ascending.
    const stmt = {
      a: (o: string, i: number) => `  const k${i} = ${o} + ${i};\n  ${o} += k${i};\n`,
      c: (o: string, i: number) => `  if (${o} > ${i}) {\n    ${o} -= ${i};\n  }\n`,
      e: (o: string, i: number) => `  const q${i} = [${o}, ${i}].length;\n  ${o} += q${i};\n`,
    };
    const sized = (fn: string, p: string, out: string, seq: Array<'a' | 'c' | 'e'>) =>
      `export function ${fn}(${p}: { cost: number }[]) {\n  let ${out} = 0;\n` +
      seq.map((k, i) => stmt[k](out, i)).join('') +
      `  for (const row of ${p}) {\n    ${out} += row.cost;\n  }\n  return ${out};\n}\n`;

    const dir = await mkdtemp(join(tmpdir(), 'dup-tiebreak-'));
    try {
      await mkdir(join(dir, 'src'), { recursive: true });
      const names: string[] = [];
      const write = async (name: string, src: string) => {
        names.push(name);
        await writeFile(join(dir, 'src', name), src, 'utf8');
      };
      for (const [i, nm] of ['One', 'Two', 'Three', 'Four'].entries()) {
        await write(`small${i}.ts`, sized(`sum${nm}`, `rows${nm}`, `acc${nm}`, ['a', 'a']));
      }
      for (const [i, nm] of ['Five', 'Six', 'Seven'].entries()) {
        await write(`large${i}.ts`, sized(`sum${nm}`, `rows${nm}`, `acc${nm}`, ['e', 'c', 'e']));
      }
      const result = await buildCloneIndex(
        names.map((n) => join(dir, 'src', n)),
        { rootDir: dir, ignorePatterns: [] }
      );
      if (!result.ok) throw new Error(`expected ok: ${result.error.message}`);
      const classes = result.value.classes;

      // Every earlier key provably ties, so this case reaches the last one.
      expect(classes).toHaveLength(2);
      expect(classes.map((c) => c.priority)).toEqual([240, 240]);
      expect(classes.map((c) => c.rank)).toEqual([240, 240]);
      expect(classes.map((c) => c.signal)).toEqual(['duplicate', 'duplicate']);
      expect(classes[0]!.fingerprint).toBe(classes[1]!.fingerprint);
      // And the last key decides: ascending tokenCount.
      expect(classes.map((c) => c.tokenCount)).toEqual([60, 80]);
      expect(classes.map((c) => c.members.length)).toEqual([4, 3]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports a class fingerprint equal to the digest of its own stream', async () => {
    // `fingerprint` is the digest, not the composite group key — a consumer can
    // recompute it with `fingerprintStream`.
    const result = await buildCloneIndex(
      ['src/long.ts', 'src/a.ts', 'src/b.ts'].map((f) => join(root, f)),
      { rootDir: root, ignorePatterns: [] }
    );
    if (!result.ok) throw new Error(`expected ok: ${result.error.message}`);
    expect(result.value.classes[0]!.fingerprint).toBe('deadbeefdeadbeef');
  });
});
