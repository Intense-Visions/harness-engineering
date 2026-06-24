# Required Review (CI gate)

Make the harness multi-persona code review a **required check** on every PR, so it
is enforced mechanically instead of remembered. The gate runs `harness review-ci`,
which always runs a client-agnostic heuristic floor and — when you opt in with a
runner secret — a full LLM multi-persona review, then fails the check when the review
rejects the change.

This page is the adoption walkthrough. For the field-level reference (every runner's
secret, the exact `gh api` apply), see [`templates/ci/README.md`](../../templates/ci/README.md).

## 1. Inherit the template

`harness init` can render the `ci-required-review` template, which writes:

- `.github/workflows/required-review.yml` — the gate workflow (runs on `pull_request`).
- `required-review.ruleset.json` — the config-as-code binding that makes the check required.

The workflow diffs the PR's real base — `origin/<base-ref>...HEAD` resolved from the
runtime base branch, with `fetch-depth: 0` plus a base fetch — so it always reviews
the actual change set. (See `templates/ci/README.md` for the exact range expression.)

## 2. Pick a runner (and its secret)

The heuristic floor runs with no configuration. To enable the LLM multi-persona tier,
pass `--runner <client>` and set its secret:

| Runner        | Secret env                                       | Notes                                                                             |
| ------------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `claude`      | `ANTHROPIC_API_KEY`                              | verified                                                                          |
| `antigravity` | `GEMINI_API_KEY`                                 | current Gemini-family CLI (`agy`); unverified for CI                              |
| `codex`       | `OPENAI_API_KEY`                                 | verified                                                                          |
| `local`       | `HARNESS_LOCAL_ENDPOINT` + `HARNESS_LOCAL_MODEL` | **secret-free, cost-free** — single-pass review via an openai-compatible endpoint |

If the secret is absent, the gate **degrades gracefully to floor-only** — it never
breaks the workflow. `--block-on` (default `request-changes`) controls what fails the
check.

## 3. Promote to required (staged)

Wire it **non-blocking first** to bake it in, then promote:

1. Let the workflow run and report on PRs without enforcing it (this repo dogfoods
   this stage in `.github/workflows/required-review.yml`, with `continue-on-error`).
2. Once stable, apply the ruleset to make `required-review` a required status check:

   ```bash
   gh api repos/{owner}/{repo}/rulesets --input required-review.ruleset.json
   ```

The ruleset's check name and the workflow's job name are both `required-review`; keep
them identical.

See also: [[ci-review-contract]], [[tiered-review-degradation]],
[[required-check-binding]] in `docs/knowledge/core/`.
