import { z } from 'zod';

// --- Node Types ---

export const NODE_TYPES = [
  // Code
  'repository',
  'module',
  'file',
  'class',
  'interface',
  'function',
  'method',
  'variable',
  // Knowledge
  'adr',
  'decision',
  'learning',
  'failure',
  'issue',
  'document',
  'skill',
  'conversation',
  // VCS
  'commit',
  'build',
  'test_result',
  // Observability (future)
  'span',
  'metric',
  'log',
  // Structural
  'layer',
  'pattern',
  'constraint',
  'violation',
  // Design
  'design_token',
  'aesthetic_intent',
  'design_constraint',
  // Traceability
  'requirement',
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

// --- Edge Types ---

export const EDGE_TYPES = [
  // Code relationships
  'contains',
  'imports',
  'calls',
  'implements',
  'inherits',
  'references',
  // Knowledge relationships
  'applies_to',
  'caused_by',
  'resolved_by',
  'documents',
  'violates',
  'specifies',
  'decided',
  // VCS relationships
  'co_changes_with',
  'triggered_by',
  'failed_in',
  // Execution relationships (future)
  'executed_by',
  'measured_by',
  // Design relationships
  'uses_token',
  'declares_intent',
  'violates_design',
  'platform_binding',
  // Traceability relationships
  'requires',
  'verified_by',
  'tested_by',
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

// --- Observability types (for noise pruning) ---

export const OBSERVABILITY_TYPES: ReadonlySet<NodeType> = new Set(['span', 'metric', 'log']);

// --- Source Location ---

export interface SourceLocation {
  readonly fileId: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly startColumn?: number;
  readonly endColumn?: number;
}

// --- Graph Node ---

export interface GraphNode {
  readonly id: string;
  readonly type: NodeType;
  readonly name: string;
  readonly path?: string;
  readonly location?: SourceLocation;
  readonly content?: string;
  readonly hash?: string;
  readonly metadata: Record<string, unknown>;
  readonly embedding?: readonly number[];
  readonly lastModified?: string; // ISO timestamp
}

// --- Graph Edge ---

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly type: EdgeType;
  readonly confidence?: number; // 0-1, for Fusion Layer edges
  readonly metadata?: Record<string, unknown>;
}

// --- ContextQL ---

export interface ContextQLParams {
  readonly rootNodeIds: readonly string[];
  readonly maxDepth?: number; // default 3
  readonly includeTypes?: readonly NodeType[];
  readonly excludeTypes?: readonly NodeType[];
  readonly includeEdges?: readonly EdgeType[];
  readonly bidirectional?: boolean; // default false
  readonly pruneObservability?: boolean; // default true
}

export interface ContextQLResult {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly stats: {
    readonly totalTraversed: number;
    readonly totalReturned: number;
    readonly pruned: number;
    readonly depthReached: number;
  };
}

// --- Projection ---

export interface ProjectionSpec {
  readonly fields: readonly (keyof GraphNode)[];
}

// --- Ingest ---

export interface IngestResult {
  readonly nodesAdded: number;
  readonly nodesUpdated: number;
  readonly edgesAdded: number;
  readonly edgesUpdated: number;
  readonly errors: readonly string[];
  readonly durationMs: number;
}

// --- Graph Metadata (persisted alongside graph) ---

export interface GraphMetadata {
  readonly schemaVersion: number;
  readonly lastScanTimestamp: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
}

export const CURRENT_SCHEMA_VERSION = 1;

// --- Zod Schemas (for validation) ---

export const GraphNodeSchema = z.object({
  id: z.string(),
  type: z.enum(NODE_TYPES),
  name: z.string(),
  path: z.string().optional(),
  location: z
    .object({
      fileId: z.string(),
      startLine: z.number(),
      endLine: z.number(),
      startColumn: z.number().optional(),
      endColumn: z.number().optional(),
    })
    .optional(),
  content: z.string().optional(),
  hash: z.string().optional(),
  metadata: z.record(z.unknown()),
  embedding: z.array(z.number()).optional(),
  lastModified: z.string().optional(),
});

export const GraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(EDGE_TYPES),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});
