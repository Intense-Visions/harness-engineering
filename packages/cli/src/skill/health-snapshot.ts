/**
 * Health snapshot -- captured codebase health state.
 * Types and runtime capture/cache logic for the skill recommendation engine.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Granular check results from assess_project and related tools. */
export interface HealthChecks {
  deps: { passed: boolean; issueCount: number; circularDeps: number; layerViolations: number };
  entropy: { passed: boolean; deadExports: number; deadFiles: number; driftCount: number };
  security: { passed: boolean; findingCount: number; criticalCount: number };
  perf: { passed: boolean; violationCount: number };
  docs: { passed: boolean; undocumentedCount: number };
  lint: { passed: boolean; issueCount: number };
}

/** Aggregated graph and coverage metrics. */
export interface HealthMetrics {
  avgFanOut: number;
  maxFanOut: number;
  avgCyclomaticComplexity: number;
  maxCyclomaticComplexity: number;
  avgCouplingRatio: number;
  /** Null when test coverage data is not available. */
  testCoverage: number | null;
  anomalyOutlierCount: number;
  articulationPointCount: number;
}

/** A point-in-time snapshot of codebase health. */
export interface HealthSnapshot {
  /** ISO 8601 timestamp of when the snapshot was captured. */
  capturedAt: string;
  /** Git commit SHA at capture time, used for staleness detection. */
  gitHead: string;
  /** Absolute path to the project root. */
  projectPath: string;
  /** Granular pass/fail and issue counts from health checks. */
  checks: HealthChecks;
  /** Aggregated numeric metrics from graph analysis and coverage tools. */
  metrics: HealthMetrics;
  /** Active signal identifiers derived from checks and metrics. */
  signals: string[];
}

// ---------------------------------------------------------------------------
// Cache I/O
// ---------------------------------------------------------------------------

const CACHE_FILE = 'health-snapshot.json';
const STALENESS_MS = 3_600_000; // 1 hour

/**
 * Check if a snapshot is still fresh based on git HEAD match or time fallback.
 */
export function isSnapshotFresh(snapshot: HealthSnapshot, projectPath: string): boolean {
  try {
    const currentHead = execSync('git rev-parse HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (snapshot.gitHead === currentHead) return true;
  } catch {
    // Non-git directory -- fall through to time-based staleness
  }
  const age = Date.now() - new Date(snapshot.capturedAt).getTime();
  return age < STALENESS_MS;
}

/**
 * Load a cached health snapshot from .harness/health-snapshot.json.
 * Returns null if the file does not exist or contains invalid JSON.
 */
export function loadCachedSnapshot(projectPath: string): HealthSnapshot | null {
  const filePath = path.join(projectPath, '.harness', CACHE_FILE);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as HealthSnapshot;
  } catch {
    return null;
  }
}

/**
 * Save a health snapshot to .harness/health-snapshot.json.
 */
export function saveCachedSnapshot(snapshot: HealthSnapshot, projectPath: string): void {
  const dir = path.join(projectPath, '.harness');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, CACHE_FILE);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
}

// ---------------------------------------------------------------------------
// Signal derivation
// ---------------------------------------------------------------------------

/** Signal derivation rules: [signalName, predicate]. */
const SIGNAL_RULES: Array<[string, (c: HealthChecks, m: HealthMetrics) => boolean]> = [
  ['circular-deps', (c) => c.deps.circularDeps > 0],
  ['layer-violations', (c) => c.deps.layerViolations > 0],
  ['dead-code', (c) => c.entropy.deadExports > 0 || c.entropy.deadFiles > 0],
  ['drift', (c) => c.entropy.driftCount > 0],
  ['security-findings', (c) => c.security.findingCount > 0],
  ['doc-gaps', (c) => c.docs.undocumentedCount > 0],
  ['perf-regression', (c) => c.perf.violationCount > 0],
  ['anomaly-outlier', (_c, m) => m.anomalyOutlierCount > 0],
  ['articulation-point', (_c, m) => m.articulationPointCount > 0],
  ['high-coupling', (_c, m) => m.avgCouplingRatio > 0.5 || m.maxFanOut > 20],
  ['high-complexity', (_c, m) => m.maxCyclomaticComplexity > 20 || m.avgCyclomaticComplexity > 10],
  ['low-coverage', (_c, m) => m.testCoverage !== null && m.testCoverage < 60],
];

/**
 * Derive active signal identifiers from health checks and metrics.
 * Uses threshold-based rules to map numeric values to named signals.
 */
export function deriveSignals(checks: HealthChecks, metrics: HealthMetrics): string[] {
  const signals = new Set<string>();
  for (const [name, predicate] of SIGNAL_RULES) {
    if (predicate(checks, metrics)) signals.add(name);
  }
  return [...signals];
}

// ---------------------------------------------------------------------------
// Health checks runner -- internal parse helpers
// ---------------------------------------------------------------------------

interface ToolResult {
  content: Array<{ type: string; text: string }>;
}

const DEFAULT_CHECK = { passed: true, issueCount: 0 };

/** Extract the first text content from a tool result and parse as JSON. */
function parseToolResult(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? '{}');
}

/** Build a map of check name to pass/issue from assess_project output. */
function buildCheckMap(
  assessData: Record<string, unknown>
): Map<string, { passed: boolean; issueCount: number }> {
  const map = new Map<string, { passed: boolean; issueCount: number }>();
  const checks = (assessData.checks ?? []) as Array<{
    name: string;
    passed: boolean;
    issueCount: number;
  }>;
  for (const c of checks) {
    map.set(c.name, { passed: c.passed, issueCount: c.issueCount });
  }
  return map;
}

/** Count violations by reason from check_dependencies output. */
function countViolations(depsData: Record<string, unknown>): {
  circularDeps: number;
  layerViolations: number;
} {
  const violations = (depsData.violations ?? []) as Array<{ reason: string }>;
  return {
    circularDeps: violations.filter((v) => v.reason === 'CIRCULAR_DEP').length,
    layerViolations: violations.filter(
      (v) => v.reason === 'WRONG_LAYER' || v.reason === 'FORBIDDEN_IMPORT'
    ).length,
  };
}

/** Extract granular entropy counts from detect_entropy output. */
function parseEntropyGranular(entropyData: Record<string, unknown>): {
  deadExports: number;
  deadFiles: number;
  driftCount: number;
} {
  const dc = (entropyData.deadCode ?? {}) as Record<string, unknown[]>;
  const dr = (entropyData.drift ?? {}) as Record<string, unknown[]>;
  return {
    deadExports: dc.unusedExports?.length ?? 0,
    deadFiles: dc.deadFiles?.length ?? 0,
    driftCount: (dr.staleReferences?.length ?? 0) + (dr.missingTargets?.length ?? 0),
  };
}

/** Count critical findings from security scan output. */
function countCriticalFindings(securityData: Record<string, unknown>): number {
  const findings = (securityData.findings ?? []) as Array<{ severity: string }>;
  return findings.filter((f) => f.severity === 'error').length;
}

// ---------------------------------------------------------------------------
// Health checks runner
// ---------------------------------------------------------------------------

/**
 * Run health checks by calling assess_project, check_dependencies, and
 * entropy/security handlers for granular counts. Returns HealthChecks.
 */
export async function runHealthChecks(projectPath: string): Promise<HealthChecks> {
  const { handleAssessProject } = await import('../mcp/tools/assess-project.js');
  const { handleCheckDependencies } = await import('../mcp/tools/architecture.js');
  const { handleDetectEntropy } = await import('../mcp/tools/entropy.js');
  const { handleRunSecurityScan } = await import('../mcp/tools/security.js');

  const [assessResult, depsResult, entropyResult, securityResult] = await Promise.all([
    handleAssessProject({
      path: projectPath,
      checks: ['deps', 'entropy', 'security', 'perf', 'docs', 'lint'],
    }),
    handleCheckDependencies({ path: projectPath }),
    handleDetectEntropy({ path: projectPath, type: 'all' }),
    handleRunSecurityScan({ path: projectPath }),
  ]);

  const assessData = parseToolResult(assessResult);
  const checkMap = buildCheckMap(assessData);
  const { circularDeps, layerViolations } = countViolations(parseToolResult(depsResult));
  const entropyGranular = parseEntropyGranular(parseToolResult(entropyResult));
  const criticalCount = countCriticalFindings(parseToolResult(securityResult));

  const deps = checkMap.get('deps') ?? DEFAULT_CHECK;
  const entropy = checkMap.get('entropy') ?? DEFAULT_CHECK;
  const security = checkMap.get('security') ?? DEFAULT_CHECK;
  const perf = checkMap.get('perf') ?? DEFAULT_CHECK;
  const docs = checkMap.get('docs') ?? DEFAULT_CHECK;
  const lint = checkMap.get('lint') ?? DEFAULT_CHECK;

  return {
    deps: { passed: deps.passed, issueCount: deps.issueCount, circularDeps, layerViolations },
    entropy: { passed: entropy.passed, ...entropyGranular },
    security: { passed: security.passed, findingCount: security.issueCount, criticalCount },
    perf: { passed: perf.passed, violationCount: perf.issueCount },
    docs: { passed: docs.passed, undocumentedCount: docs.issueCount },
    lint: { passed: lint.passed, issueCount: lint.issueCount },
  };
}

// ---------------------------------------------------------------------------
// Graph metrics aggregation
// ---------------------------------------------------------------------------

const ZERO_METRICS: HealthMetrics = {
  avgFanOut: 0,
  maxFanOut: 0,
  avgCyclomaticComplexity: 0,
  maxCyclomaticComplexity: 0,
  avgCouplingRatio: 0,
  testCoverage: null,
  anomalyOutlierCount: 0,
  articulationPointCount: 0,
};

/** Compute average of numeric values; returns 0 for empty arrays. */
function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 1000) / 1000;
}

/**
 * Run graph-based metric aggregation. Returns HealthMetrics.
 * Gracefully returns zero defaults when graph is unavailable.
 */
export async function runGraphMetrics(projectPath: string): Promise<HealthMetrics> {
  try {
    const { loadGraphStore } = await import('../mcp/utils/graph-loader.js');
    const store = await loadGraphStore(projectPath);
    if (!store) return ZERO_METRICS;

    const { GraphCouplingAdapter, GraphComplexityAdapter, GraphAnomalyAdapter } =
      await import('@harness-engineering/graph');

    // Coupling metrics
    const couplingAdapter = new GraphCouplingAdapter(store);
    const couplingData = couplingAdapter.computeCouplingData();
    const files = couplingData.files;

    const avgFanOut = avg(files.map((f: { fanOut: number }) => f.fanOut));
    const maxFanOut =
      files.length > 0 ? Math.max(...files.map((f: { fanOut: number }) => f.fanOut)) : 0;
    const avgCouplingRatio = avg(files.map((f: { couplingRatio: number }) => f.couplingRatio));

    // Complexity metrics
    const complexityAdapter = new GraphComplexityAdapter(store);
    const complexityData = complexityAdapter.computeComplexityHotspots();
    const hotspots = complexityData.hotspots;

    const avgCyclomaticComplexity = avg(hotspots.map((h: { complexity: number }) => h.complexity));
    const maxCyclomaticComplexity =
      hotspots.length > 0
        ? Math.max(...hotspots.map((h: { complexity: number }) => h.complexity))
        : 0;

    // Anomaly metrics
    const anomalyAdapter = new GraphAnomalyAdapter(store);
    const anomalyReport = anomalyAdapter.detect();

    return {
      avgFanOut,
      maxFanOut,
      avgCyclomaticComplexity,
      maxCyclomaticComplexity,
      avgCouplingRatio,
      testCoverage: null, // Coverage integration deferred -- not available from graph
      anomalyOutlierCount: anomalyReport.summary.outlierCount,
      articulationPointCount: anomalyReport.summary.articulationPointCount,
    };
  } catch {
    return ZERO_METRICS;
  }
}
