/**
 * Hermes Phase 1 — `harness insights` composer.
 *
 * Composes the existing entropy, decay, attention, impact, and health
 * analyzers into a single `InsightsReport`. Each sub-block is wrapped in
 * try/catch so a single analyzer failing produces a `warnings[]` entry
 * with the rest of the report still populated.
 *
 * Lives in core (not dashboard) so it can be re-used from CLI and dashboard
 * alike — the harness layer-architecture forbids cli/orchestrator from
 * importing dashboard.
 *
 * Spec: docs/changes/hermes-phase-1-session-search/proposal.md (D5)
 */
import * as fs from 'fs';
import * as path from 'path';
import type {
  InsightsReport,
  InsightsKey,
  InsightsHealthBlock,
  InsightsEntropyBlock,
  InsightsDecayBlock,
  InsightsAttentionBlock,
  InsightsImpactBlock,
} from '@harness-engineering/types';
import { INSIGHTS_KEYS } from '@harness-engineering/types';

export interface ComposeInsightsOptions {
  /** Top-level keys to skip entirely. */
  skip?: InsightsKey[];
  /** Per-component timeout — currently used as a soft signal, not enforced (analyzers are sync). */
  perAnalyzerTimeoutMs?: number;
}

async function safeGather<T>(
  key: InsightsKey,
  fn: () => Promise<T> | T,
  warnings: string[]
): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    warnings.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Length of a possibly-undefined array. */
function arrayLen(arr: unknown): number {
  return Array.isArray(arr) ? arr.length : 0;
}

/** Gather the entropy block via the existing EntropyAnalyzer on the project root. */
async function gatherEntropyBlock(projectPath: string): Promise<InsightsEntropyBlock> {
  const { EntropyAnalyzer } = await import('../entropy/analyzer.js');
  const analyzer = new EntropyAnalyzer({
    rootDir: projectPath,
    include: ['src/**/*.ts', 'src/**/*.tsx', 'packages/*/src/**/*.ts'],
    exclude: ['node_modules/**', 'dist/**', '**/*.test.ts', '**/*.spec.ts'],
    analyze: { drift: false, deadCode: true, patterns: false, complexity: false },
  });
  const result = await analyzer.analyze();
  const empty: InsightsEntropyBlock = { driftCount: 0, deadFiles: 0, deadExports: 0 };
  if (!result.ok) return empty;
  const report = result.value as {
    drift?: { drifts?: unknown[] };
    deadCode?: { deadFiles?: unknown[]; deadExports?: unknown[] };
  };
  return {
    driftCount: arrayLen(report.drift?.drifts),
    deadFiles: arrayLen(report.deadCode?.deadFiles),
    deadExports: arrayLen(report.deadCode?.deadExports),
  };
}

/** Gather the decay block via TimelineManager.trends(). */
async function gatherDecayBlock(projectPath: string): Promise<InsightsDecayBlock> {
  const { TimelineManager } = await import('../architecture/timeline-manager.js');
  const mgr = new TimelineManager(projectPath);
  const trends = mgr.trends() as {
    recentSnapshots?: unknown[];
    topAffected?: Array<{ id?: string; name?: string }>;
  };
  const recentBumps = arrayLen(trends.recentSnapshots);
  const affected = Array.isArray(trends.topAffected) ? trends.topAffected : [];
  const topAffected: string[] = [];
  for (const node of affected) {
    const label = node.id ?? node.name;
    if (typeof label === 'string' && label.length > 0) topAffected.push(label);
    if (topAffected.length >= 5) break;
  }
  return { recentBumps, topAffected };
}

/** Gather the attention block — count active vs stale session directories. */
async function gatherAttentionBlock(projectPath: string): Promise<InsightsAttentionBlock> {
  const sessionsDir = path.join(projectPath, '.harness', 'sessions');
  if (!fs.existsSync(sessionsDir)) return { activeThreadCount: 0, staleThreadCount: 0 };
  const now = Date.now();
  const STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  let active = 0;
  let stale = 0;
  const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(sessionsDir, entry.name);
    try {
      const stat = fs.statSync(dirPath);
      if (now - stat.mtimeMs > STALE_MS) {
        stale++;
      } else {
        active++;
      }
    } catch {
      // ignore unreadable entries
    }
  }
  return { activeThreadCount: active, staleThreadCount: stale };
}

/** Gather the impact block — read recent blast-radius numbers if cached on disk. */
async function gatherImpactBlock(projectPath: string): Promise<InsightsImpactBlock> {
  // Read the impact cache if the dashboard has populated it; otherwise return empty.
  const cachePath = path.join(projectPath, '.harness', 'cache', 'impact.json');
  if (!fs.existsSync(cachePath)) return { recentBlastRadius: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as {
      blastRadius?: Array<{ node: string; affected: number }>;
    };
    const radii = raw.blastRadius ?? [];
    return {
      recentBlastRadius: radii.slice(0, 5).map((r) => ({
        node: r.node,
        affected: r.affected,
      })),
    };
  } catch {
    return { recentBlastRadius: [] };
  }
}

/** Gather the health block — pass/fail summary from check outputs. */
async function gatherHealthBlock(projectPath: string): Promise<InsightsHealthBlock> {
  // Reuse the entropy-based health signal as a cheap baseline.
  const entropy = await gatherEntropyBlock(projectPath);
  const signals: string[] = [];
  if (entropy.driftCount > 0) signals.push(`${entropy.driftCount} drift findings`);
  if (entropy.deadFiles > 0) signals.push(`${entropy.deadFiles} dead files`);
  if (entropy.deadExports > 0) signals.push(`${entropy.deadExports} dead exports`);
  const passed = signals.length === 0;
  return {
    passed,
    signals,
    summary: passed ? 'No structural health findings.' : signals.join('; '),
  };
}

/** Top-level composer. Runs each enabled block in parallel and returns the assembled report. */
export async function composeInsights(
  projectPath: string,
  opts: ComposeInsightsOptions = {}
): Promise<InsightsReport> {
  const skip = new Set<InsightsKey>(opts.skip ?? []);
  const warnings: string[] = [];

  const wantedKeys = INSIGHTS_KEYS.filter((k) => !skip.has(k));

  const [healthRes, entropyRes, decayRes, attentionRes, impactRes] = await Promise.all([
    wantedKeys.includes('health')
      ? safeGather('health', () => gatherHealthBlock(projectPath), warnings)
      : Promise.resolve(null),
    wantedKeys.includes('entropy')
      ? safeGather('entropy', () => gatherEntropyBlock(projectPath), warnings)
      : Promise.resolve(null),
    wantedKeys.includes('decay')
      ? safeGather('decay', () => gatherDecayBlock(projectPath), warnings)
      : Promise.resolve(null),
    wantedKeys.includes('attention')
      ? safeGather('attention', () => gatherAttentionBlock(projectPath), warnings)
      : Promise.resolve(null),
    wantedKeys.includes('impact')
      ? safeGather('impact', () => gatherImpactBlock(projectPath), warnings)
      : Promise.resolve(null),
  ]);

  const projectName = pickProjectName(projectPath);

  return {
    generatedAt: new Date().toISOString(),
    project: { root: projectPath, ...(projectName && { name: projectName }) },
    health: healthRes,
    entropy: entropyRes,
    decay: decayRes,
    attention: attentionRes,
    impact: impactRes,
    warnings,
  };
}

function pickProjectName(projectPath: string): string | undefined {
  try {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return undefined;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { name?: string };
    return pkg.name;
  } catch {
    return undefined;
  }
}
