// packages/core/src/review/output/clump-comments.ts
//
// The REVIEW half of the creation seam (docs/changes/clumping/proposal.md,
// Phase 3): "a set of like findings becomes one work item rather than N",
// applied to the only thing review actually creates — inline GitHub comments.
//
// Review never files an issue. Its terminal act is a terminal report plus, when
// `--comment` is set, one inline comment per finding (`format-github.ts:64`).
// Twenty `suggestion`s scattered across one directory is the review-attention
// failure this control exists to stop, so THAT is what gets grouped.
//
// Two rules, and the asymmetry between them is the whole design:
//
//   - `critical` / `important` keep their own inline comment. A line anchor IS
//     the value of an inline comment: it puts the finding on the hunk the author
//     is already reading. Grouping a critical would trade that away.
//   - `suggestion` — the floor's natural target — groups into ONE comment per
//     (scope, kind), naming every member with its file and line.
//
// NOT dedup. `deduplicate-findings.ts:153` merges findings whose line ranges
// overlap within 3 lines — restatements of ONE finding. This groups DISTINCT
// findings that happen to be alike. Both run, in that order, and conflating them
// is the likeliest misreading of this module.

import { formClumps, resolveFloor, scopeOfPath, withOrdinals } from '../../fleet/clumping';
import type { Clump, ClumpPolicy, ClumpableItem } from '../../fleet/clumping';
import { SEVERITY_RANK } from '../constants';
import type { GitHubInlineComment, ReviewFinding } from '../types';
import { formatGitHubComment, sanitizeMarkdown } from './format-github';

/**
 * Severity dominates; trust score breaks ties within a severity band.
 *
 * The ×100 band is the same order-of-magnitude trick `derivePriority` uses in
 * cli: `trustScore` is 0-100, so without the band a 100%-trust suggestion would
 * outrank a 0%-trust critical. `weight` is ordering ONLY — the floor reads
 * STRUCTURE (`grade`), never this number.
 */
function weightOf(finding: ReviewFinding): number {
  return SEVERITY_RANK[finding.severity] * 100 + (finding.trustScore ?? 0);
}

/**
 * A review finding as the seam-neutral candidate core's clumping control reads.
 *
 * `ordinal` disambiguates a repeated `finding.id`. `ReviewFinding.id` is
 * documented as `domain-file-line` and is therefore NOT guaranteed unique after
 * fan-out: two agents in one domain can land on the same line of the same file,
 * and DEDUP only merges findings whose line ranges overlap within 3 lines.
 * `formClumps` THROWS on a duplicate id rather than collapsing two items, which
 * is right when the output is filed issues and wrong here — it would turn a
 * review that found something into a crash. The ordinal keeps the throw
 * unreachable from this seam without weakening it anywhere else, and matches
 * what the craft adapter does for the same reason.
 */
export function toClumpableFinding(finding: ReviewFinding, ordinal = 0): ClumpableItem {
  return {
    id: `${finding.id}#${ordinal}`,
    scope: scopeOfPath(finding.file),
    // The review domain IS "the kind of judgment the item demands" — a `bug`
    // suggestion and a `style` suggestion on the same directory are not one
    // conversation, and grouping them would produce exactly the vague
    // mega-comment this control is supposed to prevent.
    kind: finding.domain,
    grade: { kind: 'severity', severity: finding.severity },
    weight: weightOf(finding),
    conflictKeys: [finding.file],
    ref: finding,
  };
}

/** Recover the finding a clump member was built from. */
function findingOf(item: ClumpableItem): ReviewFinding {
  // `ref` is core's opaque passthrough; this module put a ReviewFinding there
  // two functions up, so the narrowing is local and total.
  return item.ref as ReviewFinding;
}

/** `[12, 12]` reads as a line, `[12, 18]` as a range. */
function lineLabel(finding: ReviewFinding): string {
  const [start, end] = finding.lineRange;
  return start === end ? `${start}` : `${start}-${end}`;
}

/**
 * Render one clump as a single inline comment.
 *
 * The body names EVERY member with its file and line. That is not decoration:
 * trading twenty precisely-anchored comments for one that says "several naming
 * suggestions in this directory" is strictly worse than leaving the twenty
 * alone, because the author can no longer act on any of them. The anchor goes
 * on the heaviest member (members are weight-desc, id-asc), so the comment
 * still lands on a line in the diff.
 */
export function formatClumpComment(
  clump: Clump,
  resolutions: ReadonlyMap<string, string>
): GitHubInlineComment {
  const head = findingOf(clump.members[0]!);
  const members = clump.members;
  const lines: string[] = [
    `**SUGGESTION × ${members.length}** [${clump.kind}] in \`${clump.scope}\``,
    '',
    `${members.length} suggestion-severity findings of the same kind over one scope, grouped into one comment ` +
      `so they cost one read rather than ${members.length}. Each is listed with its own location:`,
    '',
  ];
  for (const item of members) {
    // Keyed by the ITEM id, not the finding id: the item id carries the
    // occurrence ordinal that makes a repeated `finding.id` distinguishable, so
    // keying on the finding would silently hand two twins one resolution.
    const resolution = resolutions.get(item.id);
    const suffix = resolution === undefined ? '' : ` _(${resolution})_`;
    const member = findingOf(item);
    // `sanitizeMarkdown` for the same CWE-79 reason `formatGitHubComment` uses
    // it: a title is agent-authored text that lands in a rendered GitHub comment.
    lines.push(
      `- \`${member.file}:${lineLabel(member)}\` — ${sanitizeMarkdown(member.title)}${suffix}`
    );
  }
  lines.push('', `<!-- harness-clump: ${clump.id} -->`);
  return {
    path: head.file,
    line: head.lineRange[1],
    side: 'RIGHT',
    body: lines.join('\n'),
  };
}

/** What the grouping did, so a caller can report it instead of guessing. */
export interface ClumpedCommentReport {
  /** Findings handed in. */
  findings: number;
  /** Comments emitted. */
  comments: number;
  /** Findings that kept their own anchored comment (above the floor, or solo). */
  individual: number;
  /** Clumps emitted. */
  clumps: number;
  /** Findings folded into a clump. */
  grouped: number;
  /** Sub-floor findings whose conflict keys were all inside the touched set (D4). */
  act: number;
  /** Sub-floor findings that fell outside it, or ran with no touched set. */
  file: number;
  /** Groups past `maxClumps`, degraded back to individual comments rather than dropped. */
  overCapFindings: number;
}

export interface ClumpedCommentResult {
  comments: GitHubInlineComment[];
  report: ClumpedCommentReport;
}

export interface FormatClumpedCommentsOptions {
  /**
   * The diff's changed files. This is the review seam's touched set, and it is
   * what makes D4's `'act'` resolution REACHABLE here — a craft sweep has no
   * equivalent and therefore degrades every sub-floor item to `'file'`.
   */
  touched?: readonly string[];
  policy?: Partial<ClumpPolicy>;
}

/**
 * Format the deduped findings as inline comments, grouping the sub-floor ones.
 *
 * LAW (pinned by `clump-comments.test.ts`): every finding handed in is
 * represented in exactly one emitted comment. A review comment that vanishes
 * because a cap was hit looks identical in output to a review that found
 * nothing, and that is the silent drop this whole control exists to prevent.
 */
export function formatClumpedComments(
  findings: readonly ReviewFinding[],
  options: FormatClumpedCommentsOptions = {}
): ClumpedCommentResult {
  const { touched, policy } = options;
  const ctx = touched === undefined ? {} : { touched };

  // 1. The floor decides the ROUTE, per finding: above it, the finding keeps its
  //    own anchor; below it, the finding is a grouping candidate.
  //
  //    The findings are numbered ONCE, here, and the same numbering is reused by
  //    the complement loop below. Both loops used to number independently — two
  //    `new Map()`s that had to agree — and a disagreement would have emitted a
  //    second comment for a finding already inside a clump. Sharing the array
  //    makes the agreement structural instead of a convention.
  const numbered = withOrdinals(findings, (finding) => finding.id);
  const candidates: ClumpableItem[] = [];
  const resolutions = new Map<string, string>();
  let act = 0;
  let file = 0;
  for (const { item: finding, ordinal } of numbered) {
    const item = toClumpableFinding(finding, ordinal);
    const verdict = resolveFloor(item, ctx, policy);
    if (!verdict.below) continue;
    if (verdict.resolution === 'act') act += 1;
    else file += 1;
    resolutions.set(item.id, `${verdict.resolution}: ${verdict.reason}`);
    candidates.push(item);
  }

  // 2. Formation over the sub-floor set ONLY.
  //
  //    `floorEnabled: false` is deliberate and is the policy's own documented
  //    escape hatch, not a workaround. The floor already ran one loop up and is
  //    what SELECTED this set; letting `formClumps` run it a second time would
  //    floor every one of these items again, return zero clumps, and leave the
  //    grouping silently doing nothing — wired, green and inert. The route
  //    decision happens once, above, where the resolution is also recorded.
  const result = formClumps(candidates, { ...policy, floorEnabled: false }, ctx);

  // 3. Emit under ONE rule: a finding is either folded into a clump or it keeps
  //    its own anchored comment.
  //
  //    Written as a complement over the input rather than as a loop per shed
  //    bucket (`solo`, `overCap`, `ungraded`, `floored`). The per-bucket form
  //    read as more careful and was strictly worse: two of those buckets are
  //    unreachable from this seam, so they were branches no test could ever
  //    exercise, and adding a SIXTH bucket upstream would have dropped its
  //    findings on the floor with every existing test still green. Here, a new
  //    bucket is covered the moment it exists. This is what makes "every
  //    finding appears in exactly one comment" a structural property rather
  //    than an enumeration that has to be kept in sync.
  const clumpedIds = new Set(result.clumps.flatMap((c) => c.members.map((m) => m.id)));
  const comments: GitHubInlineComment[] = [];
  for (const clump of result.clumps) comments.push(formatClumpComment(clump, resolutions));
  for (const { item: finding, ordinal } of numbered) {
    if (!clumpedIds.has(`${finding.id}#${ordinal}`)) comments.push(formatGitHubComment(finding));
  }

  return {
    comments,
    report: {
      findings: findings.length,
      comments: comments.length,
      individual: findings.length - result.counts.clumped,
      clumps: result.clumps.length,
      grouped: result.counts.clumped,
      act,
      file,
      overCapFindings: result.overCap.length,
    },
  };
}
