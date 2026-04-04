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
