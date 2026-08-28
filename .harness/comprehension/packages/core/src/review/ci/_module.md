---
schemaVersion: 1
module: 'packages/core/src/review/ci'
sourceHash: '6165f5f936212b48d2d7a91bff15c5ecafcec7b4ca3c9f96e9fffadc100480f4'
compiledAt: '2026-08-28T01:22:10.470Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'orchestrator.ts', 'runner-presets.ts', 'verdict-schema.ts']
---

## Summary

A two-tier CI review orchestrator that combines a required floor-only review pipeline with an optional secret-gated LLM tier (via agent-cli or endpoint runners). Phase 1 defines the CiReviewVerdict schema and runner-preset registry with parsers for Claude/Codex/Gemini/Antigravity/Local verdicts. Phase 2 orchestrates execution: spawns configured CLI runners (agent-cli presets) or invokes endpoints (local) via injected seams, enforces process safety (timeout/stdout-cap/stderr-bound), merges findings across tiers via maxAssessment, applies block-on thresholds to derive exit code, and validates all findings against integrity constraints (#984). Fail-closed: runner failure or overflow always rejects (never silent pass); assessment derivation mirrors buildCiReviewVerdict logic; requiredRunnerFailed forces exit 1 regardless of blockOn setting.

## Invariants

- CI_ASSESSMENTS index order is severity order — used by maxAssessment and deriveAssessment to rank findings deterministically.
- CiBlockOn threshold is either an assessment level or 'none' — must be applied consistently in applyThreshold to derive exit code.
- Runner timeout is SIGTERM-enforced (child.on('close') with code===null→reject) — prevents runCiReview from blocking forever on hung CLI.
- Stdout overflow kills child and rejects (classified requiredRunnerFailed) — never silent pass; manual byte-tracking enforced because execFile maxBuffer doesn't apply in streaming mode.
- Stderr is bounded to STDERR_CAP_BYTES; only STDERR_TAIL_BYTES surfaced in rejection Error — prevents chatty CLI from blowing memory while keeping rejections debuggable.
- requiredRunnerFailed forces exit 1 even when assessment<blockOn — runner failure is a gate blocker independent of threshold.
- All verdict parsers (parseClaudeVerdict, parseCodexVerdict, etc.) must return {findings, assessment} or throw; preset.verdictParser is the only sink for LLM output.
- RUNNER_PRESETS registry is the single source of truth for supported runners — isSupportedRunner checks preset.supported===true; unsupported runners skip gracefully (no failure).
- Finding integrity is applied to BOTH floor and LLM tier independently, then merged — enforceFindingIntegrity enforces schema (severity, file, line, summary), abstained reports no invariant examined (never read as clean gate).
- Two-tier assessment merging uses maxAssessment(floorAssessment, llmAssessment) — floor and LLM tier severities are combined, not averaged; higher severity always wins.
- Secret-gating is per-preset via env lookup (e.g. HARNESS_CLAUDE_API_KEY) — unsupported presets skip; configured presets that throw are requiredRunnerFailed.
- stdin to spawned runner is the unified-diff string from diff.fileDiffs — diffToStdin joins all file diffs; CLI receives diff via child.stdin?.end().

## Interface Contract

```ts
export AgentCliPreset
export AgentCliRunnerId
export CI_ASSESSMENTS
export CI_REVIEW_DOMAINS
export CI_REVIEW_VERDICT_SCHEMA_VERSION
export CI_RUNNERS
export CiBlockOn
export CiReviewResult
export CiReviewVerdict
export CiReviewVerdictParts
export CiReviewVerdictSchema
export CiRunner
export DEFAULT_EXEC_MAX_STDOUT_BYTES
export DEFAULT_EXEC_TIMEOUT_MS
export EndpointPreset
export EndpointRunnerId
export ExecFileLike
export HeadlessInvocation
export LocalEndpointInvoke
export RUNNER_PRESETS
export RunCiReviewOptions
export RunnerId
export RunnerPreset
export buildCiReviewVerdict
export defaultExecFile
export deriveBlockingFindings
export deriveExitCode
export isSupportedRunner
export parseAntigravityVerdict
export parseCiReviewVerdict
export parseClaudeVerdict
export parseCodexVerdict
export parseGeminiVerdict
export parseLocalVerdict
export presetKind
export runCiReview
```

## Dependency Slice

```
import { EnforceFindingIntegrityOptions, FindingIntegrityReport, enforceFindingIntegrity, formatIntegritySummary, mergeIntegrityReports } from '../finding-integrity'
import { runReviewPipeline } from '../pipeline-orchestrator'
import { ReviewFinding } from '../types'
import { DiffInfo, ReviewDomain } from '../types/context'
import { parseAntigravityVerdict } from './parsers/antigravity'
import { parseClaudeVerdict } from './parsers/claude'
import { parseCodexVerdict } from './parsers/codex'
import { parseLocalVerdict } from './parsers/local'
import { AgentCliPreset, EndpointPreset, LocalEndpointInvoke, RUNNER_PRESETS, RunnerId } from './runner-presets'
import { CI_ASSESSMENTS, CiReviewVerdict, buildCiReviewVerdict } from './verdict-schema'
import { nodeExecFile } from 'node:child_process'
import { z } from 'zod'
```
