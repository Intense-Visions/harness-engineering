# Workflow Audit Session: Holiday Confidence Tracker

Status: resolved (remediation applied; scheduled workflow cannot be exercised from a PR)
Started: 2026-09-07
Skill: `harness-workflow-audit` (INVENTORY -> MECHANICAL -> JUDGMENT -> REPORT)
Workflow: `.github/workflows/holiday-confidence-track.yml`
Failing runs: `31372352672`, `32008807443`, `32704972836`, `33407509136`, `34128383695` — 5/5, never green

## Investigation Log

### Step 1 — Confirm the failure record, do not trust the issue

`gh run list --workflow=holiday-confidence-track.yml` returned five runs, all `conclusion: failure`,
first at `2026-08-10T08:57:06Z`. There is no successful run to regress from.

Issue #1965 attributes this workflow's failure to the `GH013` ruleset push rejection it shares with
`snapshot.yml`. The log contradicts that. From run `34128383695`:

```
track  Compute and record Holiday Confidence  No parseable KPI output; recording nothing (fail-soft).
track  Commit the trend ledger  fatal: pathspec '.harness/metrics/holiday-confidence.jsonl' did not match any files
track  Commit the trend ledger  ##[error]Process completed with exit code 128.
```

`git add` is two lines before `git push`. The job has never reached its own push. `GH013` is real
but latent — it is the third layer, not the first.

### Step 2 — Resolve the ignore claim against the real tree

```
$ git ls-files '.harness/metrics/*'
(empty)
$ git check-ignore -v .harness/metrics/holiday-confidence.jsonl
.harness/.gitignore:46:metrics/	.harness/metrics/holiday-confidence.jsonl
```

The ledger has never been tracked, and could not be. Blame told the more interesting half:

- `0563679fd` (#1131, the PR that _created_ this workflow) replaced `metrics/` with the correct
  `metrics/*` + `!metrics/holiday-confidence.jsonl` pair. The author got it right.
- `9e2b9b46d` _"docs(roadmap): register 4 deepseek-harness adoption candidates"_ — an unrelated docs
  commit — re-added a bare `metrics/` at line 46.

A trailing-slash directory ignore stops git descending into the directory, so the earlier negation
became unreachable. The un-ignore was switched off by a docs commit, invisibly, because the workflow
was already red one defect earlier.

### Step 3 — Ask why the KPI abstained

This is where the audit left the item brief. `No parseable KPI output` was treated by the brief (and
by the workflow's own header) as an honest abstain. It is not. Run the built CLI:

```
$ node packages/cli/dist/bin/harness.js holiday-confidence --json
i Holiday Confidence: n/a (ERROR)
i Window: last 30 days · 0/0 merged PRs confident
  (a) multi-persona review fired : 0/0
  ...
```

`--json` produced pretty text. `--help` lists the flag, and the compiled chunk contains
`if (opts.json)`, so the option is registered and read. Probing commander's stores directly:

```
["holiday-confidence","--json"]                => subOpts: {}             progOpts: {"json":true}
["holiday-confidence","--window","7"]          => subOpts: {"window":"7"} progOpts: {}
["holiday-confidence","--window","7","--json"] => subOpts: {"window":"7"} progOpts: {"json":true}
["holiday-confidence","--json","--window","7"] => subOpts: {"window":"7"} progOpts: {"json":true}
```

`--window` lands on the subcommand; `--json` lands on the program. The root program declares its own
`--json` at `packages/cli/src/index.ts:76`, and commander binds a repeated flag to the first
declarer. `opts.json` in the action is therefore always `undefined`.

So the abstain was never honest. Even with the `git add` guard and the gitignore fixed and the push
landing, this workflow would have recorded nothing on every run forever — green, and empty. That is
the audit skill's Iron Law failure verbatim: _a gate that never fires manufactures false confidence._

### Step 4 — Check whether the CLI defect is local

```
insights  => subOpts.json: undefined   progOpts.json: true
adoption  => subOpts.json: undefined   progOpts.json: true
verify    => subOpts.json: undefined   progOpts.json: true
```

36 command files declare `--json`. The shadowing is systemic. Fixing all of them is a different
change with a different test burden; this lane fixes the one command its workflow depends on and
reports the rest.

## Hypotheses

- **H1 — confirmed.** `git add` on a missing pathspec under `bash -e` exits 128, making the
  documented abstain path unreachable. Simulated all three branches of the commit step in a scratch
  repo: pre-fix abstain -> `exit 128`; post-fix abstain -> clean `exit 0`.
- **H2 — confirmed.** A later bare `metrics/` defeats an earlier negation regardless of ordering,
  because git never descends into an ignored directory. Removing line 46 makes the ledger stageable
  while `adoption.jsonl` stays ignored.
- **H3 — inferred, not observed.** The bare `git push` would hit `GH013`. Cannot be observed for
  this workflow because it has never reached the push; inferred from `snapshot.yml`'s identical push
  to the same protected branch. The fallback is written so a _successful_ direct push short-circuits
  before the PR path.
- **H4 — confirmed by experiment.** Commander flag shadowing makes `--json` a no-op. Confirmed by
  the probe above and pinned by a regression test that fails when the fix is reverted.

## Resolution

Four stacked defects fixed; one systemic finding reported and deliberately not fixed. Full trace,
patches, forks, and assumptions in
`plans/2026-09-07-holiday-confidence-ledger-commitback-plan.md`.

The scheduled workflow cannot run from a PR (`on:` is `schedule` + `workflow_dispatch` only), so
this PR's CI validates the CLI change and the repo gates, not the workflow execution. The workflow
itself is verified by YAML parse, `bash -n` on every `run:`, `node --check` on the embedded script,
and a scratch-repo simulation of all three commit-step branches. First live proof is the next Monday
run or a manual `workflow_dispatch` after merge.
