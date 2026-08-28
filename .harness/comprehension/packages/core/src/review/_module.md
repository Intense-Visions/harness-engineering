---
schemaVersion: 1
module: 'packages/core/src/review'
sourceHash: 'dec3f9d34e6774832db0a129141cfa8f0d5c8ea6672b7df18414f10de878f957'
compiledAt: '2026-08-28T01:22:10.515Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
