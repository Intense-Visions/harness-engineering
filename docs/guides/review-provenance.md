# Reading Review Provenance

## Overview

Every PR built through `harness-autopilot` carries a provenance stamp in its body. The stamp
says which reviews the session called for, which of them ran, at what tier, with how many
reviewers of how many required, over what diff, and whether each review's receipt still passes
its gate. This guide explains how to read it, how to check it, and what it does not prove.

## The stamp

This is the output of `harness review-provenance render --session demo` for a two-phase session
in which nothing went wrong, pasted as the command printed it:

```text
<!-- harness:review-provenance -->
### Review provenance

| Review | Moment | Tier | Backend | Reviewers | Diff | Coverage | Gate | Blocking | By class | Escaped from | Override |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| phase-0 | phase | full | agent | 4/4 | c83689e..89dcda3 | 3/3 files | pass at 89dcda3 | 0 | none | none | none |
| phase-1 | phase | light | agent | 1/1 | 89dcda3..964f3f4 | 1/1 files | pass at 964f3f4 | 0 | none | none | none |
| final-all | final | full | agent | 4/4 | c83689e..964f3f4 | 4/4 files | pass at 964f3f4 | 0 | none | none | none |

<!-- harness:review-provenance -->
```

Phases are numbered from 0: `phase-0` is the first phase of the session's plan, whatever number
its spec heading carries.

| Column       | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review       | `phase-N` for a phase review (N without leading zeros), `final-all` for the final review. `N` is the phase's 0-based position in the session's phase list. There is one row for every phase in that list and one for the final review, whether or not the review ran, and one for every review directory that exists. A directory with any other name (`phase-01`, `phase-2b`) is not a review directory: it gets no row and is counted in a note.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Moment       | `phase` or `final`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Tier         | `full`: one dispatch per reviewer (compliance, bug, security, architecture, plus activated conditional reviewers). `light`: one reviewer, `compliance-bug`, covering compliance and bugs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Backend      | `agent`, or `pipeline` when `review.backend` selected the coded pipeline and a runner resolved. A `light` review is always `agent`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Reviewers    | Required reviewers whose findings file loaded, of required reviewers. A reviewer the receipt marks as run whose file is missing or invalid is not counted. Anything short of `N/N` means the gate failed on that review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Diff         | The reviewed range, as two short SHAs. `(base: starting-commit)` means the receipt declares that its base is the session's starting commit and not the merge base; the gate accepts that only when the default branch cannot be resolved in the clone, so on a passing row the label does mean that. `(gap: base is not the head phase-M reviewed)` means this phase's range does not start at the head `phase-M` read, `phase-M` being the nearest earlier phase whose receipt the gate could use, so commits between them were in no phase review. The rule is the gate's own phase-base rule: an earlier phase with no receipt, a receipt that is not a valid phase receipt, and one whose head is no longer in the branch's history (a rebase rewrote it) are passed over. `(gap: base is not the session starting commit)` means no earlier phase receipt could be used and this phase's range does not start at the session's starting commit. A gap is the reason the row's gate fails `PHASE_BASE_MISMATCH`; when no base can be named at all the gate fails `PHASE_BASE_UNKNOWN` and no gap is printed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Coverage     | `<examined>/<files> files`: files of the diff that at least one required reviewer lists as examined, of the files in the diff. `unknown` when the diff could not be computed. It is shown, never gated, it is the reviewers' own statement of what they read, and it is a union: `N/N` does not say any one reviewer read every file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Gate         | The receipt gate's result, re-run when the stamp is rendered. `pass at <sha>`: the gate holds at the reviewed commit. `FAIL: <codes>`: it does not hold, for the listed reasons (at most six codes, then `+M more`). `FAIL: <codes> (overridden)`: it failed and the human overrode every listed code, in the round the receipt is for. On the final row each of the three is followed by `, +N commits not reviewed` when N commits were made after the commit the final review read, or by `, +? commits not reviewed (count unavailable)` when git could not count them. `MISSING`: the session called for this review and it has no directory. `receipt missing`, `receipt invalid`, `receipt unreadable (<reason>)`: the review's directory exists and holds no receipt, a file that is not a receipt, or one that could not be read. `receipt outside repository`: the receipt is in another git repository than the one the stamp was rendered in. `receipt outside project`: the receipt path leaves the project. Any of these six ends ` (overridden)` when a `gate` decision recorded for the review lists the code the row fails with (`RECEIPT_MISSING` for `MISSING` and `receipt missing`, `RECEIPT_INVALID` for `receipt invalid` and `receipt unreadable`, `RECEIPT_OUTSIDE_REPO` for `receipt outside repository`, `GATE_ERROR` for `receipt outside project`). `skipped (empty)` and `skipped (dropped)`: the review has no receipt and a `skipped` decision says why it was not run: its range changed no files, or the phase was dropped from the plan. For an `empty` skip the stamp recomputes the range at the head the decision names (a phase from the base the gate would demand of it at that head, the final review from the final base there) and lists its files: `skipped (empty)` when it lists none, `skipped (empty; range not empty)` when it lists some, `skipped (empty; unverified)` when the decision names no head or git cannot say. The final row ends `, +N commits not reviewed` whatever its Gate cell says. With no receipt that was read (`MISSING`, `receipt …`, overridden or not, or `skipped`) it counts from the base the final gate would demand at HEAD: the merge base with the default branch, else, when none resolves, the session's starting commit. Only a `skipped (empty)` cell counts from the head its decision names instead, since that range was found empty. It prints `, +? commits not reviewed (count unavailable)` when no base is known or git cannot count. |
| Blocking     | `critical` and `important` findings, counted from the reviewer findings files, one per finding. `3 (2 dismissed)`: two of the three were set aside without a fix, by a recorded decision. `(2 dismissed, 1 unaudited)` or `(…, 1 decider unknown)`: a dismissal was recorded as taken with no audit, or without saying who took it. `at least N; not loaded: <reviewers>`: a reviewer's findings file did not load (absent, unreadable, or rejected by the gate), so the count is a floor. `; round 2; round 1: 3 blocking`: this is the second round of the review, after a fix, and the first round found three. An earlier round the receipt lists at or above the round the gate counts is not shown.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| By class     | Those findings by kind: `stale-claim`, `edge-case`, `weak-test`, `collateral`, `design`, `other`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Escaped from | The earliest stage that should have caught each: `spec`, `plan`, `execution`, `verification`, or `none`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Override     | `none`: no decision was recorded for the review. `unknown`: a decision of the session could not be read and none could be read for this review, so "none" cannot be claimed. Otherwise the counts first, `<o> override(s), <d> dismissal(s)`, then `, <s> skip(s)` when the review was skipped, then `, <k> from other rounds` when decisions were taken in a round other than the one the receipt is for, then the decisions of the receipt's round, separated by `;`. When any decision of the session could not be read the counts are floors and the cell starts `unknown, at least`. The round is the one the gate counts, 1 + the `round-R/` archives beside the receipt, not the round the receipt states. `gate (<codes>) (<who>): <reason>` is an override of a failed gate, `findings (<who>): <reason>` an override of blocking findings, `dismissed <ids> (<who>): <reason>` findings set aside without a fix, and `skipped (<empty or dropped>) (<who>): <reason>` a review that was not run. `<who>` is `human`, `audited` (taken in trusted mode after a self-audit that ran and agreed), `unaudited`, or `decider unknown` (recorded before decisions said who took them). A row without a receipt shows `-` when the decisions were read and the review has none, `unknown` when they could not be read, else the same counts and decisions: of the round its directory's `round-R/` archives say it is (1 + the archives, with `from other rounds` for the rest) when there are any, else over all its rounds. At most six decisions are written out, then `+N more`; a reason longer than 120 characters ends with `…`. The counts are never shortened.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

The second example is a four-phase session in which several things went wrong. The first phase
was reviewed twice, and one finding of the second round was dismissed. In the second phase a
required reviewer did not run and the human overrode the failed gate, shipped one blocking
finding and dismissed another. The third phase was never reviewed. The fourth phase's review
directory was created and no receipt was written into it. A commit was made after the final
review.

```text
<!-- harness:review-provenance -->
### Review provenance

| Review | Moment | Tier | Backend | Reviewers | Diff | Coverage | Gate | Blocking | By class | Escaped from | Override |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| phase-0 | phase | full | agent | 4/4 | c83689e..89bea1b | 3/3 files | pass at 89bea1b | 1 (1 dismissed); round 2; round 1: 3 blocking | edge-case 1 | plan 1 | 0 overrides, 1 dismissal, 1 from other rounds: dismissed bug-empty-input (human): the only caller passes a literal&#59; VALIDATE discarded it and the human agreed |
| phase-1 | phase | full | agent | 4/5 | 89bea1b..28e991c | 1/1 files | FAIL: REQUIRED_REVIEWER_NOT_RUN (overridden) | 2 (1 dismissed) | stale-claim 1, design 1 | execution 1, plan 1 | 2 overrides, 1 dismissal: gate (REQUIRED_REVIEWER_NOT_RUN) (human): the adversarial reviewer timed out twice&#59; accepted for this phase; findings (human): architecture-flag-name ships as is&#59; renaming the flag is tracked as a follow-up; dismissed bug-help-text (human): the help text is generated&#59; the generator already prints the default |
| phase-2 | - | - | - | - | - | - | MISSING | - | - | - | - |
| phase-3 | - | - | - | - | - | - | receipt missing | - | - | - | - |
| final-all | final | full | agent | 4/4 | c83689e..8995313 | 5/5 files | pass at 8995313, +1 commit not reviewed | 0 | none | none | none |

<!-- harness:review-provenance -->
```

Reading it row by row:

- `phase-0`: the Override cell says `0 overrides, 1 dismissal, 1 from other rounds`. The
  dismissal written out belongs to round 2, the round this receipt is for, and `(human)` says the
  human took it. One more decision was taken in round 1 and does not apply to this receipt, so it
  is counted and not written out. The round 1 receipt is archived in `phase-0/round-1/`, and the
  gate checks the row's `round 2; round 1: 3 blocking` against it.
- `phase-1`: `4/5` reviewers, and the gate fails with `REQUIRED_REVIEWER_NOT_RUN`. It is marked
  `(overridden)` because a `gate` decision of this round lists that code. `2 overrides` are that
  gate override and the `findings` override; `2 (1 dismissed)` says one of the two blocking
  findings was set aside and the other shipped.
- `phase-2`: `MISSING`. The plan had a third phase and no review directory exists for it.
- `phase-3`: `receipt missing`. A review was started and never finished. This row does not count
  as a review.
- `final-all`: the gate passes at the commit the final review read, and one commit made after it
  was read by no final review.

Lines under the table are notes about what the table cannot show. The renderer writes these and
no others:

| Note                                                                                                                                      | Meaning                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overrides could not be read from autopilot-state.json`                                                                                   | The state file is absent or unreadable, or a review decision in it does not have the typed shape (a `gate` decision with no codes or a code that is not a failure code, a `REVIEW` decision with no phase, a round that is not a positive integer). Rows without a parsed decision say `unknown`. |
| `decision provenance unknown: N review decisions were recorded without decidedBy`                                                         | N review decisions were written before decisions said who took them. Each reads as `decider unknown` on its row.                                                                                                                                                                                  |
| `orphan decision: N recorded for <review>, which is not a review of this session`                                                         | N decisions name a review the session does not have, for example `phase: 1` written for the first phase of a one-phase session. They apply to no row.                                                                                                                                             |
| `decision without a row: N recorded for <review>, which has no review directory; whether the session calls for that review is unknown`    | The expected reviews are unknown (see the notes below), and N decisions name a review that has no directory. The stamp cannot say whether the session calls for it, so it does not call them orphans.                                                                                             |
| `orphan decision: kind <kind> recorded under state <STATE>, which is not a review state`                                                  | A decision carries a review kind under a state other than `REVIEW` or `FINAL_REVIEW`. It applies to no row.                                                                                                                                                                                       |
| `expected reviews unknown (autopilot-state.json is absent or is not a JSON object), so a phase review that never ran is not shown`        | The session state could not be read, so only phase reviews that have a directory get a row and a missing one cannot be shown. Every session calls for a final review, so `final-all` always has a row.                                                                                            |
| `expected reviews unknown (autopilot-state.json has no phase list), so a phase review that never ran is not shown`                        | The same, because the state has no `phases` list.                                                                                                                                                                                                                                                 |
| `expected reviews unknown (phase entry N is malformed), so a phase review that never ran is not shown`                                    | The same, because the entry at 0-based position N is not an object with a name.                                                                                                                                                                                                                   |
| `expected reviews unknown (phase entry N states an index other than its 0-based position), so a phase review that never ran is not shown` | The same, because that entry's `index` is not its position (numbered from 1, a duplicate, a string).                                                                                                                                                                                              |
| `entries under reviews/ that are not review directories, skipped: N`                                                                      | Something under the session's `reviews/` is not a directory named `phase-N` (no leading zeros) or `final-all`. Names are not printed.                                                                                                                                                             |

No cell is cut without a mark. The only free text on a stamp is a decision's reason, the finding
ids of a dismissal and a reviewer id, and it is made inert before it is printed: line breaks and
tabs become a space; every invisible character is removed (control and format characters, every
default-ignorable code point, the tag characters and variation selectors, the soft hyphen, and
the bidirectional and zero-width marks); a `|` becomes `/`, `://` becomes `: //`, `www.` becomes
`www .`, `@` becomes `(at)`, a `#` or a `GH-` before a digit gets a space after it, and `<`, `>`,
`&`, `[`, `]`, `*`, `_`, `~`, `$`, `;`, the backslash and the backtick appear as numeric character
references (`;` because it separates the decisions of an Override cell). A reason or a finding id therefore cannot add markup, a URL, a mention, a `#` or `GH-` issue
reference, math or hidden text to a PR body. Two kinds of link are not broken, because breaking
them would also break ordinary finding ids and words: a run of 7 to 40 hexadecimal characters,
which GitHub links when it names a commit of the repository, and a reference such as `ABC-123`
that a repository's own autolink settings turn into a link. A reader of the PR body refuses a row whose
Override cell holds any of them raw, or holds more than the renderer can write there: anything
but the counts and at most six decisions in the forms above, each reason at most 120
characters.

### How the Gate column is computed

`render` runs the receipt gate again for every review, so the stamp never shows a review as
clean on the receipt's word. It applies every rule `harness check-review-receipt` applies, with
two differences. `check-review-receipt` requires the receipt's head to be the current HEAD,
because a review state must not be left on a stale review. `render` runs at PR time, after later
phases have committed, so it accepts a head that is the current HEAD **or an ancestor of it**
and prints the commit the gate was evaluated at (`pass at <sha>`). And `render` does not check
the working tree (`WORKTREE_DIRTY` never appears on the stamp): the tree it runs in is not the
tree any of those reviews read, which is checked by `check-review-receipt` when each review state
is left. For the final review it also counts the commits after that head and prints them
whatever the gate's result, because those commits ship without a final review.

A head that is not in the history of HEAD fails with `HEAD_MISMATCH`, and so does a checkout
where git cannot answer. **A rebase or a squash after the reviews therefore fails every row it
rewrote**: the commits the reviews read are no longer on the branch, so each such row is
`FAIL: HEAD_MISMATCH`, and a phase row usually also `PHASE_BASE_UNKNOWN` (no earlier phase head
and no starting commit is still an ancestor of it). An amend rewrites only the tip, so it fails
only the rows whose reviewed head was the amended commit. Render the stamp before rewriting
history. Running the final review again afterwards
restores only the final row: nothing re-reviews the earlier phases, so their rows keep
`FAIL: HEAD_MISMATCH`. A reader should conclude that the phase reviews read commits that are no
longer on the branch, and rely on the final row, a cold review of the whole change as it now is.
The same holds after the rebase autopilot makes when the branch below a stacked branch merges.

Every session calls for a final review, so a session's stamp always has a `final-all` row, even
when its phase list cannot be read or it has no review directory (`MISSING`, with the commits it
did not cover).

`render` reads `autopilot-state.json` once: the phase list, the decisions and the starting commit
every row is gated with all come from that one reading, so a state file the session rewrites
while the stamp is rendered cannot give two rows two different answers.

## What to look for

- **The `final-all` row.** It should be `full`, `N/N`, `pass at` the PR's head commit with no
  `+N commits not reviewed`, and `none` in the Override column. That row is the cold, full
  review of the whole change (ADR
  [0140](../knowledge/decisions/0140-the-final-review-is-cold-and-full.md)).
- **A `MISSING` row, or a `receipt …` Gate cell.** The session's plan had that phase and no
  finished review of it exists.
- **A `skipped (…)` row.** The review was not run, by a recorded decision: `empty` when its range
  changed no files, `dropped` when the phase was dropped from the plan. The Override cell says
  who decided and why. `skipped (empty; range not empty)` means the stamp found files in that
  range at the head the decision names, so the decision is wrong; `skipped (empty; unverified)`
  means it could not check. A dropped phase's commits, if it made any, stay on the branch: the
  next phase review starts at the last reviewed phase head before them, and the final review
  covers the whole change, so they are reviewed there.
- **A `light` phase.** Expected for a low-risk phase. It is also what a session that cannot
  dispatch subagents records, so a PR whose every phase row is `light` had no fan-out before the
  final review.
- **Low coverage.** `2/40 files` on a `full` review means the reviewers say they read two files.
- **A `FAIL` in the Gate column.** The review did not meet the gate. With `(overridden)` the
  human accepted every listed failure in that round; without it, the review state was left some
  other way, a new failure appeared after the override, or the branch changed after the review.
- **Dismissals and overrides.** The Override cell starts with how many there are. Read the
  reasons and who took each. A dismissal is a decision the human took (`(human)`), or in trusted
  mode one taken after the session's blind-then-refute self-audit ran and agreed (`(audited)`).
  The pipeline never records a dismissal as `(unaudited)`; one that is, or reads `(decider
unknown)`, is flagged in the Blocking cell and deserves a second look. An override is always
  the human's; a `gate (…)` override on `final-all` means the PR shipped without a
  passing final review.
- **`from other rounds`.** Decisions were taken in a round the current receipt is not for. They
  do not apply to it; the earlier round's files are kept on the machine that ran the pipeline.
- **`unknown` in the Override column, or an `orphan decision` note.** The stamp could not read a
  decision, or could not tell which review it was for. Neither means nothing was overridden.
- **`(base: starting-commit)` or a `(gap: …)` in the Diff column.** The range is not the one the
  pipeline normally reviews; read which commits it leaves out.

## Checking a receipt yourself

```bash
# Gate one review. Exits 0 on a pass and 1 on any failure, including a missing receipt.
harness check-review-receipt .harness/sessions/<slug>/reviews/final-all

# The same for a receipt copied to a directory whose name says nothing: state which review it is.
harness check-review-receipt /some/copy --moment final

# The base the gate demands of a final review, from the gate's own resolver.
harness review-tier --moment final --session <slug>

# One reviewer findings file, checked with the gate's parser against the reviewed range.
harness check-review-receipt --findings .harness/sessions/<slug>/reviews/final-all/bug.json --base <sha> --head <sha>

# Reprint the stamp for a session, from any directory of the repository.
# Exits 1 if the session directory does not exist.
harness review-provenance render --session <slug>
```

`check-review-receipt` and `review-provenance render` read the session's review directory, which
is ignored by git, so they work on the machine that ran the pipeline and not on a fresh clone of
the PR branch.

The gate recomputes HEAD, whether the tracked files equal it, the diff's file set, the base's
ancestry, a phase review's base (the head of the nearest earlier phase receipt, or the session's
starting commit) and, for a final review, the merge base with the default branch (or, when none
resolves, the session's starting commit), it
checks `round` and `priorRounds` against the `round-R/` archives beside the receipt and that
every reviewer id is a known one, and it reads each reviewer's findings file (a regular file
of at most 5 MB inside the review directory, or it is not read). It needs no model credential.

The gate also checks that the receipt is for the review its directory names, and **the directory
decides**: `phase-N` is a phase review, `final-all` the final review and a directory under
`.harness/reviews/` a standalone review. A receipt that says otherwise fails `MOMENT_MISMATCH`.
`--moment` is read only for a directory that states none of these, which fails `MOMENT_UNKNOWN`
without it. For a directory that does state a moment the flag cannot change it: passing
`--moment phase` for `final-all` fails `MOMENT_MISMATCH`.

Under `check-review-receipt` a receipt is valid only at the commit it reviewed: once HEAD moves,
the gate fails with `HEAD_MISMATCH`. That is why a phase receipt checked this way after later
phases have committed fails (the stamp's Gate column uses the ancestor rule above instead), and
why a fix committed after the final review sends autopilot back to the final review.

## What the stamp does not prove

- **The stamp in a PR body is not authenticated.** It is text in a body the PR author can edit,
  and CI cannot recompute it: the receipts and findings files are ignored by git and exist only
  on the machine that ran the pipeline. Anyone who can edit the body can write any stamp, so a
  stamp read back out of a PR body is shown as stated, never as verified. `harness pre-merge-brief`
  shows it under the line
  `_As stated in the PR body by its author; not verified by CI (review receipts are machine-local)._`,
  which opens its Review provenance section whatever the body holds. It prints the rows and notes
  it kept, says how many lines it left out, and says whether the stamp covers the PR head: it
  compares the PR head with the head the `final-all` row reviewed (its Diff cell), whatever that
  row's Gate cell says, so a final review that passed or was overridden at an older commit reads
  `Commits after <sha> are not covered.`, and a row with `+N commits not reviewed` is never
  current. A stamp with no `final-all` row states no final review of the PR. It shows a body it
  did not read as `conflicting`, `too-large` or `ambiguous` (with the reason), and a stamp it
  found but could read no line of as found and not read (it may come from another harness
  version); none of these is `no pipeline review recorded` or a pass. A PR body that could not be
  read (`gh` failed, or replied with something that is not a pull request) is
  `unavailable / not configured`. Fitting the brief into one comment never cuts the Review
  provenance section. `--pr` takes only a positive decimal number within the safe integers;
  anything else exits 1. The shipped workflows re-run the brief when the PR body is edited.
- **The reader is best effort.** It follows the CommonMark blocks that hide text, but it does not
  render the page. It looks for the opening marker on a line of its own after an empty line (or
  first), the heading `### Review provenance` on the next line, then the table (its header line,
  its rule line, then rows) and the notes under it, and the closing marker on a line of its own
  after an empty line, none of it inside an HTML comment, a fenced code block or a raw HTML block
  (`<script>`, `<pre>`, `<style>`, `<textarea>`, `<?`, `<!X`, `<![CDATA[`). A marker anywhere
  else, in a paragraph, a list item, a quote or a link reference definition's title, is text and
  starts no stamp. A line inside the markers that is not the table or its notes, or is indented
  four or more columns (a code block on the page, not a table row), is left out and counted.
  Blank means spaces and tabs only, as in CommonMark: a fence closer followed by a no-break space
  closes nothing. The reader keeps only rows whose twelve cells each have their column's form and
  notes that are one of the sentences in the table above, and it runs in time linear in the
  body's length.
- **It fails closed on the constructs it knows.** The body is `ambiguous` (with a reason) and no
  stamp in it is read when, before the body's last marker, there is: `<details` or `</details`,
  in any case and anywhere (a code span, a comment, a code block included; `details-element`);
  an HTML comment opener that shares its line with a backtick, leaves a comment open without
  starting its line, or reopens a comment after a `-->` on its line (`comment-opener`); a line
  starting with `<noscript`, `<template`, `<select` or `<rp`, or an HTML block of CommonMark
  type 6 or 7 (a block tag such as `<div>`, or a tag alone on its line) holding, before the next
  empty line, a line that opens a fence, a raw HTML block or a comment (`html-block`); a fence on
  the line of a list item or a quote, or a line inside a fence, a comment or a raw HTML block that
  is less indented than its opener, as when a list item ends there (`container`). Ordinary PR
  bodies still read: top-level comments, code fences, lists (a fence indented with its list item
  included), headings, tables, images and other HTML alone on a line. When the body holds more
  than one stamp, none is read (`conflicting`). A body longer than 262144 characters is not read
  at all (`too-large`). Each of the three is a state of its own: a later reader of the stamp
  reports it as such, never as "no stamp" and never as a pass.
- **What the reader does not defend against.** A body crafted to show one stamp and hide another
  (or to hide part of one: a fence inside the stamp hides a note from the page, and the reader
  still reads the note) is not caught in every form. That is forging, not a reading error:
  whoever can write such a body can write any stamp in plain view, which is why the stamp is
  unauthenticated and shown as stated, not verified.
- The gate proves that each required reviewer produced its own findings file, written at the
  reviewed commit, over files of the diff. It cannot prove the reviewers ran in separate
  contexts.
- The gate checks the moment against the review directory, each findings file's `head`, the
  base's ancestry, the merge base of a final review (a declared `starting-commit` base is
  accepted only when no merge base resolves and the base is the session's starting commit), the
  single `compliance-bug` reviewer of a `light` review, that every reviewer id is known, `round`
  and `priorRounds` against the archived rounds, that finding ids are unique, and the
  `blocking` and `advisory` counts.
- These stay claims: which conditional reviewers should have been active, whether a phase was
  entitled to `light`, `coldContext` and `priorFindingsSupplied`, whether a reviewer read the
  files it lists (the Coverage column is built from that list), the backend, and who took each
  decision (`decidedBy`), and a `skipped` decision with its reason and the head it names (for an
  `empty` skip the stamp recomputes that range and says when it is not empty or cannot be
  checked; a `dropped` reason is not checked). The archived rounds are the session's own files, so the round check
  shows the receipt agrees with them, not that no round was left unarchived.
- **The final base is only as trustworthy as the clone's remote-tracking refs.** The merge base
  comes from local refs (`refs/remotes/origin/HEAD`, `origin/main`, `origin/master`) and the
  gate does not fetch. A session can rewrite those refs (`git update-ref`) and move what the
  gate treats as the default branch's merge base, so a narrowed final review can pass.
- The phase list, the decisions and the starting commit come from the session's
  `autopilot-state.json`, which the agent writes. The stamp parses them with a typed schema and
  says what it could not read; it cannot tell whether they were edited.
- Findings from review hooks (canary detectors, craft domains) are not in the receipt and not in
  the Blocking column. One that was overridden appears in the Override column only.
- An override lets a review with a failed gate through, and a dismissal sets a blocking finding
  aside. The stamp shows both; nothing prevents them.

## Related

- [Review receipts](../knowledge/core/review-receipts.md)
- ADR [0139](../knowledge/decisions/0139-review-receipts-are-claims-recomputed-by-gates.md), ADR [0140](../knowledge/decisions/0140-the-final-review-is-cold-and-full.md)
- [`review` configuration](../reference/configuration.md#review)
