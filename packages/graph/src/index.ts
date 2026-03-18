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

// Ingest
export { CodeIngestor } from './ingest/CodeIngestor.js';
export { GitIngestor } from './ingest/GitIngestor.js';
export type { GitRunner } from './ingest/GitIngestor.js';
export { TopologicalLinker } from './ingest/TopologicalLinker.js';
export type { LinkResult } from './ingest/TopologicalLinker.js';
export { KnowledgeIngestor } from './ingest/KnowledgeIngestor.js';

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

// Context
export { Assembler } from './context/Assembler.js';
export type {
  AssembledContext,
  GraphBudget,
  GraphFilterResult,
  GraphCoverageReport,
} from './context/Assembler.js';

// Constraints
export { GraphConstraintAdapter } from './constraints/GraphConstraintAdapter.js';
export type {
  GraphDependencyData,
  GraphLayerViolation,
} from './constraints/GraphConstraintAdapter.js';

export const VERSION = '0.1.0';
