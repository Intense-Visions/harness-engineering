# `ci-pre-merge-brief` — opt-in senior pre-merge brief

This template wires the built-in `harness pre-merge-brief` command into a GitHub
Actions workflow that composes a single **senior-facing accountability brief**
and upserts it as a sticky comment on every pull request. It is an opt-in,
discoverable template (rendered by `harness init`); it is not part of any level
scaffold, and it is independent of the `ci-required-review` template — you can
adopt either, both, or neither.

## What it renders

| File                           | Purpose                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pre-merge-brief.yml`          | A `pull_request` workflow whose single job runs `harness review-ci` then `harness pre-merge-brief --comment`.   |
| `pre-merge-brief.ruleset.json` | A GitHub repository ruleset that marks the workflow's check as a required status check (for the eventual gate). |

## What the brief contains

The upserted comment (one sticky comment per PR, updated in place) assembles, in
order: a **diff summary**, the **review verdict**, a point-in-time **Signal
status** snapshot, the **outcome-eval** result, and a derived **"Worth your
eyes"** section (the union of blocking findings, warn/alert signals, unmet
outcome criteria, and flagged guardian diff-coverage records).

Every section degrades **independently**: a missing or unavailable input renders
an "unavailable / not configured" line rather than failing the job. The workflow
always exits 0 — the brief is informational; blocking a merge on the review
verdict is the `ci-required-review` template's job.

## The binding contract

The workflow job's `name:` is the literal string **`pre-merge-brief`**, and the
ruleset's `required_status_checks[].context` is the same literal
**`pre-merge-brief`**. GitHub matches required checks by this name. **Do not
rename one without the other** — if they drift, the ruleset will require a check
that never reports and every PR will be blocked indefinitely.

## Template variables

`harness init` renders `pre-merge-brief.yml.hbs` with three Handlebars variables.
The engine compiles in strict mode, so all three must be supplied:

| Variable     | Default           | Meaning                                                             |
| ------------ | ----------------- | ------------------------------------------------------------------- |
| `runner`     | `claude`          | Which review runner `review-ci` uses for the LLM tier of the brief. |
| `blockOn`    | `request-changes` | The `review-ci` block-on level (does not fail the brief job).       |
| `baseBranch` | _(required)_      | The PR base branch the workflow triggers on.                        |

> GitHub Actions `${{ ... }}` expressions in the template are emitted verbatim
> (escaped past Handlebars); only `runner`, `blockOn`, and `baseBranch` are
> substituted.

## Applying the ruleset (deferred — run once, by a repo admin)

The ruleset is **not** applied automatically by this template or by any CI. It
exists for the **eventual acknowledgment gate** — the point at which "the brief
was posted" (and, later, acknowledged) becomes a required merge condition. Until
you opt in, the workflow simply posts the brief and never blocks a merge.

After the workflow has run at least once on a PR (so the `pre-merge-brief` check
is known to GitHub), a repository admin applies the ruleset with the GitHub CLI:

```sh
gh api repos/{owner}/{repo}/rulesets --input pre-merge-brief.ruleset.json
```

Replace `{owner}/{repo}` with your repository. The ruleset targets the default
branch (`~DEFAULT_BRANCH`), which is the portable choice across forks and renames.

## Per-runner secrets

Set these as repository **Actions secrets**. The workflow exposes all of them as
environment variables; the runner you select reads the one it needs. The
heuristic floor of `review-ci` runs regardless; the LLM tier is secret-gated and
**degrades gracefully** (skips the LLM pass) when its secret is absent.

| `runner`                                    | Secret env var(s)                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `claude`                                    | `ANTHROPIC_API_KEY`                                                                                       |
| `antigravity` (and the superseded `gemini`) | `GEMINI_API_KEY` _(unverified for CI — selecting antigravity without a working secret yields floor-only)_ |
| `codex`                                     | `OPENAI_API_KEY`                                                                                          |
| `local`                                     | `HARNESS_LOCAL_ENDPOINT`, `HARNESS_LOCAL_MODEL` — **no API key; secret-free and cost-free**               |

The brief posts its sticky comment through the GitHub CLI using the built-in
`GITHUB_TOKEN` (exposed as `GH_TOKEN`); no additional secret is required for
comment posting.

## Notes

- The workflow diffs `origin/${{ github.base_ref }}...HEAD` (the PR's real base,
  resolved at runtime), with `fetch-depth: 0` and an explicit
  `git fetch origin ${{ github.base_ref }}` step so the base ref is reachable.
- The `review-ci` step is `continue-on-error: true`: a blocking verdict feeds the
  brief's review section but never fails the brief job. Pair this template with
  `ci-required-review` if you want the verdict to actually gate the merge.
- The **review-verdict section** is composed from the `review-ci --out` artifact
  handed to `pre-merge-brief --from`. If that artifact is unavailable the section
  renders "unavailable" and every other section still populates.
- The workflow installs `@harness-engineering/cli@latest`. Pin it to a specific
  released version in the rendered workflow once you have validated the brief, for
  reproducible CI runs.
