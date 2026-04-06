// Types
export type {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  SourceLocation,
  ContextQLParams,
  ContextQLResult,
  ProjectionSpec,
  IngestResult,
  GraphMetadata,
} from './types.js';

export {
  NODE_TYPES,
  EDGE_TYPES,
  OBSERVABILITY_TYPES,
  CURRENT_SCHEMA_VERSION,
  GraphNodeSchema,
  GraphEdgeSchema,
} from './types.js';

// Store
export { GraphStore } from './store/GraphStore.js';
export type { NodeQuery, EdgeQuery } from './store/GraphStore.js';
export { VectorStore } from './store/VectorStore.js';
export type { VectorSearchResult } from './store/VectorStore.js';
export { saveGraph, loadGraph } from './store/Serializer.js';

// Query
export { ContextQL } from './query/ContextQL.js';
export { project } from './query/Projection.js';
export { groupNodesByImpact, classifyNodeCategory } from './query/groupImpact.js';
export type { ImpactGroups, NodeCategory } from './query/groupImpact.js';

// Ingest
export { CodeIngestor } from './ingest/CodeIngestor.js';
export { GitIngestor } from './ingest/GitIngestor.js';
export type { GitRunner } from './ingest/GitIngestor.js';
export { TopologicalLinker } from './ingest/TopologicalLinker.js';
export type { LinkResult } from './ingest/TopologicalLinker.js';
export { KnowledgeIngestor } from './ingest/KnowledgeIngestor.js';
export { RequirementIngestor } from './ingest/RequirementIngestor.js';

// Connectors
export type {
  GraphConnector,
  ConnectorConfig,
  SyncMetadata,
  HttpClient,
} from './ingest/connectors/ConnectorInterface.js';
export { linkToCode } from './ingest/connectors/ConnectorUtils.js';
export { SyncManager } from './ingest/connectors/SyncManager.js';
export { JiraConnector } from './ingest/connectors/JiraConnector.js';
export { SlackConnector } from './ingest/connectors/SlackConnector.js';
export { ConfluenceConnector } from './ingest/connectors/ConfluenceConnector.js';
export { CIConnector } from './ingest/connectors/CIConnector.js';

// Search
export { FusionLayer } from './search/FusionLayer.js';
export type { FusionResult } from './search/FusionLayer.js';

// Entropy
export { GraphEntropyAdapter } from './entropy/GraphEntropyAdapter.js';
export type {
  GraphDriftData,
  GraphDeadCodeData,
  GraphSnapshotSummary,
} from './entropy/GraphEntropyAdapter.js';

export { GraphComplexityAdapter } from './entropy/GraphComplexityAdapter.js';
export type {
  GraphComplexityHotspot,
  GraphComplexityResult,
} from './entropy/GraphComplexityAdapter.js';

export { GraphCouplingAdapter } from './entropy/GraphCouplingAdapter.js';
export type { GraphCouplingFileData, GraphCouplingResult } from './entropy/GraphCouplingAdapter.js';

export { GraphAnomalyAdapter } from './entropy/GraphAnomalyAdapter.js';
export type {
  AnomalyDetectionOptions,
  StatisticalOutlier,
  ArticulationPoint,
  AnomalyReport,
} from './entropy/GraphAnomalyAdapter.js';

// NLQ
export {
  askGraph,
  INTENTS,
  IntentClassifier,
  EntityExtractor,
  EntityResolver,
  ResponseFormatter,
} from './nlq/index.js';
export type { Intent, ClassificationResult, ResolvedEntity, AskGraphResult } from './nlq/index.js';

// Context
export { Assembler } from './context/Assembler.js';
export type {
  AssembledContext,
  GraphBudget,
  GraphFilterResult,
  GraphCoverageReport,
} from './context/Assembler.js';

// Traceability
export { queryTraceability } from './query/Traceability.js';
export type {
  TraceabilityResult,
  TraceabilityOptions,
  RequirementCoverage,
  TracedFile,
} from './query/Traceability.js';

// Constraints
export { GraphConstraintAdapter } from './constraints/GraphConstraintAdapter.js';
export type {
  GraphDependencyData,
  GraphLayerViolation,
} from './constraints/GraphConstraintAdapter.js';

// Design Ingest
export { DesignIngestor } from './ingest/DesignIngestor.js';

// Design Constraints
export { DesignConstraintAdapter } from './constraints/DesignConstraintAdapter.js';
export type { DesignViolation, DesignStrictness } from './constraints/DesignConstraintAdapter.js';

// Feedback
export { GraphFeedbackAdapter } from './feedback/GraphFeedbackAdapter.js';
export type { GraphImpactData, GraphHarnessCheckData } from './feedback/GraphFeedbackAdapter.js';

// Independence
export { TaskIndependenceAnalyzer } from './independence/index.js';
export type {
  TaskDefinition,
  IndependenceCheckParams,
  OverlapDetail,
  PairResult,
  IndependenceResult,
} from './independence/index.js';

export { ConflictPredictor } from './independence/index.js';
export type { ConflictSeverity, ConflictDetail, ConflictPrediction } from './independence/index.js';

// Blast Radius
export { CompositeProbabilityStrategy, CascadeSimulator } from './blast-radius/index.js';
export type {
  ProbabilityStrategy,
  CascadeSimulationOptions,
  CascadeNode,
  CascadeLayer,
  CascadeResult,
} from './blast-radius/index.js';

export const VERSION = '0.2.0';
