/**
 * Health snapshot -- captured codebase health state.
 * Types and runtime capture/cache logic for the skill recommendation engine.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { SignalName } from '@harness-engineering/core';
import { reconcilePassed } from '@harness-engineering/core';
import { logger } from '../output/logger';

/**
 * Set to `false` when a check could not be measured — its tool errored, threw,
 * or returned output that does not parse (#2589). An unmeasured check is
 * `passed: false` with zeroed counts, so it raises no signal and never reads as
 * clean. Absent means measured (snapshots cached before #2589 carry no marker).
 */
interface Measurable {
  measured?: false;
}

/** Granular check results from assess_project and related tools. */
export interface HealthChecks {
  deps: Measurable & {
    passed: boolean;
    issueCount: number;
    circularDeps: number;
    layerViolations: number;
  };
  entropy: Measurable & {
    passed: boolean;
    deadExports: number;
    deadFiles: number;
    driftCount: number;
  };
  security: Measurable & { passed: boolean; findingCount: number; criticalCount: number };
  perf: Measurable & { passed: boolean; violationCount: number };
  docs: Measurable & { passed: boolean; undocumentedCount: number };
  lint: Measurable & { passed: boolean; issueCount: number };
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
  /**
   * Per-surface rework metric (#1528, report-only). `maxUnplannedReworkRate` is
   * the worst surface's unplanned rework rate; `reworkSurfaceCount` counts
   * surfaces at/over {@link REWORK_ATTENTION_THRESHOLD}. Throughput and rework are
   * read together — this block sits beside the other health metrics.
   */
  reworkRate: { maxUnplannedReworkRate: number; reworkSurfaceCount: number };
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

/**
 * Attention threshold for the report-only rework signal: a surface whose
 * unplanned rework rate is at/over 20% is worth surfacing. Tunable — not
 * load-bearing for correctness (#1528).
 */
export const REWORK_ATTENTION_THRESHOLD = 0.2;

/** Signal derivation rules: [signalName, predicate]. */
const SIGNAL_RULES: Array<[SignalName, (c: HealthChecks, m: HealthMetrics) => boolean]> = [
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
  [
    'rework-hotspot',
    // Optional-chained: older snapshots (and partial test fixtures) predate the
    // reworkRate block; a missing block reads as zero rework, never a throw.
    (_c, m) => (m.reworkRate?.maxUnplannedReworkRate ?? 0) >= REWORK_ATTENTION_THRESHOLD,
  ],
];

/**
 * Derive active signal identifiers from health checks and metrics.
 * Uses threshold-based rules to map numeric values to named signals.
 */
export function deriveSignals(checks: HealthChecks, metrics: HealthMetrics): SignalName[] {
  const signals = new Set<SignalName>();
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
  isError?: boolean;
}

type ParsedTool = Record<string, unknown> | null;

/**
 * Extract the first text content from a tool result and parse it as a JSON
 * object. Returns `null` — "not measured" — on `isError`, invalid JSON, or a
 * non-object payload, so a failed tool can never be read as an empty, clean
 * result (#2589). Warns instead of throwing so the surrounding pipeline keeps
 * going.
 */
function parseToolResult(result: ToolResult | null, toolName: string): ParsedTool {
  if (result === null) return null;
  const text = result.content?.[0]?.text ?? '';
  if (result.isError) {
    logger.warn(`${toolName} reported an error: ${text.slice(0, 200)}`);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  logger.warn(`${toolName} returned non-JSON output: ${text.slice(0, 120)}`);
  return null;
}

/** Await a tool handler, turning a rejection into a `null` (not-measured) result. */
async function settle(
  toolName: string,
  call: () => Promise<ToolResult>
): Promise<ToolResult | null> {
  try {
    return await call();
  } catch (error) {
    logger.warn(`${toolName} threw: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

type CheckEntry = { passed: boolean; issueCount: number };

/**
 * Build a map of check name to pass/issue from assess_project output. A failed
 * assess run yields an empty map, so every check reads as not measured.
 */
function buildCheckMap(assessData: ParsedTool): Map<string, CheckEntry> {
  const map = new Map<string, CheckEntry>();
  const checks = assessData?.checks;
  if (!Array.isArray(checks)) return map;
  for (const c of checks as Array<Partial<CheckEntry> & { name?: unknown }>) {
    if (typeof c?.name === 'string' && typeof c.passed === 'boolean') {
      map.set(c.name, {
        passed: c.passed,
        issueCount: typeof c.issueCount === 'number' ? c.issueCount : 0,
      });
    }
  }
  return map;
}

/** Count violations by reason from check_dependencies output; `null` when not measured. */
function countViolations(
  depsData: ParsedTool
): { circularDeps: number; layerViolations: number } | null {
  if (!depsData || !Array.isArray(depsData.violations)) return null;
  const violations = depsData.violations as Array<{ reason: string }>;
  return {
    circularDeps: violations.filter((v) => v.reason === 'CIRCULAR_DEP').length,
    layerViolations: violations.filter(
      (v) => v.reason === 'WRONG_LAYER' || v.reason === 'FORBIDDEN_IMPORT'
    ).length,
  };
}

interface EntropySummaryCounts {
  totalIssues: number;
  deadExports: number;
  deadFiles: number;
  driftCount: number;
}

/**
 * Read entropy counts from detect_entropy's SUMMARY payload
 * (`{ totalIssues, categories: { drift, deadCode, patterns } }`). The detailed
 * report overflows (`Invalid string length`) on large repos (#2589), the same
 * reason assess_project moved to summary mode (#2551, `entropyCheckFromSummary`).
 *
 * Fails closed with the same predicate as `entropyCheckFromSummary`: no numeric
 * `totalIssues`, or no numeric `deadCode` counts (dead-code analysis always
 * runs under `type: 'all'`), means the analyzer did not run — `null`, never 0.
 */
function parseEntropySummary(entropyData: ParsedTool): EntropySummaryCounts | null {
  if (!entropyData) return null;
  const categories = entropyData.categories as Record<string, Record<string, unknown>> | undefined;
  const dead = categories?.['deadCode'];
  const totalIssues = entropyData.totalIssues;
  if (
    typeof totalIssues !== 'number' ||
    typeof dead?.issueCount !== 'number' ||
    typeof dead.deadExports !== 'number' ||
    typeof dead.deadFiles !== 'number'
  ) {
    return null;
  }
  const drift = categories?.['drift']?.issueCount;
  return {
    totalIssues,
    deadExports: dead.deadExports,
    deadFiles: dead.deadFiles,
    driftCount: typeof drift === 'number' ? drift : 0,
  };
}

/**
 * Count critical findings from security scan output; `null` when not measured.
 * A scan that read zero files abstained, so it is unmeasured, not 0 (#2622).
 */
function countCriticalFindings(securityData: ParsedTool): number | null {
  if (!securityData || !Array.isArray(securityData.findings)) return null;
  if (securityData.abstained === true) return null;
  const findings = securityData.findings as Array<{ severity: string }>;
  return findings.filter((f) => f.severity === 'error').length;
}

// ---------------------------------------------------------------------------
// Health checks runner
// ---------------------------------------------------------------------------

/**
 * Run health checks by calling assess_project, check_dependencies, and
 * entropy/security handlers for granular counts. Returns HealthChecks.
 *
 * Entropy comes only from this module's own summary-mode detect_entropy call,
 * so assess_project is not asked to run it a second time.
 */
export async function runHealthChecks(projectPath: string): Promise<HealthChecks> {
  const { handleAssessProject } = await import('../mcp/tools/assess-project.js');
  const { handleCheckDependencies } = await import('../mcp/tools/architecture.js');
  const { handleDetectEntropy } = await import('../mcp/tools/entropy.js');
  const { handleRunSecurityScan } = await import('../mcp/tools/security.js');

  const [assessResult, depsResult, entropyResult, securityResult] = await Promise.all([
    settle('assess_project', () =>
      handleAssessProject({
        path: projectPath,
        checks: ['deps', 'security', 'perf', 'docs', 'lint'],
      })
    ),
    settle('check_dependencies', () => handleCheckDependencies({ path: projectPath })),
    settle('detect_entropy', () =>
      handleDetectEntropy({ path: projectPath, type: 'all', mode: 'summary' })
    ),
    // Read-only probe: never append to the tracked security timeline (#2474).
    settle('run_security_scan', () => handleRunSecurityScan({ path: projectPath, record: false })),
  ]);

  return assembleHealthChecks({
    checkMap: buildCheckMap(parseToolResult(assessResult, 'assess_project')),
    violations: countViolations(parseToolResult(depsResult, 'check_dependencies')),
    entropy: parseEntropySummary(parseToolResult(entropyResult, 'detect_entropy')),
    criticalCount: countCriticalFindings(parseToolResult(securityResult, 'run_security_scan')),
  });
}

interface CheckInputs {
  checkMap: Map<string, CheckEntry>;
  violations: { circularDeps: number; layerViolations: number } | null;
  entropy: EntropySummaryCounts | null;
  criticalCount: number | null;
}

const UNMEASURED = { passed: false, measured: false } as const;

/**
 * Assemble HealthChecks. A check whose inputs did not all arrive is
 * `{ passed: false, measured: false }` with zeroed counts (#2589).
 */
function assembleHealthChecks({
  checkMap,
  violations,
  entropy,
  criticalCount,
}: CheckInputs): HealthChecks {
  const deps = checkMap.get('deps');
  const security = checkMap.get('security');
  const perf = checkMap.get('perf');
  const docs = checkMap.get('docs');
  const lint = checkMap.get('lint');

  return {
    deps:
      deps && violations
        ? { passed: deps.passed, issueCount: deps.issueCount, ...violations }
        : { ...UNMEASURED, issueCount: 0, circularDeps: 0, layerViolations: 0 },
    entropy: entropy
      ? {
          passed: entropy.totalIssues === 0,
          deadExports: entropy.deadExports,
          deadFiles: entropy.deadFiles,
          driftCount: entropy.driftCount,
        }
      : { ...UNMEASURED, deadExports: 0, deadFiles: 0, driftCount: 0 },
    security:
      security && criticalCount !== null
        ? { passed: security.passed, findingCount: security.issueCount, criticalCount }
        : { ...UNMEASURED, findingCount: 0, criticalCount: 0 },
    perf: perf
      ? { passed: perf.passed, violationCount: perf.issueCount }
      : { ...UNMEASURED, violationCount: 0 },
    docs: docs
      ? { passed: docs.passed, undocumentedCount: docs.issueCount }
      : { ...UNMEASURED, undocumentedCount: 0 },
    lint: lint
      ? { passed: lint.passed, issueCount: lint.issueCount }
      : { ...UNMEASURED, issueCount: 0 },
  };
}

// ---------------------------------------------------------------------------
// Graph metrics aggregation
// ---------------------------------------------------------------------------

const ZERO_REWORK = { maxUnplannedReworkRate: 0, reworkSurfaceCount: 0 };

export const ZERO_METRICS: HealthMetrics = {
  avgFanOut: 0,
  maxFanOut: 0,
  avgCyclomaticComplexity: 0,
  maxCyclomaticComplexity: 0,
  avgCouplingRatio: 0,
  testCoverage: null,
  anomalyOutlierCount: 0,
  articulationPointCount: 0,
  reworkRate: ZERO_REWORK,
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
      // Zeroed here; rework is git-derived and computed independently in
      // runReworkMetrics so it survives graph-unavailable, then merged in capture.
      reworkRate: ZERO_REWORK,
    };
  } catch {
    return ZERO_METRICS;
  }
}

/**
 * Compute the report-only rework metric block from local git history (#1528).
 * Independent of the graph so it survives a graph-unavailable project. The
 * planned-issue set is left empty here (roadmap resolution is a CLI-command
 * concern); the snapshot therefore treats all rework as unplanned. Degrade-safe:
 * a non-git dir or any failure yields a zeroed block, never a throw.
 */
export async function runReworkMetrics(projectPath: string): Promise<HealthMetrics['reworkRate']> {
  try {
    const { computeRework } = await import('@harness-engineering/core');
    const report = await computeRework({ since: '30d', cwd: projectPath, minCommits: 2 });
    const rates = report.surfaces.map((s) => s.unplannedReworkRate);
    const maxUnplannedReworkRate = rates.length > 0 ? Math.max(...rates) : 0;
    const reworkSurfaceCount = report.surfaces.filter(
      (s) => s.unplannedReworkRate >= REWORK_ATTENTION_THRESHOLD
    ).length;
    return { maxUnplannedReworkRate, reworkSurfaceCount };
  } catch {
    return { ...ZERO_REWORK };
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Capture a complete health snapshot for a project.
 * Runs health checks and graph metrics in parallel, derives signals,
 * saves to cache, and returns the snapshot.
 */
export async function captureHealthSnapshot(projectPath: string): Promise<HealthSnapshot> {
  // Get git HEAD
  let gitHead = '';
  try {
    gitHead = execSync('git rev-parse HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // Non-git directory
  }

  // Run checks, graph metrics, and rework metrics in parallel (rework is
  // git-derived and independent of the graph, so it does not serialize capture).
  const [checks, graphMetrics, reworkRate] = await Promise.all([
    runHealthChecks(projectPath),
    runGraphMetrics(projectPath),
    runReworkMetrics(projectPath),
  ]);
  const metrics: HealthMetrics = { ...graphMetrics, reworkRate };

  // Derive signals
  const signals = deriveSignals(checks, metrics);

  // Reconcile: demote any check that passed assess but has a contradicting signal.
  // Conjunction, monotonic toward fail — never promotes a real failure to green.
  const reconciledChecks = reconcilePassed(checks, signals);

  const snapshot: HealthSnapshot = {
    capturedAt: new Date().toISOString(),
    gitHead,
    projectPath,
    checks: reconciledChecks,
    metrics,
    signals,
  };

  // Write to cache
  saveCachedSnapshot(snapshot, projectPath);

  return snapshot;
}
