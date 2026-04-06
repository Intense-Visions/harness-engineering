import type { RoadmapFeature } from '@harness-engineering/core';

/** Health check response shape */
export interface HealthCheckResponse {
  status: 'ok' | 'error';
}

/** Generic API response wrapper with timestamp */
export interface ApiResponse<T> {
  data: T;
  timestamp: string;
}

/** API error response */
export interface ApiErrorResponse {
  error: string;
  timestamp: string;
}

// --- Cache ---

/** A cache entry with timestamp and TTL tracking */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// --- Roadmap types ---

/** Per-milestone progress summary */
export interface MilestoneProgress {
  name: string;
  isBacklog: boolean;
  total: number;
  done: number;
  inProgress: number;
  planned: number;
  blocked: number;
  backlog: number;
}

/** Roadmap gatherer result */
export interface RoadmapData {
  milestones: MilestoneProgress[];
  features: RoadmapFeature[];
  totalFeatures: number;
  totalDone: number;
  totalInProgress: number;
  totalPlanned: number;
  totalBlocked: number;
  totalBacklog: number;
}

/** Roadmap gatherer error result */
export interface RoadmapError {
  error: string;
}

export type RoadmapResult = RoadmapData | RoadmapError;

// --- Health types ---

/** Codebase health gatherer result */
export interface HealthData {
  totalIssues: number;
  errors: number;
  warnings: number;
  fixableCount: number;
  suggestionCount: number;
  durationMs: number;
  analysisErrors: string[];
}

/** Health gatherer error result */
export interface HealthError {
  error: string;
}

export type HealthResult = HealthData | HealthError;

// --- Graph types ---

/** Node type breakdown for graph metrics */
export interface NodeTypeCount {
  type: string;
  count: number;
}

/** Graph gatherer result when available */
export interface GraphData {
  available: true;
  nodeCount: number;
  edgeCount: number;
  nodesByType: NodeTypeCount[];
}

/** Graph gatherer result when unavailable */
export interface GraphUnavailable {
  available: false;
  reason: string;
}

export type GraphResult = GraphData | GraphUnavailable;

// --- Overview types ---

/** KPI overview combining all data sources */
export interface OverviewData {
  roadmap: RoadmapResult;
  health: HealthResult;
  graph: GraphResult;
}

// --- SSE event types ---

export type SSEEventType = 'roadmap' | 'health' | 'graph' | 'overview';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}
