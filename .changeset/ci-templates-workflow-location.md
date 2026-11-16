---
'@harness-engineering/cli': patch
---

`harness init -t ci-required-review` / `-t ci-pre-merge-brief` now render their GitHub Actions workflow into `.github/workflows/` (`harness-required-review.yml` / `harness-pre-merge-brief.yml`) instead of the repo root, where GitHub never ran it. The template's setup notes go to `.github/harness/<template>.md` instead of becoming the project `README.md`. These add-on templates are now also written into an existing project (previously nothing was written there), and `harness init` reports every existing file it kept rather than skipping it silently. The distinct workflow names never overwrite the `load-bearing-minimum` level's `.github/workflows/required-review.yml`.
