---
type: business_concept
domain: core
tags: [review, receipts, review-tier, stage-attribution, gate, provenance-stamp, shift-left]
---

# Review Receipts

A review receipt is a typed record of what one review did. A coded gate recomputes it, so a
review that ran fewer reviewers than it claims fails instead of passing quietly. Contract types
live in `packages/types/src/pipeline-receipts.ts`; validators, the gate and the provenance
stamp live in `packages/core/src/receipts/`. The reading guide is
[Reading Review Provenance](../../guides/review-provenance.md). Decisions: ADR
[0139](../decisions/0139-review-receipts-are-claims-recomputed-by-gates.md) and ADR
[0140](../decisions/0140-the-final-review-is-cold-and-full.md).

## Concepts

**Review receipt.** `receipt.json`: `moment` (`phase`, `final`, `standalone`), `tier`,
`backend`, the diff range as resolved 40-character SHAs (with `baseSource` when the base fell
back to the starting commit), `coldContext`, `priorFindingsSupplied`, one record per reviewer,
blocking and advisory counts, and, after a fix round, `round` and `priorRounds` (1 + the
`round-R/` archives beside it, and one entry per archive). Beside it sits one findings file per reviewer, `<reviewerId>.json`, holding the range it was given
(`base` and `head`, both required, equal to the receipt's `diff.base` and `diff.head`), the diff files it examined and its
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
a `package.json` `main`, `bin` or `exports` field at the reviewed head; a renamed one counts under its
old path, and one that points into a build directory, `dist/`, `build/`, `lib/` or `out/`, names
its source under `src/` with the same stem, `entryPointSources`), the
phase's assessed complexity is `high`, or the rigor is `thorough`. It returns `full` for every
final and standalone review. `harness review-tier` is its caller: the command runs git from the
repository top level and reads `review.backend` from the `harness.config.json` there, so it
answers the same from any directory; it gathers the diff, the range's commit messages and the
package entry points, applies the selector and prints the tier with its reasons. A flag the moment does not read is
an error (`--complexity`, `--rigor` and `--base` for a final or standalone review, `--session`
for a phase or standalone one, `--target` for a phase), and an error message is printed inert. For a final
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
`demotion: "no-subagent-tool"`, which autopilot records as a decision. A standalone review is
always computed `full`, so a `light` standalone receipt fails `TIER_DEMOTED` without that
demotion whether or not it records `computedTier`.

This "review tier" is separate from three other tiers in the review code: the depth tier
(Quick, Standard, Deep) that activates conditional reviewers, the model tier (`fast`,
`standard`, `strong`), and the heuristic and LLM tiers of `harness review-ci`
([Tiered Review Degradation](./tiered-review-degradation.md)).

**Receipt gate.** `validateReviewReceipt` fails on a receipt whose `moment` is not the one its
directory states (`phase-N` with no leading zeros, `final-all`, or a directory directly under
`.harness/reviews/`, the session layout tested first; the directory decides, and `--moment` is read only for a directory that states none, so a flag that
contradicts the directory fails `MOMENT_MISMATCH`), a required reviewer that did not run, a
`full` roster missing a core reviewer, a `light` roster that is not exactly `compliance-bug` (no other reviewer listed, required or not), a
reviewer listed twice, a reviewer id that is not a known reviewer (`UNKNOWN_REVIEWER`), a
`round` that is not 1 + the `round-R/` archives or archives not numbered `round-1` to `round-n`
(`ROUND_MISMATCH`), `priorRounds` that do not match them (`PRIOR_ROUNDS_MISMATCH`; each prior
round's blocking count is recounted from its archived findings files), a round
after the first at the head the round before it reviewed (`ROUND_SAME_HEAD`: only a fix commit
starts a new round), a `.round-R.partial` staging directory an interrupted archive left beside
the receipt (`ROUND_ARCHIVE_INTERRUPTED`), a findings file that is absent, invalid, shared, outside the receipt directory (`FINDINGS_PATH_INVALID`), written under another reviewer's id, written at another head or for another base (`FINDINGS_BASE_MISMATCH`), empty of examined files or outside the recomputed diff,
a finding id used twice in the review, `blocking` or `advisory` counts that differ from what the
findings files hold (`COUNTS_MISMATCH`), a head that is not the current HEAD (git runs at the
top of the worktree that holds the receipt, which must be the caller's: a receipt in another
worktree, or under a repository planted in the review directory, fails `RECEIPT_OUTSIDE_REPO`), tracked files
that differ from HEAD (`WORKTREE_DIRTY`, from `git status --porcelain=v1 -z --untracked-files=no`;
untracked files do not count, and the self-check applies it when given a range), a base that is not
an ancestor of the head, a `phase` receipt whose base is not the `diff.head` of the nearest
earlier usable `phase-M` receipt of its session, or the session's starting commit when there is
none (`PHASE_BASE_MISMATCH`; an earlier receipt that cannot be read or is not a valid phase receipt, or whose `diff.head` a
rebase left off the branch, is passed over, which only widens the review; `PHASE_BASE_UNKNOWN`
when no base can be named, including a starting commit that is not an ancestor of the head,
which after a rebase the session replaces with its new starting commit, and a phase receipt
outside a session; `phaseReviewBase`), a diff range that cannot be computed or changes nothing, and a `final`
receipt that is not full, cold, free of prior findings and based at the merge base with its
`diff.target` or, without one, the default branch (`TARGET_UNRESOLVED`, `TARGET_OWN_BRANCH`; a declared `baseSource: "starting-commit"` is accepted only when no
default-branch merge base resolves and the base is the session's starting commit, and an unknown
starting commit fails `STARTING_COMMIT_UNKNOWN`; when a merge base resolves, the base must be that
commit). One rule (`finalReviewBase`) and one resolver serve the gate and
`harness review-tier`. A missing
receipt fails, and so does a receipt or findings file that is not a regular file of at most 5
MB; the MCP tool alone fails `GATE_ERROR` on a missing or invalid argument. Autopilot may not
leave REVIEW or FINAL_REVIEW without a passing receipt, a human override, or a recorded
empty-phase (or empty-final) skip: a range that changes no files is not reviewed, no receipt is
written, the skip is a decision in `decisions[]`, and the next phase's base passes over it.
Repositories in the SHA-256 object format are not supported: every sha the receipt, a findings
file and the session state hold is a 40-character SHA-1 id. The codes are `REVIEW_GATE_FAILURE_CODES`, a literal union defined in
`packages/types/src/pipeline-receipts.ts`. Surfaces: `harness check-review-receipt [path]
[--moment phase|final|standalone]` (the path is `receipt.json` or its directory, and a path that
does not exist and does not end in `.json` is read as a directory; exit 0 on a pass, exit 1 on a
failure), with two more modes, one per call: `--archive-round <review-dir>` archives an ended
round into `round-R/` and prints the next round, and
`--findings <file> [--base <sha> --head <sha>]` checks one reviewer findings file with the gate's parser, reviewer-id rule and diff (a reviewer's
self-check, which needs only the CLI; a flag the chosen mode does not read, `--base`/`--head` with a receipt path or `--moment` with `--findings`, exits 1), and the `check_review_receipt` MCP tool (`path` is the project root,
`receipt` the review directory, which must be inside it by real path, so a symlink that leads
out is refused; a `moment` outside the three values returns `GATE_ERROR`). It needs no model
credential.

**Provenance stamp.** A Markdown block between `<!-- harness:review-provenance -->` markers,
printed by `harness review-provenance render --session <slug>`. The session is resolved from the
top level of the worktree, so the command prints the same stamp from any directory, and its
`autopilot-state.json` is read once per render: that one reading gives the expected reviews,
the decisions and the starting commit every row is gated with. It has one row per review the
session's phase list calls for (`MISSING` for one that has no directory) and one per review
directory that exists: a directory without a readable receipt is a row whose Gate cell says
`receipt missing`, `receipt invalid`, `receipt unreadable (<reason>)`, `receipt outside
repository` or `receipt outside project`, and it does not count as reviewed. A review with no
receipt that a `skipped` decision covers is `skipped (empty)` or `skipped (dropped)` instead.
The twelve columns are Review, Moment, Tier, Backend, Reviewers (findings files that loaded, of
required), Diff (with `(base: starting-commit)` when declared, and a gap note when a phase's
base is not the one the gate demands of it: the gate's own phase-base rule, read from the
gate's result, which passes over a missing, unread or invalid earlier receipt and one whose
head a rebase took off the branch, and falls back to the session's starting commit), Coverage
(diff files a required reviewer examined, of the diff's files; shown, never gated), Gate (re-run
at render time with two differences from `check-review-receipt`: the reviewed head may be an
ancestor of HEAD, and the working tree is not checked, so `WORKTREE_DIRTY` never appears; at
most six codes then `+M more`; the final row, whatever its Gate cell says, a receipt-less one
included, is followed by `, +N commits not reviewed` when commits follow the reviewed head, the
head an empty-skip recorded or the starting commit, or `, +? commits not reviewed (count
unavailable)`), Blocking (with dismissed findings, flagged `unaudited` or `decider unknown` where
the dismissal was, `at least N; not loaded: …` when a findings file did not load, and earlier
rounds), By class, Escaped from, and Override (`none`; `unknown` when a decision of the session
could not be read and none of this review's could, on a row without a receipt too; otherwise the
number of overrides and dismissals first, then `N skips`, then `N from other rounds`, the whole
prefixed `unknown, at least` when any decision of the session could not be read, then the
`gate`, `findings`, `dismissed` and `skipped` decisions of the row's round, each with its
decider, `(human)`, `(audited)`, `(unaudited)` or `(decider unknown)`, at most six, then `+N
more`). The row's round is the one the gate counts, 1 + the `round-R/` archives beside the
receipt, never the round the receipt states. A row without a receipt shows the review's
decisions too, and its Gate cell ends `(overridden)` when a `gate` decision names the code it
fails with (`RECEIPT_MISSING`, `RECEIPT_INVALID`, `RECEIPT_OUTSIDE_REPO` or `GATE_ERROR`). Rows
are `phase-N` and `final-all` only; any other entry under `reviews/` is skipped and counted. No
cell is cut without a mark: a rationale over 120 characters ends with `…`. Free text is made
inert: invisible and control characters are removed, and nothing in it can become markup, a
URL, a mention, a `#` or `GH-` issue reference (`#12`, `GH-12`) or math (`$`); `;` is encoded
too, because it separates the decisions of an Override cell. Two kinds of link are not broken,
because breaking them would break ordinary ids: a bare run of 7 to 40 hex characters (GitHub
links a commit sha) and a repository's own autolink reference (`ABC-123`). Notes under the table
are one of ten fixed sentences (`STAMP_NOTES` in `stamp-grammar.ts`): decisions that could not
be read, decisions recorded without `decidedBy`, an orphan decision, a decision for a review
with no row when the expected reviews are unknown, the reason the expected reviews are unknown,
skipped entries. Rows and notes are assembled in core (`assembleStamp`). The renderer and the
PR-body parser (`parseProvenanceStamp`, in `stamp-parser.ts`) share that grammar, so the parser
keeps only rows and notes the renderer can write, an Override cell no longer than the renderer
writes included. It reads a stamp only as the rendered page shows one: the markers on lines of
their own, each after an empty line, the heading on the line after the opening marker, outside
HTML comments, fenced code blocks, raw HTML blocks (`<script>`, `<pre>`, `<style>`,
`<textarea>`, `<?`, `<!X`, `<![CDATA[`) and `<details>` elements, open or not (GitHub shows one
collapsed, or lets the reader collapse it); rows only under the table's header and rule, and
notes only in the list after the table. A marker in a paragraph, a list item, a quote or a link
reference definition's title is text. A body that shows more than one stamp is `conflicting` and
none is read; a body over 262144 characters is `too-large` and is not read; the scan is linear
in the body's length. Autopilot places the stamp in the PR body. The stamp in a PR body is
unauthenticated: CI cannot recompute it, because receipts are machine-local.

**Review decision.** An entry of `decisions[]` in a session's `autopilot-state.json` with
`state` `REVIEW` or `FINAL_REVIEW` and a `kind`: `gate` (a failed receipt gate was overridden;
carries the `codes`), `findings` (blocking findings were overridden), `dismissed` (blocking
findings were set aside without a fix; carries the `findingIds`) or `skipped` (the review was
not run; carries the `reason`, `empty` or `dropped`, and for an empty range may carry the
`head` it was found empty at). Every kind carries a `rationale`, a `round`: the round of the
review it was taken in (1 when absent), and `decidedBy`: `human`, `audited` (taken in trusted
mode after a blind-then-refute self-audit that ran and agreed) or `unaudited`. A record with no
`decidedBy` key, written before the field existed, reads as decider unknown and is counted in a
note; any other value, `unknown` included, is unreadable. A decision applies only to the receipt
of its round, so a round 1 override or dismissal does nothing to a round 2 receipt. `codes` must
be real failure codes. The type is `ReviewDecisionRecord`, a union with one shape per kind (the
read type `ReadReviewDecision` adds the `unknown` decider); `readSessionReviewState` parses them
with `ReviewDecisionRecordSchema`, keyed by review, and keeps only the declared fields. A review
decision that does not parse is never dropped silently: the stamp says overrides could not be
read. One that parses and belongs to no review of the session, or sits under a state that is not
a review state, is an orphan and is named in a note; when the reviews the session calls for are
unknown, one for a review with no directory is named in its own note instead, not as an orphan.
In autopilot a dismissal is recorded only after a `judgment` pause: the human answers in
supervised mode, and in trusted mode the recommendation is taken only when the self-audit ran
and agreed (`audited`); with no auditor available, or audit off, the human answers. Overrides
are always the human's; a review skipped as empty is recorded `unaudited` (git found the range
empty), a dropped phase `human`. A final review ends `passed` only when nothing of it was set
aside in any round: `passed-with-dismissals` with a dismissal, `overridden` with an override.

**Session state.** The part of `autopilot-state.json` that code reads: `phases[]`, `decisions[]`
and `startingCommit` (`AutopilotSessionState`, `AutopilotPhaseEntry`; schema
`AutopilotSessionStateSchema` and the file name `AUTOPILOT_STATE_FILENAME`, exported from
`packages/core/src/state`). One reader, `readSessionReviewState`, reads every field the review
commands use with that schema, one field at a time so a fault in one never hides another; the
CLI reads the file once (a regular file of at most 5 MB) and hands it the text. Three other
readers of the file are not review commands and do not use the schema: roadmap sync
(`packages/core/src/roadmap/sync.ts`) and `harness migrate` (`packages/cli/src/commands/migrate.ts`)
each parse it as unvalidated JSON and check each field they use, and the pre-compact hook
(`packages/cli/src/hooks/pre-compact-state.js`) reads it for a summary. A phase is
identified by its 0-based position in `phases[]`. That one number is the entry's `index` when it
carries one, the `N` of its review directory `phase-N` and the `phase` of a decision record. The
stamp takes the reviews a session calls for from the positions. An entry that states another
`index`, or is malformed, makes that set unknown, and the stamp says why instead of guessing.
`startingCommit` is a full sha or it is not read.

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

**Fix rounds.** Before a fix round the ended round's files are archived into `round-R/` inside
the review directory by `harness check-review-receipt --archive-round` (core
`archiveReviewRound`); the gate reads the archived receipts and findings files to check `round`
and `priorRounds`. The command archives only a review directory of the layout above that holds a
`receipt.json` (a regular file, naming only findings files that are regular files directly in
the directory, the only files the archive moves)
(a round that wrote none, such as a failed mechanical phase, is not a round and keeps its
number), only when HEAD is no longer the head that receipt reviewed (a fix round needs a fix
commit; a review run again at the same head stays in its round and overwrites its files), and
only when the archives present are numbered `round-1` to `round-(R-1)`. It moves the files into
a staging directory `.round-R.partial`, `receipt.json` last, and renames it to `round-R/`, moving
everything back on an error (`receipt.json` first), so an error archives the round whole or not
at all. An interruption (the process dies) leaves the staging directory: the gate fails
`ROUND_ARCHIVE_INTERRUPTED` while it exists, beside a missing or invalid receipt too. The next
`--archive-round` completes the archive when the staging directory holds `receipt.json` and every
findings file it names, renaming it to `round-R/` even when a newer attempt has written files
into the review directory since (they stay; that attempt's receipt is rewritten as the next
round). With no `receipt.json` staged it moves the staged files back and then archives. It
refuses a staging directory that is not the next archive's, a staged receipt that is unreadable
or names a findings file the staging directory lacks, and, when moving back, a name in both
places (the staged copy is the ended round's, the other a newer attempt's): those stop for the
human. A prior round's blocking count is recounted from its archived findings files, each once;
when one cannot be read it is the archived receipt's own `blocking`, that receipt's claim. A standalone directory is named for its head, so a
standalone review after a fix commit is a new directory and needs no archive.

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
  the session's starting commit when none does), the `light` roster, the reviewer ids, `round`
  and `priorRounds` against the `round-R/` archives, finding-id uniqueness, and the `blocking`
  and `advisory` counts.
- These stay claims: that reviewers ran in separate contexts, the conditional-reviewer set
  (beyond every id being known), a phase's entitlement to `light`, `coldContext` and
  `priorFindingsSupplied`, whether a reviewer read the files it lists in `examinedFiles`,
  `computedTier` and `tierReasons` (what the session says the tier command printed), and the
  `backend`. The merge base is
  taken against the default branch ref as the clone holds it, or against the receipt's
  `diff.target`, a remote-tracking branch the session chose (the receipt schema requires a full
  `refs/remotes/` ref, so a sha, a HEAD-relative name, a local branch or a tag is an invalid
  receipt; one that does not resolve fails `TARGET_UNRESOLVED`, and the branch's own
  remote-tracking branch, exactly `refs/remotes/<remote>/<its name>` for a configured remote,
  fails `TARGET_OWN_BRANCH`; its upstream is not consulted, since a stacked branch tracks its parent); the gate does not fetch, and the
  session can rewrite those local remote-tracking refs (`git update-ref`) and so move what the
  gate treats as the merge base: the final base is only as trustworthy as those refs. The
  starting commit (the final base's fallback and the first phase's base) and the earlier
  receipts (a later phase's base) are the session's own files, so the gate proves the receipts
  agree with them, not that they are honest. So are the `round-R/` archives: the round check
  shows agreement with them and cannot show a round that was never archived.
- Callers of the MCP tool decide on its `pass` field alone. Through the shared
  response-compaction middleware `failures` is absent on a pass, a single object when there is
  exactly one failure, and an array when there are two or more. The CLI's `--json` output always
  carries an array.
- The receipt and the gate count findings by one rule
  (`tallyReviewFindings`): every finding in every reviewer findings file counts once, as
  written; `critical` and `important` are blocking and `suggestion` is advisory. Nothing is
  merged by file or line. The gate fails a receipt whose `blocking` or `advisory` differs, and
  requires finding ids to be unique across the review. A finding the review's own validation
  step later discarded stays in its reviewer's file, so it is still counted, and autopilot
  leaves a review state over it only by a fix or a recorded human override.
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

| File                                                                                      | Holds                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [pipeline-receipts.ts](../../../packages/types/src/pipeline-receipts.ts)                  | Contract types: receipt, reviewer record, the failure codes                                                                                 |
| [schema.ts](../../../packages/core/src/receipts/schema.ts)                                | Zod validators for both files; `tallyReviewFindings`, the counting rule                                                                     |
| [review-gate.ts](../../../packages/core/src/receipts/review-gate.ts)                      | `validateReviewReceipt`, `finalReviewBase`, `checkReviewerFindingsText` (the self-check)                                                    |
| [load.ts](../../../packages/core/src/receipts/load.ts)                                    | Reads a receipt; the findings reader confined to the review directory                                                                       |
| [rounds.ts](../../../packages/core/src/receipts/rounds.ts)                                | `archiveReviewRound`, `readArchivedRounds`: the `round-R/` archives of a fix round                                                          |
| [review-paths.ts](../../../packages/core/src/shared/review-paths.ts)                      | `normalizeReviewPath`, `pathEscapes`: the path rules the gate and the tier selector share (a shared leaf)                                   |
| [layout.ts](../../../packages/core/src/receipts/layout.ts)                                | Review directory names, `expectedReviewMoment` (the one precedence rule)                                                                    |
| [stamp-grammar.ts](../../../packages/core/src/receipts/stamp-grammar.ts)                  | The stamp's columns, cell grammars, bounds, notes and inert text                                                                            |
| [stamp-parser.ts](../../../packages/core/src/receipts/stamp-parser.ts)                    | The PR-body parser (`parseProvenanceStamp`): what the rendered page shows, one stamp, a bounded input                                       |
| [decisions.ts](../../../packages/core/src/receipts/decisions.ts)                          | `ReviewDecisionRecordSchema`, `readSessionReviewState` (the one reader of the session state)                                                |
| [autopilot-session-state.ts](../../../packages/core/src/state/autopilot-session-state.ts) | `AutopilotSessionStateSchema`, `AutopilotPhaseEntrySchema`, `AUTOPILOT_STATE_FILENAME`                                                      |
| [provenance.ts](../../../packages/core/src/receipts/provenance.ts)                        | Renders the provenance stamp; `assembleStamp`, `buildProvenanceRow`                                                                         |
| [backend.ts](../../../packages/core/src/receipts/backend.ts)                              | `resolveReviewBackend`                                                                                                                      |
| [unsafe-text.ts](../../../packages/core/src/shared/unsafe-text.ts)                        | The one unsafe-character rule (exported from receipts as `escapeTerminalText`), shared with the auto-decision log; ZWNJ and ZWJ are allowed |
| [tier-selector.ts](../../../packages/core/src/review/tier-selector.ts)                    | `selectReviewTier`                                                                                                                          |
| [gate.ts](../../../packages/cli/src/review-receipts/gate.ts)                              | `gateReviewReceipt`: recomputes HEAD, the diff and the base, runs gate                                                                      |
| [io.ts](../../../packages/cli/src/review-receipts/io.ts)                                  | The git seam; `resolveRepoRoots`; `resolveFinalReviewBase`                                                                                  |
| [check-review-receipt.ts](../../../packages/cli/src/commands/check-review-receipt.ts)     | `harness check-review-receipt`: the command over that gate                                                                                  |
| [review-tier.ts](../../../packages/cli/src/commands/review-tier.ts)                       | `harness review-tier`: the tier, its reasons, the backend and the final or standalone base                                                  |
| [review-receipt.ts](../../../packages/cli/src/mcp/tools/review-receipt.ts)                | The `check_review_receipt` MCP tool                                                                                                         |
| [provenance.ts](../../../packages/cli/src/review-receipts/provenance.ts)                  | `runReviewProvenanceRender`: one read of the session state, each review gated again                                                         |
| [review-provenance.ts](../../../packages/cli/src/commands/review-provenance.ts)           | `harness review-provenance render`: flags and printing only                                                                                 |
