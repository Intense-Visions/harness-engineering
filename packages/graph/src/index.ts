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

// Search
export { FusionLayer } from './search/FusionLayer.js';
export type { FusionResult } from './search/FusionLayer.js';

export const VERSION = '0.1.0';
