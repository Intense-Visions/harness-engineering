// packages/cli/src/commands/fleet/clump-dispatch.test.ts
//
// The execution seam's runnable surface (Phase 5). The point of these tests is
// NOT that a CLI command prints something: it is that a clump actually becomes
// the unit of work — one PR plan per clump, one commit per member, one verdict
// per clump — and that the one input shape which would let a lane quietly fall
// back to re-folding findings by hand is rejected rather than degraded.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formClumps, type ClumpableItem } from '@harness-engineering/core';
import { describe, expect, it } from 'vitest';

import { clumpIssues, type IntakeIssue } from './clumpable-issues';
import {
  CLUMP_FAILED_EXIT_CODE,
  NO_CLUMPS_INPUT_EXIT_CODE,
  VERDICT_PARTITION_BREACH_EXIT_CODE,
  describeMember,
  extractClumps,
  runClumpDispatch,
} from './clump-dispatch';
import {
  clumpCraftFindings,
  type CraftClumpableFinding,
} from '../../shared/craft/findings/clumpable';

const dir = mkdtempSync(join(tmpdir(), 'clump-dispatch-'));
let seq = 0;
function tmpJson(value: unknown): string {
  const file = join(dir, `in-${seq++}.json`);
  writeFileSync(file, JSON.stringify(value), 'utf-8');
  return file;
}

/** Capture stdout+stderr around a run, so an exit code is never read alone. */
function capture(fn: () => number): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args: unknown[]) => void out.push(args.map(String).join(' '));
  console.error = (...args: unknown[]) => void err.push(args.map(String).join(' '));
  try {
    return { code: fn(), out: out.join('\n'), err: err.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

/** A real craft run's output shape: findings PLUS the grouped view Phase 3 wired. */
function craftRunOutput(n: number): { findings: CraftClumpableFinding[]; clumps: unknown } {
  const findings: CraftClumpableFinding[] = Array.from({ length: n }, (_, i) => ({
    code: 'CODE-R004',
    tier: 'foundational',
    impact: 'medium',
    confidence: 'high',
    target: { file: `packages/cli/src/commands/a${i}.ts`, line: 10 + i },
  }));
  return { findings, clumps: clumpCraftFindings(findings, '') };
}

describe('extractClumps — what a lane may hand in', () => {
  it('reads the clump set out of a craft run output, a clump-issues dump and a bare ClumpResult alike', () => {
    const craft = extractClumps(craftRunOutput(4));
    expect('gap' in craft, JSON.stringify(craft)).toBe(false);
    expect((craft as readonly unknown[]).length).toBe(1);

    const bare = clumpCraftFindings(craftRunOutput(4).findings, '');
    expect(extractClumps(bare)).toHaveLength(1);

    const issues: IntakeIssue[] = [1, 2, 3].map((n) => ({
      number: n,
      title: `fix packages/cli/src/thing${n}.ts`,
      body: 'touches packages/cli/src/',
      labels: [{ name: 'bug' }],
    }));
    const intake = clumpIssues(issues);
    expect(extractClumps(intake.result)).toHaveLength(intake.result.clumps.length);
  });

  it('REJECTS a findings-only input rather than reporting zero plans', () => {
    // This is the whole point of the phase. A lane handed a findings-only run
    // must be told its input carries no grouped view, not shown an empty plan
    // list that reads as "nothing to group".
    const gap = extractClumps({ findings: craftRunOutput(4).findings });
    expect(gap).toHaveProperty('gap');
    expect((gap as { gap: string }).gap).toMatch(/4 findings and no `clumps`/);
  });

  it('distinguishes a genuinely empty clump set from a missing one', () => {
    // The positive control for the rejection above: a run that legitimately
    // grouped nothing is an empty ARRAY, never a gap.
    const empty = clumpCraftFindings([], '');
    const got = extractClumps({ findings: [], clumps: empty });
    expect('gap' in (got as object)).toBe(false);
    expect(got).toHaveLength(0);
  });
});

describe('describeMember — the citation in the PR body', () => {
  it('names the issue at intake and the rubric cite at creation, and degrades to the id', () => {
    expect(
      describeMember({
        id: 'x',
        scope: 's',
        kind: 'k',
        grade: { kind: 'ungraded' },
        weight: 0,
        conflictKeys: [],
        ref: { number: 42, title: 'the title' },
      })
    ).toEqual({ subject: 'the title', citation: '#42 — the title' });

    expect(
      describeMember({
        id: 'x',
        scope: 's',
        kind: 'k',
        grade: { kind: 'ungraded' },
        weight: 0,
        conflictKeys: [],
        ref: { code: 'CODE-R004', target: { file: 'a/b.ts', line: 7 } },
      })
    ).toEqual({ subject: 'CODE-R004 at a/b.ts:7', citation: 'CODE-R004 — a/b.ts:7' });

    // An unrecognized ref falls back to the id; it never fabricates a citation.
    const bare: ClumpableItem = {
      id: 'the-id',
      scope: 's',
      kind: 'k',
      grade: { kind: 'ungraded' },
      weight: 0,
      conflictKeys: [],
      ref: { something: 'else' },
    };
    expect(describeMember(bare)).toEqual({ subject: 'the-id', citation: 'the-id' });
  });
});

describe('runClumpDispatch — DISPATCH: one PR plan per clump, one commit per member', () => {
  it('reads the emitted clumps and plans one PR per clump with a commit per member', () => {
    const run = craftRunOutput(5);
    const { code, out } = capture(() => runClumpDispatch({ input: tmpJson(run), json: true }));
    expect(code).toBe(0);
    const { plans } = JSON.parse(out) as {
      plans: { commits: unknown[]; branch: string; title: string }[];
    };
    // The PROPERTY: one plan per clump, one commit per member, one branch each.
    const emitted = clumpCraftFindings(run.findings, '');
    expect(plans).toHaveLength(emitted.clumps.length);
    for (const [i, plan] of plans.entries()) {
      expect(plan.commits).toHaveLength(emitted.clumps[i]!.members.length);
    }
    expect(new Set(plans.map((p) => p.branch)).size).toBe(plans.length);
  });

  it('carries every member into the PR body with its citation', () => {
    const run = craftRunOutput(3);
    const { out } = capture(() => runClumpDispatch({ input: tmpJson(run), json: true }));
    const { plans } = JSON.parse(out) as { plans: { body: string }[] };
    for (const finding of run.findings) {
      expect(plans[0]!.body).toContain(`${finding.target.file}:${finding.target.line}`);
    }
  });

  it('exits non-zero on a findings-only input and plans nothing', () => {
    const { code, err, out } = capture(() =>
      runClumpDispatch({ input: tmpJson({ findings: craftRunOutput(4).findings }), json: true })
    );
    expect(code).toBe(NO_CLUMPS_INPUT_EXIT_CODE);
    expect(err).toMatch(/no clump set to dispatch/);
    expect(out).toBe('');
  });

  it('exits non-zero on an unreadable input rather than planning an empty batch', () => {
    const { code, err } = capture(() =>
      runClumpDispatch({ input: join(dir, 'does-not-exist.json') })
    );
    expect(code).toBe(NO_CLUMPS_INPUT_EXIT_CODE);
    expect(err).toMatch(/cannot read/);
  });
});

describe('runClumpDispatch — VERIFY: one verdict per clump, D10 drops (criterion 14)', () => {
  const run = craftRunOutput(4);
  const emitted = clumpCraftFindings(run.findings, '');
  const clumpId = emitted.clumps[0]!.id;
  const memberIds = emitted.clumps[0]!.members.map((m) => m.id);

  it('settles ONE verdict per clump and exits 0 when every member verifies', () => {
    const verdict = tmpJson({
      clumps: { [clumpId]: memberIds.map((id) => ({ memberId: id, verified: true })) },
    });
    const { code, out } = capture(() =>
      runClumpDispatch({ input: tmpJson(run), verdict, json: true })
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as { verdicts: { status: string; remainder: string[] }[] };
    expect(parsed.verdicts).toHaveLength(1);
    expect(parsed.verdicts[0]!.status).toBe('verified');
    expect(parsed.verdicts[0]!.remainder).toHaveLength(memberIds.length);
  });

  it('drops one failing member, keeps the rest, and exits 0 — the clump did NOT fail', () => {
    const verdict = tmpJson({
      postDropBuild: 'green',
      clumps: {
        [clumpId]: memberIds.map((id, i) =>
          i === 1
            ? { memberId: id, verified: false, reason: 'suite red' }
            : { memberId: id, verified: true }
        ),
      },
    });
    const { code, out } = capture(() =>
      runClumpDispatch({ input: tmpJson(run), verdict, json: true })
    );
    // The ECONOMICS property D10 exists for: one bad member costs one member.
    expect(code).toBe(0);
    const parsed = JSON.parse(out) as {
      verdicts: {
        status: string;
        remainder: string[];
        drops: { memberId: string; reason: string; revertCommitSubject: string }[];
      }[];
    };
    const v = parsed.verdicts[0]!;
    expect(v.status).toBe('verified-with-drops');
    expect(v.remainder).toHaveLength(memberIds.length - 1);
    expect(v.drops).toHaveLength(1);
    expect(v.drops[0]!.memberId).toBe(memberIds[1]);
    expect(v.drops[0]!.reason).toBe('suite red');
    // The revert names the DROPPED member's commit, not a survivor's.
    expect(v.drops[0]!.revertCommitSubject).toContain(run.findings[1]!.target.file);
  });

  it('fails the clump — and exits non-zero — only when the remainder is empty or will not build', () => {
    const allBad = tmpJson({
      postDropBuild: 'green',
      clumps: {
        [clumpId]: memberIds.map((id) => ({ memberId: id, verified: false, reason: 'red' })),
      },
    });
    const empty = capture(() =>
      runClumpDispatch({ input: tmpJson(run), verdict: allBad, json: true })
    );
    expect(empty.code).toBe(CLUMP_FAILED_EXIT_CODE);
    expect(JSON.parse(empty.out).verdicts[0].reason).toMatch(/remainder is empty/);

    const oneBad = {
      clumps: {
        [clumpId]: memberIds.map((id, i) =>
          i === 1
            ? { memberId: id, verified: false, reason: 'red' }
            : { memberId: id, verified: true }
        ),
      },
    };
    const broke = capture(() =>
      runClumpDispatch({
        input: tmpJson(run),
        verdict: tmpJson({ ...oneBad, postDropBuild: 'red' }),
        json: true,
      })
    );
    expect(broke.code).toBe(CLUMP_FAILED_EXIT_CODE);
    expect(JSON.parse(broke.out).verdicts[0].reason).toMatch(/no longer builds/);

    // Positive control at the SAME scope: the identical outcomes with a green
    // post-drop build pass. Without it, the two failures above also hold for an
    // implementation that failed every clump that ever dropped anything.
    const green = capture(() =>
      runClumpDispatch({
        input: tmpJson(run),
        verdict: tmpJson({ ...oneBad, postDropBuild: 'green' }),
        json: true,
      })
    );
    expect(green.code).toBe(0);
    expect(JSON.parse(green.out).verdicts[0].status).toBe('verified-with-drops');
  });

  it('an unrun post-drop build is not a green one', () => {
    const verdict = tmpJson({
      clumps: {
        [clumpId]: memberIds.map((id, i) =>
          i === 1
            ? { memberId: id, verified: false, reason: 'red' }
            : { memberId: id, verified: true }
        ),
      },
    });
    const { code, out } = capture(() =>
      runClumpDispatch({ input: tmpJson(run), verdict, json: true })
    );
    expect(code).toBe(CLUMP_FAILED_EXIT_CODE);
    expect(JSON.parse(out).verdicts[0].reason).toMatch(/was not run/);
    // The flag overrides the file, so a lane that DID run the build can say so.
    const over = capture(() =>
      runClumpDispatch({ input: tmpJson(run), verdict, postDropBuild: 'green', json: true })
    );
    expect(over.code).toBe(0);
  });

  it('refuses a clump with no outcomes rather than calling it verified', () => {
    const { code, err } = capture(() =>
      runClumpDispatch({ input: tmpJson(run), verdict: tmpJson({ clumps: {} }), json: true })
    );
    expect(code).toBe(NO_CLUMPS_INPUT_EXIT_CODE);
    expect(err).toMatch(/no outcomes for clump/);
  });

  it('exits on a verdict that names a member the clump does not carry', () => {
    const verdict = tmpJson({
      clumps: {
        [clumpId]: [
          ...memberIds.map((id) => ({ memberId: id, verified: true })),
          { memberId: 'not-a-member', verified: false, reason: 'r' },
        ],
      },
    });
    const { code, err } = capture(() =>
      runClumpDispatch({ input: tmpJson(run), verdict, json: true })
    );
    expect(code).toBe(VERDICT_PARTITION_BREACH_EXIT_CODE);
    expect(err).toMatch(/does not carry/);
  });

  it('exits on a drop with no recorded reason', () => {
    const verdict = tmpJson({
      postDropBuild: 'green',
      clumps: {
        [clumpId]: memberIds.map((id, i) =>
          i === 0 ? { memberId: id, verified: false } : { memberId: id, verified: true }
        ),
      },
    });
    const { code, err } = capture(() =>
      runClumpDispatch({ input: tmpJson(run), verdict, json: true })
    );
    expect(code).toBe(VERDICT_PARTITION_BREACH_EXIT_CODE);
    expect(err).toMatch(/no reason/);
  });
});

describe('WIRED — the command reaches the core primitive from a real entry point', () => {
  it('is registered on `harness fleet` beside budget-check and clump-issues', async () => {
    const { createFleetCommand } = await import('./index');
    const names = createFleetCommand()
      .commands.map((c) => c.name())
      .sort();
    expect(names).toContain('clump-dispatch');
    expect(names).toContain('clump-issues');
    expect(names).toContain('budget-check');
  });

  it('plans over a clump formed by the SAME primitive the seams use', () => {
    // Not a hand-built fixture: the input is `formClumps` output, so a change to
    // formation that broke the lane unit would show up here.
    const items: ClumpableItem[] = ['p', 'q', 'r'].map((id) => ({
      id,
      scope: 'packages/core/src',
      kind: 'CODE',
      grade: { kind: 'axes', tier: 'foundational', impact: 'medium', confidence: 'high' },
      weight: 10,
      conflictKeys: [`${id}.ts`],
    }));
    const result = formClumps(items);
    const { code, out } = capture(() => runClumpDispatch({ input: tmpJson(result), json: true }));
    expect(code).toBe(0);
    expect(JSON.parse(out).plans[0].commits).toHaveLength(3);
  });
});
