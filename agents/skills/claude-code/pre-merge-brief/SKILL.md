# Pre-Merge Brief

> The harness pointed at the human who clicks merge. A thin wrapper over `harness pre-merge-brief` that composes a senior-facing accountability brief — the diff summary, the multi-persona review verdict (from `review-ci --json`), the **Review provenance** stamp as the PR body states it, the curated **Signal status** snapshot, the outcome-eval result, the Guardian diff-coverage analysis, and a derived **"👀 Worth your eyes"** section — and posts it as a single sticky PR comment (upsert by marker). All composition and degradation logic lives in the command; this skill orchestrates invocation, reports which sections degraded, and hands off. Advisory and non-blocking: the brief never flips the review gate.

## When to Use

- On every PR, so the senior engineer who merges sees "you are pushing this — here's what deserves your eyes" before they click merge.
- `on_pr` (dogfooded via the `required-review` workflow, reusing that run's `review-ci --json` artifact) and `manual` (a senior running it locally against the current branch's PR).
- NOT as a merge gate — the acknowledgment gate is deliberately deferred (spec D3). The brief is advisory; the review gate's exit code is what blocks.
- NOT a replacement for `review-ci` — this skill CONSUMES the review verdict, it does not re-run the review (spec D1).
- NOT for recomputing signals a different way — signals come from `@harness-engineering/signals` via the command (spec D2/D6).

## Process

### Phase 1: GATHER — Resolve inputs

1. Locate the `review-ci --json` artifact for this run and record its path for `--from`. In CI it is the JSON the `required-review` workflow's `review-ci` step wrote (e.g. `/tmp/review.json`); locally, run `harness review-ci --json <path>` first if a verdict is wanted. Absent `--from` is tolerated — the review section degrades to "unavailable".
2. Resolve the diff range for `--diff` (default `origin/<base>...HEAD` via the command's own resolver). Override only when the base is non-standard.
3. Resolve the head sha for `--head` (default `git rev-parse HEAD`) — used for the `execution_outcome` graph lookup. Pre-merge the node is commonly absent, which is the documented degradation path, not an error.
4. If posting (`--comment`), confirm `gh` is authenticated. Delivery failure never crashes the command (spec S1): it prints the brief and warns, still exiting 0.

### Phase 2: COMPOSE — Run the command

Invoke `harness pre-merge-brief` with the resolved inputs:

```bash
harness pre-merge-brief --from <review.json> --diff <range> --head <sha> [--pr <number>] [--comment]
```

The command builds the seven-section brief (marker + header, then Diff summary → Review verdict → **Review provenance** → **Signal status** → Outcome evaluation → Guardian diff-coverage → **👀 Worth your eyes**) and, with `--comment`, upserts the sticky PR comment by its marker (`<!-- harness:pre-merge-brief -->`; the review verdict's finding lists and the 🛑 bullets show 50 items and then `+N more`, and a brief still longer than 60,000 characters is cut at a line end, section by section, and says how many characters are not shown and which sections lost text, so it always fits a GitHub comment; the Review provenance section is never cut, and "Worth your eyes" only after every other section) — patching the existing comment in place rather than posting a new one on each push. Without `--comment` it prints the brief to stdout. Each input degrades independently to an explicit "unavailable" line; the command exits 0 on a successful render regardless of which inputs were present.

The **Review provenance** section shows the stamp `harness-autopilot` placed in the PR body. The command reads the body of the PR `--pr` names (else the PR number in `GITHUB_REF`, else the current branch's PR) and always opens the section with the line `_As stated in the PR body by its author; not verified by CI (review receipts are machine-local)._`: the PR author writes the body, and CI has no receipts to check it against. The reader (`parseProvenanceStamp`) is best effort and does not render the page. It recognises a stamp only when a marker pair on lines of their own opens with the heading `### Review provenance` outside HTML comments, code blocks and raw HTML blocks, and shows only lines the renderer could have written: a table row whose twelve cells each have their column's form, and a note that is one of the renderer's fixed sentences, none indented four or more columns. The rest are counted (`N line(s) between the stamp markers are not stamp lines and are not shown.`), and a stamp over the size bounds (50 rows, 20 notes, 4000 characters a line, 30,000 in all) says so (`N line(s) of the stamp are over its size bounds and are not shown.`). A body the reader does not read shows a state of its own, never `no pipeline review recorded` and never a pass: `conflicting` (it shows two or more stamps, and none is read), `too-large` (it is longer than 262144 characters) and `ambiguous` with its reason (`details-element`, `comment-opener`, `html-block` or `container`: before the last marker it holds a construct the reader knows may hide part of the page, so nothing is read). A stamp that was found but none of whose lines could be read (a stamp from another harness version, say) reads `A stamp was found but none of its lines could be read (N dropped); it may come from another harness version.`, which is not `no pipeline review recorded` either. Under the table the section says whether the stamp covers the PR head (`stampCoverage`): it compares the PR head with the head the `final-all` row reviewed (its Diff cell), whatever that row's Gate cell says (pass, `FAIL: … (overridden)` or `FAIL: …`). At the PR head, with no `+N commits not reviewed`, it reads `The PR head is <sha>, the commit this stamp's final review is at (gate: <gate>).`; otherwise `The PR head is <sha>; this stamp's final review is at <sha> (gate: <gate>). Commits after <sha> are not covered.`, so a stamp left behind by later pushes does not read as current, overridden or not. A stamp with no `final-all` row states no final review of the PR (it names the commits its other rows passed at), and one with two or more is compared with nothing. When the PR head could not be read, the section says the stamp is not compared with it. A body with no stamp, or with the renderer's own no-review stamp, reads `no pipeline review recorded`. A body that could not be read (`gh` failed, or replied with something that is not a pull request) reads `unavailable / not configured`, which is a different statement: it does not say no review ran. The brief reads the PR's body, head and comments in one `gh pr view`, and the poster reuses those comments.

### Phase 3: REPORT — Surface what matters

1. Report which sections rendered with real data and which degraded to "unavailable / not yet evaluated", so the senior knows the brief's coverage.
2. Surface the **"👀 Worth your eyes"** items verbatim — the union of blocking review findings, signals in `warn`/`alert`, and unmet outcome criteria. This is the section the accountable human should read first.

### Phase 4: HANDOFF — Advisory transition

Emit the transition via `emit_interaction`. The brief is advisory and non-blocking: it never flips the review gate's pass/fail status (spec D3, D4). In the dogfood workflow the brief step is `continue-on-error`, so a brief failure never fails the PR.

## Harness Integration

- **`harness pre-merge-brief`** — the command this skill wraps. Flags: `--from <path>` (review-ci verdict JSON), `--pr <number>` (the PR to read and comment on; default: the number in `GITHUB_REF`, else the current branch's PR; digits only, so `#12`, `0` or `007` exits 1 with `--pr must be a pull request number (digits only)` and nothing is read or posted, a number past 9007199254740991 (the largest integer JavaScript holds exactly) exits 1 too rather than naming another PR, and a `GITHUB_REF` under `refs/pull/` that is not `refs/pull/<number>/merge` or `/head` is an error too), `--comment` (sticky-upsert to that PR via `gh`), `--diff <range>`, `--head <sha>`. Pure render (`buildBriefBody`) + injected seams (`postBrief`, `RunGit`, graph store); no `process.exit` in the pure core.
- **`review-ci`** — upstream producer of the review verdict. This skill reuses its `--json` artifact via `--from`; it never re-runs the review (D1). `review-ci` remains the single source of review truth.
- **`@harness-engineering/signals`** — the shared leaf package (extracted in spec Phase 1/D6) providing `gatherSignals`. The command computes the Signal status snapshot from it; the CLI does not route signal computation through the dashboard app.
- **`execution_outcome` graph nodes** — the outcome-eval result, looked up by head sha from `.harness/graph`; commonly absent pre-merge (degrades to "not yet evaluated").
- **`required-review.yml` (dogfood)** — the `on_pr` delivery path: a `continue-on-error` step runs the brief after the existing `review-ci` run, reusing its artifact (spec Phase 4/D4). Adopter template graduation is a tracked follow-up (D5).

## Gates

- **Never re-run the review.** Consume `review-ci --json`; do not invoke the review pipeline from this skill (D1).
- **Never block the merge.** The brief is advisory; the review gate's exit code is authoritative. No acknowledgment gate in v1 (D3).
- **Never crash `--comment`.** A `gh`/PR delivery failure prints the brief and warns, still exiting 0 (S1).
- **Thin wrapper only.** No brief composition, signal computation, or union logic in the skill — all of it lives in the command.

## Success Criteria

Maps to spec `docs/changes/senior-accountability-surface/proposal.md`. This skill satisfies criterion #2 (the skill wrapping the command, `on_pr` + `manual`) and supports #1/#3/#4 by driving the command whose pure functions are unit-tested. Introduces no new `harness validate` findings.

## Rationalizations to Reject

These are common rationalizations that sound reasonable but lead to incorrect results. When you catch yourself thinking any of these, stop and follow the documented process instead.

| Rationalization                                                                                                      | Why It Is Wrong                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The `review-ci --json` artifact is missing, so I'll re-run the review pipeline myself to fill the verdict section." | This skill CONSUMES the review verdict via `--from`; it never re-runs the review. `review-ci` is the single source of review truth. Absent `--from`, the review section degrades to "unavailable" — that is the correct outcome, not a reason to re-run.                      |
| "The outcome section says 'not yet evaluated', so I'll write in a plausible verdict so the brief looks complete."    | Each input degrades independently to an explicit "unavailable / not yet evaluated" line. Pre-merge the `execution_outcome` node is commonly absent by design. Fabricating a section defeats the accountability the brief exists to provide — report the degradation honestly. |
| "`gh` posting failed, so I'll exit non-zero so CI notices."                                                          | Delivery must fail soft: print the brief, warn on one line, and exit 0 (S1). The brief step is `continue-on-error` and must never fail the PR or flip the review gate.                                                                                                        |
| "A senior asked for the brief to block merges, so I'll add an acknowledgment gate."                                  | The acknowledgment gate is deliberately deferred (D3). The brief is advisory; the review gate's exit code is authoritative. Keep it non-blocking and point them at the follow-up.                                                                                             |
| "I'll compute the signal snapshot inline here — it's cleaner than routing through the command."                      | Thin wrapper only: all composition, signal computation (from `@harness-engineering/signals`), and the "Worth your eyes" union logic live in the command. The skill orchestrates invocation and reports coverage — it recomputes nothing.                                      |

## Escalation

- **No PR for the current branch (`--comment`).** The command warns and prints the brief to stdout instead of posting, still exiting 0. Surface the warning; do not treat it as a failure.
- **No review artifact (`--from` missing/absent).** The review-verdict section degrades to "unavailable". If a verdict is wanted, run `harness review-ci --json <path>` first and pass it.
- **`gh` unauthenticated or API error while posting.** Delivery fails soft (brief printed, one-line stderr warning, exit 0). Fix `gh auth` and re-run; nothing is lost.
- **Signals or outcome-eval unavailable.** Each degrades independently to its "unavailable"/"not yet evaluated" line — expected pre-merge, not an error. Do not block the brief on them.
- **Someone asks to make the brief block merges.** That is the deferred acknowledgment gate (spec D3), a separate future spec. Keep the brief advisory; point them at the follow-up roadmap row.

## Examples

### Example: brief on a PR in CI (dogfood)

The `required-review.yml` workflow runs `review-ci --json /tmp/review.json`, then this skill's command:

```bash
harness pre-merge-brief --from /tmp/review.json --diff "origin/main...HEAD" --comment
```

The brief is composed and upserted as a sticky PR comment. The review found one blocking finding and two `alert` signals, so **👀 Worth your eyes** lists exactly those three; the outcome section shows "not yet evaluated" (no `execution_outcome` node pre-merge). The step is `continue-on-error`, so even if `gh` posting fails the review gate is unaffected.

### Example: senior running it locally

```bash
harness pre-merge-brief --comment
```

No `--from`, so the review-verdict section renders "unavailable"; signals are gathered live and the diff summary uses the default `origin/<base>...HEAD` range. The senior sees the current signal status and diff before clicking merge.
