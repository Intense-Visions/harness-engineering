---
schemaVersion: 1
module: 'packages/core/tests/review/ci'
sourceHash: '2dbe5029e20d01c23b12798ff9ffa04c6aa3ffaddc9c6d0b3e87dde6df5b789c'
compiledAt: '2026-08-28T01:22:10.907Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'default-exec-file.test.ts',
    'orchestrator.test.ts',
    'parsers.test.ts',
    'runner-presets.test.ts',
    'verdict-schema.test.ts',
  ]
---

## Summary

The `packages/core/tests/review/ci` module tests the CI review orchestration layer that gates code changes with a two-tier pipeline: a fast floor-level (mechanical) review, optionally followed by an LLM-based review. The module comprises five test files covering child-process safety, orchestration logic, verdict parsing from five runner backends (Claude, Codex, Antigravity, Gemini, local), runner registry shape, and verdict schema validation. Critical concerns: floor reviews can short-circuit the LLM tier via mechanical stops or skips; the diff is piped via STDIN (not files); missing secrets gracefully skip the LLM tier without throwing; and unsupported runners fail gracefully rather than silently.

## Invariants

- Floor always runs; LLM is optional and secret-gated — mechanical reviews execute regardless; LLM tier only runs if the required secret (ANTHROPIC_API_KEY, etc.) is present in env.
- Mechanical stops short-circuit LLM tier — if the floor returns stoppedByMechanical: true, the LLM tier is skipped and ranLlmTier is false.
- Skipped floors fail closed — skipped: true from the floor produces exitCode: 1, not green; the CI orchestrator owns no PR eligibility semantics and relies on the floor to reject ineligible PRs.
- All child-process failures reject, triggering requiredRunnerFailed — timeout, output cap exceeded, non-zero exit, and signal kills all reject the seam's promise; never silently succeed.
- Diff is piped to STDIN, not passed as a file argument — all runner invocations receive the serialized diff via stdin, with no --input-file or --file flag leaking into argv.
- Missing secrets gracefully skip LLM tier — absence of the required env var produces llmSkipReason set and ranLlmTier: false; no exception thrown.
- Unsupported runners gracefully skip — requests for unsupported runners (cursor, gemini) produce skip-with-reason, not an error; verdict runner reverts to floor-only.
- Verdict parsers handle distinct output formats — Claude emits a transcript envelope with .result as a JSON string; Codex produces JSONL event stream; Antigravity emits plain JSON (possibly fenced); each parser is tolerant of variations (fenced blocks, trailing prose, JSONL noise).
- Supported runners are: claude, codex, antigravity, local — verified via isSupportedRunner(); gemini is superseded by antigravity; cursor is a placeholder awaiting implementation.
- Floor and LLM findings merge into a single findings array — final verdict includes all findings from both tiers; blocking (critical-severity) findings are mirrored in blockingFindings.
- Critical severity findings block — severity: 'critical' findings in blockingFindings trigger assessment: 'request-changes' and exitCode: 1.
- Schema version is locked to 1 — any other schemaVersion value is rejected; versioning is a hard constraint on verdict shape compatibility.
- CI_RUNNERS enum is the single source of truth — the runner registry (claude, gemini, antigravity, codex, cursor, local, floor-only) is the authoritative enum; unsupported runners must still appear in the enum with supported: false and an unsupportedReason.
- Local endpoint runner requires inject — the local preset's LocalEndpointInvoke must be supplied; absence of it gracefully skips with 'local endpoint not configured' reason.

## Interface Contract

```ts

```

## Dependency Slice

```
import { ExecFileLike, defaultExecFile, runCiReview } from '../../../src/review/ci/orchestrator'
import { parseAntigravityVerdict } from '../../../src/review/ci/parsers/antigravity'
import { parseClaudeVerdict } from '../../../src/review/ci/parsers/claude'
import { parseCodexVerdict } from '../../../src/review/ci/parsers/codex'
import { parseGeminiVerdict } from '../../../src/review/ci/parsers/gemini'
import { parseLocalVerdict } from '../../../src/review/ci/parsers/local'
import { LocalEndpointInvoke, RUNNER_PRESETS, isSupportedRunner, presetKind } from '../../../src/review/ci/runner-presets'
import { CI_REVIEW_DOMAINS, CI_REVIEW_VERDICT_SCHEMA_VERSION, CI_RUNNERS, CiReviewVerdictSchema, parseCiReviewVerdict } from '../../../src/review/ci/verdict-schema'
import { ReviewFinding } from '../../../src/review/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execPath } from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
