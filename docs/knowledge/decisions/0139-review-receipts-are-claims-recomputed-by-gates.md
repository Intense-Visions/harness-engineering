---
number: 0139
title: 'The agent does the work and writes a typed receipt; a gate recomputes the receipt and treats its fields as claims'
date: 2026-11-20
status: accepted
tier: large
source: docs/changes/shift-left-pipeline-fidelity/proposal.md
---

## Context

> **Record of an operative decision.** This ADR documents spec decisions **D3, D4 and D7** of
> `docs/changes/shift-left-pipeline-fidelity/proposal.md`.

`harness-code-review` told the reviewing agent to run four review subagents in parallel.
Autopilot dispatched that skill to one subagent that had no agent-spawning tool, so the fan-out
collapsed into a single context and nothing noticed. The instruction existed and silently did
not happen. A prompt cannot enforce its own execution, and the harness cannot run the reviewers
itself without a model credential, which most adopters and every CI job without a secret lack.

The design question was how to make "the review ran as claimed" checkable on Claude Code,
Cursor, Codex and Gemini CLI, with no API key.

## Decision

### The agent works; code checks a receipt (D3)

A review writes a typed `ReviewReceipt` (`packages/types/src/pipeline-receipts.ts`): the moment,
the tier, the backend, the diff range as resolved SHAs, and one record per reviewer. Each
reviewer writes its own findings file naming the range it was given (`base`, `head`) and the diff files it examined.
The agent still does all the reviewing. A coded gate, `validateReviewReceipt` in
`packages/core/src/receipts/review-gate.ts`, decides whether the review counts.

### The gate recomputes; receipt fields are claims (D4)

The gate does not validate the receipt's shape and stop. Its caller
(`gateReviewReceipt` in `packages/cli/src/review-receipts/gate.ts`) recomputes what can be
recomputed and the gate compares:

- The moment comes from where the receipt is, not from the receipt: a directory named
  `phase-N` (N without leading zeros) is a phase review, `final-all` the final review, and a directory
  directly under `.harness/reviews/` (one level: the branch part of its name is sanitised to a
  single path segment) a standalone review. The session layout (`sessions/<slug>/reviews/<label>`)
  is tested first, so a session whose slug is `.harness` cannot make its final review read as a
  standalone one. The directory decides: `--moment` is read only for a
  directory that states none of these, and a flag that contradicts the directory fails
  (`MOMENT_MISMATCH`), because the flag comes from the same caller the gate is checking. A
  receipt that says otherwise fails (`MOMENT_MISMATCH`), and when nothing states a moment the
  gate fails (`MOMENT_UNKNOWN`); the check is never skipped. One function,
  `expectedReviewMoment` in `packages/core/src/receipts/layout.ts`, holds that precedence for
  the CLI and the MCP tool.
- Git runs in the repository that holds the receipt, and that must be the caller's: the gate
  resolves the repository top from the caller's directory and from the receipt's and fails
  `RECEIPT_OUTSIDE_REPO` when they differ, so a receipt in another worktree, or under a
  repository planted in the review directory, is not checked against that repository's history.
- HEAD comes from `git rev-parse HEAD`, not from the receipt. A receipt whose `diff.head` is not
  the current HEAD fails (`HEAD_MISMATCH`), so a commit made after a review makes it stale.
- The working tree comes from `git status --porcelain=v1 -z --untracked-files=no`: a receipt is
  bound to a commit, but reviewers and the mechanical checks read the working tree, so the gate,
  and the reviewer self-check when it is given a range, fail (`WORKTREE_DIRTY`) when tracked
  files differ from HEAD. Untracked files, such as the review directory, do not count.
- The base is checked with git: `diff.base` must be an ancestor of `diff.head`
  (`DIFF_BASE_NOT_ANCESTOR`), and for a final review it must be the merge base with the default
  branch, or with the remote-tracking branch its `diff.target` names (ADR 0140, Stacked branches;
  a full `refs/remotes/` ref, any other form an invalid receipt) (`FINAL_BASE_NOT_MERGE_BASE`), whatever `baseSource` the receipt declares. `baseSource:
"starting-commit"` is accepted only when the gate cannot resolve a default-branch merge base
  itself and `diff.base` is the session's starting commit (the `startingCommit` of the session's
  `autopilot-state.json`); when that commit is unknown the gate fails
  (`STARTING_COMMIT_UNKNOWN`). One core rule (`finalReviewBase`) and one git resolver decide the
  base for the gate and `harness review-tier --moment final`, which prints it, so a
  writer takes the base from the command and never from a recipe of its own.
- A phase receipt's base is recomputed too (`phaseReviewBase`): it must be the `diff.head` of
  the nearest earlier `phase-M` receipt of the same session, else the session's starting commit
  (`PHASE_BASE_MISMATCH`). A phase that wrote no receipt (it made no commit, or was never
  reviewed) is passed over, so its commits fall in the next phase's diff, and so is an earlier
  receipt that cannot be read, is not a valid phase receipt (the receipt schema, `moment: "phase"`),
  or whose `diff.head` is not an ancestor of the head (a rebase
  rewrote it): the base falls to the next earlier usable receipt, else the starting commit.
  Passing over only ever widens the review. When no base can be named (no usable earlier receipt
  and no starting commit, a starting commit that is not an ancestor of the head, or a phase
  receipt outside a session) the gate fails `PHASE_BASE_UNKNOWN`; after a rebase the session
  records its new starting commit, and the next phase review covers everything since it. A standalone review's base stays an ancestry check.
- The diff's file set comes from `git diff --name-only --no-renames -z <base>..<head>`, using
  the receipt's two SHAs. `-z` makes git print names unquoted, so a path with a non-ASCII
  character or a space compares equal to what a reviewer listed, and `--no-renames` puts a
  renamed file in the set under both paths. A range that cannot be computed, or that changes no
  files, fails.
- Each findings file is read from disk, from inside the receipt's directory only (real paths are
  resolved, so a symlink that leads out reads as absent), only when it is a regular file of at
  most 5 MB (a FIFO, a device or a directory is not opened), and parsed. The receipt is read
  under the same rule. A reviewer marked `ran` with no file, an invalid file, a file written
  under another reviewer's id, a file written at another head (`FINDINGS_HEAD_MISMATCH`) or for another base
  (`FINDINGS_BASE_MISMATCH`, so a review over a narrower range cannot pass by rewriting the
  receipt's `diff.base`), a file
  shared with another reviewer, an empty examined-files list, or an examined file outside the
  diff fails.
- A `full` receipt must list `compliance`, `bug`, `security` and `architecture` as required. A
  `light` receipt must list exactly one reviewer, `compliance-bug`, required, and no other. A reviewer listed
  twice fails, a reviewer id that is not a known reviewer fails (`UNKNOWN_REVIEWER`), and so
  does a required reviewer with `ran: false`.
- A blocking (`critical` or `important`) finding without `findingClass` and `escapedFrom` makes
  its file invalid.
- The receipt's `blocking` and `advisory` counts are recounted from the findings files, one per
  finding (`critical` and `important` are blocking, `suggestion` is advisory, nothing is merged
  by location). A receipt whose counts differ fails (`COUNTS_MISMATCH`), and a finding id used
  twice in a review fails (`DUPLICATE_FINDING_ID`).
- The round is counted from the `round-R/` archives beside the receipt (an ended round is
  archived with `harness check-review-receipt --archive-round <review-dir>`): the archives must
  be numbered `round-1` to `round-n` and `round` must be 1 + the archives (`ROUND_MISMATCH`),
  `priorRounds` must list exactly the archived rounds with the head of each archive's own
  receipt and a blocking count (`PRIOR_ROUNDS_MISMATCH`). The count is recounted from the
  findings files the archived receipt's ran reviewers name, each file once, inside the archive;
  when one of them is absent or not a findings file (or a ran reviewer names none), it is the
  archived receipt's own `blocking`, which is then only that receipt's claim. An archive with no
  readable `receipt.json` always fails. A round after the first whose
  `diff.head` is the head the round before it reviewed fails (`ROUND_SAME_HEAD`): only a fix
  commit starts a new round, so a review run again at the same head cannot re-roll its blocking
  findings away. The archive command refuses the routes an honest agent could take by mistake:
  a directory with no `receipt.json` (a round that wrote none is not a round), a path that is
  not a review directory of the layout, a HEAD still at the ended round's head, and archives
  numbered out of sequence, a `receipt.json` that is not a regular file, and a receipt naming a
  findings file that is not a regular file directly in the review directory (the archive moves
  only those). It moves the files through a staging directory, `receipt.json` last, and moves
  them back on an error, `receipt.json` first, so an error archives the round whole or not at
  all. An interruption (the process dies) leaves the staging directory `.round-R.partial`: the
  gate fails `ROUND_ARCHIVE_INTERRUPTED` while one exists (beside a missing or invalid receipt
  too). The next `--archive-round` completes the archive when the staging directory holds
  `receipt.json` and every findings file that receipt names: it is renamed to `round-R/` as that
  round, even when a newer attempt has since written files into the review directory (they stay
  there, and that attempt's receipt is rewritten with the new round). When the staging directory
  holds no `receipt.json`, it moves the staged files back and archives again. It refuses, moving
  nothing, a staging directory that is not the next archive's, one whose receipt is unreadable or
  names a findings file it does not hold, and, when moving back, a staged name the review
  directory also holds (the staged copy is the ended round's, the other a newer attempt's;
  which to keep is the human's call).

A missing receipt fails (`RECEIPT_MISSING`), and so does an unreadable or invalid one
(`RECEIPT_INVALID`); the MCP tool alone fails `GATE_ERROR` on a missing or invalid argument. A
`light` receipt below a computed `full`, and any `light` standalone receipt, fails
`TIER_DEMOTED` without `demotion: "no-subagent-tool"`. The final-review rules (`FINAL_NOT_FULL`,
`FINAL_NOT_COLD`, `FINAL_PRIOR_FINDINGS`, and the target rules `TARGET_UNRESOLVED` and
`TARGET_OWN_BRANCH`) are ADR 0140's. Autopilot may not leave REVIEW or FINAL_REVIEW without a
passing receipt, a human override, or a recorded empty-phase (or empty-final) skip: a range that
changes no files is not reviewed and writes no receipt, the skip is recorded in `decisions[]`,
and the next phase's base passes over it. Repositories in the SHA-256 object format are not
supported: every sha the gate accepts is a 40-character SHA-1 id. The gate reads no environment variable and calls no
model, so it passes or fails identically everywhere. It is exposed as `harness
check-review-receipt [path] [--moment phase|final|standalone]` (exit 0 on a pass, exit 1 on any
failure; `--moment` is for a directory that states no moment), whose
`--archive-round <review-dir>` mode archives an ended round before a fix round, whose
`--findings <file> --base <sha> --head <sha>` mode lets a reviewer check its own findings file with the gate's parser and
diff before it returns, and the `check_review_receipt` MCP tool,
which confines the receipt path to the project by real path. The failure codes are a literal
union in `packages/types/src/pipeline-receipts.ts`. It is not part of `check_phase_gate`, which
maps implementation files to spec files and has no session concept.

### A reviewer that cannot fan out says so (D7)

A session with no subagent-spawning tool runs the `light` tier and records `tier: "light"`. It
never records `full`. Honest capability is what makes the roster check meaningful.

### Threat model

The gate defends against honest mistakes and shortcuts by an agent following the skills: a
fan-out that silently collapsed, a reviewer that was never dispatched, a stale receipt, a
miscounted finding, a base taken from the wrong place. It does not defend against a session
that deliberately forges the files and refs it writes itself. The known forging routes are
limits, not defects: rewriting the clone's remote-tracking refs (`git update-ref`) to move the
final base, hand-editing an earlier receipt or the `startingCommit` of `autopilot-state.json` to
move a phase's or the final fallback base, fabricating findings files (one context writing every
reviewer's file), and planting a repository or a worktree for the gate to read. Where a cheap
check closes a route an honest agent could take by mistake (its own remote-tracking branch
named as the target, a findings file left from a review over another range, a receipt read in another
repository, an invalid earlier receipt), the gate makes it; it does not try to out-guess a
session that sets out to deceive it.

## Consequences

- A degraded review now fails a gate, or its receipt records `tier: light`; a `light` receipt
  below a computed `full` records the demotion (`demotion: "no-subagent-tool"`) and fails the
  gate (`TIER_DEMOTED`) unless it declares it. It cannot pass as `full` unless a session writes a
  false receipt on purpose.
- **What the gate cannot prove:** that reviewers ran in separate contexts. One context that
  deliberately writes four findings files passes. The provenance stamp makes the claim visible.
- These things a receipt says stay claims in Phase 1 because the gate does not recompute them:
  the set of conditional reviewers (only that every id is a known one), whether a phase was
  entitled to `light`, `coldContext` and `priorFindingsSupplied` (checked for consistency on a
  final receipt, never against what the briefs held), whether a reviewer read the files it lists
  in `examinedFiles`, `computedTier` and `tierReasons` (what the session says the tier command
  printed), and the `backend`. A `light` receipt whose recorded `computedTier` is `full`, and every `light` standalone
  receipt (a standalone review is always computed `full`, recorded or not), fails
  (`TIER_DEMOTED`) unless it carries `demotion: "no-subagent-tool"`, so the one sanctioned
  demotion is visible on the receipt. The moment, the base (a phase's against the previous
  receipt or the starting commit, a final's against the merge base), a clean tracked tree, the
  `light` roster, the reviewer ids, each findings file's head, `round` and `priorRounds` against
  the archives, and `blocking` and `advisory` are not among the claims: the gate checks each of
  them.
- **The starting commit and the earlier receipts are the session's own writing.** The final
  base's fallback and the first phase's base are the `startingCommit` of `autopilot-state.json`,
  and a later phase's base is an earlier receipt's `diff.head`; the session being checked writes
  all of them. A session that makes the default branch unresolvable chooses its final base, and
  one that rewrites an earlier receipt chooses the next phase's base. The gate proves the
  receipts agree with each other, not that the session's own records are honest. The `round-R/`
  archives are the session's own files too: the round check proves the receipt agrees with
  them, and cannot show a round that was never archived.
- **The final base is only as trustworthy as the clone's remote-tracking refs.** The gate takes
  the default branch's merge base from local refs (`refs/remotes/origin/HEAD`'s target, then
  `refs/remotes/origin/main`, then `refs/remotes/origin/master`, always by full name so a local
  branch named `origin/main` cannot shadow them) and does not fetch. Those refs are the session's to
  rewrite: `git update-ref refs/remotes/origin/main HEAD~1` moves what the gate treats as the
  merge base, and a one-commit final review then passes. Proving the base would need a network
  fetch, which a credential-free gate does not do.
- The session state the stamp reads (`phases[]`, `decisions[]` and `startingCommit` in
  `autopilot-state.json`) is the agent's own writing. One reader (`readSessionReviewState`)
  parses it with the state schema (`AutopilotSessionStateSchema`), field by field, once per
  render, and the stamp says what it could not read; that is all it can do.
- The stamp in a PR body is unauthenticated. The receipts are ignored by git, so CI has nothing
  to recompute a stamp from. A reader of a PR body accepts as a stamp only what the rendered page
  shows as one: a marker pair on lines of their own, each after an empty line, the heading on
  the line after the opening marker, none of it inside an HTML comment, a code block, a raw
  HTML block or a `<details>` element (open or not), and from it only the table's rows and its
  notes, in forms the renderer can write. A marker in a paragraph, a list item, a quote or a link
  reference definition is text. A body that shows two stamps is conflicting and neither is read,
  and a body over 262144 characters is not read.
- A failed gate can be overridden by the human. Autopilot records the override in `decisions[]`
  as a typed record (`kind: "gate"`, with the overridden `codes` and a `rationale`;
  `ReviewDecisionRecord`) and the stamp shows it, so an override is visible on the PR but is not
  prevented. A blocking finding the session set aside without a fix is recorded the same way
  (`kind: "dismissed"`), and only after a `judgment` pause: the session that ran the executors
  does not dismiss a blocking finding on its own word. In trusted mode that pause resolves
  without the human only when the blind-then-refute self-audit ran and agreed; when the session
  cannot spawn the auditor, or audit is off, the human answers. Every decision carries the round
  it was taken in and applies to that round only, and who took it (`decidedBy`: `human`,
  `audited` or `unaudited`), which the stamp prints beside it; a dismissal that is not the
  human's or audited is flagged in the Blocking cell, and a record written with no `decidedBy`
  reads as `decider unknown` with a note. `decidedBy` is a claim: the stamp shows who the session
  says decided. A decision the stamp cannot parse makes it say so, never `none` (on a row with
  no receipt too), and one that belongs to no review is named in a note. Only a decision's
  declared fields are read; anything else written beside it never reaches the stamp.
- The stamp does not repeat the receipt's word. `review-provenance render` runs the gate again
  for each review and prints the result, with two rules relaxed: the reviewed head may be an
  ancestor of HEAD, because a phase review is followed by later commits, and the working tree is
  not checked, because the tree the stamp is rendered in is not the tree any of those reviews
  read. A review state still gates with the head required to be HEAD and a clean tracked tree. A
  row's decisions are those of the round the gate counts from the `round-R/` archives, never the
  round the receipt states, and a Diff gap is the gate's own phase-base rule. For the final
  review the stamp also counts the commits made after the reviewed head, and prints the count
  whether the gate passed, failed or was overridden, and on a final row with no receipt too
  (from the head an empty-skip recorded, else the starting commit). A review directory without a
  readable receipt is a row that says so, and shows the decisions recorded for it; a review that
  was not run by a recorded `skipped` decision says `skipped (empty)` or `skipped (dropped)`.
  After a rebase, an amend or a squash the reviewed commits are gone from the branch and every
  row fails `HEAD_MISMATCH`; a new final review restores the final row only.
- MCP callers decide on the tool result's `pass` field alone. Through the shared
  response-compaction middleware `failures` is absent on a pass, a single object when there is
  exactly one failure, and an array when there are two or more, so its shape is not a contract
  for that surface.
- A failed mechanical phase (validate, typecheck, tests) is not a gate failure. No reviewer runs
  and no receipt is written, so there is nothing for the gate to recompute; autopilot treats it
  as a red check to fix and records no gate override for it.
- Later phases of the same spec are designed to copy the pattern: the claim-consistency sweep
  and the edge-case contract each write a receipt that a search-only gate recomputes. Neither is
  built yet.

## Alternatives rejected

- **Stronger prompt wording.** This is what failed.
- **The harness runs the reviewers.** Needs a credential or a runner on every client. It remains
  available as the opt-in `review.backend: "pipeline"` (D8).
- **Validate the receipt's schema only.** That is prompt-only enforcement with extra files: an
  agent that skipped the reviewers can still write a well-formed receipt.
