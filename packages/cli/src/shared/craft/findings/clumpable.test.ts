// Laws for the CRAFT half of the creation seam
// (docs/changes/clumping/proposal.md, Phase 3).

import { formClumps } from '@harness-engineering/core';
import { describe, expect, it } from 'vitest';

import type { CraftFinding } from '../../../design-craft/findings/schema.js';
import type { CodeFinding } from '../../../code-craft/findings/schema.js';
import {
  clumpCraftFindings,
  craftKind,
  craftPath,
  craftScope,
  toClumpableItems,
  type CraftClumpableFinding,
} from './clumpable.js';

/**
 * A project root the fixtures below are NOT under: every fixture path in this
 * file is already project-relative, so `craftPath`'s non-absolute guard must
 * leave it alone. Passing a real-looking root rather than `''` keeps that
 * guard exercised by every test in the file instead of bypassed.
 */
const ROOT = '/repo/clone-a';

interface FindingOverrides {
  code: string;
  file: string;
  line?: number;
  tier?: CraftClumpableFinding['tier'];
  impact?: CraftClumpableFinding['impact'];
  confidence?: CraftClumpableFinding['confidence'];
}

/** Above the floor by default, so a test that wants a sub-floor item must say so. */
function finding(over: FindingOverrides): CraftClumpableFinding {
  return {
    code: over.code,
    tier: over.tier ?? 'foundational',
    impact: over.impact ?? 'large',
    confidence: over.confidence ?? 'high',
    target: { file: over.file, ...(over.line !== undefined ? { line: over.line } : {}) },
  };
}

describe('craftKind — the family is the code prefix, never the citation', () => {
  it('reads the prefix of the finding code', () => {
    expect(craftKind('CODE-R004')).toBe('CODE');
    expect(craftKind('NAME-R001')).toBe('NAME');
    expect(craftKind('CRAFT-P001')).toBe('CRAFT');
  });

  it('degrades a hyphenless code to its own family rather than throwing', () => {
    // An LLM can emit a malformed code. Taking the whole run's findings down
    // over one of them is a worse outcome than that one finding grouping alone.
    expect(craftKind('MALFORMED')).toBe('MALFORMED');
  });
});

describe("design-craft's cite shape never reaches `kind`", () => {
  // The guard this pins: `cite.rubricId.split('-')[0]` is the obvious way to
  // derive a family, and on design-craft `cite` is `rubricOrPatternId`, so that
  // reading yields `undefined` and would fold every design finding into one
  // bogus group that LOOKS like a working clump.
  const design: CraftFinding = {
    code: 'CRAFT-C001',
    phase: 'critique',
    tier: 'polish',
    impact: 'medium',
    confidence: 'high',
    target: { file: 'packages/dashboard/src/Button.tsx', line: 12 },
    message: 'hierarchy is flat',
    cite: { rubricOrPatternId: 'rubric-hierarchy-clarity', source: 'https://example.invalid' },
    derived: { priority: 118 },
  };

  it("maps a real design-craft finding to kind 'CRAFT'", () => {
    const [item] = toClumpableItems([design], ROOT);
    expect(item!.kind).toBe('CRAFT');
    // ...and NOT to anything derived from the citation.
    expect(item!.kind).not.toBe('rubric');
    expect(item!.kind).not.toBe('undefined');
  });

  it('POSITIVE CONTROL: a rubricId family maps by the same rule, not a design special case', () => {
    // If `kind` were special-cased on design-craft rather than derived from
    // `code`, this ten-family case would be the one that broke.
    const code: CodeFinding = {
      code: 'CODE-R004',
      phase: 'critique',
      tier: 'polish',
      impact: 'medium',
      confidence: 'high',
      target: { file: 'packages/cli/src/a.ts', unit: 'run', kind: 'function', line: 3 },
      message: 'name misleads',
      cite: { rubricId: 'CODE-R004', source: 'x' },
      derived: { priority: 118 },
    };
    const [item] = toClumpableItems([code], ROOT);
    expect(item!.kind).toBe('CODE');
  });

  it('the two shapes co-exist in one call and land in DIFFERENT kinds', () => {
    const items = toClumpableItems(
      [design, finding({ code: 'CODE-R004', file: 'packages/dashboard/src/Other.tsx' })],
      ROOT
    );
    expect(items.map((i) => i.kind).sort()).toEqual(['CODE', 'CRAFT']);
  });
});

describe('craftScope — the directory, identically on every platform', () => {
  it('is the directory of the target file', () => {
    expect(craftScope('packages/cli/src/a.ts')).toBe('packages/cli/src');
  });

  it("a root-level file scopes to '.'", () => {
    expect(craftScope('README.md')).toBe('.');
  });

  it('does NOT split on a backslash — a win32 run must produce the same scope as a POSIX one', () => {
    // `path.dirname` on win32 would return `a\\b` here and `a/b\\c.ts` stays
    // whole on POSIX, so the same finding would emit two different clump ids
    // across the CI matrix.
    expect(craftScope('a\\b\\c.ts')).toBe('.');
  });
});

describe('N same-(scope, kind) findings emit ONE work unit', () => {
  const N = 5;
  const findings = Array.from({ length: N }, (_, i) =>
    finding({ code: 'CODE-R004', file: `packages/cli/src/file-${i}.ts` })
  );

  it(`folds ${N} findings into 1 clump with ${N} members`, () => {
    const result = clumpCraftFindings(findings, ROOT);
    expect(result.clumps).toHaveLength(1);
    expect(result.clumps[0]!.members).toHaveLength(N);
    expect(result.clumps[0]!.scope).toBe('packages/cli/src');
    expect(result.clumps[0]!.kind).toBe('CODE');
  });

  it('POSITIVE CONTROL: a different scope does NOT join that clump', () => {
    // Without this, "1 clump" would also be the answer if the adapter collapsed
    // every finding onto one constant scope — a broken adapter and a working one
    // look identical on the test above alone.
    const result = clumpCraftFindings(
      [...findings, finding({ code: 'CODE-R004', file: 'packages/core/src/elsewhere.ts' })],
      ROOT
    );
    expect(result.clumps).toHaveLength(1);
    expect(result.counts.solo).toBe(1);
    expect(result.solo[0]!.scope).toBe('packages/core/src');
  });

  it('POSITIVE CONTROL: a different kind does NOT join that clump', () => {
    const result = clumpCraftFindings(
      [
        ...findings,
        ...Array.from({ length: N }, (_, i) =>
          finding({ code: 'NAME-R001', file: `packages/cli/src/named-${i}.ts` })
        ),
      ],
      ROOT
    );
    expect(result.clumps).toHaveLength(2);
    expect(result.clumps.map((c) => c.kind).sort()).toEqual(['CODE', 'NAME']);
  });

  it('two findings on the SAME file never share a clump (conflict keys)', () => {
    const result = clumpCraftFindings(
      [
        finding({ code: 'CODE-R004', file: 'packages/cli/src/a.ts' }),
        finding({ code: 'CODE-R005', file: 'packages/cli/src/a.ts' }),
      ],
      ROOT
    );
    // Different codes → different kinds, so they are separate anyway; the
    // conflict rule is what keeps them apart when the kind matches.
    const same = clumpCraftFindings(
      [
        finding({ code: 'CODE-R004', file: 'packages/cli/src/a.ts' }),
        finding({ code: 'CODE-R004', file: 'packages/cli/src/a.ts' }),
      ],
      ROOT
    );
    expect(result.clumps).toHaveLength(0);
    expect(same.clumps).toHaveLength(0);
    expect(same.counts.conflictSplits).toBe(1);
    expect(same.counts.solo).toBe(2);
  });
});

describe('ids are unique even when the identifying tuple is not', () => {
  it('two findings with the same code, file and line do not collide', () => {
    // `formClumps` THROWS on a duplicate id rather than collapsing two items,
    // so a non-unique id would take a real craft run down. Two rubrics firing
    // on two units declared on the same line is not hypothetical.
    const items = toClumpableItems(
      [
        finding({ code: 'CODE-R004', file: 'a/b.ts', line: 7 }),
        finding({ code: 'CODE-R004', file: 'a/b.ts', line: 7 }),
      ],
      ROOT
    );
    expect(new Set(items.map((i) => i.id)).size).toBe(2);
    expect(() => clumpCraftFindings([], ROOT)).not.toThrow();
  });
});

describe("every sub-floor craft item resolves 'file' — the seam has no touched set", () => {
  // The spec's stated, DELIBERATE outcome (Phase 3, "`ctx.touched` has a
  // supplier on only one path"): a craft sweep is not an in-flight diff, so
  // Goal 3's `'act'` resolution is structurally unreachable here. Asserted so
  // it cannot drift to `'act'` silently.
  const subFloor = [
    finding({
      code: 'CODE-R004',
      file: 'packages/cli/src/a.ts',
      impact: 'small',
      tier: 'aspirational',
    }),
    finding({
      code: 'CODE-R004',
      file: 'packages/cli/src/b.ts',
      impact: 'small',
      confidence: 'low',
    }),
  ];

  it("floors them and resolves every one to 'file'", () => {
    const result = clumpCraftFindings(subFloor, ROOT);
    expect(result.counts.floored).toBe(2);
    expect(result.counts.flooredAct).toBe(0);
    expect(result.counts.flooredFile).toBe(2);
    expect(result.floored.every((f) => f.resolution === 'file')).toBe(true);
  });

  it("POSITIVE CONTROL: the SAME items resolve 'act' once a touched set is supplied", () => {
    // Proves `flooredAct === 0` above is the missing touched set and not a
    // floor that cannot produce `'act'` at all — an inert floor and a correctly
    // degrading one are indistinguishable from the assertion above alone.
    const items = toClumpableItems(subFloor, ROOT);
    const withTouched = formClumps(items, undefined, {
      touched: ['packages/cli/src/a.ts', 'packages/cli/src/b.ts'],
    });
    expect(withTouched.counts.flooredAct).toBe(2);
  });

  it('above-floor findings are NOT floored (the floor is not a silent delete)', () => {
    const result = clumpCraftFindings(
      [
        finding({
          code: 'CODE-R004',
          file: 'packages/cli/src/a.ts',
          impact: 'large',
          confidence: 'low',
        }),
      ],
      ROOT
    );
    expect(result.counts.floored).toBe(0);
  });
});

describe('conservation — nothing a craft run emits is silently dropped', () => {
  it('every finding lands in exactly one bucket', () => {
    const findings = [
      ...Array.from({ length: 30 }, (_, i) =>
        finding({ code: 'CODE-R004', file: `packages/cli/src/dir${i % 4}/f${i}.ts` })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        finding({
          code: 'NAME-R001',
          file: `packages/core/src/n${i}.ts`,
          impact: 'small',
          confidence: 'low',
        })
      ),
    ];
    const r = clumpCraftFindings(findings, ROOT);
    const total =
      r.counts.clumped + r.counts.floored + r.counts.overCap + r.counts.ungraded + r.counts.solo;
    expect(r.counts.input).toBe(findings.length);
    expect(total).toBe(findings.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Portability (success criterion 7, the half Phase 3 deferred to Phase 6).
//
// THE PROPERTY, stated before any encoding: a clump id names a SET OF FINDINGS,
// so two clones of one repo checked out at different absolute roots must
// publish the SAME id for the same findings. Criterion 7 says "two runs of
// `formClumps` over the same input produce identical output"; inside one clone
// that held trivially, and across clones it FAILED — measured
// `clump-1252b222d5c68f3e` vs `clump-5552dc07fc8290b2` for identical findings
// under `/var/folders/xy/T/alpha` and `/home/zeta/deep/nest/beta`.
//
// These tests are written as a comparison BETWEEN TWO ROOTS, never as an
// assertion that one root yields one literal id. A single-root test cannot see
// this property at all: every id it could assert is a correct id for that
// machine.
// ─────────────────────────────────────────────────────────────────────────────

/** The seven families with no `target.relative`: an absolute `target.file` only. */
function absoluteFindings(root: string): CraftClumpableFinding[] {
  return [
    finding({ code: 'CODE-R004', file: `${root}/packages/api/src/a.ts`, line: 10 }),
    finding({ code: 'CODE-R004', file: `${root}/packages/api/src/b.ts`, line: 20 }),
    finding({ code: 'CODE-R004', file: `${root}/packages/api/src/c.ts`, line: 30 }),
  ];
}

/** Two roots with DIFFERENT depths — `/var/...` is 4 segments, `/home/...` is 5. */
const ROOT_A = '/var/folders/xy/T/alpha';
const ROOT_B = '/home/zeta/deep/nest/beta';

describe('a clump id is the same in every clone', () => {
  it('two different absolute project roots produce the SAME clump ids', () => {
    const a = clumpCraftFindings(absoluteFindings(ROOT_A), ROOT_A);
    const b = clumpCraftFindings(absoluteFindings(ROOT_B), ROOT_B);

    // POSITIVE CONTROL, first: `[] === []` would satisfy the equality below
    // while proving nothing, so pin that there is actually a clump to compare.
    expect(a.clumps).toHaveLength(1);
    expect(b.clumps).toHaveLength(1);

    expect(a.clumps.map((c) => c.id)).toEqual(b.clumps.map((c) => c.id));
  });

  it('…and the same member ids, which is the other half the clump id hashes', () => {
    const a = clumpCraftFindings(absoluteFindings(ROOT_A), ROOT_A);
    const b = clumpCraftFindings(absoluteFindings(ROOT_B), ROOT_B);
    const ids = (r: typeof a) => r.clumps[0]!.members.map((m) => m.id);
    expect(ids(a)).toHaveLength(3);
    expect(ids(a)).toEqual(ids(b));
    // Relativizing `scope` alone would leave THIS failing: a member id is
    // `code:file:line#ordinal`, so the absolute path reaches the hash through
    // the members even when the scope is clean.
    expect(ids(a).join(' ')).not.toContain(ROOT_A);
  });

  it('…and the same conflict keys, so a conflict split is a clone-independent decision', () => {
    const a = clumpCraftFindings(absoluteFindings(ROOT_A), ROOT_A);
    const b = clumpCraftFindings(absoluteFindings(ROOT_B), ROOT_B);
    expect(a.clumps[0]!.conflictKeys).toHaveLength(3);
    expect(a.clumps[0]!.conflictKeys).toEqual(b.clumps[0]!.conflictKeys);
  });

  it('NEGATIVE CONTROL: the ids are NOT identical merely because the findings are few', () => {
    // If `craftPath` returned a constant, every assertion above would still
    // pass. A DIFFERENT finding set under the same root must differ.
    const a = clumpCraftFindings(absoluteFindings(ROOT_A), ROOT_A);
    const other = clumpCraftFindings(
      [
        finding({ code: 'CODE-R004', file: `${ROOT_A}/packages/web/src/a.ts`, line: 10 }),
        finding({ code: 'CODE-R004', file: `${ROOT_A}/packages/web/src/b.ts`, line: 20 }),
        finding({ code: 'CODE-R004', file: `${ROOT_A}/packages/web/src/c.ts`, line: 30 }),
      ],
      ROOT_A
    );
    expect(other.clumps).toHaveLength(1);
    expect(other.clumps[0]!.id).not.toBe(a.clumps[0]!.id);
  });
});

describe('craftPath — what each family gets, and what no root can fix', () => {
  it('relativizes an absolute file against the project root', () => {
    expect(
      craftPath(finding({ code: 'CODE-R004', file: `${ROOT_A}/packages/api/src/a.ts` }), ROOT_A)
    ).toBe('packages/api/src/a.ts');
  });

  it('prefers a declared `target.relative` — the four families that carry one', () => {
    // api / cli-ergonomics / docs / knowledge each declare
    // `relative: path.relative(projectRoot, full)`. Reading it means those four
    // are portable even from a caller that cannot name a root.
    const f: CraftClumpableFinding = {
      ...finding({ code: 'API-R001', file: `${ROOT_A}/packages/api/src/routes.ts` }),
      target: {
        file: `${ROOT_A}/packages/api/src/routes.ts`,
        relative: 'packages/api/src/routes.ts',
      },
    };
    expect(craftPath(f, '')).toBe('packages/api/src/routes.ts');
    expect(craftPath(f, '/some/other/root')).toBe('packages/api/src/routes.ts');
  });

  it('leaves an already-relative path alone', () => {
    const f = finding({ code: 'CODE-R004', file: 'packages/cli/src/a.ts' });
    expect(craftPath(f, ROOT_A)).toBe('packages/cli/src/a.ts');
  });

  it('STATED LIMIT: a file OUTSIDE the root keeps its absolute path', () => {
    // `path.relative('/var/folders/xy/T/alpha', '/elsewhere/x.ts')` is
    // `../../../../elsewhere/x.ts` — the number of `..` segments is a function
    // of how deep the root sits, so the "relative" form is exactly as
    // machine-local as the absolute one. Returning the absolute path keeps the
    // non-portability visible instead of dressing it up.
    const f = finding({ code: 'CODE-R004', file: '/elsewhere/x.ts' });
    expect(craftPath(f, ROOT_A)).toBe('/elsewhere/x.ts');
    expect(craftPath(f, ROOT_B)).toBe('/elsewhere/x.ts');
  });

  it('…and that limit is NOT a silent portability claim: such ids still differ', () => {
    // The honest consequence, pinned so nobody reads the case above as "handled".
    const outside = [
      finding({ code: 'CODE-R004', file: '/elsewhere/x.ts', line: 1 }),
      finding({ code: 'CODE-R004', file: '/elsewhere/y.ts', line: 2 }),
    ];
    const a = clumpCraftFindings(outside, ROOT_A);
    const b = clumpCraftFindings(outside, ROOT_B);
    // Identical here only because the INPUT paths are identical — two clones
    // would supply different ones. The id is stable w.r.t. the root because the
    // root is not consulted at all for an outside file.
    expect(a.clumps[0]!.id).toBe(b.clumps[0]!.id);
    expect(a.clumps[0]!.scope).toBe('/elsewhere');
  });
});
