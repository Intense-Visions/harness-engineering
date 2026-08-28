---
schemaVersion: 1
module: 'packages/graph/src'
sourceHash: '4b25943f8f03b54a4d33d6d022320dc9ac9678c32a77ba7df7c5a92dea35c820'
compiledAt: '2026-08-28T01:22:11.570Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'types.ts']
---

## Summary

@harness-engineering/graph is a multi-modal knowledge graph system that extracts, stores, and analyzes semantic relationships across code, documentation, design, business logic, and observability. It consists of five layers: (1) **Store** — in-memory DAG with indices by node/edge, composite edge keys (from\0to\0type), and BFS traversal; (2) **Ingest** — multi-pathway extraction (CodeIngestor for 7 languages, diagram/business/decision/design/canary parsers) orchestrated by KnowledgePipelineRunner in a 4-phase convergence loop; (3) **Query** — ContextQL DSL, Assembler with FusionLayer hybrid search, shortest-path and traceability; (4) **Analysis** — domain adapters (complexity, anomalies, constraints, coupling, blast-radius simulation); (5) **NLQ** — natural-language intent classification routing to structured graph operations. Powers context assembly, impact analysis, and anomaly detection across the harness.

## Invariants

- All node/edge accesses return shallow copies; mutations merge into existing entries rather than replace, preserving external references.
- Composite edge keys (from\0to\0type) enforce uniqueness; duplicates update metadata in-place without incrementing edge count.
- NODE_TYPES, EDGE_TYPES, EDGE_PROVENANCES are const literal arrays; adding a type requires updating both the array and all discriminated-union branches.
- Edge provenance (EXTRACTED/INFERRED/AMBIGUOUS) is immutable and gates downstream adapter confidence; heuristic edges are distinguishable from AST facts.
- Knowledge snapshot baseline captured pre-ingest is load-bearing for phase 2 drift detection; reconcile phase compares pre/post extraction snapshots.
- Skip-dirs and exclude patterns resolved once at ingest start; no dynamic rescanning after ingest begins.
- Materialization confidence floor (0.5) gates knowledge document writes; entries below floor are reported as gaps but never written to disk; human-authored nodes bypass floor.
- Graph integrity checks include denominators; zero findings with zero denominators means examined-nothing (abstention), never a pass.
- Staleness detection is deletion-based only (StalenessInfo.isStale); move/rename detection is non-goal.
- POISONED_KEYS filter (**proto**, constructor, prototype) in safeMerge prevents prototype-pollution during node merges.

## Interface Contract

```ts
export ALL_EXTRACTORS
export AggregateResult
export AnomalyDetectionOptions
export AnomalyReport
export ApiPathExtractor
export ArticulationPoint
export AskGraphResult
export AssembledContext
export Assembler
export BusinessKnowledgeIngestor
export CIConnector
export CURRENT_SCHEMA_VERSION
export CacheableEnvelope
export CanaryResultsIngestor
export CanaryRunRecordInput
export CanaryTestResultInput
export CascadeLayer
export CascadeNode
export CascadeResult
export CascadeSimulationOptions
export CascadeSimulator
export ClassificationResult
export CodeIngestor
export CodeIngestorOptions
export CommunityAssignment
export CommunityDetectionResult
export CommunityDetector
export CommunityDetectorOptions
export CommunityEdgeInput
export CommunityGraphInput
export CompositeProbabilityStrategy
export ConflictDetail
export ConflictPrediction
export ConflictPredictor
export ConflictSeverity
export ConflictType
export ConfluenceConnector
export ConnectorConfig
export ContextQL
export ContextQLParams
export ContextQLResult
export Contradiction
export ContradictionDetector
export ContradictionEntry
export ContradictionResult
export CoverageReport
export CoverageScorer
export CraftFindingRecord
export D2Parser
export DEFAULT_BLOCKLIST
export DEFAULT_PATTERNS
export DEFAULT_SKIP_DIRS
export DecisionIngestor
export DesignConstraintAdapter
export DesignIngestor
export DesignStrictness
export DesignViolation
export DetectCommunitiesOptions
export DetectedElement
export DiagramEntity
export DiagramFormatParser
export DiagramParseResult
export DiagramParser
export DiagramRelationship
export DomainCoverage
export DomainCoverageScore
export DomainInferenceOptions
export DriftClassification
export DriftDetector
export DriftFinding
export DriftResult
export EDGE_PROVENANCES
export EDGE_TYPES
export EdgeProvenance
export EdgeQuery
export EdgeType
export EntityExtractor
export EntityResolver
export EnumConstantExtractor
export ExtractionCounts
export ExtractionRecord
export ExtractionRunResult
export ExtractionRunner
export FigmaConnector
export FusionLayer
export FusionResult
export GapEntry
export GapReport
export GitIngestor
export GitRunner
export Grade
export GraphAnomalyAdapter
export GraphBudget
export GraphComplexityAdapter
export GraphComplexityHotspot
export GraphComplexityResult
export GraphConnector
export GraphConstraintAdapter
export GraphCouplingAdapter
export GraphCouplingFileData
export GraphCouplingResult
export GraphCoverageReport
export GraphDeadCodeData
export GraphDependencyData
export GraphDirMode
export GraphDriftData
export GraphEdge
export GraphEdgeSchema
export GraphEntropyAdapter
export GraphFeedbackAdapter
export GraphFilterResult
export GraphHarnessCheckData
export GraphImpactData
export GraphIntegrityReport
export GraphLayerViolation
export GraphMetadata
export GraphNode
export GraphNodeSchema
export GraphSnapshotSummary
export GraphStabilityTier
export GraphStore
export HttpClient
export INTENTS
export ImageAnalysisExtractor
export ImageAnalysisExtractorOptions
export ImageAnalysisProvider
export ImageAnalysisResult
export ImpactGroups
export IndependenceCheckParams
export IndependenceResult
export IngestResult
export IntegrityCode
export IntegrityDenominators
export IntegrityFinding
export IntegritySeverity
export Intent
export IntentClassifier
export JiraConnector
export KnowledgeDocMaterializer
export KnowledgeIngestor
export KnowledgePipelineOptions
export KnowledgePipelineResult
export KnowledgePipelineRunner
export KnowledgeSnapshot
export KnowledgeSnapshotEntry
export KnowledgeStagingAggregator
export KnowledgeVerdict
export Language
export LinkResult
export LoadGraphResult
export LoadMetadataResult
export LouvainDetector
export MaterializeOptions
export MaterializeResult
export MaterializedDoc
export MermaidParser
export MiroConnector
export NODE_STABILITY
export NODE_TYPES
export NodeCategory
export NodeQuery
export NodeType
export OBSERVABILITY_TYPES
export OverlapDetail
export PackedSummaryCache
export PairResult
export PlantUmlParser
export ProbabilityStrategy
export ProjectionSpec
export RequirementCoverage
export RequirementIngestor
export ResolvedEntity
export ResponseFormatter
export ShortestPathDirection
export ShortestPathOptions
export ShortestPathResult
export SignalExtractor
export SkippedEntry
export SlackConnector
export SourceLocation
export StagedEntry
export StalenessInfo
export StatisticalOutlier
export StructuralDriftDetector
export SyncManager
export SyncMetadata
export TaskDefinition
export TaskIndependenceAnalyzer
export TestDescriptionExtractor
export TopologicalLinker
export TraceabilityOptions
export TraceabilityResult
export TracedFile
export VERSION
export ValidationRuleExtractor
export VectorSearchResult
export VectorStore
export askGraph
export buildCommunityInput
export checkConnectorSync
export checkExtractedNodes
export checkGraphIntegrity
export classifyNodeCategory
export createExtractionRunner
export detectCommunities
export detectLanguage
export findMainWorktreeRoot
export groupNodesByImpact
export inferDomain
export linkToCode
export loadGraph
export loadGraphMetadata
export localGraphDir
export normalizeIntent
export project
export queryTraceability
export resolveGraphDir
export resolveSkipDirs
export saveGraph
export skipDirGlobs
```

## Dependency Slice

```
import { z } from 'zod'
```
