---
type: business_concept
domain: core
tags: [review, ci, required-review, branch-protection, ruleset, config-as-code]
---

# Required-Check Binding

A workflow that _runs_ a review is not a _required_ review. A GitHub Actions job
reports a status check, but only branch protection / a repo ruleset makes that check
mandatory. Leaving that step manual is the "ships in pieces" gap the required-review
feature (#541) exists to close.

## Config-as-code ruleset

`templates/ci/required-review.ruleset.json` is a committed GitHub ruleset that binds
the gate as a required status check. The binding is config-as-code: auditable,
diffable, and re-appliable, rather than a one-off click in repo settings.

The contract that makes it work: the ruleset's `required_status_checks[].context`
MUST equal the workflow's job/check name — both are the literal `required-review`.
A test parses both files and asserts this parity, so they cannot silently drift.

## Apply and promotion

Applying the ruleset is an explicit, documented step (it needs a repo-admin token),
deferred to the adopter rather than run by the template:

```
gh api repos/{owner}/{repo}/rulesets --input required-review.ruleset.json
```

Promotion is staged (spec SC8): wire the check **non-blocking first** (run + report,
`continue-on-error`, no ruleset), then apply the ruleset to make it **required** once
it proves stable on real PRs. This repo's own `.github/workflows/required-review.yml`
dogfoods the non-blocking stage.

See also: [[ci-review-contract]], [[tiered-review-degradation]]. Adopter setup:
`templates/ci/README.md` and `docs/standard/required-review.md`.
