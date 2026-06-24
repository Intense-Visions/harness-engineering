---
number: 0041
title: CI review orchestration lives in tested core, not adopter YAML
date: 2026-06-24
status: accepted
tier: medium
source: docs/changes/required-review-ci/proposal.md
---

## Context

The required-review gate (#541) has to do real work per PR: run the heuristic floor,
optionally dispatch a secret-gated LLM runner, normalize heterogeneous client output
to `CiReviewVerdict` (ADR 0040), merge floor + LLM findings, apply a `block-on`
threshold, and emit an exit code. The question was _where that logic lives_.

The tempting place for "CI logic" is the GitHub Actions workflow YAML itself —
`run:` steps with shell, `jq`, and conditionals. But the load-bearing, error-prone
piece is verdict normalization across four heterogeneous CLIs, and YAML/bash is the
least testable, least patchable home for it: every adopter would carry a copy that
can't be unit-tested and can't be centrally fixed.

## Decision

All orchestration lives in tested TypeScript:

- The contract and `runCiReview(options)` orchestrator live in
  `packages/core/src/review/ci/`, with full unit coverage against real-captured
  fixtures (mocked process/endpoint seams — no real CLI spawned in tests).
- A thin `harness review-ci` CLI command (`packages/cli`) parses argv, resolves the
  diff, injects the `local` provider seam, and propagates the orchestrator's exit
  code. The command is the surface; the logic is in core.
- The adopter's workflow YAML is deliberately thin: it installs the CLI and calls
  `harness review-ci`. No normalization, threshold, or runner logic in YAML.

Process spawning (`agent-cli` runners) and the `local` endpoint call are **injected
seams** (`execFile`, `localInvoke`) defaulting to real implementations — so the
orchestrator is fully testable and `packages/core` never imports
`packages/intelligence` (the openai-compatible provider is wired at the CLI layer).

## Consequences

- The risky normalization/threshold/blocking logic is unit-tested and centrally
  upgradable — adopters bump the CLI version rather than re-rendering a workflow.
- The gate is CI-provider-agnostic by construction; GitHub Actions is just the first
  thin wrapper (template #540/#541).
- Child-process safety (timeout, output cap, stderr capture, fail-closed on a hung
  or oversized runner) is enforced once in core, not re-implemented per workflow.
- Cost: a CLI surface to maintain — accepted, since `review-ci` is the coherent home
  for the contract and other tooling can call it.

See also: ADR 0040 (the contract this orchestrator produces), [[ci-review-contract]],
[[tiered-review-degradation]].
