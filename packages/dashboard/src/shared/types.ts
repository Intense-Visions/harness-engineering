import type { FeatureStatus } from '@harness-engineering/core';
export type { FeatureStatus };

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

/** Projected feature for API consumption — excludes filesystem paths */
export interface DashboardFeature {
  name: string;
  status: FeatureStatus;
  summary: string;
  milestone: string;
  blockedBy: string[];
  assignee: string | null;
  priority: string | null;
}

/** Roadmap gatherer result */
export interface RoadmapData {
  milestones: MilestoneProgress[];
  features: DashboardFeature[];
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
  /** Deferred: coverage baselines */
  coverageBaselines?: { file: string; current: number; baseline: number }[];
  /** Deferred: doc drift status */
  docDrift?: { drifted: number; total: number; threshold: number } | null;
  /** Deferred: dependency health */
  dependencyHealth?: { violations: number; circular: number } | null;
}

/** Health gatherer error result */
export interface HealthError {
  error: string;
}

export type HealthResult = HealthData | HealthError;

/** Extended health response including security, perf, and arch from GatherCache */
export interface ExtendedHealthData {
  health: HealthResult;
  security: SecurityResult | null;
  perf: PerfResult | null;
  arch: ArchResult | null;
}

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

// --- Blocker graph types ---

export interface BlockerEdge {
  from: string;
  to: string;
}

export interface RoadmapChartsData {
  milestones: RoadmapData['milestones'];
  features: RoadmapData['features'];
  blockerEdges: BlockerEdge[];
}

// --- Overview types ---

/** KPI overview combining all data sources */
export interface OverviewData {
  roadmap: RoadmapResult;
  health: HealthResult;
  graph: GraphResult;
}

// --- SSE event types ---

export type SSEEvent =
  | { type: 'roadmap'; data: RoadmapResult; timestamp: string }
  | { type: 'health'; data: HealthResult; timestamp: string }
  | { type: 'graph'; data: GraphResult; timestamp: string }
  | { type: 'overview'; data: OverviewData; timestamp: string }
  | { type: 'checks'; data: ChecksData; timestamp: string };

// --- CI types ---

export interface CIData {
  checks: CheckResult[];
  lastRun: string | null;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  errorCount: number;
  warningCount: number;
  details?: string;
}

// --- Security types ---

export interface SecurityData {
  valid: boolean;
  findings: SecurityFindingSummary[];
  stats: { filesScanned: number; errorCount: number; warningCount: number; infoCount: number };
}

export interface SecurityFindingSummary {
  ruleId: string;
  category: string;
  severity: string;
  file: string;
  line: number;
  message: string;
}

export interface SecurityError {
  error: string;
}

export type SecurityResult = SecurityData | SecurityError;

// --- Perf types ---

export interface PerfData {
  valid: boolean;
  violations: PerfViolationSummary[];
  stats: { filesAnalyzed: number; violationCount: number };
}

export interface PerfViolationSummary {
  metric: string;
  file: string;
  value: number;
  threshold: number;
  severity: string;
}

export interface PerfError {
  error: string;
}

export type PerfResult = PerfData | PerfError;

// --- Architecture types ---

export interface ArchData {
  passed: boolean;
  totalViolations: number;
  regressions: { category: string; delta: number }[];
  newViolations: { file: string; detail: string; severity: string }[];
}

export interface ArchError {
  error: string;
}

export type ArchResult = ArchData | ArchError;

// --- Anomaly types ---

export interface AnomalyData {
  outliers: AnomalyOutlier[];
  articulationPoints: AnomalyArticulationPoint[];
  overlapCount: number;
}

export interface AnomalyOutlier {
  nodeId: string;
  name: string;
  type: string;
  metric: string;
  value: number;
  zScore: number;
}

export interface AnomalyArticulationPoint {
  nodeId: string;
  name: string;
  componentsIfRemoved: number;
  dependentCount: number;
}

export interface AnomalyUnavailable {
  available: false;
  reason: string;
}

export type AnomalyResult = AnomalyData | AnomalyUnavailable;

// --- Blast radius types ---

export interface BlastRadiusData {
  sourceNodeId: string;
  sourceName: string;
  layers: BlastRadiusLayer[];
  summary: {
    totalAffected: number;
    maxDepth: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
  };
}

export interface BlastRadiusLayer {
  depth: number;
  nodes: BlastRadiusNode[];
}

export interface BlastRadiusNode {
  nodeId: string;
  name: string;
  type: string;
  probability: number;
  parentId: string;
}

export interface BlastRadiusError {
  error: string;
}

export type BlastRadiusResult = BlastRadiusData | BlastRadiusError;

// --- Checks aggregate (on-demand gather) ---

/** Combined result of all expensive gatherers for SSE broadcast */
export interface ChecksData {
  security: SecurityResult;
  perf: PerfResult;
  arch: ArchResult;
  anomalies: AnomalyResult;
  lastRun: string;
}
