// packages/cli/src/commands/fleet/clumpable-issues.test.ts
//
// Phase 4 of docs/changes/clumping/proposal.md — the intake seam.

import { describe, it, expect } from 'vitest';
import { formClumps, resolveFloor } from '@harness-engineering/core';
import type { ClumpableItem } from '@harness-engineering/core';

import {
  DEFAULT_ISSUE_TYPE_LABELS,
  DEFAULT_TRACKER_PATH_PREFIXES,
  INTAKE_CLUMP_POLICY,
  UNSCOPED,
  clumpIssues,
  issueKind,
  issueScope,
  issueWeight,
  labelNames,
  mentionedPaths,
  toClumpableIssues,
  type IntakeIssue,
} from './clumpable-issues';

/** A typed issue in one directory, with a distinct file so nothing conflict-splits. */
function issue(
  number: number,
  type: string,
  file: string,
  extra: Partial<IntakeIssue> = {}
): IntakeIssue {
  return {
    number,
    title: `issue ${number}`,
    body: `breaks in \`${file}\``,
    labels: [{ name: type }],
    ...extra,
  };
}

describe('mentionedPaths', () => {
  it('finds repository-relative paths in first-mention order, de-duplicated', () => {
    const text =
      'see `packages/cli/src/a.ts` and packages/core/src/b.ts, then packages/cli/src/a.ts again';
    expect(mentionedPaths(text)).toEqual(['packages/cli/src/a.ts', 'packages/core/src/b.ts']);
  });

  it('ignores a path inside a URL — a link is not a work target', () => {
    expect(mentionedPaths('https://example.com/docs/guide.md explains it')).toEqual([]);
  });

  it('ignores a bare filename with no directory', () => {
    // A top-level file would otherwise scope the issue to the repository root
    // and group everything that mentions one.
    expect(mentionedPaths('README.md is stale')).toEqual([]);
  });

  it('does not mistake a directory whose name ends in a one-letter extension for a file', () => {
    // Measured on the live backlog: `docs/roadmap.d` matched a looser pattern
    // and scoped issues to `docs/`.
    expect(mentionedPaths('rows live under docs/roadmap.d today')).toEqual([]);
  });

  it('drops tracker bookkeeping paths — an issue does not edit its own roadmap shard', () => {
    const text = 'Roadmap shard: `docs/roadmap.d/capacity-shadow-pricing.md`';
    expect(mentionedPaths(text)).toEqual([]);
    // Positive control at the SAME scope: with the prefix list emptied, the very
    // same text yields the path, so the empty result above is the filter working
    // rather than the pattern failing to match.
    expect(mentionedPaths(text, { trackerPathPrefixes: [] })).toEqual([
      'docs/roadmap.d/capacity-shadow-pricing.md',
    ]);
  });

  it('exposes the default tracker prefix list', () => {
    expect([...DEFAULT_TRACKER_PATH_PREFIXES]).toEqual(['docs/roadmap.d/']);
  });
});

describe('issueScope', () => {
  it('is the directory of the first mentioned path, rendered as a directory', () => {
    expect(issueScope(['packages/cli/src/a.ts', 'packages/core/src/b.ts'])).toBe(
      'packages/cli/src/'
    );
  });

  it('is the UNSCOPED sentinel when the issue names no path', () => {
    expect(issueScope([])).toBe(UNSCOPED);
  });

  it('can never collide with the UNSCOPED sentinel, even for a directory named `unscoped`', () => {
    // The trailing `/` is what makes the sentinel unreachable. Without it this
    // issue would group with the genuinely-unscoped ones — the exact false
    // affinity the sentinel exists to prevent.
    expect(issueScope(['unscoped/foo.ts'])).toBe('unscoped/');
    expect(issueScope(['unscoped/foo.ts'])).not.toBe(UNSCOPED);
  });

  it('a path with NO directory scopes to `./`, not to a path that does not exist', () => {
    // This function used to be its own copy of the path rule, MINUS the
    // `cut === -1` guard its two siblings had: `slice(0, -1)` is "all but the
    // last character", so `README.md` answered `'README.m/'` — a scope that
    // looks like a directory, is not one, and would have silently grouped two
    // root-level issues under a name neither of them names.
    expect(issueScope(['README.md'])).toBe('./');
    // POSITIVE CONTROL at the same scope: one directory in, the answer is the
    // directory, so the guard is on the boundary and not an answer for all.
    expect(issueScope(['x/README.md'])).toBe('x/');
    // …and it still cannot collide with the sentinel.
    expect(issueScope(['README.md'])).not.toBe(UNSCOPED);
  });

  it('is UNREACHABLE from issue text today, which is why the signature had to be fixed', () => {
    // The guard above is unreachable through `mentionedPaths`: PATH_PATTERN
    // requires at least one `/`, so a bare `README.md` in an issue body is
    // never extracted as a path and `issueScope` is handed `[]` instead. That
    // is exactly what made the defect survive — the function is EXPORTED with a
    // signature advertising no such precondition, so the precondition is pinned
    // here rather than assumed.
    expect(mentionedPaths('see README.md for details')).toEqual([]);
    // POSITIVE CONTROL: the same sentence with a directory IS extracted, so the
    // emptiness above is the pattern's slash rule and not a broken fixture.
    expect(mentionedPaths('see docs/README.md for details')).toEqual(['docs/README.md']);
  });
});

describe('issueKind', () => {
  it('is the single type label', () => {
    expect(issueKind([{ name: 'bug' }, { name: 'good first issue' }])).toBe('bug');
  });

  it('accepts bare label names as well as gh label objects', () => {
    expect(labelNames(['bug', { name: 'documentation' }])).toEqual(['bug', 'documentation']);
    expect(issueKind(['enhancement'])).toBe('enhancement');
  });

  it('is null when the issue carries no type label — nothing to group on', () => {
    expect(issueKind([{ name: 'good first issue' }])).toBeNull();
    expect(issueKind(undefined)).toBeNull();
  });

  it('is null when the issue carries TWO type labels — that is a fork, not a guess', () => {
    expect(issueKind([{ name: 'bug' }, { name: 'enhancement' }])).toBeNull();
  });

  it('reads a caller-supplied vocabulary', () => {
    expect(issueKind([{ name: 'defect' }], { typeLabels: ['defect'] })).toBe('defect');
    expect(issueKind([{ name: 'bug' }], { typeLabels: ['defect'] })).toBeNull();
    expect([...DEFAULT_ISSUE_TYPE_LABELS]).toContain('bug');
  });
});

describe('issueWeight', () => {
  it('is the existing pilot score when the prioritize axis supplied its three inputs', () => {
    // (impact × confidence) ÷ effort = (4 × 3) ÷ 2 = 6.
    expect(issueWeight({ number: 1, title: 't', impact: 4, confidence: 3, effort: 2 })).toBe(6);
  });

  it('is 0 — never a fabricated rank — when the trio is absent or partial', () => {
    expect(issueWeight({ number: 1, title: 't' })).toBe(0);
    expect(issueWeight({ number: 1, title: 't', impact: 4, confidence: 3 })).toBe(0);
  });
});

describe('toClumpableIssues', () => {
  it('owns id uniqueness so a repeated issue number can never crash formClumps', () => {
    // A backlog arrives from paginated `gh` output; a page-boundary re-read
    // repeats a number. `formClumps` THROWS on a duplicate id.
    const dup = [
      issue(7, 'bug', 'packages/cli/src/a.ts'),
      issue(7, 'bug', 'packages/cli/src/b.ts'),
    ];
    const items = toClumpableIssues(dup);
    // The PROPERTY first, then the encoding that delivers it — in the other
    // order a mutant that removes the ordinal fails on the id string and the
    // no-crash claim is never reached, so the test would pass for the wrong
    // reason the day someone relaxed the string assertion.
    expect(() => formClumps(items)).not.toThrow();
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.map((i) => i.id)).toEqual(['issue-7#0', 'issue-7#1']);
    // Positive control: strip the ordinal and the same input DOES throw, so the
    // not-throw above is the ordinal working rather than formClumps tolerating
    // duplicates.
    const collided = items.map((i) => ({ ...i, id: 'issue-7' }));
    expect(() => formClumps(collided)).toThrow(/duplicate ClumpableItem id/);
  });

  it('grades a typed issue above the floor and an untyped one ungraded', () => {
    const [typed, untyped] = toClumpableIssues([
      issue(1, 'bug', 'packages/cli/src/a.ts'),
      { number: 2, title: 'mystery', body: 'in packages/cli/src/b.ts', labels: [] },
    ]);
    expect(typed!.grade).toEqual({ kind: 'severity', severity: 'important' });
    expect(untyped!.grade).toEqual({ kind: 'ungraded' });
  });

  it('sets conflictKeys to the paths the issue names', () => {
    const [item] = toClumpableIssues([
      {
        number: 1,
        title: 't',
        body: 'packages/cli/src/a.ts and packages/cli/src/b.ts',
        labels: ['bug'],
      },
    ]);
    expect(item!.conflictKeys).toEqual(['packages/cli/src/a.ts', 'packages/cli/src/b.ts']);
  });
});

describe('the floor at the intake seam', () => {
  it('sheds nothing: every typed issue grades above the floor', () => {
    const { report } = clumpIssues([
      issue(1, 'bug', 'packages/cli/src/a.ts'),
      issue(2, 'documentation', 'docs/reference/a.md'),
      issue(3, 'enhancement', 'packages/core/src/a.ts'),
    ]);
    expect(report.floored).toBe(0);
  });

  it('POSITIVE CONTROL: the floor is LIVE in this composition, not switched off', () => {
    // A zero `floored` and a disabled floor look identical in output. This runs
    // the SAME policy the intake seam runs under over an item graded
    // `suggestion`, and that item IS shed — so the zero above is a property of
    // the issue→grade mapping, not of a dead check.
    const subFloor: ClumpableItem = {
      id: 'probe#0',
      scope: 'packages/cli/src/',
      kind: 'bug',
      grade: { kind: 'severity', severity: 'suggestion' },
      weight: 0,
      conflictKeys: ['packages/cli/src/a.ts'],
    };
    expect(resolveFloor(subFloor, {}, INTAKE_CLUMP_POLICY).below).toBe(true);
    expect(formClumps([subFloor], INTAKE_CLUMP_POLICY).counts.floored).toBe(1);
  });
});

describe('unscoped issues', () => {
  const scoped = [
    issue(1, 'bug', 'packages/cli/src/a.ts'),
    issue(2, 'bug', 'packages/cli/src/b.ts'),
    issue(3, 'bug', 'packages/cli/src/c.ts'),
  ];
  const unscoped = [
    { number: 10, title: 'intermittent hang', body: 'no path here', labels: ['bug'] },
    { number: 11, title: 'slow startup', body: 'no path here either', labels: ['bug'] },
  ];

  it('never co-clump with a scoped issue of the same kind', () => {
    const { result } = clumpIssues([...scoped, ...unscoped]);
    for (const clump of result.clumps) {
      const scopes = new Set(clump.members.map((m) => m.scope));
      expect(scopes.size).toBe(1);
      if (clump.scope === UNSCOPED) {
        expect(clump.members.map((m) => m.id).sort()).toEqual(['issue-10#0', 'issue-11#0']);
      } else {
        expect(clump.members.every((m) => m.id.startsWith('issue-'))).toBe(true);
        expect(clump.members.map((m) => m.id)).not.toContain('issue-10#0');
        expect(clump.members.map((m) => m.id)).not.toContain('issue-11#0');
      }
    }
  });

  it('group only with other unscoped issues OF THE SAME KIND', () => {
    const mixed = [
      ...unscoped,
      { number: 12, title: 'document the thing', body: 'no path', labels: ['documentation'] },
    ];
    const { result } = clumpIssues(mixed);
    const unscopedClumps = result.clumps.filter((c) => c.scope === UNSCOPED);
    expect(unscopedClumps).toHaveLength(1);
    expect(unscopedClumps[0]!.kind).toBe('bug');
    // The lone `documentation` issue is below `minToClump` and stays solo.
    expect(result.solo.map((i) => i.id)).toEqual(['issue-12#0']);
  });

  it('stay solo when there is no second unscoped issue of their kind', () => {
    const { result, report } = clumpIssues([...scoped, unscoped[0]!]);
    expect(result.clumps.every((c) => c.scope !== UNSCOPED)).toBe(true);
    expect(result.solo.map((i) => i.id)).toEqual(['issue-10#0']);
    expect(report.unscoped).toBe(1);
  });

  it('are COUNTED, never hidden', () => {
    const { report } = clumpIssues([...scoped, ...unscoped]);
    expect(report.unscoped).toBe(2);
  });
});

describe('clumpIssues', () => {
  it('groups like issues over one scope into one work unit', () => {
    const { result, report } = clumpIssues([
      issue(1, 'bug', 'packages/cli/src/a.ts'),
      issue(2, 'bug', 'packages/cli/src/b.ts'),
      issue(3, 'bug', 'packages/cli/src/c.ts'),
    ]);
    expect(result.clumps).toHaveLength(1);
    expect(result.clumps[0]!.scope).toBe('packages/cli/src/');
    expect(result.clumps[0]!.kind).toBe('bug');
    expect(report.clumped).toBe(3);
    expect(report.individual).toBe(0);
  });

  it('never co-clumps two issues that name the same file', () => {
    const { result, report } = clumpIssues([
      issue(1, 'bug', 'packages/cli/src/a.ts'),
      issue(2, 'bug', 'packages/cli/src/a.ts'),
    ]);
    expect(report.conflictSplits).toBe(1);
    expect(result.clumps).toHaveLength(0);
    expect(result.solo).toHaveLength(2);
  });

  it('LAW: every issue is represented exactly once — one clump member or one queue entry', () => {
    const backlog: IntakeIssue[] = [
      issue(1, 'bug', 'packages/cli/src/a.ts'),
      issue(2, 'bug', 'packages/cli/src/b.ts'),
      issue(3, 'documentation', 'docs/reference/a.md'),
      { number: 4, title: 'untyped', body: 'packages/cli/src/d.ts', labels: [] },
      { number: 5, title: 'forked', body: 'packages/cli/src/e.ts', labels: ['bug', 'enhancement'] },
      { number: 6, title: 'unscoped', body: 'nothing', labels: ['bug'] },
    ];
    const { result, individual, report } = clumpIssues(backlog);
    const clumpedIds = result.clumps.flatMap((c) => c.members.map((m) => m.id));
    const seen = [...clumpedIds, ...individual.map((i) => i.id)].sort();
    expect(seen).toEqual(
      toClumpableIssues(backlog)
        .map((i) => i.id)
        .sort()
    );
    expect(new Set(seen).size).toBe(backlog.length);
    expect(report.individual).toBe(backlog.length - report.clumped);
  });

  it('CONSERVATION: the five core buckets partition the input exactly', () => {
    const backlog: IntakeIssue[] = [
      issue(1, 'bug', 'packages/cli/src/a.ts'),
      issue(2, 'bug', 'packages/cli/src/b.ts'),
      { number: 3, title: 'untyped', body: 'packages/cli/src/c.ts', labels: [] },
      {
        number: 4,
        title: 'forked',
        body: 'packages/cli/src/d.ts',
        labels: ['bug', 'documentation'],
      },
      issue(5, 'question', 'docs/a.md'),
    ];
    const { counts } = clumpIssues(backlog).result;
    expect(counts.input).toBe(
      counts.clumped + counts.floored + counts.overCap + counts.ungraded + counts.solo
    );
  });

  it('counts untyped and multi-typed issues separately, both terminal', () => {
    const { report } = clumpIssues([
      { number: 1, title: 'untyped', body: 'packages/cli/src/a.ts', labels: [] },
      { number: 2, title: 'forked', body: 'packages/cli/src/b.ts', labels: ['bug', 'enhancement'] },
      issue(3, 'bug', 'packages/cli/src/c.ts'),
    ]);
    expect(report.untyped).toBe(1);
    expect(report.multiTyped).toBe(1);
    expect(report.ungraded).toBe(2);
    expect(report.clumped).toBe(0);
  });

  it('does not cap by default — intake organizes an already-filed backlog', () => {
    const backlog: IntakeIssue[] = [];
    for (let n = 1; n <= 60; n += 1) backlog.push(issue(n, 'bug', `packages/dir${n}/a.ts`));
    const { report } = clumpIssues(backlog);
    expect(report.overCap).toBe(0);
    expect(report.individual).toBe(60); // each is solo in its own scope — but still in the queue
  });

  it('honours a caller-set cap and degrades over-cap units to individual queue entries', () => {
    const backlog = [
      issue(1, 'bug', 'packages/a/x.ts'),
      issue(2, 'bug', 'packages/a/y.ts'),
      issue(3, 'documentation', 'docs/b/x.md'),
      issue(4, 'documentation', 'docs/b/y.md'),
    ];
    const { result, individual, report } = clumpIssues(backlog, { maxClumps: 1 });
    expect(result.clumps).toHaveLength(1);
    expect(report.overCap).toBe(2);
    // Nothing is dropped: the shed clump's members come back as queue entries.
    const seen = [
      ...result.clumps.flatMap((c) => c.members.map((m) => m.id)),
      ...individual.map((i) => i.id),
    ].sort();
    expect(seen).toEqual(['issue-1#0', 'issue-2#0', 'issue-3#0', 'issue-4#0']);
  });
});
