---
schemaVersion: 1
module: 'packages/core/src/review'
sourceHash: 'dec3f9d34e6774832db0a129141cfa8f0d5c8ea6672b7df18414f10de878f957'
compiledAt: '2026-08-28T01:22:10.515Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'change-type.ts',
    'constants.ts',
    'context-scoper.ts',
    'deduplicate-findings.ts',
    'depth-calibrator.ts',
    'eligibility-gate.ts',
    'evidence-gate.ts',
    'exclusion-set.ts',
    'fan-out.ts',
    'finding-integrity.ts',
    'index.ts',
    'mechanical-checks.ts',
    'meta-judge.ts',
    'model-tier-resolver.ts',
    'parallel-groups.ts',
    'pipeline-orchestrator.ts',
    'trust-score.ts',
    'two-stage.ts',
    'types.ts',
    'validate-findings.ts',
  ]
---

## Summary

`packages/core/src/review` is a multi-agent code review orchestrator that analyzes pull diffs through eight specialized review lenses (security, bug detection, architecture, compliance, frontend races, TypeScript strictness, learnings, adversarial) and produces trust-scored findings. The pipeline detects change type from commit message/diff heuristics, gathers contextual code within budgets (3:1 ratio for <20-line diffs, 1:1 for larger), fan-outs to agents in parallel or stages, validates findings against mechanical checks and graph data, deduplicates with a 3-line tolerance, enforces integrity constraints, and computes trust scores (35% validation method, 30% evidence saturation, 15% cross-agent agreement, 20% domain baselines). Output formats include terminal, GitHub inline comments, and structured JSON.

## Invariants

- Severity rank immutability — critical=2 > important=1 > suggestion=0; used by assessment, deduplication, and output; reordering breaks finding priority logic
- Trust factor weights sum to 1.0 — {validation: 0.35, evidence: 0.3, agreement: 0.15, historical: 0.2}; changing distribution requires recalibration of all domain baselines
- Validation method hierarchy — mechanical (1.0) > graph (0.8) > heuristic (0.5); immutable authority ordering for conflict resolution
- Evidence saturation baseline — 3 items saturate evidence factor to 1.0; >3 items gain no additional trust credit
- Agreement line-gap tolerance — 3-line window for detecting corroborated findings; must match deduplication threshold to prevent false dedups
- Context budget ratio — <20-line diffs get 3:1 ratio, ≥20 lines get 1:1 ratio; enforced across import/graph/test paths
- Domain baseline coverage — all ReviewDomain values (security|bug|architecture|compliance|learnings) must have entries in DOMAIN_BASELINES; missing entry causes NaN trust scores
- Path traversal gate — all file reads must validate resolved path is within project root via isWithinProject(); CWE-22 escalation if bypassed
- Finding ID determinism — makeFindingId(domain, file, line, title) must be idempotent for cross-session deduplication and PR comment linking
- Validation score range [0, 1] — all VALIDATION_SCORES entries and trust factors must stay in [0, 1] to prevent overflow in final computation
- Conditional subagent order — SUBAGENT_ORDER defines execution sequence; depth calibration and eligibility gates filter this list but must preserve order for reproducible scheduling

## Interface Contract

```ts
export *
export ADVERSARIAL_DESCRIPTOR
export AGENT_DESCRIPTORS
export AGREEMENT_LINE_GAP
export ARCHITECTURE_DESCRIPTOR
export AgentReviewResult
export BUG_DETECTION_DESCRIPTOR
export COMPLIANCE_DESCRIPTOR
export CONDITIONAL_SUBAGENT_DESCRIPTORS
export CONFIDENCE_CEILING_BY_VALIDATION
export CORROBORATED_AGREEMENT
export CalibrateDepthOptions
export ChangeType
export CommitHistoryEntry
export ConditionalAgentResult
export ConditionalSubagent
export ConfidenceBand
export ContextBundle
export ContextFile
export ContextScopeOptions
export DEFAULT_PROVIDER_TIERS
export DOMAIN_BASELINES
export DeduplicateFindingsOptions
export DepthCalibration
export DiffInfo
export EVIDENCE_SATURATION
export EligibilityResult
export EnforceFindingIntegrityOptions
export EnforceFindingIntegrityResult
export EvidenceCoverageReport
export EvidenceMismatchAction
export ExclusionSet
export FACTOR_WEIGHTS
export FRONTEND_RACES_DESCRIPTOR
export FanOutOptions
export FindingIntegrityAction
export FindingIntegrityReport
export FindingIntegrityViolation
export FindingInvariant
export FindingSeverity
export GenerateRubricOptions
export GitHubInlineComment
export GraphAdapter
export GraphNode
export MechanicalCheckOptions
export MechanicalCheckResult
export MechanicalCheckStatus
export MechanicalFinding
export ModelProvider
export ModelTier
export ModelTierConfig
export ParallelGroups
export PipelineContext
export PipelineFlags
export PrMetadata
export PriorReview
export ProviderDefaults
export RISK_KEYWORDS
export ReviewAgentDescriptor
export ReviewAssessment
export ReviewConfidence
export ReviewDepth
export ReviewDomain
export ReviewFinding
export ReviewOutputOptions
export ReviewPipelineResult
export ReviewStage
export ReviewStrength
export ReviewSubagent
export Rubric
export RubricItem
export RunPipelineOptions
export SECURITY_DESCRIPTOR
export STANDALONE_AGREEMENT
export SUBAGENT_ORDER
export TYPESCRIPT_STRICT_DESCRIPTOR
export TrustScoreOptions
export VALIDATION_SCORES
export VULNERABILITY_CLASS_SPECS
export ValidateFindingsOptions
export VulnerabilityClassSpec
export attachGuardianCoverage
export buildExclusionSet
export calibrateDepth
export checkEligibility
export checkEvidenceClassConsistency
export checkEvidenceCoverage
export claimsVulnerabilityClass
export computeActivations
export computeDepth
export computeTrustScores
export confidenceBand
export confidenceCeiling
export countChangedLines
export deduplicateFindings
export detectChangeType
export detectRiskKeywords
export determineAssessment
export emptyIntegrityReport
export enforceFindingIntegrity
export fanOutConditionalSubagents
export fanOutReview
export findParallelGroups
export formatFindingBlock
export formatGitHubComment
export formatGitHubSummary
export formatIntegritySection
export formatIntegritySummary
export formatTerminalOutput
export generateRubric
export getExitCode
export getTrustLevel
export isSmallSuggestion
export mergeIntegrityReports
export resolveModelTier
export runAdversarialAgent
export runArchitectureAgent
export runBugDetectionAgent
export runComplianceAgent
export runFrontendRacesAgent
export runMechanicalChecks
export runReviewPipeline
export runSecurityAgent
export runTypescriptStrictAgent
export scopeContext
export splitBundlesByStage
export stageDomains
export tagUncitedFindings
export validateFindings
```

## Dependency Slice

```
import { defineLayer, validateDependencies } from '../constraints/dependencies'
import { validateAgentsMap } from '../context/agents-map'
import { checkDocCoverage } from '../context/doc-coverage'
import { parseSecurityConfig } from '../security/config'
import { parseHarnessIgnore } from '../security/harness-ignore'
import { SecurityScanner } from '../security/scanner'
import { fileExists, findFiles, readFileContent, relativePosix } from '../shared/fs-utils'
import { TypeScriptParser } from '../shared/parsers'
import { Ok, Result } from '../shared/result'
import { readSessionSection } from '../state/session-sections'
import { runAdversarialAgent } from './agents/adversarial-agent'
import { runArchitectureAgent } from './agents/architecture-agent'
import { runBugDetectionAgent } from './agents/bug-agent'
import { runComplianceAgent } from './agents/compliance-agent'
import { runFrontendRacesAgent } from './agents/frontend-races-agent'
import { runLearningsAgent } from './agents/learnings-agent'
import { runSecurityAgent } from './agents/security-agent'
import { runTypescriptStrictAgent } from './agents/typescript-strict-agent'
import { detectChangeType } from './change-type'
import { AGREEMENT_LINE_GAP, CORROBORATED_AGREEMENT, DOMAIN_BASELINES, EVIDENCE_SATURATION, FACTOR_WEIGHTS, SEVERITY_RANK, STANDALONE_AGREEMENT, VALIDATED_BY_RANK, VALIDATION_SCORES } from './constants'
import { scopeContext } from './context-scoper'
import { deduplicateFindings } from './deduplicate-findings'
import { ConditionalSubagent, DepthCalibration, ReviewDepth, calibrateDepth } from './depth-calibrator'
import { checkEligibility } from './eligibility-gate'
import { checkEvidenceCoverage, tagUncitedFindings } from './evidence-gate'
import { ExclusionSet, buildExclusionSet } from './exclusion-set'
import { fanOutConditionalSubagents, fanOutReview } from './fan-out'
import { EnforceFindingIntegrityOptions, FindingIntegrityReport, enforceFindingIntegrity } from './finding-integrity'
import { runMechanicalChecks } from './mechanical-checks'
import { generateRubric } from './meta-judge'
import { determineAssessment, formatGitHubComment, formatTerminalOutput, getExitCode } from './output'
import { computeTrustScores, getTrustLevel } from './trust-score'
import { splitBundlesByStage } from './two-stage'
import { AgentReviewResult, ChangeType, CommitHistoryEntry, ContextBundle, ContextFile, ContextScopeOptions, DiffInfo, EligibilityResult, EvidenceCoverageReport, FanOutOptions, FindingIntegrityViolation, FindingSeverity, GitHubInlineComment, GraphAdapter, GraphNode, MechanicalCheckOptions, MechanicalCheckResult, MechanicalCheckStatus, MechanicalFinding, ModelProvider, ModelTier, ModelTierConfig, ParallelGroups, PipelineFlags, PrMetadata, ProviderDefaults, ReviewConfidence, ReviewDomain, ReviewFinding, ReviewPipelineResult, ReviewStage, ReviewStrength, ReviewSubagent, Rubric, RubricItem } from './types'
import { ReviewDomain } from './types/context'
import { EvidenceCoverageReport, MechanicalFinding } from './types/mechanical'
import { validateFindings } from './validate-findings'
import { SessionEntry } from '@harness-engineering/types'
import * as path from 'node:path'
```
