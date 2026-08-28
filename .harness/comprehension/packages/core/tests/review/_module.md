---
schemaVersion: 1
module: 'packages/core/tests/review'
sourceHash: '1d9c9a7acca9371f2ad9e5a193ac62f06dc71b4511c0742e3e502338e6f12783'
compiledAt: '2026-08-28T01:22:10.967Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'change-type.test.ts',
    'context-scoper.test.ts',
    'dedup-confidence-tiebreaker.test.ts',
    'deduplicate-findings.test.ts',
    'depth-calibrator.test.ts',
    'eligibility-gate.test.ts',
    'evidence-gate.test.ts',
    'exclusion-set.test.ts',
    'fan-out-conditional.test.ts',
    'fan-out.test.ts',
    'finding-integrity-seam.test.ts',
    'finding-integrity.test.ts',
    'guardian-coverage.test.ts',
    'harness-ignore-suppression.test.ts',
    'learnings-agent.test.ts',
    'mechanical-checks-parallel.test.ts',
    'mechanical-checks.test.ts',
    'meta-judge.test.ts',
    'model-tier-resolver.test.ts',
    'parallel-groups.test.ts',
    'pipeline-orchestrator.test.ts',
    'trust-score.test.ts',
    'two-stage.test.ts',
    'validate-findings.test.ts',
  ]
---

## Summary

**packages/core/tests/review** tests the code-review orchestration pipeline that classifies code changes, gathers domain-specific context into 5 parallel review tracks (architecture, security, bug, compliance, learnings), runs mechanical checks, dispatches to parallel domain agents, validates findings against evidence and integrity rules, and enforces eligibility gates. The flow: classify change → scope context into 5 bundles → mechanical checks → fan-out to agents → gates (eligibility/evidence/integrity) → dedup → trust score. The 20+ test files cover change classification (commit prefixes vs. diff heuristics), context bundling with fallback import resolution (NodeNext .js→.ts, Babel .js→.jsx), parallel agent dispatch, PR state filtering (closed/merged/draft/trivial/prior-review), evidence citation matching, and finding integrity (evidence must align with claimed vulnerability class—mismatches downgrade severity rather than drop findings).

## Invariants

- 5-domain bundle invariant: scopeContext() ALWAYS produces exactly 5 ContextBundle instances (architecture, bug, compliance, learnings, security); caller code assumes this count
- Changed files in all bundles: every domain bundle includes all changed files with reason='changed'; omitting breaks context for that domain
- Convention file routing: convention files (CLAUDE.md, AGENTS.md) route ONLY to compliance bundle; missing from compliance causes context gap
- Change type consistency: all bundles within a scope operation share the same changeType (from commit message or diff heuristics); inconsistency breaks depth tuning
- Import resolution fallbacks: without graph, resolver must try NodeNext (.js→.ts) and Babel (.js→.jsx) variants; omitting either breaks cross-platform context
- Evidence-class consistency: security findings (with CWE/OWASP tags) must cite security-relevant evidence (SQL queries, injection patterns); violations are downgraded not dropped, preserving violation record
- Eligibility gates are sequential: closed/merged PRs, drafts (CI mode), doc-only changes, prior-review matches must all populate skipReason; no short-circuit paths
- Evidence line-range matching: finding at [40, 45] only matches evidence citing a line within 40–45; off-by-one or missing lines fail coverage and flag uncited
- Parallel dispatch per domain: fan-out agents must run concurrently, not sequentially; timing gates verify all domains complete in parallel
- Finding domain consistency: every finding in an AgentReviewResult must have domain equal to result's domain; mismatch indicates orchestration error

## Interface Contract

```ts

```

## Dependency Slice

```
import { validateDependencies } from '../../src/constraints/dependencies'
import { validateAgentsMap } from '../../src/context/agents-map'
import { checkDocCoverage } from '../../src/context/doc-coverage'
import { LEARNINGS_DESCRIPTOR, runLearningsAgent } from '../../src/review/agents/learnings-agent'
import { runSecurityAgent } from '../../src/review/agents/security-agent'
import { detectChangeType } from '../../src/review/change-type'
import from '../../src/review/ci/orchestrator'
import { scopeContext } from '../../src/review/context-scoper'
import { deduplicateFindings } from '../../src/review/deduplicate-findings'
import { ConditionalSubagent, RISK_KEYWORDS, calibrateDepth, computeActivations, computeDepth, countChangedLines, detectRiskKeywords } from '../../src/review/depth-calibrator'
import { checkEligibility } from '../../src/review/eligibility-gate'
import { checkEvidenceCoverage, tagUncitedFindings } from '../../src/review/evidence-gate'
import { ExclusionSet, buildExclusionSet } from '../../src/review/exclusion-set'
import { fanOutConditionalSubagents, fanOutReview } from '../../src/review/fan-out'
import { checkEvidenceClassConsistency, claimsVulnerabilityClass, confidenceCeiling, emptyIntegrityReport, enforceFindingIntegrity, formatIntegritySummary, mergeIntegrityReports } from '../../src/review/finding-integrity'
import { runMechanicalChecks } from '../../src/review/mechanical-checks'
import { generateRubric } from '../../src/review/meta-judge'
import { DEFAULT_PROVIDER_TIERS, resolveModelTier } from '../../src/review/model-tier-resolver'
import { findParallelGroups } from '../../src/review/parallel-groups'
import { attachGuardianCoverage, runReviewPipeline } from '../../src/review/pipeline-orchestrator'
import { computeTrustScores, getTrustLevel } from '../../src/review/trust-score'
import { STAGE_DOMAINS, splitBundlesByStage, stageDomains } from '../../src/review/two-stage'
import { ContextBundle, ContextFile, ContextScopeOptions, DiffInfo, GraphAdapter, GraphNode, MechanicalCheckOptions, MechanicalCheckResult, MechanicalFinding, ModelTierConfig, PipelineFlags, PrMetadata, ReviewDomain, ReviewFinding, Rubric } from '../../src/review/types'
import { validateFindings } from '../../src/review/validate-findings'
import { fileExists, findFiles, readFileContent } from '../../src/shared/fs-utils'
import { readSessionSection } from '../../src/state/session-sections'
import { SessionEntry } from '@harness-engineering/types'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
