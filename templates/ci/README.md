# `ci-required-review` — opt-in required-review gate

This template wires the built-in `harness review-ci` command into a GitHub
Actions check that branch protection can mark as **required**. It is an opt-in,
discoverable template (rendered by `harness init`); it is not part of any level
scaffold.

## What it renders

| File                           | Purpose                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `required-review.yml`          | A `pull_request` workflow whose single job runs `harness review-ci` as the gate.        |
| `required-review.ruleset.json` | A GitHub repository ruleset that marks the workflow's check as a required status check. |

### The binding contract

The workflow job's `name:` is the literal string **`required-review`**, and the
ruleset's `required_status_checks[].context` is the same literal
**`required-review`**. GitHub matches required checks by this name. **Do not
rename one without the other** — if they drift, the ruleset will require a check
that never reports and every PR will be blocked indefinitely.

## Template variables

`harness init` renders `required-review.yml.hbs` with three Handlebars variables.
The engine compiles in strict mode, so all three must be supplied:

| Variable     | Default           | Meaning                                                 |
| ------------ | ----------------- | ------------------------------------------------------- |
| `runner`     | `claude`          | Which review runner `review-ci` uses for the LLM tier.  |
| `blockOn`    | `request-changes` | The assessment level at which the gate fails the check. |
| `baseBranch` | _(required)_      | The PR base branch the workflow triggers on.            |

> GitHub Actions `${{ ... }}` expressions in the template are emitted verbatim
> (escaped past Handlebars); only `runner`, `blockOn`, and `baseBranch` are
> substituted.

## Applying the ruleset (deferred — run once, by a repo admin)

The ruleset is **not** applied automatically by this template or by any CI.
After the workflow has run at least once on a PR (so the `required-review` check
is known to GitHub), a repository admin applies the ruleset with the GitHub CLI:

```sh
gh api repos/{owner}/{repo}/rulesets --input required-review.ruleset.json
```

Replace `{owner}/{repo}` with your repository. The ruleset targets the default
branch (`~DEFAULT_BRANCH`), which is the portable choice across forks and renames.
`strict_required_status_checks_policy: true` requires branches to be up to date
before merging.

## Per-runner secrets

Set these as repository **Actions secrets**. The workflow exposes all of them as
environment variables; the runner you select reads the one it needs. The
heuristic floor of `review-ci` runs regardless and can block on its own; the LLM
tier is secret-gated and **degrades gracefully** (skips the LLM pass) when its
secret is absent.

| `runner`                                    | Secret env var(s)                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `claude`                                    | `ANTHROPIC_API_KEY`                                                                                       |
| `antigravity` (and the superseded `gemini`) | `GEMINI_API_KEY` _(unverified for CI — selecting antigravity without a working secret yields floor-only)_ |
| `codex`                                     | `OPENAI_API_KEY`                                                                                          |
| `local`                                     | `HARNESS_LOCAL_ENDPOINT`, `HARNESS_LOCAL_MODEL` — **no API key; secret-free and cost-free**               |

The `local` runner points at your own OpenAI-compatible endpoint, so it needs no
API-key secret and incurs no per-call cost.

## Notes

- `--comment` (PR-review posting) is **not** rendered into the workflow today: it
  is a non-functional stub in the published CLI (it logs a "not wired" warning and
  posts nothing), and including it invited an over-broad `pull-requests: write`
  permission. The flag still exists on the CLI for when PR posting lands; the
  rendered run step will re-add `--comment` (and the workflow will re-add
  `pull-requests: write`) once posting is actually implemented. The check gates on
  the command's exit code, so the required check works without it.
- The rendered workflow diffs `origin/${{ github.base_ref }}...HEAD` (the PR's
  real base, resolved at runtime), with `fetch-depth: 0` and an explicit
  `git fetch origin ${{ github.base_ref }}` step so the base ref is reachable.
  This avoids `review-ci`'s `origin/HEAD` fallback silently reviewing the wrong
  (or empty) diff when the PR base is not `main`.
- The workflow pins `@harness-engineering/cli@2.8.0` for reproducibility; bump
  the pin in the rendered workflow to adopt newer releases.
