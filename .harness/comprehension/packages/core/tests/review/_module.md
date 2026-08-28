---
schemaVersion: 1
module: 'packages/core/tests/review'
sourceHash: '1d9c9a7acca9371f2ad9e5a193ac62f06dc71b4511c0742e3e502338e6f12783'
compiledAt: '2026-08-28T01:22:10.967Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
