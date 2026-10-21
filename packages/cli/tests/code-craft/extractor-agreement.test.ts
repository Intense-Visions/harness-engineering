/**
 * Criterion 5, restated — the two unit extractors, measured against each other.
 *
 * `code-craft`'s matcher resolves a `typescript`-extracted unit against a
 * `byMember` key built from an ESTREE-extracted one. That cross-parser join is
 * the integration's load-bearing assumption, and this file is it as a test.
 * `@typescript-eslint/typescript-estree` is a direct runtime dependency of
 * `packages/cli`, so both extractors can be called for real rather than
 * re-implemented.
 *
 * WHAT THIS FILE FOUND THAT THE REPO-SCALE MEASUREMENT COULD NOT. At Scope D
 * (2,066 files / 7,880 units) the two extractors agree on `startLine` and
 * `endLine` 7,880 / 7,880 exactly. That figure is real and it is also
 * VACUOUS with respect to decorators: this repository contains **zero** TS/TSX
 * decorators (the only `^@` match under the packages source roots is a CSS `@import`).
 * The spec's "Named risk: extractor line-number agreement" names decorators as
 * the likely divergence point, so the repo-scale scan could not test the one
 * construct the risk was about. This hand-built fixture can, and it diverges —
 * see the decorated-class case below. Clearing a named risk requires a corpus
 * that contains the named construct.
 *
 * Source: docs/changes/duplication-detection/proposal.md (Phase 5).
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@typescript-eslint/typescript-estree';
import { extractUnits as extractEstreeUnits } from '@harness-engineering/core';
import type { CloneClass, CloneIndex, CloneMember } from '@harness-engineering/core';
import { extractUnits as extractTsUnits } from '../../src/code-craft/extract/units';
import { resolveSiblingEvidence } from '../../src/code-craft/extract/siblings';

/**
 * Every construct that is measured or hypothesised to diverge, sized so that
 * `code-craft`'s substantive-unit bar (3+ body statements or control flow)
 * admits all of them — otherwise the agreement claim would hold over a subset
 * of the fixture rather than over the constructs it was written to cover.
 *
 * `Dec` is `declare`d rather than defined: a body-less declaration is not a
 * unit to either extractor, so the decorator helper does not change the count.
 */
const FIXTURE = [
  'declare function Dec(): ClassDecorator & MethodDecorator;',
  '',
  '@Dec()',
  'export class Decorated {',
  '  @Dec()',
  '  run(x: number): string {',
  '    const a = x * 2;',
  '    const b = a + 1;',
  '    return String(b);',
  '  }',
  '}',
  '',
  '/**',
  ' * A documented free function.',
  ' */',
  'export function documented(x: number): number {',
  '  const a = x + 1;',
  '  const b = a + 2;',
  '  return a + b;',
  '}',
  '',
  '// A line comment above a free function.',
  'export function commented(x: number): number {',
  '  const a = x + 1;',
  '  const b = a + 2;',
  '  return a + b;',
  '}',
  '',
  'export const handlers = {',
  '  propArrow: (a: number): number => {',
  '    const x = a + 1;',
  '    const y = x + 2;',
  '    return x + y;',
  '  },',
  '  propFn: function (a: number): number {',
  '    const x = a + 1;',
  '    const y = x + 2;',
  '    return x + y;',
  '  },',
  '};',
  '',
  'export class Fields {',
  '  readonly compute = (a: number): number => {',
  '    const x = a + 1;',
  '    const y = x + 2;',
  '    return x + y;',
  '  };',
  '',
  '  static build(a: number): number {',
  '    const x = a + 1;',
  '    const y = x + 2;',
  '    return x + y;',
  '  }',
  '}',
  '',
  'export const Holder = class Inner {',
  '  method(a: number): number {',
  '    const x = a + 1;',
  '    const y = x + 2;',
  '    return x + y;',
  '  }',
  '};',
  '',
  'export const loadAll = async (a: number): Promise<number> => {',
  '  const x = a + 1;',
  '  const y = x + 2;',
  '  return x + y;',
  '};',
  '',
  'export default function defaulted(a: number): number {',
  '  const x = a + 1;',
  '  const y = x + 2;',
  '  return x + y;',
  '}',
  '',
].join('\n');

/** The fixture's unit count, asserted from BOTH sides before anything else. */
const EXPECTED_UNITS = 13;

const tsUnits = extractTsUnits(FIXTURE, 'fixture.ts');
// `jsx: false` for a `.ts` path is core's own per-extension rule
// (`JSX_CAPABLE_EXTENSIONS` is every supported extension EXCEPT `.ts`). Using
// `jsx: true` uniformly is not a harmless default: it makes at least one real
// `.ts` file in this repository unparseable, which silently drops a unit from
// any agreement denominator taken that way.
const estreeUnits = extractEstreeUnits(
  parse(FIXTURE, { loc: true, range: true, tokens: true, jsx: false }) as never
);

describe('estree / typescript unit-extractor agreement (criterion 5, restated)', () => {
  it('both extractors emit every construct the fixture was written to cover', () => {
    // THE ANTI-VACUITY GUARD FOR THIS WHOLE FILE. If either extractor stops
    // emitting a construct, this fails rather than the agreement below holding
    // silently over a smaller set.
    // Mutation: delete the decorated method from the fixture — both counts
    // drop to 12 and this fails by number.
    expect(tsUnits).toHaveLength(EXPECTED_UNITS);
    expect(estreeUnits).toHaveLength(EXPECTED_UNITS);
  });

  it('agrees on startLine within the +/-2 tolerance for all 13 units', () => {
    // Criterion 5's actual claim. Pairing is by endLine, which agrees exactly
    // (asserted below), so the pairing cannot be what absorbs a start drift.
    for (const t of tsUnits) {
      const peer = estreeUnits.find((e) => e.endLine === t.endLine && e.name === t.name);
      expect(peer, `no estree peer for ${t.kind} ${t.name}@${t.line}`).toBeDefined();
      expect(Math.abs(peer!.startLine - t.line)).toBeLessThanOrEqual(2);
    }
  });

  it('agrees on endLine EXACTLY for all 13 units', () => {
    // Mutation: `node.getEnd()` -> anything else in code-craft's extractor —
    // this and the span co-check both go red. The co-check is only safe
    // BECAUSE this holds exactly.
    const pairs = tsUnits.map((t) => [
      t.endLine,
      estreeUnits.find((e) => e.name === t.name && Math.abs(e.startLine - t.line) <= 2)?.endLine,
    ]);
    expect(pairs.filter(([a, b]) => a === b)).toHaveLength(EXPECTED_UNITS);
  });

  it('EXACT startLine agreement is 12 of 13, and the exception is the decorated CLASS', () => {
    const exact = tsUnits.filter((t) =>
      estreeUnits.some((e) => e.startLine === t.line && e.endLine === t.endLine)
    );
    // 12, not 13: the spec record's "decorators specifically agree — both
    // extractors report a decorated class at its @Dec() line" is REFUTED for
    // the class. It holds for the method.
    expect(exact).toHaveLength(12);

    const tsClass = tsUnits.find((u) => u.name === 'Decorated')!;
    const esClass = estreeUnits.find((u) => u.name === 'Decorated')!;
    // `typescript`'s ClassDeclaration.getStart(sf) returns the `@` position, so
    // code-craft reports the decorator's line. typescript-estree keeps class
    // decorators OUT of ClassDeclaration.loc.start, which lands on the
    // `export`/`class` line. The asymmetry is inside estree, between node
    // types — not a uniform difference between the libraries.
    expect(tsClass.line).toBe(3);
    expect(esClass.startLine).toBe(4);
    expect(esClass.endLine).toBe(tsClass.endLine);

    // The decorated METHOD does agree, at its own decorator's line. Pinned by
    // literal because this is the half of the claim that survives.
    const tsMethod = tsUnits.find((u) => u.name === 'run')!;
    const esMethod = estreeUnits.find((u) => u.name === 'run')!;
    expect(tsMethod.line).toBe(5);
    expect(esMethod.startLine).toBe(5);
  });

  it('pins the kind divergence to exactly the object-literal-property case', () => {
    const divergent = tsUnits
      .filter((t) => {
        const peer = estreeUnits.find((e) => e.endLine === t.endLine && e.name === t.name);
        return peer !== undefined && String(peer.kind) !== t.kind;
      })
      .map((t) => {
        const peer = estreeUnits.find((e) => e.endLine === t.endLine && e.name === t.name)!;
        return { name: t.name, ts: t.kind, es: String(peer.kind) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Mutation: change asFunctionLike's `ts.isPropertyAssignment(node.parent)`
    // arm to always 'function' — the set empties and this fails. That is
    // correct: a change to either mapping must be deliberate and visible.
    expect(divergent).toEqual([
      { name: 'propArrow', ts: 'method', es: 'function' },
      { name: 'propFn', ts: 'method', es: 'function' },
    ]);
    // The class-field arrow is NOT in the set: its parent is a
    // PropertyDeclaration, not a PropertyAssignment, so both say 'function'.
    expect(divergent.some((d) => d.name === 'compute')).toBe(false);
  });

  it('the matcher loses no unit to either divergence', () => {
    // The payoff: build a byMember-shaped index from the ESTREE units (which is
    // how the real index is built) and resolve every TYPESCRIPT unit through
    // the shipped matcher. All 13 must hit, or the cross-parser join drops
    // units in production.
    const index = indexFromEstree();
    const hits = tsUnits.filter(
      (t) => resolveSiblingEvidence(index, '/repo', '/repo/fixture.ts', t) !== undefined
    );
    expect(hits).toHaveLength(EXPECTED_UNITS);
  });

  it('the decorated class is rescued BY the +/-2 tolerance, not despite it', () => {
    // This is what makes the tolerance load-bearing rather than inert. At Scope
    // D it contributes 0 true positives — but Scope D contains no decorator at
    // all, so that figure says nothing about this construct. An exact-only
    // matcher misses a decorated class outright.
    const index = indexFromEstree();
    const tsClass = tsUnits.find((u) => u.name === 'Decorated')!;

    // The exact key MISSES: code-craft says 3, the index is keyed on 4.
    expect(index.byMember.get(`fixture.ts:${tsClass.line}`)).toBeUndefined();
    // The matcher still resolves it, via the -1/+1 probe plus the endLine
    // co-check (endLine agrees exactly, so the co-check accepts).
    expect(resolveSiblingEvidence(index, '/repo', '/repo/fixture.ts', tsClass)).toBeDefined();
  });
});

/**
 * A `byMember` index with a 3-member class per estree unit, so that every unit
 * CAN be hit and a miss is always the matcher's doing rather than a class that
 * never qualified.
 */
function indexFromEstree(): CloneIndex {
  const classes: CloneClass[] = estreeUnits.map((u) => {
    const own: CloneMember = {
      file: 'fixture.ts',
      unit: u.name,
      kind: u.kind,
      startLine: u.startLine,
      endLine: u.endLine,
    };
    const members: CloneMember[] = [
      own,
      { ...own, file: 'other-a.ts' },
      { ...own, file: 'other-b.ts' },
    ];
    return {
      fingerprint: `fp-${u.startLine}`.padEnd(16, '0'),
      tokenCount: 90,
      members,
      rank: 270,
      priority: 270,
      signal: 'duplicate',
    };
  });
  const byMember = new Map<string, CloneClass>();
  for (const cls of classes) {
    for (const m of cls.members) {
      if (!byMember.has(`${m.file}:${m.startLine}`)) byMember.set(`${m.file}:${m.startLine}`, cls);
    }
  }
  return {
    classes,
    byMember,
    skipped: [],
    collisions: [],
    stats: {
      filesScanned: 1,
      filesIgnored: 0,
      filesSkipped: 0,
      skippedTruncated: 0,
      unitsFingerprinted: classes.length,
      unitsBelowMinTokens: 0,
      classesReported: classes.length,
      classesSuppressed: 0,
      classesTruncated: 0,
      collisionsObserved: 0,
      collisionsTruncated: 0,
    },
  };
}
