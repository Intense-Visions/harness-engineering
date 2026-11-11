// packages/core/src/fleet/clumping/dispatch.ts
//
// The EXECUTION seam (docs/changes/clumping/proposal.md, Phase 5): a `Clump` is
// the lane unit, the one-PR-per-clump contract is a value rather than a
// paragraph, and D10's drop semantics are a function rather than an instruction.
//
// WHY THIS IS CODE AND NOT FOUR SKILL.md PARAGRAPHS. `roadmap-fleet`,
// `bug-fleet`, `cleanup-fleet` and `craft-fleet` are SKILL.md files; nothing in
// this repository schedules their lanes. Their DISPATCH and VERIFY contracts are
// prose an agent is trusted to apply. The family already has the answer to that
// — `harness fleet budget-check` exists precisely so the spend-envelope consult
// is a callable rather than a sentence, and `harness fleet clump-issues` does
// the same for the intake axis. These two functions are the callable half of the
// execution contract; `packages/cli/src/commands/fleet/clump-dispatch.ts` is the
// surface a lane runs, and `agents/skills/tests/` pins the prose that points at
// it.
//
// Pure — no fs, no network, no clock, no git. It plans and it settles; running
// the plan belongs to the caller.

/** How a clump member's own commit is described, so the trail stays granular. */
export interface ClumpCommit {
  /** The member this commit belongs to. One commit per member, no more, no fewer. */
  memberId: string;
  /** Conventional-commit subject for the member's own change. */
  subject: string;
  /** Where the member came from, carried into the PR body. */
  citation: string;
}

/**
 * The one-PR-per-clump contract, as a value.
 *
 * One branch, one PR, one commit per member. Title names the clump; body lists
 * each member with its citation. The three properties this buys a reviewer —
 * one judgment mode, one coherent scope, a granular trail — are each a field
 * here rather than an assurance in a SKILL.md.
 */
export interface ClumpPRPlan {
  clumpId: string;
  scope: string;
  kind: string;
  /** One branch for the whole clump. */
  branch: string;
  /** `<type>(<scope>): <kind> across <scope> (N items)`. */
  title: string;
  /** Markdown body: one line per member, each with its citation. */
  body: string;
  /** EXACTLY one entry per member, in member order (success criterion 10). */
  commits: readonly ClumpCommit[];
}

/**
 * What `planClumpPR` actually reads off a member.
 *
 * Declared rather than taking a whole `ClumpableItem`, because the thing a lane
 * hands in is usually a SERIALIZED clump set (`ClumpView`), whose members carry
 * an id and nothing else. Typing the parameter as the full item would have been
 * a claim the input cannot meet — and it would have been enforced nowhere,
 * since the lane's input arrives as JSON through a cast.
 */
export interface PlannableMember {
  id: string;
  /** The native record, when the caller still has one. Absent on the wire. */
  ref?: unknown;
}

/** What `planClumpPR` actually reads off a clump. Both `Clump` and `ClumpUnitView` satisfy it. */
export interface PlannableClump {
  id: string;
  scope: string;
  kind: string;
  members: readonly PlannableMember[];
}

/** What a caller knows about a clump that core cannot derive. */
export interface ClumpPlanOptions {
  /** Conventional-commit type for the title. Default `fix`. */
  commitType?: string;
  /** Branch prefix. Default `clump`. */
  branchPrefix?: string;
  /**
   * How a member is described in its own commit subject and PR body line.
   *
   * Default: the member id. Seams that carry a richer native record on `ref`
   * (an issue number, a rubric cite) override this. It is a function of the
   * ITEM, never of the index, so a reordered input cannot change what a commit
   * says about a member.
   */
  describe?: (item: PlannableMember) => { subject: string; citation: string };
}

/** A character class git refs tolerate; everything else collapses to `-`. */
function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned === '' ? 'unscoped' : cleaned;
}

/**
 * Plan the one PR a clump becomes.
 *
 * The invariant worth stating is the one a reviewer depends on and a bundler is
 * tempted to break: `plan.commits.length === clump.members.length`, in member
 * order. Commit-per-member is not cosmetic bookkeeping — it is what makes D10's
 * drop a one-commit revert instead of a re-run of the whole lane, which is in
 * turn the only thing that keeps bundling N items from making one bad item N
 * times as expensive as it is today.
 *
 * A clump with no members is rejected rather than planned. An empty PR is the
 * fabricated-clump failure the formation layer already refuses to produce, and
 * accepting one here would reintroduce it one layer down.
 */
export function planClumpPR(clump: PlannableClump, options: ClumpPlanOptions = {}): ClumpPRPlan {
  if (clump.members.length === 0) {
    throw new Error(
      `planClumpPR: clump ${clump.id} has no members; a clump is a work unit, and an empty PR is ceremony with no payload`
    );
  }
  const commitType = options.commitType ?? 'fix';
  const branchPrefix = options.branchPrefix ?? 'clump';
  const describe =
    options.describe ?? ((item: PlannableMember) => ({ subject: item.id, citation: item.id }));

  const commits: ClumpCommit[] = clump.members.map((member) => {
    const { subject, citation } = describe(member);
    return { memberId: member.id, subject: `${commitType}(${clump.scope}): ${subject}`, citation };
  });

  const n = clump.members.length;
  const title = `${commitType}(${clump.scope}): ${clump.kind} across ${clump.scope} (${n} item${n === 1 ? '' : 's'})`;
  const body = [
    `${n} like item${n === 1 ? '' : 's'} of kind \`${clump.kind}\` over \`${clump.scope}\`, one commit each.`,
    '',
    ...commits.map((commit) => `- \`${commit.memberId}\` — ${commit.citation}`),
    '',
    `Clump \`${clump.id}\`. A member that fails verification is dropped by reverting its own commit; the rest proceed.`,
  ].join('\n');

  return {
    clumpId: clump.id,
    scope: clump.scope,
    kind: clump.kind,
    branch: `${branchPrefix}/${slug(clump.kind)}-${slug(clump.scope)}-${clump.id}`,
    title,
    body,
    commits,
  };
}

/** One member's verification outcome, as the lane observed it. */
export interface ClumpMemberOutcome {
  memberId: string;
  /** `false` ⇒ the member's own commit is reverted and the clump proceeds. */
  verified: boolean;
  /** Required when `verified` is false: a drop with no recorded reason is a silent drop. */
  reason?: string;
}

/** A dropped member, with what to revert and why it went. */
export interface ClumpDrop {
  memberId: string;
  /** The commit subject to revert — the member's own, never the clump's. */
  revertCommitSubject: string;
  reason: string;
}

/**
 * The post-drop build signal.
 *
 * `unknown` is a first-class value and NOT a synonym for green. A clump that
 * dropped a member has a tree nothing has re-checked; reporting it verified on
 * no evidence is the same failure shape as accepting a subagent's self-report.
 */
export type PostDropBuild = 'green' | 'red' | 'unknown';

/** What VERIFY settles on. ONE verdict per clump — never one per member. */
export interface ClumpVerdict {
  clumpId: string;
  /** `verified`: nothing dropped. `verified-with-drops`: some dropped, remainder green. `failed`: no usable remainder. */
  status: 'verified' | 'verified-with-drops' | 'failed';
  /** Members that survive, in plan order. */
  remainder: readonly string[];
  /** Members dropped, each with its own revert and reason. */
  drops: readonly ClumpDrop[];
  /** Set only on `failed`. */
  reason?: string;
}

export interface ClumpVerdictOptions {
  /**
   * Whether the tree still builds AFTER the drops were reverted. Consulted only
   * when something was dropped: with no drops the lane's own verification already
   * covered the tree it ran against.
   */
  postDropBuild?: PostDropBuild;
}

/**
 * Settle ONE verdict for a clump (D10, success criterion 14).
 *
 * A member that fails verification is dropped by reverting ITS OWN commit and
 * the clump proceeds with the rest. The whole clump fails only when the
 * post-drop remainder is empty, or when it no longer builds.
 *
 * Three things are rejected rather than smoothed over, each because the smooth
 * version is indistinguishable in output from the thing it hides:
 *
 *   - An outcome naming a member the plan does not carry. A verdict for a member
 *     that is not in the PR is a verdict about something else; accepting it
 *     would let a drop be recorded against a commit that will never be reverted.
 *   - A member with no outcome at all. The convenient default is "assume it
 *     passed", which turns an unrun check into a green one — the exact silent
 *     pass this family keeps rediscovering.
 *   - A failure with no reason. D10 says the drop is RECORDED with its reason;
 *     a reasonless drop is a silent delete wearing a verdict.
 *
 * `postDropBuild: 'unknown'` after a drop fails the clump. That is deliberately
 * conservative and matches craft-fleet's own standard: a proof the phase demands
 * and that could not be produced is a rejection, not a graceful skip.
 */
export function settleClumpVerdict(
  plan: ClumpPRPlan,
  outcomes: readonly ClumpMemberOutcome[],
  options: ClumpVerdictOptions = {}
): ClumpVerdict {
  const planned = new Map(plan.commits.map((commit) => [commit.memberId, commit]));

  const seen = new Set<string>();
  for (const outcome of outcomes) {
    if (!planned.has(outcome.memberId)) {
      throw new Error(
        `settleClumpVerdict: outcome names '${outcome.memberId}', which clump ${plan.clumpId} does not carry; a verdict for a member outside the PR cannot be reverted`
      );
    }
    if (seen.has(outcome.memberId)) {
      throw new Error(
        `settleClumpVerdict: two outcomes for member '${outcome.memberId}' in clump ${plan.clumpId}; one verdict per member, and the later one would silently win`
      );
    }
    seen.add(outcome.memberId);
    if (!outcome.verified && (outcome.reason ?? '').trim() === '') {
      throw new Error(
        `settleClumpVerdict: member '${outcome.memberId}' failed with no reason; D10 requires the drop be recorded WITH its reason`
      );
    }
  }
  const missing = plan.commits.filter((commit) => !seen.has(commit.memberId));
  if (missing.length > 0) {
    throw new Error(
      `settleClumpVerdict: no outcome for ${missing.map((m) => `'${m.memberId}'`).join(', ')} in clump ${plan.clumpId}; an unverified member is not a verified one`
    );
  }

  const verdictByMember = new Map(outcomes.map((outcome) => [outcome.memberId, outcome]));
  const remainder: string[] = [];
  const drops: ClumpDrop[] = [];
  // Iterate the PLAN, not the outcomes: remainder and drop order are then a
  // function of the PR's commit order, so two lanes reporting the same outcomes
  // in different orders settle identically.
  for (const commit of plan.commits) {
    const outcome = verdictByMember.get(commit.memberId)!;
    if (outcome.verified) {
      remainder.push(commit.memberId);
    } else {
      drops.push({
        memberId: commit.memberId,
        revertCommitSubject: commit.subject,
        reason: outcome.reason!,
      });
    }
  }

  if (drops.length === 0) {
    return { clumpId: plan.clumpId, status: 'verified', remainder, drops };
  }
  if (remainder.length === 0) {
    return {
      clumpId: plan.clumpId,
      status: 'failed',
      remainder,
      drops,
      reason: `every member of clump ${plan.clumpId} was dropped; the post-drop remainder is empty`,
    };
  }
  const build = options.postDropBuild ?? 'unknown';
  if (build !== 'green') {
    return {
      clumpId: plan.clumpId,
      status: 'failed',
      remainder,
      drops,
      reason:
        build === 'red'
          ? `clump ${plan.clumpId} no longer builds after ${drops.length} revert(s)`
          : `clump ${plan.clumpId} dropped ${drops.length} member(s) and the post-drop build was not run; an unrun build is not a green one`,
    };
  }
  return { clumpId: plan.clumpId, status: 'verified-with-drops', remainder, drops };
}

/**
 * The D10 partition law, as a checkable value.
 *
 * Every planned member appears exactly once across `remainder ∪ drops`. The
 * sibling of formation's conservation law and for the same reason: a drop that
 * loses a member from both sides is the silent delete this whole control exists
 * to prevent, and from the outside it is indistinguishable from a clean verdict.
 */
export function checkVerdictPartition(
  plan: ClumpPRPlan,
  verdict: ClumpVerdict
): { holds: boolean; planned: number; settled: number } {
  const settledIds = [...verdict.remainder, ...verdict.drops.map((drop) => drop.memberId)];
  const unique = new Set(settledIds);
  const planned = plan.commits.map((commit) => commit.memberId);
  const holds =
    settledIds.length === unique.size &&
    unique.size === planned.length &&
    planned.every((id) => unique.has(id));
  return { holds, planned: planned.length, settled: settledIds.length };
}
