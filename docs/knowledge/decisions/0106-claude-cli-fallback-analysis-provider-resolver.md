---
number: 0106
title: claude-CLI fallback in the analysis-provider resolver
date: 2026-08-27
status: accepted
tier: medium
source: docs/changes/compiled-comprehension-substrate/proposal.md
---

## Context

The MCP-side `resolveAnalysisProvider` (`packages/cli/src/mcp/utils/analysis-provider.ts`)
is the shared resolver for the LLM-judgment tools `acceptance_eval` / `outcome_eval`,
and — as of the compiled-comprehension-substrate work — the backend for
comprehension's `generateSemantic`. Until now it resolved a provider by env
precedence only: `ANTHROPIC_API_KEY` (Anthropic) → `HARNESS_ANALYSIS_BASE_URL`
(local OpenAI-compatible `/v1`) → `null`. A Claude **subscription** user with no
`ANTHROPIC_API_KEY` and no local `/v1` endpoint therefore fell through to `null`,
so the eval tools degraded to an inert/advisory verdict and comprehension had no
semantic backend — even though a fully usable `claude`-CLI backend
(`ClaudeCliAnalysisProvider`, subscription auth, no API key) exists in
`@harness-engineering/intelligence` and is already used elsewhere.

This is the MCP env-precedence resolver, which is a distinct shape from the
orchestrator's `buildAnalysisProvider`, a **type-dispatched** selector keyed off a
configured provider name rather than an ordered precedence chain. The two are not
merged here: this decision is a strictly-additive extension of the env-precedence
resolver only, leaving the orchestrator selector untouched.

## Decision

Append a `claude`-CLI step **last** to the precedence chain:

> Anthropic key → local `/v1` → `claude`-CLI subscription (no API key) → null

Detection is via an injectable, Windows-safe `isClaudeCliAvailable()` helper
(scans `PATH`/`Path` with the platform-correct delimiter and, on win32, each
`PATHEXT` extension; `env`/`fileExists`/`platform` are all injectable so tests are
deterministic on any host and never depend on the CI machine having `claude`
installed). The `claude`-CLI provider is constructed only when a `claude`
executable is resolvable on `PATH`; otherwise the step yields `null` and the chain
terminates at `null` exactly as before.

Append-last is deliberate: it preserves the fully-local-first ordering
([[fully-local-cannot-be-autopilot]]) — an Anthropic key or a configured local
endpoint still wins — and only fills the previously-`null` gap.

## Consequences

- **Every environment that resolved a provider before resolves the SAME one after.**
  Anthropic-key → Anthropic; local `/v1` (no key) → OpenAI-compatible; both set →
  Anthropic (backward compatible); blank/whitespace base-url + no key + no claude →
  `null`. This is proven by the append-last precedence test
  (`packages/cli/tests/mcp/utils/analysis-provider.test.ts`).
- **The one changed environment** is "no key + no local endpoint + `claude` on
  PATH": it previously degraded to `null` (advisory stub / static-only) and now
  resolves a real `ClaudeCliAnalysisProvider`. So `acceptance_eval` /
  `outcome_eval` degradation improves for subscription users, and comprehension's
  "no API token" path becomes a real semantic backend for them (closing SC5's
  subscription gap).
- Nested `claude --print` calls draw on the interactive subscription pool. This is
  bounded by the `generateSemantic` adapter's cost levers (input bounding, tight
  `maxTokens`, `disableThinking`, and a per-run token budget) and its reentrancy
  guard (`HARNESS_COMPREHENSION_ACTIVE`), so a comprehend-triggered nested `claude`
  cannot re-trigger comprehension.
- No environment loses a provider and no existing step is reordered or removed; the
  change is purely additive at the tail of the chain.
