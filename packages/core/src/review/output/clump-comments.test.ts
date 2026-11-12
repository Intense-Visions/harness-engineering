// Laws for the REVIEW half of the creation seam
// (docs/changes/clumping/proposal.md, Phase 3).

import { describe, expect, it } from 'vitest';

import { formClumps } from '../../fleet/clumping';
import type { ReviewFinding } from '../types';
import { formatClumpedComments, toClumpableFinding } from './clump-comments';
import { scopeOfPath } from '../../fleet/clumping';

function finding(over: Partial<ReviewFinding> & { id: string; file: string }): ReviewFinding {
  return {
    id: over.id,
    file: over.file,
    lineRange: over.lineRange ?? [10, 10],
    domain: over.domain ?? 'bug',
    severity: over.severity ?? 'suggestion',
    title: over.title ?? `title ${over.id}`,
    rationale: over.rationale ?? `rationale ${over.id}`,
    evidence: over.evidence ?? [],
    validatedBy: over.validatedBy ?? 'heuristic',
    ...(over.suggestion !== undefined ? { suggestion: over.suggestion } : {}),
    ...(over.trustScore !== undefined ? { trustScore: over.trustScore } : {}),
  };
}

const N = 6;
const suggestions = Array.from({ length: N }, (_, i) =>
  finding({ id: `s${i}`, file: `src/auth/f${i}.ts`, lineRange: [i + 1, i + 1] })
);
const touched = suggestions.map((f) => f.file);

describe('N same-(scope, kind) suggestions produce ONE comment', () => {
  it(`folds ${N} suggestions into 1 comment`, () => {
    const { comments, report } = formatClumpedComments(suggestions, { touched });
    expect(comments).toHaveLength(1);
    expect(report.clumps).toBe(1);
    expect(report.grouped).toBe(N);
  });

  it('POSITIVE CONTROL: the same N without grouping would be N comments', () => {
    // `minToClump: Infinity` makes every group fall below the clumping
    // threshold, so the suite sees what the pre-clumping pipeline emitted.
    // Without this, "1 comment" would also be the answer if the formatter had
    // simply dropped five findings on the floor.
    const { comments } = formatClumpedComments(suggestions, {
      touched,
      policy: { minToClump: Number.MAX_SAFE_INTEGER },
    });
    expect(comments).toHaveLength(N);
  });

  it('POSITIVE CONTROL: a different domain does not join the group', () => {
    const mixed = [
      ...suggestions,
      finding({ id: 'x', file: 'src/auth/style.ts', domain: 'security' }),
    ];
    const { comments } = formatClumpedComments(mixed, { touched: mixed.map((f) => f.file) });
    // One clump for `bug`; the lone `security` suggestion stays solo.
    expect(comments).toHaveLength(2);
  });

  it('POSITIVE CONTROL: a different directory does not join the group', () => {
    const mixed = [...suggestions, finding({ id: 'y', file: 'src/billing/other.ts' })];
    const { comments, report } = formatClumpedComments(mixed, {
      touched: mixed.map((f) => f.file),
    });
    expect(report.clumps).toBe(1);
    expect(comments).toHaveLength(2);
  });
});

describe('criticals and importants stay individually anchored', () => {
  const criticals = [
    finding({ id: 'c0', file: 'src/auth/f0.ts', severity: 'critical', lineRange: [4, 4] }),
    finding({ id: 'c1', file: 'src/auth/f1.ts', severity: 'critical', lineRange: [5, 5] }),
    finding({ id: 'i0', file: 'src/auth/f2.ts', severity: 'important', lineRange: [6, 6] }),
  ];

  it('each keeps its own comment on its own line', () => {
    const { comments, report } = formatClumpedComments(criticals, {
      touched: criticals.map((f) => f.file),
    });
    expect(comments).toHaveLength(3);
    expect(report.clumps).toBe(0);
    expect(comments.map((c) => `${c.path}:${c.line}`)).toEqual([
      'src/auth/f0.ts:4',
      'src/auth/f1.ts:5',
      'src/auth/f2.ts:6',
    ]);
  });

  it('criticals stay anchored while suggestions in the SAME scope fold', () => {
    const all = [...criticals, ...suggestions];
    const { comments, report } = formatClumpedComments(all, {
      touched: all.map((f) => f.file),
    });
    // 3 individual + 1 grouped.
    expect(comments).toHaveLength(4);
    expect(report.individual).toBe(3);
    expect(report.grouped).toBe(N);
  });
});

describe('the grouped comment names every member with its file and line', () => {
  // A grouped comment that says "several suggestions in this directory" trades
  // twenty actionable comments for one unactionable one, which is strictly
  // worse than doing nothing. This is the law that stops that.
  it('every member appears in the body as file:line', () => {
    const { comments } = formatClumpedComments(suggestions, { touched });
    const body = comments[0]!.body;
    for (const f of suggestions) {
      expect(body).toContain(`${f.file}:${f.lineRange[0]}`);
      expect(body).toContain(f.title);
    }
  });

  it('a multi-line finding renders as a range', () => {
    const ranged = suggestions.map((f, i) =>
      i === 0 ? finding({ ...f, id: f.id, file: f.file, lineRange: [3, 9] }) : f
    );
    const { comments } = formatClumpedComments(ranged, { touched });
    expect(comments[0]!.body).toContain('src/auth/f0.ts:3-9');
  });

  it('the comment anchors to a real member file and line', () => {
    const { comments } = formatClumpedComments(suggestions, { touched });
    const anchor = comments[0]!;
    const member = suggestions.find((f) => f.file === anchor.path);
    expect(member).toBeDefined();
    expect(anchor.line).toBe(member!.lineRange[1]);
    expect(anchor.side).toBe('RIGHT');
  });
});

describe("the diff's changed files make D4's 'act' resolution reachable here", () => {
  it("resolves 'act' when every conflict key is inside the touched set", () => {
    const { report } = formatClumpedComments(suggestions, { touched });
    expect(report.act).toBe(N);
    expect(report.file).toBe(0);
  });

  it("POSITIVE CONTROL: resolves 'file' when the file is outside the touched set", () => {
    const { report } = formatClumpedComments(suggestions, { touched: ['src/unrelated.ts'] });
    expect(report.act).toBe(0);
    expect(report.file).toBe(N);
  });

  it("POSITIVE CONTROL: resolves 'file' when no touched set is supplied at all", () => {
    // This is the craft seam's permanent state, reproduced here to show the
    // same code produces both answers — so `act: 6` above is the touched set
    // doing work, not a constant.
    const { report } = formatClumpedComments(suggestions);
    expect(report.act).toBe(0);
    expect(report.file).toBe(N);
  });

  it('the resolution is visible in the grouped comment, not just in the report', () => {
    const { comments } = formatClumpedComments(suggestions, { touched });
    expect(comments[0]!.body).toContain('act: severity is suggestion');
  });
});

describe('LAW: every finding is represented in exactly one comment', () => {
  // A review comment that vanishes because a cap was hit looks identical in
  // output to a review that found nothing.
  // Titles are DELIMITED (`over#7#`, not `over-7`): a bare `over-1` is a
  // substring of `over-10`, so an undelimited probe counts eleven matches for
  // one finding and the law fails for a reason unrelated to the code under test.
  // The delimiter is `#` and not `<>` because both comment paths escape `<`/`>`
  // for CWE-79, so an angle-bracketed probe matches NOTHING and the law fails
  // the other way. Both near-misses happened while writing this suite.
  function represented(comments: readonly { body: string }[], f: ReviewFinding): number {
    return comments.filter((c) => c.body.includes(f.title)).length;
  }

  it('holds across a mixed, cap-tripping population', () => {
    const population: ReviewFinding[] = [];
    for (let i = 0; i < 60; i += 1) {
      population.push(
        finding({
          id: `m${i}`,
          file: `src/area${i % 25}/f${i}.ts`,
          lineRange: [i + 1, i + 1],
          severity: i % 7 === 0 ? 'critical' : i % 5 === 0 ? 'important' : 'suggestion',
          domain: i % 3 === 0 ? 'bug' : 'security',
          title: `mixed#${i}#`,
        })
      );
    }
    const { comments, report } = formatClumpedComments(population, {
      touched: population.map((f) => f.file),
    });
    for (const f of population) expect(represented(comments, f)).toBe(1);
    expect(report.findings).toBe(population.length);
    expect(report.individual + report.grouped).toBe(population.length);
  });

  it('an over-cap group degrades to individual comments rather than disappearing', () => {
    // 25 (scope, kind) groups of 2 against a cap of 20: five groups are shed by
    // the cap and must come back as individual comments.
    const population: ReviewFinding[] = [];
    for (let i = 0; i < 50; i += 1) {
      population.push(
        finding({
          id: `o${i}`,
          file: `src/area${i % 25}/f${i}.ts`,
          lineRange: [i + 1, i + 1],
          title: `over#${i}#`,
        })
      );
    }
    const { comments, report } = formatClumpedComments(population, {
      touched: population.map((f) => f.file),
    });
    expect(report.clumps).toBe(20);
    expect(report.overCapFindings).toBe(10);
    expect(comments).toHaveLength(20 + 10);
    for (const f of population) expect(represented(comments, f)).toBe(1);
  });
});

describe('a repeated finding id neither throws nor drops a comment', () => {
  // `ReviewFinding.id` is `domain-file-line` and is NOT unique after fan-out.
  // `formClumps` throws on a duplicate id rather than collapsing two items,
  // which is right for filed issues and wrong here: it would turn a review that
  // found something into a crash.
  const twins = [
    finding({ id: 'bug-src/auth/f.ts-10', file: 'src/auth/f.ts', title: 'first#' }),
    finding({ id: 'bug-src/auth/f.ts-10', file: 'src/auth/f.ts', title: 'second#' }),
  ];

  it('emits one comment per finding and does not throw', () => {
    expect(() => formatClumpedComments(twins, { touched: ['src/auth/f.ts'] })).not.toThrow();
    const { comments, report } = formatClumpedComments(twins, { touched: ['src/auth/f.ts'] });
    expect(comments).toHaveLength(2);
    expect(report.findings).toBe(2);
    expect(comments.filter((c) => c.body.includes('first#'))).toHaveLength(1);
    expect(comments.filter((c) => c.body.includes('second#'))).toHaveLength(1);
  });

  it('a repeated id whose FIRST occurrence is above the floor is still reported once', () => {
    // The case the two numbering loops had to agree on, built so a
    // disagreement is actually observable. The twins above share a file, so the
    // conflict rule splits them and neither is ever clumped: `clumpedIds` is
    // empty and the complement's ordinals are never consulted. And twins that
    // BOTH clump are no better — a complement stuck on ordinal 0 finds `#0` in
    // the set and stays silent, so the drift hides.
    //
    // Here `#0` is a CRITICAL, which keeps its own anchored comment and never
    // becomes a candidate, while `#1` and `#2` are suggestions on distinct
    // files that fold into one clump. So `clumpedIds` holds `#1` and `#2` but
    // NOT `#0` — and a complement that numbered independently and drifted to 0
    // would look up `#0` for all three, miss twice, and emit two duplicate
    // comments for findings already inside the clump.
    const id = 'bug-src/auth-10';
    const population = [
      finding({ id, file: 'src/auth/a.ts', severity: 'critical', title: 'alpha#' }),
      finding({ id, file: 'src/auth/b.ts', title: 'beta#' }),
      finding({ id, file: 'src/auth/c.ts', title: 'gamma#' }),
    ];
    const { comments, report } = formatClumpedComments(population, {
      touched: population.map((f) => f.file),
    });
    expect(report.clumps).toBe(1);
    expect(report.grouped).toBe(2);
    // One clump comment plus one anchored comment for the critical. No more.
    expect(comments).toHaveLength(2);
    for (const f of population) {
      expect(comments.filter((c) => c.body.includes(f.title)).length).toBe(1);
    }
  });

  it('POSITIVE CONTROL: core still rejects a duplicate id when it is handed one', () => {
    // Proves the ordinal is what keeps the throw unreachable here, rather than
    // the throw having quietly been removed from the primitive.
    const item = toClumpableFinding(twins[0]!);
    expect(() => formClumps([item, { ...item }])).toThrow(/duplicate ClumpableItem id/);
  });
});

describe('the grouped comment escapes member text (CWE-79)', () => {
  // Found by the conservation law in this file, not by inspection: the grouped
  // path originally interpolated `member.title` raw while the individual path
  // next to it ran `sanitizeMarkdown`. A grouped comment carries the title of
  // EVERY member, so the unescaped path was the wider of the two surfaces and
  // was invisible precisely because its neighbour was correct.
  const hostile = finding({
    id: 'h0',
    file: 'src/auth/h0.ts',
    title: '<img src=x onerror=alert(1)>',
  });
  const peer = finding({ id: 'h1', file: 'src/auth/h1.ts' });

  it('escapes angle brackets in a grouped member title', () => {
    const { comments, report } = formatClumpedComments([hostile, peer], {
      touched: ['src/auth/h0.ts', 'src/auth/h1.ts'],
    });
    expect(report.clumps).toBe(1);
    expect(comments[0]!.body).not.toContain('<img');
    expect(comments[0]!.body).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('POSITIVE CONTROL: the individual path escapes it identically', () => {
    // Same finding, routed as a critical so it takes the un-grouped path. If
    // this ever stopped escaping, the assertion above would be pinning a
    // property the module no longer has anywhere.
    const { comments } = formatClumpedComments(
      [finding({ ...hostile, id: 'h0', file: hostile.file, severity: 'critical' })],
      { touched: ['src/auth/h0.ts'] }
    );
    expect(comments[0]!.body).not.toContain('<img');
    expect(comments[0]!.body).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('scopeOfPath', () => {
  it('is the directory', () => {
    expect(scopeOfPath('src/auth/login.ts')).toBe('src/auth');
  });

  it("a root-level file scopes to '.'", () => {
    expect(scopeOfPath('README.md')).toBe('.');
  });

  it('does not split on a backslash — win32 and POSIX must agree', () => {
    expect(scopeOfPath('a\\b\\c.ts')).toBe('.');
  });
});

describe('toClumpableFinding', () => {
  it('weight ranks severity above trust score', () => {
    const critical = toClumpableFinding(
      finding({ id: 'a', file: 'x/a.ts', severity: 'critical', trustScore: 0 })
    );
    const suggestion = toClumpableFinding(
      finding({ id: 'b', file: 'x/b.ts', severity: 'suggestion', trustScore: 100 })
    );
    expect(critical.weight).toBeGreaterThan(suggestion.weight);
  });

  it('the conflict key is the file, so two findings on one file never co-clump', () => {
    const same = [
      finding({ id: 'p', file: 'src/auth/f.ts', title: 'first' }),
      finding({ id: 'q', file: 'src/auth/f.ts', title: 'second' }),
    ];
    const { comments, report } = formatClumpedComments(same, {
      touched: ['src/auth/f.ts'],
    });
    expect(report.clumps).toBe(0);
    expect(comments).toHaveLength(2);
  });
});
