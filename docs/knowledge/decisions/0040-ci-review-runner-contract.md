---
number: 0040
title: CI review runner contract (CiReviewVerdict + two-kind preset registry)
date: 2026-06-24
status: accepted
tier: medium
source: docs/changes/required-review-ci/proposal.md
---

## Context

The required-review CI gate (#541) must run "the multi-persona review" on every PR
across heterogeneous agent clients — Claude, Antigravity (`agy`, the current
Gemini-family CLI), Codex, Cursor — plus a secret-free local model. Each client has
a different headless invocation and emits a different output envelope:

- `claude -p --output-format json` → a transcript envelope with the verdict as a
  JSON string in `.result` (two-stage parse).
- `codex exec --json` → a JSONL event stream; the verdict is in the last
  `item.completed`/`agent_message.text` (two-stage parse).
- `agy --print` → the verdict as plain-text JSON directly (single-stage).
- `local` → a single LLM-judgment pass over an openai-compatible endpoint
  (no agent harness).

Without a normalization boundary, every consumer of a review result (the gate, the
threshold, the dogfood workflow, future tooling) would have to special-case each
client's shape — and the brittle, error-prone part (parsing real CLI output) would
be smeared across the codebase. The Phase 1 Task-10 smoke test proved the danger
empirically: every initial argv/parser guess was wrong against the real CLIs.

## Decision

Define a single normalized contract that all runners map to:

- **`CiReviewVerdict`** (Zod, versioned `schemaVersion: 1`) — `runner`, `ranLlmTier`,
  `assessment` (`approve`/`comment`/`request-changes`), `findings` (reusing core
  `ReviewFinding`), `blockingFindings`, `exitCode`, `skipped`/`skipReason`. A
  `superRefine` enforces `blockingFindings ⊆ findings`, all-critical, and
  assessment/exitCode consistency, so the verdict is trustworthy regardless of which
  (possibly model-authored) producer created it.
- **A two-kind preset registry** discriminated on `kind`:
  - `agent-cli` — `{ secretEnvVar, headlessInvocation, verdictParser, supported }`
    (claude, codex, antigravity, cursor).
  - `endpoint` — `{ endpointEnvVar, modelEnvVar, invoke, verdictParser, supported }`
    (local), where `invoke` is an injected seam (the openai-compatible provider lives
    in `packages/intelligence`, which `packages/core` must not import — see ADR 0041
    and the layer rules).

Both kinds expose a `verdictParser` and normalize to the same `CiReviewVerdict`, so
the gate/threshold logic never branches on kind or client. Adding a runner is one
registry entry plus tests — no template or orchestrator change.

A runner ships `supported: true` only once verified against the real CLI; unverified
or unavailable clients ship `supported: false` with a reason (cursor, and gemini
which is superseded by antigravity per ADR-context D8). No silently-broken preset
ships.

## Consequences

- The merge-blocking decision is computed from schema-validated findings, not raw
  client output — closing the trust boundary for model-authored verdicts (esp. the
  `local` runner).
- New clients are cheap and uniform; the contract is the stable interface other
  tooling (the CI workflow template #540, autopilot) binds to.
- Per-client envelope quirks are isolated in one parser each, with real-captured
  fixtures as the regression guard.
- Related: D7 (local dual-mode runner) and D8 (antigravity supersedes gemini) extend
  this registry without changing the contract.

See also: [[code-review-pipeline]] (the heuristic floor this contract wraps),
ADR 0041 (orchestration-in-core).
