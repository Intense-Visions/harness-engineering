---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

feat(review-ci): multi-client required-review CI gate (#541)

Adds `harness review-ci` and its contract. Core gains a versioned `CiReviewVerdict`
schema, a two-kind runner-preset registry (`agent-cli` + `endpoint`), per-runner
verdict parsers, and the `runCiReview` orchestrator — a tiered gate (client-agnostic
heuristic floor always runs; a secret-gated LLM multi-persona tier runs per runner
and degrades gracefully) with an anti-theatre `block-on` threshold where a required
runner that fails to execute blocks even under `block-on none`. The CLI gains the
`harness review-ci` command wiring it, including the local openai-compatible adapter.

Runners verified against the real CLIs: claude, codex, antigravity (`agy`). `gemini`
is superseded by antigravity; `cursor`, `local` live verification, and the
full-agentic-local path are deferred. Adopter templates ship under `templates/ci/`
(workflow + config-as-code ruleset). See docs/changes/required-review-ci/proposal.md.
