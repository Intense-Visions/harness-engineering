// packages/core/src/fleet/clumping/dispatch.test.ts
//
// The execution seam's contract (Phase 5): one PR per clump with one commit per
// member (success criterion 10), and ONE verdict per clump with a failing member
// dropped by reverting its own commit (success criterion 14 / D10).
//
// Every law here is asserted as a PROPERTY first and only then as an encoding,
// because an assertion on the encoding alone passes for the wrong reason the day
// the encoding changes, and a mutant that trips the encoding assertion while the
// property still holds has proved nothing.

import { describe, expect, it } from 'vitest';

import {
  checkVerdictPartition,
  planClumpPR,
  settleClumpVerdict,
  type ClumpMemberOutcome,
} from './dispatch';
import { formClumps } from './form';
import type { Clump, ClumpableItem } from './types';

function item(id: string, over: Partial<ClumpableItem> = {}): ClumpableItem {
  return {
    id,
    scope: 'packages/core/src/fleet',
    kind: 'CODE',
    grade: { kind: 'axes', tier: 'solid', impact: 'medium', confidence: 'high' },
    weight: 100,
    conflictKeys: [`${id}.ts`],
    ...over,
  };
}

/** A clump built the only way a lane ever gets one: out of `formClumps`. */
function realClump(ids: readonly string[]): Clump {
  const result = formClumps(ids.map((id) => item(id)));
  expect(result.clumps, 'fixture did not form a clump').toHaveLength(1);
  return result.clumps[0]!;
}

describe('planClumpPR — the one-PR-per-clump contract (criterion 10)', () => {
  it('emits exactly one commit per member, in member order', () => {
    const clump = realClump(['a', 'b', 'c', 'd']);
    const plan = planClumpPR(clump);

    // The PROPERTY: one commit per member, none lost, none invented.
    expect(plan.commits).toHaveLength(clump.members.length);
    expect(plan.commits.map((c) => c.memberId)).toEqual(clump.members.map((m) => m.id));
    // One branch and one PR for the whole clump — not one per member.
    expect(typeof plan.branch).toBe('string');
    expect(new Set([plan.branch]).size).toBe(1);
  });

  it('scales commit count with member count — the positive control for the law above', () => {
    // A `commits.length === members.length` assertion also passes against an
    // implementation that emits ONE commit for the whole clump when the fixture
    // has one member. Vary N so only a per-member implementation survives.
    for (const n of [2, 3, 7]) {
      const ids = Array.from({ length: n }, (_, i) => `m${i}`);
      expect(planClumpPR(realClump(ids)).commits).toHaveLength(n);
    }
  });

  it('names the clump in the title and lists every member with its citation in the body', () => {
    const clump = realClump(['alpha', 'beta', 'gamma']);
    const plan = planClumpPR(clump, {
      describe: (i) => ({ subject: `rename ${i.id}`, citation: `CODE-R004 @ ${i.id}.ts` }),
    });

    expect(plan.title).toContain(clump.kind);
    expect(plan.title).toContain(clump.scope);
    expect(plan.title).toContain('(3 items)');
    // The PROPERTY: every member is reachable from the body with its citation.
    for (const member of clump.members) {
      expect(plan.body, `member ${member.id} missing from body`).toContain(member.id);
      expect(plan.body).toContain(`CODE-R004 @ ${member.id}.ts`);
    }
  });

  it('describes a member from the ITEM, never its index — a reordered clump says the same things', () => {
    const forward = planClumpPR(realClump(['a', 'b', 'c']), {
      describe: (i) => ({ subject: i.id, citation: i.id }),
    });
    const reversed = planClumpPR(realClump(['c', 'b', 'a']), {
      describe: (i) => ({ subject: i.id, citation: i.id }),
    });
    const say = (p: typeof forward): string[] =>
      [...p.commits].map((c) => `${c.memberId}|${c.subject}|${c.citation}`).sort();
    expect(say(forward)).toEqual(say(reversed));
  });

  it('rejects an empty clump rather than planning a PR with no payload', () => {
    const empty = { ...realClump(['a', 'b']), members: [] } as Clump;
    expect(() => planClumpPR(empty)).toThrow(/no members/);
  });

  it('produces a branch name a git ref tolerates', () => {
    const clump = realClump(['a', 'b']);
    const plan = planClumpPR({ ...clump, scope: 'packages/my cli/src', kind: 'CODE R004' });
    expect(plan.branch).toMatch(/^clump\/[a-z0-9-]+$/);
  });
});

describe('settleClumpVerdict — one verdict per clump, D10 drops (criterion 14)', () => {
  const plan = () => planClumpPR(realClump(['a', 'b', 'c']));
  const ok = (id: string): ClumpMemberOutcome => ({ memberId: id, verified: true });
  const bad = (id: string, reason = 'test red'): ClumpMemberOutcome => ({
    memberId: id,
    verified: false,
    reason,
  });

  it('returns ONE verdict for the clump, not one per member', () => {
    const verdict = settleClumpVerdict(plan(), [ok('a'), ok('b'), ok('c')]);
    expect(verdict.clumpId).toBe(plan().clumpId);
    expect(verdict.status).toBe('verified');
    expect(verdict.drops).toHaveLength(0);
    expect(verdict.remainder).toEqual(['a', 'b', 'c']);
  });

  it('drops a failing member by reverting ITS OWN commit and proceeds with the rest', () => {
    const p = plan();
    const verdict = settleClumpVerdict(p, [ok('a'), bad('b', 'suite red on b'), ok('c')], {
      postDropBuild: 'green',
    });

    // The PROPERTY: the clump did NOT fail, the bad member left, the good ones stayed.
    expect(verdict.status).toBe('verified-with-drops');
    expect(verdict.remainder).toEqual(['a', 'c']);
    expect(verdict.drops.map((d) => d.memberId)).toEqual(['b']);
    // The drop is recorded WITH its reason — a reasonless drop is a silent delete.
    expect(verdict.drops[0]!.reason).toBe('suite red on b');
    // And the revert names b's OWN commit, never the clump's or a sibling's.
    const bCommit = p.commits.find((c) => c.memberId === 'b')!;
    expect(verdict.drops[0]!.revertCommitSubject).toBe(bCommit.subject);
    for (const sibling of p.commits.filter((c) => c.memberId !== 'b')) {
      expect(verdict.drops[0]!.revertCommitSubject).not.toBe(sibling.subject);
    }
  });

  it('one bad member costs ONE member, not the clump — the inversion D10 exists to prevent', () => {
    // Stated as the economics claim the spec makes, so a future implementation
    // that fails the whole clump on any red trips THIS, not just an enum check.
    for (const n of [3, 5, 9]) {
      const ids = Array.from({ length: n }, (_, i) => `m${i}`);
      const p = planClumpPR(realClump(ids));
      const outcomes = ids.map((id) => (id === 'm1' ? bad(id) : ok(id)));
      const verdict = settleClumpVerdict(p, outcomes, { postDropBuild: 'green' });
      expect(verdict.remainder).toHaveLength(n - 1);
      expect(verdict.drops).toHaveLength(1);
    }
  });

  it('fails the clump only when the post-drop remainder is empty', () => {
    const verdict = settleClumpVerdict(plan(), [bad('a'), bad('b'), bad('c')], {
      postDropBuild: 'green',
    });
    expect(verdict.status).toBe('failed');
    expect(verdict.remainder).toEqual([]);
    expect(verdict.reason).toMatch(/remainder is empty/);
  });

  it('fails the clump when the post-drop remainder no longer builds', () => {
    const verdict = settleClumpVerdict(plan(), [ok('a'), bad('b'), ok('c')], {
      postDropBuild: 'red',
    });
    expect(verdict.status).toBe('failed');
    expect(verdict.reason).toMatch(/no longer builds/);
    // The drops are still RECORDED on a failure — the report never loses them.
    expect(verdict.drops.map((d) => d.memberId)).toEqual(['b']);
  });

  it('an unrun post-drop build is not a green one', () => {
    const verdict = settleClumpVerdict(plan(), [ok('a'), bad('b'), ok('c')]);
    expect(verdict.status).toBe('failed');
    expect(verdict.reason).toMatch(/was not run/);
    // Positive control: the SAME outcomes with a green build pass. Without this
    // the assertion above would also hold for an implementation that failed
    // every clump that ever dropped anything.
    expect(
      settleClumpVerdict(plan(), [ok('a'), bad('b'), ok('c')], { postDropBuild: 'green' }).status
    ).toBe('verified-with-drops');
  });

  it('does not consult the build when nothing was dropped', () => {
    // A clean clump has no reverted tree to re-check; demanding a post-drop
    // build there would fail every good clump.
    expect(settleClumpVerdict(plan(), [ok('a'), ok('b'), ok('c')]).status).toBe('verified');
  });

  it('rejects an outcome for a member the clump does not carry', () => {
    expect(() => settleClumpVerdict(plan(), [ok('a'), ok('b'), ok('c'), bad('z')])).toThrow(
      /does not carry/
    );
  });

  it('rejects a member with no outcome rather than assuming it passed', () => {
    expect(() => settleClumpVerdict(plan(), [ok('a'), ok('b')])).toThrow(/no outcome for 'c'/);
  });

  it('rejects two outcomes for one member rather than letting the later one win', () => {
    expect(() => settleClumpVerdict(plan(), [ok('a'), bad('a'), ok('b'), ok('c')])).toThrow(
      /two outcomes/
    );
  });

  it('rejects a failure with no reason — D10 records the drop WITH its reason', () => {
    expect(() =>
      settleClumpVerdict(plan(), [ok('a'), { memberId: 'b', verified: false }, ok('c')])
    ).toThrow(/no reason/);
    expect(() =>
      settleClumpVerdict(plan(), [
        ok('a'),
        { memberId: 'b', verified: false, reason: '  ' },
        ok('c'),
      ])
    ).toThrow(/no reason/);
  });

  it('settles identically however the outcomes are ordered', () => {
    const p = plan();
    const outcomes = [ok('a'), bad('b'), ok('c')];
    const forward = settleClumpVerdict(p, outcomes, { postDropBuild: 'green' });
    const reversed = settleClumpVerdict(p, [...outcomes].reverse(), { postDropBuild: 'green' });
    expect(reversed).toEqual(forward);
  });
});

describe('checkVerdictPartition — the D10 conservation law', () => {
  const plan = () => planClumpPR(realClump(['a', 'b', 'c', 'd']));

  it('holds for a clean verdict, a partial-drop verdict and a total failure alike', () => {
    const p = plan();
    const all = p.commits.map((c) => c.memberId);
    const cases = [
      all.map((id) => ({ memberId: id, verified: true })),
      all.map((id, i) =>
        i === 2 ? { memberId: id, verified: false, reason: 'r' } : { memberId: id, verified: true }
      ),
      all.map((id) => ({ memberId: id, verified: false, reason: 'r' })),
    ];
    for (const outcomes of cases) {
      const verdict = settleClumpVerdict(p, outcomes, { postDropBuild: 'green' });
      const check = checkVerdictPartition(p, verdict);
      expect(check.holds, JSON.stringify(verdict)).toBe(true);
      expect(check.settled).toBe(check.planned);
    }
  });

  it('refutes a lost member, a double-placed member and a foreign member', () => {
    const p = plan();
    const good = settleClumpVerdict(
      p,
      p.commits.map((c) => ({ memberId: c.memberId, verified: true }))
    );
    // Lost: a member fell out of both sides.
    expect(checkVerdictPartition(p, { ...good, remainder: good.remainder.slice(1) }).holds).toBe(
      false
    );
    // Double-placed: a member is in the remainder AND dropped.
    expect(
      checkVerdictPartition(p, {
        ...good,
        drops: [{ memberId: good.remainder[0]!, revertCommitSubject: 'x', reason: 'r' }],
      }).holds
    ).toBe(false);
    // Foreign: a member the plan never carried, at the right cardinality — the
    // case a bare count comparison would wave through.
    expect(
      checkVerdictPartition(p, { ...good, remainder: [...good.remainder.slice(1), 'z'] }).holds
    ).toBe(false);
  });
});
