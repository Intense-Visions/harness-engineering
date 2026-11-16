---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Add `harness ci attribute-failure` to attribute a PR's red check before you retry it (#1839). It reads the failing job's log and parses the failing test names. It then checks the same job's runs on unrelated PRs and on `main` within ±24h of the failure, and whether the failing test or its source is in the PR's diff. The verdict is `environmental` when the same test failed on at least two independent unrelated diffs or `main` and the PR does not touch it. It is `in-diff` when the PR touches the test or its source, and `inconclusive` otherwise. Every verdict reports its denominator. Expired job logs (`BlobNotFound`) make the command abstain with exit code 3 instead of guessing. The pure classifier (`attributeFailure`, `parseFailingTests`, `matchDiff`) is exported from `@harness-engineering/core`. The `pr-fleet` and `cicd-fleet` skills now say to correlate first and retry only when the verdict is inconclusive.
