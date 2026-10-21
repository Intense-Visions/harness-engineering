/**
 * Sibling matcher — pure lookup over a hand-built `CloneIndex`.
 *
 * Every index here is constructed in-test: no case depends on a repo scan, so
 * each one states its own precondition and the span co-check's two real
 * Scope-D false candidates are reproduced verbatim rather than described.
 *
 * Source: docs/changes/duplication-detection/proposal.md (Phase 5).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CloneClass, CloneIndex, CloneMember } from '@harness-engineering/core';
import {
  resolveSiblingEvidence,
  buildCodeCraftCloneIndex,
} from '../../src/code-craft/extract/siblings';
import { extractUnits } from '../../src/code-craft/extract/units';
import type { CodeUnit } from '../../src/code-craft/findings/schema';

/**
 * Call recorder for core's `buildCloneIndex`, delegating to the real one.
 *
 * The empty-discovery case is VACUOUS without this: `buildCodeCraftCloneIndex`
 * returns `undefined` both when it short-circuits on an empty file list and
 * when it hands `[]` to `buildCloneIndex`, which answers `Err` on its own
 * refuse-to-pass-over-zero-files path. Only "was it called?" separates the two.
 * The mock delegates rather than stubs, so every other case in this file still
 * exercises the real index builder.
 */
const recorder = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    buildCloneIndex: (...args: Parameters<typeof actual.buildCloneIndex>) => {
      recorder.calls.push(args);
      return actual.buildCloneIndex(...args);
    },
  };
});

const STATS_ZERO: CloneIndex['stats'] = {
  filesScanned: 0,
  filesIgnored: 0,
  filesSkipped: 0,
  skippedTruncated: 0,
  unitsFingerprinted: 0,
  unitsBelowMinTokens: 0,
  classesReported: 0,
  classesSuppressed: 0,
  classesTruncated: 0,
  collisionsObserved: 0,
  collisionsTruncated: 0,
};

function member(file: string, startLine: number, endLine: number, unit = 'u'): CloneMember {
  return { file, unit, kind: 'function', startLine, endLine };
}

function cloneClass(members: CloneMember[], over: Partial<CloneClass> = {}): CloneClass {
  const tokenCount = over.tokenCount ?? 90;
  return {
    fingerprint: 'aaaaaaaaaaaaaaaa',
    tokenCount,
    members,
    rank: tokenCount * members.length,
    priority: tokenCount * members.length,
    signal: 'duplicate',
    ...over,
  };
}

/** First-writer-wins per key, exactly as core's `buildCloneIndex` builds it. */
function index(classes: CloneClass[]): CloneIndex {
  const byMember = new Map<string, CloneClass>();
  for (const cls of classes) {
    for (const m of cls.members) {
      if (!byMember.has(`${m.file}:${m.startLine}`)) byMember.set(`${m.file}:${m.startLine}`, cls);
    }
  }
  return { classes, byMember, skipped: [], collisions: [], stats: STATS_ZERO };
}

function unit(line: number, endLine: number, over: Partial<CodeUnit> = {}): CodeUnit {
  return { kind: 'function', name: 'fn', line, endLine, ...over };
}

const ROOT = '/repo';
const abs = (rel: string): string => path.join(ROOT, ...rel.split('/'));

describe('resolveSiblingEvidence', () => {
  it('hits on the exact key and excludes the queried location from the siblings', () => {
    const cls = cloneClass([
      member('a.ts', 10, 20, 'alpha'),
      member('b.ts', 30, 40, 'beta'),
      member('c.ts', 50, 60, 'gamma'),
    ]);
    const got = resolveSiblingEvidence(index([cls]), ROOT, abs('a.ts'), unit(10, 20));

    expect(got).toBeDefined();
    // Mutation: drop the `.filter` in resolveSiblingEvidence — 3 siblings, one
    // of them the queried location itself.
    expect(got!.siblings).toHaveLength(2);
    expect(got!.siblings.map((m) => m.file).sort()).toEqual(['b.ts', 'c.ts']);
    expect(got!.siblings.some((m) => m.file === 'a.ts' && m.startLine === 10)).toBe(false);
    expect(got!.siblingClass.tokenCount).toBe(90);
  });

  it('accepts a tolerance candidate whose span agrees', () => {
    // Reachable because the only member in a.ts is 2 lines off the queried
    // start AND its endLine is within the span tolerance; nothing else in the
    // fixture can satisfy any probe offset.
    const cls = cloneClass([
      member('a.ts', 12, 22, 'alpha'),
      member('b.ts', 30, 40, 'beta'),
      member('c.ts', 50, 60, 'gamma'),
    ]);
    const got = resolveSiblingEvidence(index([cls]), ROOT, abs('a.ts'), unit(10, 20));

    // Mutation: shorten START_LINE_PROBE_ORDER to [0] — undefined.
    expect(got).toBeDefined();
    expect(got!.siblings.map((m) => m.file).sort()).toEqual(['b.ts', 'c.ts']);
  });

  it('rejects the real Scope-D false candidate via the span co-check', () => {
    // Reproduced verbatim from the Scope-D measurement: a one-line arrow at
    // packages/cli/src/brand/index.ts:167 (endLine 167) whose nearest indexed
    // member is `collectFiles` at 165-172, 88 tokens. Reachable because the
    // member IS 2 lines off (so the probe reaches it) and its endLine IS 5 off
    // (so only the co-check can reject it).
    const cls = cloneClass(
      [
        member('packages/cli/src/brand/index.ts', 165, 172, 'collectFiles'),
        member('packages/cli/src/naming-craft/index.ts', 390, 397, 'collectFiles'),
        member('packages/cli/src/drift/index.ts', 210, 217, 'collectFiles'),
        member('packages/cli/src/docs-craft/index.ts', 88, 95, 'collectFiles'),
      ],
      { tokenCount: 88 }
    );
    const got = resolveSiblingEvidence(
      index([cls]),
      ROOT,
      abs('packages/cli/src/brand/index.ts'),
      unit(167, 167, { name: '<anonymous>' })
    );

    // Mutation: delete the spanAgrees call — returns collectFiles's class,
    // which is the exact false positive measured at Scope D.
    expect(got).toBeUndefined();
  });

  it('prefers the exact key over a tolerance candidate', () => {
    // The near candidate sits at a NEGATIVE offset (line 8 for a query at 10)
    // and its endLine is within the span tolerance, so BOTH candidates satisfy
    // their own co-check and only probe ORDER can decide. This placement is
    // load-bearing: with the near member at line 12 (+2, the LAST offset in
    // either ordering) the exact key wins under every permutation and the case
    // is vacuous — it was written that way first and the reordering mutant
    // survived it, 9 of 9 green.
    const exactCls = cloneClass(
      [member('a.ts', 10, 20, 'exact'), member('b.ts', 30, 40), member('c.ts', 50, 60)],
      { fingerprint: 'e0e0e0e0e0e0e0e0', tokenCount: 90 }
    );
    const nearCls = cloneClass(
      [member('a.ts', 8, 18, 'near'), member('d.ts', 70, 80), member('e.ts', 90, 100)],
      { fingerprint: 'f1f1f1f1f1f1f1f1', tokenCount: 77 }
    );
    const got = resolveSiblingEvidence(index([exactCls, nearCls]), ROOT, abs('a.ts'), unit(10, 20));

    // Mutation: reorder START_LINE_PROBE_ORDER to [-2, -1, 0, 1, 2] — returns
    // nearCls instead.
    expect(got!.siblingClass.fingerprint).toBe('e0e0e0e0e0e0e0e0');
    // Assert the ADVERSITY, not just the outcome: the rival candidate must
    // really be reachable and really be accepted on its own key, or the
    // preference above is a coin flip with a confident name.
    expect(
      resolveSiblingEvidence(index([exactCls, nearCls]), ROOT, abs('a.ts'), unit(8, 18))!
        .siblingClass.fingerprint
    ).toBe('f1f1f1f1f1f1f1f1');
  });

  it('never consults kind — the 139/7,880 object-literal-property case', () => {
    const cls = cloneClass([
      member('a.ts', 10, 20, 'alpha'),
      member('b.ts', 30, 40, 'beta'),
      member('c.ts', 50, 60, 'gamma'),
    ]);
    // The index member is estree's `function`; code-craft reports `method` for
    // the same construct (`{ alpha: (x) => {…} }`). This disagreement is real
    // for 139 of 7,880 units at Scope D.
    const got = resolveSiblingEvidence(
      index([cls]),
      ROOT,
      abs('a.ts'),
      unit(10, 20, { kind: 'method' })
    );

    // Mutation: add `&& m.kind === unit.kind` to spanAgrees — undefined.
    expect(got).toBeDefined();
    expect(got!.siblings).toHaveLength(2);
  });

  it('excludes every member at the matched key, not only the queried unit', () => {
    // The byMember key is lossy by construction: a one-line class and a
    // one-line method inside it collapse onto one `${file}:${startLine}`. Two
    // units at one location are ONE location to a reader following a file:line
    // pointer.
    const cls = cloneClass([
      member('a.ts', 58, 58, 'theClass'),
      member('a.ts', 58, 58, 'theMethod'),
      member('b.ts', 58, 58, 'beta'),
      member('c.ts', 70, 70, 'gamma'),
    ]);
    const got = resolveSiblingEvidence(index([cls]), ROOT, abs('a.ts'), unit(58, 58));

    // Mutation: filter on `m.startLine === startLine && m.unit === unit.name` —
    // leaks the same-line twin back as a third copy.
    expect(got!.siblings).toHaveLength(2);
    expect(got!.siblings.map((m) => m.unit).sort()).toEqual(['beta', 'gamma']);
    expect(got!.siblings.some((m) => m.file === 'a.ts')).toBe(false);
  });

  it('returns undefined for a file that is not in the index', () => {
    const cls = cloneClass([
      member('a.ts', 10, 20),
      member('b.ts', 30, 40),
      member('c.ts', 50, 60),
    ]);
    // Mutation: return a default class instead of undefined.
    expect(resolveSiblingEvidence(index([cls]), ROOT, abs('zzz.ts'), unit(10, 20))).toBeUndefined();
  });

  it('normalizes the absolute path to the repo-relative POSIX key core writes', () => {
    const cls = cloneClass([
      member('packages/a/src/x.ts', 10, 20, 'alpha'),
      member('packages/b/src/x.ts', 30, 40, 'beta'),
      member('packages/c/src/x.ts', 50, 60, 'gamma'),
    ]);
    const got = resolveSiblingEvidence(
      index([cls]),
      ROOT,
      abs('packages/a/src/x.ts'),
      unit(10, 20)
    );
    // Mutation: use the raw absolute `file` as the key — undefined, because
    // CloneMember.file is repo-relative.
    expect(got).toBeDefined();
    expect(got!.siblings).toHaveLength(2);
  });

  it('converts backslashes the way core relativePosix does', () => {
    // `relativePosix` is `relative(from, to).replaceAll('\\', '/')`, and the
    // byMember key is built from its output. On win32 every separator is a
    // backslash and dropping the conversion is a 100% miss rate; on POSIX a
    // backslash is a legal filename character, so a file literally named
    // `odd\name.ts` exercises the SAME line of code on every platform —
    // core writes the key `packages/a/src/odd/name.ts` and the matcher must
    // produce the identical string.
    const key = 'packages/a/src/odd/name.ts';
    const cls = cloneClass([
      member(key, 10, 20, 'alpha'),
      member('packages/b/src/x.ts', 30, 40, 'beta'),
      member('packages/c/src/x.ts', 50, 60, 'gamma'),
    ]);
    const file = path.join(ROOT, 'packages', 'a', 'src', 'odd\\name.ts');
    const got = resolveSiblingEvidence(index([cls]), ROOT, file, unit(10, 20));

    // Mutation: drop the `.replaceAll('\\', '/')` in toRelativePosix — the key
    // becomes `packages/a/src/odd\name.ts` and the lookup misses.
    expect(got).toBeDefined();
    expect(got!.siblings).toHaveLength(2);
  });
});

/**
 * A >= 40-token, >= 3-statement function planted verbatim in several files.
 *
 * Both bars are load-bearing and in different directions: code-craft's
 * extractor only emits a unit with 3+ body statements or control flow, and
 * core's detector only fingerprints a unit clearing `minTokens: 40`. A fixture
 * that quietly fell under either bar would report "no siblings" and look like
 * a wiring defect, so the first case below asserts `tokenCount >= 40` directly.
 */
const PLANTED_CLONE = `export function summarize(rows: number[]): string {
  let total = 0;
  for (const row of rows) {
    if (row > 0) {
      total += row * 2;
    }
  }
  const average = rows.length === 0 ? 0 : total / rows.length;
  const label = average > 10 ? 'high' : 'low';
  return label + ':' + String(total) + ':' + String(average);
}
`;

describe('buildCodeCraftCloneIndex', () => {
  let tmp: string;

  beforeEach(() => {
    recorder.calls.length = 0;
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-siblings-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function plant(rel: string, content = PLANTED_CLONE): string {
    const full = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    return full;
  }

  it('builds an index that resolves a planted three-copy clone end to end', async () => {
    const a = plant('packages/p/src/a.ts');
    plant('packages/p/src/b.ts');
    plant('packages/p/src/c.ts');

    const built = await buildCodeCraftCloneIndex(tmp);
    expect(built).toBeDefined();

    const units = extractUnits(PLANTED_CLONE, a);
    expect(units).toHaveLength(1);
    const got = resolveSiblingEvidence(built!, tmp, a, units[0]!);

    // Mutation: hand buildCloneIndex a single-file list (the `input.files`
    // scope) instead of the full discovery — 0 siblings, because a class needs
    // three members and the other two copies live in other files.
    expect(got).toBeDefined();
    expect(got!.siblings.map((m) => m.file).sort()).toEqual([
      'packages/p/src/b.ts',
      'packages/p/src/c.ts',
    ]);
    // The fixture must clear core's minTokens bar for this case to mean
    // anything; if it ever stops doing so this fails loudly instead of
    // reporting a plausible "no siblings".
    expect(got!.siblingClass.tokenCount).toBeGreaterThanOrEqual(40);
    expect(got!.siblingClass.members).toHaveLength(3);
  });

  it('returns undefined for an empty discovery without calling buildCloneIndex', async () => {
    expect(await buildCodeCraftCloneIndex(tmp)).toBeUndefined();
    // Mutation: drop the `files.length === 0` guard — buildCloneIndex is called
    // once (and still returns Err, so the `undefined` above keeps passing).
    // This assertion is the only thing that separates the two paths.
    expect(recorder.calls).toHaveLength(0);
  });

  it('does not form a class from two copies (minInstances: 3)', async () => {
    const a = plant('packages/p/src/a.ts');
    plant('packages/p/src/b.ts');

    const built = await buildCodeCraftCloneIndex(tmp);
    // Reachable because the discovery DID find two eligible files and the
    // index built successfully — the class simply fell below minInstances.
    expect(recorder.calls).toHaveLength(1);
    expect(built).toBeDefined();
    expect(built!.stats.classesSuppressed).toBe(1);

    const units = extractUnits(PLANTED_CLONE, a);
    // Mutation: pass `minInstances: 2` to buildCloneIndex — a hit.
    expect(resolveSiblingEvidence(built!, tmp, a, units[0]!)).toBeUndefined();
  });
});
