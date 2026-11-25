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

| Column       | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review       | `phase-N` for a phase review (N without leading zeros), `final-all` for the final review. `N` is the phase's 0-based position in the session's phase list. There is one row for every phase in that list and one for the final review, whether or not the review ran, and one for every review directory that exists. A directory with any other name (`phase-01`, `phase-2b`) is not a review directory: it gets no row and is counted in a note.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Moment       | `phase` or `final`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Tier         | `full`: one dispatch per reviewer (compliance, bug, security, architecture, plus activated conditional reviewers). `light`: one reviewer, `compliance-bug`, covering compliance and bugs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Backend      | `agent`, or `pipeline` when `review.backend` selected the coded pipeline and a runner resolved. A `light` review is always `agent`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Reviewers    | Required reviewers whose findings file loaded, of required reviewers. A reviewer the receipt marks as run whose file is missing or invalid is not counted. Anything short of `N/N` means the gate failed on that review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Diff         | The reviewed range, as two short SHAs. `(base: starting-commit)` means the receipt declares that its base is the session's starting commit and not the merge base; the gate accepts that only when the default branch cannot be resolved in the clone, so on a passing row the label does mean that. `(gap: base is not the head phase-M reviewed)` means this phase's range does not start at the head the nearest earlier reviewed phase, `phase-M`, read, so commits between them were in no phase review; a `MISSING` row or a row without a readable receipt in between is passed over, not a reset. `(gap: base is not the session starting commit)` means no earlier phase was reviewed and this phase's range does not start where the session started.                                                                                                                                                                                                                                                                                                                                            |
| Coverage     | `<examined>/<files> files`: files of the diff that at least one required reviewer lists as examined, of the files in the diff. `unknown` when the diff could not be computed. It is shown, never gated, it is the reviewers' own statement of what they read, and it is a union: `N/N` does not say any one reviewer read every file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Gate         | The receipt gate's result, re-run when the stamp is rendered. `pass at <sha>`: the gate holds at the reviewed commit. `FAIL: <codes>`: it does not hold, for the listed reasons (at most six codes, then `+M more`). `FAIL: <codes> (overridden)`: it failed and the human overrode every listed code, in the round the receipt is for. On the final row each of the three is followed by `, +N commits not reviewed` when N commits were made after the commit the final review read, or by `, +? commits not reviewed (count unavailable)` when git could not count them. `MISSING`: the session called for this review and it has no directory. `receipt missing`, `receipt invalid`, `receipt unreadable (<reason>)`: the review's directory exists and holds no receipt, a file that is not a receipt, or one that could not be read. Any of these four ends ` (overridden)` when a `gate` decision recorded for the review lists the code the row fails with (`RECEIPT_MISSING` for `MISSING` and `receipt missing`, `RECEIPT_INVALID` for the other two).                                           |
| Blocking     | `critical` and `important` findings, counted from the reviewer findings files, one per finding. `3 (2 dismissed)`: two of the three were set aside without a fix, by a recorded decision. `(2 dismissed, 1 unaudited)` or `(…, 1 decider unknown)`: a dismissal was recorded as taken with no audit, or without saying who took it. `at least N; not loaded: <reviewers>`: a reviewer's findings file did not load (absent, unreadable, or rejected by the gate), so the count is a floor. `; round 2; round 1: 3 blocking`: this is the second round of the review, after a fix, and the first round found three.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| By class     | Those findings by kind: `stale-claim`, `edge-case`, `weak-test`, `collateral`, `design`, `other`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Escaped from | The earliest stage that should have caught each: `spec`, `plan`, `execution`, `verification`, or `none`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Override     | `none`: no decision was recorded for the review. `unknown`: the session's decisions could not be read, so "none" cannot be claimed. Otherwise the counts first, `<o> override(s), <d> dismissal(s)`, then `, <k> from other rounds` when decisions were taken in a round other than the one the receipt is for, then the decisions of the receipt's round, separated by `;`. `gate (<codes>) (<who>): <reason>` is an override of a failed gate, `findings (<who>): <reason>` an override of blocking findings, and `dismissed <ids> (<who>): <reason>` findings set aside without a fix. `<who>` is `human`, `audited` (taken in trusted mode after a self-audit that ran and agreed), `unaudited`, or `decider unknown` (recorded before decisions said who took them). A row without a receipt shows `-` when the decisions were read and the review has none, `unknown` when they could not be read, else the same counts and decisions over all its rounds. At most six decisions are written out, then `+N more`; a reason longer than 120 characters ends with `…`. The counts are never shortened. |

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

| Note                                                                                                                                | Meaning                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overrides could not be read from autopilot-state.json`                                                                             | The state file is absent or unreadable, or a review decision in it does not have the typed shape (a `gate` decision with no codes or a code that is not a failure code, a `REVIEW` decision with no phase, a round that is not a positive integer). Rows without a parsed decision say `unknown`. |
| `decision provenance unknown: N review decisions were recorded without decidedBy`                                                   | N review decisions were written before decisions said who took them. Each reads as `decider unknown` on its row.                                                                                                                                                                                  |
| `orphan decision: N recorded for <review>, which is not a review of this session`                                                   | N decisions name a review the session does not have, for example `phase: 1` written for the first phase of a one-phase session. They apply to no row.                                                                                                                                             |
| `orphan decision: kind <kind> recorded under state <STATE>, which is not a review state`                                            | A decision carries a review kind under a state other than `REVIEW` or `FINAL_REVIEW`. It applies to no row.                                                                                                                                                                                       |
| `expected reviews unknown (autopilot-state.json is absent or is not a JSON object), so a review that never ran is not shown`        | The session state could not be read, so only reviews that have a directory get a row and a missing one cannot be shown.                                                                                                                                                                           |
| `expected reviews unknown (autopilot-state.json has no phase list), so a review that never ran is not shown`                        | The same, because the state has no `phases` list.                                                                                                                                                                                                                                                 |
| `expected reviews unknown (phase entry N is malformed), so a review that never ran is not shown`                                    | The same, because the entry at 0-based position N is not an object with a name.                                                                                                                                                                                                                   |
| `expected reviews unknown (phase entry N states an index other than its 0-based position), so a review that never ran is not shown` | The same, because that entry's `index` is not its position (numbered from 1, a duplicate, a string).                                                                                                                                                                                              |
| `entries under reviews/ that are not review directories, skipped: N`                                                                | Something under the session's `reviews/` is not a directory named `phase-N` (no leading zeros) or `final-all`. Names are not printed.                                                                                                                                                             |

No cell is cut without a mark. The only free text on a stamp is a decision's reason, the finding
ids of a dismissal and a reviewer id, and it is made inert before it is printed: line breaks and
tabs become a space; every invisible character is removed (control and format characters, every
default-ignorable code point, the tag characters and variation selectors, the soft hyphen, and
the bidirectional and zero-width marks); a `|` becomes `/`, `://` becomes `: //`, `www.` becomes
`www .`, `@` becomes `(at)`, a `#` or a `GH-` before a digit gets a space after it, and `<`, `>`,
`&`, `[`, `]`, `*`, `_`, `~`, `$`, `;`, the backslash and the backtick appear as numeric character
references (`;` because it separates the decisions of an Override cell). A reason or a finding id therefore cannot add markup, a link, a mention, an issue
reference, math or hidden text to a PR body. A reader of the PR body refuses a row whose
Override cell holds any of them raw, or holds more than the renderer can write there: anything
but the counts and at most six decisions in the forms above, each reason at most 120
characters.

### How the Gate column is computed

`render` runs the receipt gate again for every review, so the stamp never shows a review as
clean on the receipt's word. It applies every rule `harness check-review-receipt` applies, with
one difference. `check-review-receipt` requires the receipt's head to be the current HEAD,
because a review state must not be left on a stale review. `render` runs at PR time, after later
phases have committed, so it accepts a head that is the current HEAD **or an ancestor of it**
and prints the commit the gate was evaluated at (`pass at <sha>`). For the final review it also
counts the commits after that head and prints them whatever the gate's result, because those
commits ship without a final review.

A head that is not in the history of HEAD fails with `HEAD_MISMATCH`, and so does a checkout
where git cannot answer. **A rebase, an amend or a squash after the reviews therefore turns
every row into `FAIL: HEAD_MISMATCH`**: the commits the reviews read are no longer on the
branch. Render the stamp before rewriting history, or run the final review again afterwards.

A session with no review directory and no phase list renders `_no pipeline review recorded._`
between the markers.

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

Both read the session's review directory, which is ignored by git, so they work on the machine
that ran the pipeline and not on a fresh clone of the PR branch.

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
  on the machine that ran the pipeline. A stamp is read back out of a PR body only as a reader
  of the rendered page sees it: the opening marker on a line of its own after an empty line (or
  first), the heading `### Review provenance` on the next line, then the table (its header line,
  its rule line, then rows) and the notes under it, and the closing marker on a line of its own
  after an empty line. None of it may sit inside an HTML comment, a fenced code block or a raw
  HTML block. A marker anywhere else, in a paragraph, a list item, a quote or a link reference
  definition's title, is text and starts no stamp, and a line inside the markers that is not the
  table or its notes is left out and counted. When the body holds more than one such stamp, the
  last is read. The reader keeps only rows whose twelve cells each have their column's form and
  notes that are one of the sentences in the table above.
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
  decision (`decidedBy`). The archived rounds are the session's own files, so the round check
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
