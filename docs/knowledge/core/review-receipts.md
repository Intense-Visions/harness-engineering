---
type: business_concept
domain: core
tags: [review, receipts, review-tier, stage-attribution, gate, shift-left]
---

# Review Receipts

A review receipt is a typed record of what one review did. A coded gate recomputes it, so a
review that ran fewer reviewers than it claims fails instead of passing quietly. Contract types
live in `packages/types/src/pipeline-receipts.ts`; validators and the gate live in
`packages/core/src/receipts/`. Decisions: ADR
[0139](../decisions/0139-review-receipts-are-claims-recomputed-by-gates.md) and ADR
[0140](../decisions/0140-the-final-review-is-cold-and-full.md).

## Concepts

**Review receipt.** `receipt.json`: `moment` (`phase`, `final`, `standalone`), `tier`,
`backend`, the diff range as resolved 40-character SHAs (with `baseSource` when the base fell
back to the starting commit), `coldContext`, `priorFindingsSupplied`, one record per reviewer,
blocking and advisory counts. Beside it sits one findings file per reviewer, `<reviewerId>.json`, holding the commit that reviewer read
(`head`, required, equal to the receipt's `diff.head`), the diff files it examined and its
findings. Neither file is read unless it is a regular file of at most 5 MB.

**Review tier.** `light` is one reviewer (`compliance-bug`, and the gate enforces the id) after
the mechanical checks. `full` is `compliance`, `bug`, `security` and `architecture`, plus each
conditional reviewer the depth calibration activates (`adversarial`, `typescript-strict`,
`frontend-races`), one dispatch per reviewer. `selectReviewTier`
(`packages/core/src/review/tier-selector.ts`) makes a phase `full` when its diff, a changed path
or any commit message of its range matches a risk keyword (the diff is read as text whatever git
attributes say; of the trailers git identifies in a message, only identity trailers are left
out, by the rule `IDENTITY_TRAILER` in that file, which the `harness-code-review` skill states,
compared by the key and value git parses rather than by line text;
every other trailer is matched), the diff touches a package entry point (a package's `src/index.ts`, or a file named by
a `package.json` `main`, `bin` or `exports` field; a renamed one counts under its old path), the
phase's assessed complexity is `high`, or the rigor is `thorough`. It returns `full` for every
final and standalone review. `harness review-tier` is its caller: the command runs git from the
repository top level and reads `review.backend` from the `harness.config.json` there, so it
answers the same from any directory; it gathers the diff, the range's commit messages and the
package entry points, applies the selector and prints the tier with its reasons. For a final
review it also prints the base the receipt gate will demand, and for a standalone review the
advised base (the gate checks a standalone base only for ancestry), from the gate's own
resolver (`--session` supplies the starting commit; `--target <ref>` names the remote-tracking
branch a stacked branch merges into, and the final receipt records the full ref it prints as
`diff.target`, which the gate reads). A standalone review takes its base from
the range it reviews; the command prints the default-branch merge base as advice and, when none
resolves, says to name the range (`no-default-branch`), never to pass `--session`, which applies
to the final moment only. The skills run the command and use its
output, the final base included. A diff too large for git's output buffer is `full`
(`diff-too-large`). It exits 1 when it cannot compute a tier (an unresolvable range, an empty
diff, no repository) and never falls back to `light`. A session
that cannot dispatch subagents runs `light` and says so, whatever the command printed: the
receipt records the computed tier and reasons (`computedTier`, `tierReasons`), and a `light`
receipt whose computed tier is `full` fails `TIER_DEMOTED` unless it carries
`demotion: "no-subagent-tool"`, which autopilot records as a decision.

This "review tier" is separate from three other tiers in the review code: the depth tier
(Quick, Standard, Deep) that activates conditional reviewers, the model tier (`fast`,
`standard`, `strong`), and the heuristic and LLM tiers of `harness review-ci`
([Tiered Review Degradation](./tiered-review-degradation.md)).

**Receipt gate.** `validateReviewReceipt` fails on a receipt whose `moment` is not the one its
directory states (`phase-N` with no leading zeros, `final-all`, or a directory directly under
`.harness/reviews/`, the session layout tested first; the directory decides, and `--moment` is read only for a directory that states none, so a flag that
contradicts the directory fails `MOMENT_MISMATCH`), a required reviewer that did not run, a
`full` roster missing a core reviewer, a `light` roster that is not exactly `compliance-bug`, a
reviewer listed twice, a reviewer id that is not a known reviewer (`UNKNOWN_REVIEWER`), a
findings file that is absent, invalid, shared, written under another reviewer's id, written at another head, empty of examined files or outside the recomputed diff,
a finding id used twice in the review, `blocking` or `advisory` counts that differ from what the
findings files hold (`COUNTS_MISMATCH`), a head that is not the current HEAD (git runs at the
top of the worktree that holds the receipt, whatever the caller's directory), tracked files
that differ from HEAD (`WORKTREE_DIRTY`, from `git status --porcelain=v1 -z --untracked-files=no`;
untracked files do not count, and the self-check applies it when given a range), a base that is not
an ancestor of the head, a `phase` receipt whose base is not the `diff.head` of the nearest
earlier usable `phase-M` receipt of its session, or the session's starting commit when there is
none (`PHASE_BASE_MISMATCH`; an earlier receipt that cannot be read, or whose `diff.head` a
rebase left off the branch, is passed over, which only widens the review; `PHASE_BASE_UNKNOWN`
when no base can be named, including a starting commit that is not an ancestor of the head,
which after a rebase the session replaces with its new starting commit, and a phase receipt
outside a session; `phaseReviewBase`), a diff range that cannot be computed or changes nothing, and a `final`
receipt that is not full, cold, free of prior findings and based at the merge base with the
default branch (a declared `baseSource: "starting-commit"` is accepted only when no
default-branch merge base resolves and the base is the session's starting commit, and an unknown
starting commit fails `STARTING_COMMIT_UNKNOWN`; when a merge base resolves, the base must be that
commit). One rule (`finalReviewBase`) and one resolver serve the gate and
`harness review-tier`. A missing
receipt fails, and so does a receipt or findings file that is not a regular file of at most 5
MB. The codes are `REVIEW_GATE_FAILURE_CODES`, a literal union defined in
`packages/types/src/pipeline-receipts.ts`. Surfaces: `harness check-review-receipt [path]
[--moment phase|final|standalone]` (the path is `receipt.json` or its directory, and a path that
does not exist and does not end in `.json` is read as a directory; exit 0 on a pass, exit 1 on a
failure), with one more mode:
`--findings <file> [--base <sha> --head <sha>]` checks one reviewer findings file with the gate's parser, reviewer-id rule and diff (a reviewer's
self-check, which needs only the CLI; a flag the chosen mode does not read, `--base`/`--head` with a receipt path or `--moment` with `--findings`, exits 1), and the `check_review_receipt` MCP tool (`path` is the project root,
`receipt` the review directory, which must be inside it by real path, so a symlink that leads
out is refused; a `moment` outside the three values returns `GATE_ERROR`). It needs no model
credential.

**Escaped-from stage.** Each blocking (`critical` or `important`) finding names the earliest
stage that should have caught it: `spec`, `plan`, `execution`, `verification`, or `none`. With
`findingClass` (`stale-claim`, `edge-case`, `weak-test`, `collateral`, `design`, `other`) it is
required on every blocking finding: a blocking finding without both makes its findings file
invalid. The rubric is
`agents/skills/claude-code/harness-code-review/references/attribution-rubric.md`.

## Relationships

- A finding class maps to the earliest stage that could catch it. The mapping is a reviewer's
  estimate and is read as a ranking of stages, not as exact counts.
- `review.backend` in the repository top's `harness.config.json` selects the agent backend (default) or the coded
  pipeline for the `full` tier. When the pipeline is configured and no runner resolves, the
  review runs on the agent backend and the receipt records `backend: "agent"`
  (`resolveReviewBackend`, which also holds the rule that a `light` review always runs on the
  agent backend). `harness review-tier` reads the key and prints the resolved backend, marked
  `DEGRADED` on that fallback; whether a runner is available is known only to the calling
  session, which says so with `--pipeline-runner`. The gate applies the same rules to both
  backends.

## Layout

| Review     | Directory                                     |
| ---------- | --------------------------------------------- |
| Phase      | `.harness/sessions/<slug>/reviews/phase-N/`   |
| Final      | `.harness/sessions/<slug>/reviews/final-all/` |
| Standalone | `.harness/reviews/<branch>-<head sha>/`       |

All three are ignored by git: they are machine-local. `N` in `phase-N` is the phase's 0-based
position. A standalone directory is one level directly under `.harness/reviews/`: in its name each
run of characters outside `[A-Za-z0-9._-]` in the branch is replaced by `-` and any leading or
trailing `-` or `.` is removed, so the branch part is a single path segment. A directory inside a
session (`sessions/<slug>/reviews/<label>`) is read by the session rule first. Review hooks write `hook-<name>.json` files into the same directory; they are not
reviewer findings files and are not in the receipt's counts.

## Limits

- Threat model (ADR 0139): the gate defends against honest mistakes and shortcuts by an agent
  following the skills, not against a session that deliberately forges its own files and refs
  (rewriting remote-tracking refs, hand-editing earlier receipts or the starting commit,
  fabricating findings files).
- The gate proves that each required reviewer produced its own findings file over files of the
  diff at the current commit. It does not prove the reviewers ran in separate contexts: one
  context that writes four findings files passes.
- The gate checks, and does not take on trust: the moment (against the review directory, which
  no flag overrides), the head, a clean tracked tree, each findings file's head, the base's ancestry, a phase's
  base (the previous usable receipt's head, else the starting commit), the merge base
  of a final review (whatever `baseSource` the receipt declares, while a merge base resolves;
  the session's starting commit when none does), the `light` roster, the reviewer ids, finding-id uniqueness, and the `blocking`
  and `advisory` counts.
- These stay claims: that reviewers ran in separate contexts, the conditional-reviewer set
  (beyond every id being known), a phase's entitlement to `light`, `coldContext` and
  `priorFindingsSupplied`, whether a reviewer read the files it lists in `examinedFiles`,
  `computedTier` and `tierReasons` (what the session says the tier command printed), and the
  `backend`. The merge base is
  taken against the default branch ref as the clone holds it, or against the receipt's
  `diff.target`, a remote-tracking branch the session chose (a sha, a HEAD-relative name, a local
  branch or a tag fails `TARGET_UNRESOLVED`, and the branch's own upstream or a remote-tracking
  branch of its name fails `TARGET_OWN_BRANCH`); the gate does not fetch, and the
  session can rewrite those local remote-tracking refs (`git update-ref`) and so move what the
  gate treats as the merge base: the final base is only as trustworthy as those refs. The
  starting commit (the final base's fallback and the first phase's base) and the earlier
  receipts (a later phase's base) are the session's own files, so the gate proves the receipts
  agree with them, not that they are honest.
- Callers of the MCP tool decide on its `pass` field alone. Through the shared
  response-compaction middleware `failures` is absent on a pass, a single object when there is
  exactly one failure, and an array when there are two or more. The CLI's `--json` output always
  carries an array.
- The receipt and the gate count findings by one rule
  (`tallyReviewFindings`): every finding in every reviewer findings file counts once, as
  written; `critical` and `important` are blocking and `suggestion` is advisory. Nothing is
  merged by file or line. The gate fails a receipt whose `blocking` or `advisory` differs, and
  requires finding ids to be unique across the review. A finding the review's own validation
  step later discarded stays in its reviewer's file, so it is still counted.
- The gate's text output prints every string that a receipt, a findings file or a path can
  carry through one helper, `escapeTerminalText`: control characters, DEL, the C1 controls, bidi
  controls and invisible format characters are printed as `\u{XXXX}`, so a receipt cannot
  repaint a `FAIL` line as `PASS`. `--json` prints the strings JSON-encoded, unchanged otherwise.
- Hook findings (canary detectors, craft domains) are outside the receipt and its counts.
- The reviewer self-check (`harness check-review-receipt --findings`) sees one file: ids
  repeated across two reviewers' files are found only by the gate.
- FINAL_REVIEW reviews from the merge base while OUTCOME_EVAL still judges
  `startingCommit..HEAD`; the two ranges differ when the branch held commits before the session
  started.

## Source

| File                                                                                  | Holds                                                                                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [pipeline-receipts.ts](../../../packages/types/src/pipeline-receipts.ts)              | Contract types: receipt, reviewer record, the failure codes                                                                                 |
| [schema.ts](../../../packages/core/src/receipts/schema.ts)                            | Zod validators for both files; `tallyReviewFindings`, the counting rule                                                                     |
| [review-gate.ts](../../../packages/core/src/receipts/review-gate.ts)                  | `validateReviewReceipt`, `finalReviewBase`, `checkReviewerFindingsText` (the self-check)                                                    |
| [load.ts](../../../packages/core/src/receipts/load.ts)                                | Reads a receipt; the findings reader confined to the review directory                                                                       |
| [review-paths.ts](../../../packages/core/src/shared/review-paths.ts)                  | `normalizeReviewPath`, `pathEscapes`: the path rules the gate and the tier selector share (a shared leaf)                                   |
| [layout.ts](../../../packages/core/src/receipts/layout.ts)                            | Review directory names, `expectedReviewMoment` (the one precedence rule)                                                                    |
| [backend.ts](../../../packages/core/src/receipts/backend.ts)                          | `resolveReviewBackend`                                                                                                                      |
| [unsafe-text.ts](../../../packages/core/src/shared/unsafe-text.ts)                    | The one unsafe-character rule (exported from receipts as `escapeTerminalText`), shared with the auto-decision log; ZWNJ and ZWJ are allowed |
| [tier-selector.ts](../../../packages/core/src/review/tier-selector.ts)                | `selectReviewTier`                                                                                                                          |
| [gate.ts](../../../packages/cli/src/review-receipts/gate.ts)                          | `gateReviewReceipt`: recomputes HEAD, the diff and the base, runs gate                                                                      |
| [io.ts](../../../packages/cli/src/review-receipts/io.ts)                              | The git seam; `resolveRepoRoots`; `resolveFinalReviewBase`                                                                                  |
| [check-review-receipt.ts](../../../packages/cli/src/commands/check-review-receipt.ts) | `harness check-review-receipt`: the command over that gate                                                                                  |
| [review-tier.ts](../../../packages/cli/src/commands/review-tier.ts)                   | `harness review-tier`: the tier, its reasons, the backend and the final or standalone base                                                  |
| [review-receipt.ts](../../../packages/cli/src/mcp/tools/review-receipt.ts)            | The `check_review_receipt` MCP tool                                                                                                         |
