import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { isAbsolute, join, relative, dirname } from 'node:path';
import {
  SecurityTimelineFileSchema,
  EMPTY_SUPPLY_CHAIN,
  UNMEASURED_SUPPLY_CHAIN_SCORE_CEILING,
  isSupplyChainMeasured,
  securityFindingId,
} from './security-timeline-types';
import type {
  SecurityTimelineFile,
  SecurityTimelineSnapshot,
  SecurityCategorySnapshot,
  SupplyChainSnapshot,
  FindingLifecycle,
  SecurityTrendResult,
  SecurityTrendLine,
  TrendAttribution,
  TimeToFixResult,
  TimeToFixStats,
  Direction,
} from './security-timeline-types';
import type { ScanResult, SecurityFinding } from './types';

/** Runs an audit command in `cwd` and returns its stdout (JSON). */
export type AuditCommandRunner = (command: string, cwd: string) => string;

/** Lockfile → audit command. Only managers whose `--json` shape we parse. */
const AUDIT_COMMANDS: ReadonlyArray<{ lockfile: string; command: string }> = [
  { lockfile: 'pnpm-lock.yaml', command: 'pnpm audit --json' },
  { lockfile: 'package-lock.json', command: 'npm audit --json' },
  { lockfile: 'npm-shrinkwrap.json', command: 'npm audit --json' },
];

const defaultAuditRunner: AuditCommandRunner = (command, cwd) => {
  try {
    return execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    // Audits exit non-zero when vulnerabilities exist but still print valid
    // JSON on stdout; hand that back so the parser can decide.
    const stdout = (err as { stdout?: unknown } | null)?.stdout;
    if (typeof stdout === 'string' && stdout.length > 0) return stdout;
    throw err;
  }
};

export class SecurityTimelineManager {
  private readonly rootDir: string;
  private readonly timelinePath: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
    this.timelinePath = join(rootDir, '.harness', 'security', 'timeline.json');
  }

  /**
   * Load timeline from disk.
   * Returns empty SecurityTimelineFile if file does not exist or is invalid.
   * Lifecycle entries with absolute paths under rootDir are migrated to repo-relative
   * form on read (older versions persisted whatever the scanner emitted, which leaked
   * machine paths into committed timeline.json). Migrated files are re-saved so the
   * fixup is one-shot.
   */
  load(): SecurityTimelineFile {
    if (!existsSync(this.timelinePath)) {
      return { version: 1, snapshots: [], findingLifecycles: [] };
    }
    try {
      const raw = readFileSync(this.timelinePath, 'utf-8');
      const data = JSON.parse(raw);
      const parsed = SecurityTimelineFileSchema.safeParse(data);
      if (!parsed.success) {
        console.error(
          `Security timeline validation failed for ${this.timelinePath}:`,
          parsed.error.format()
        );
        return { version: 1, snapshots: [], findingLifecycles: [] };
      }
      let mutated = false;
      for (const lc of parsed.data.findingLifecycles) {
        const next = this.toRepoRelativePath(lc.file);
        if (next !== lc.file) {
          lc.file = next;
          mutated = true;
        }
      }
      if (mutated) this.save(parsed.data);
      return parsed.data;
    } catch (error) {
      console.error(`Error loading security timeline from ${this.timelinePath}:`, error);
      return { version: 1, snapshots: [], findingLifecycles: [] };
    }
  }

  /**
   * Save timeline to disk using atomic write (temp file + rename).
   */
  save(timeline: SecurityTimelineFile): void {
    const dir = dirname(this.timelinePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const tmp = this.timelinePath + '.' + randomBytes(4).toString('hex') + '.tmp';
    writeFileSync(tmp, JSON.stringify(timeline, null, 2));
    renameSync(tmp, this.timelinePath);
  }

  /**
   * Capture a new snapshot from a scan result.
   * Aggregates findings by category/severity, computes security score,
   * appends to timeline (or replaces if same commitHash), and saves.
   */
  capture(
    scanResult: ScanResult,
    commitHash: string,
    supplyChain?: SupplyChainSnapshot
  ): SecurityTimelineSnapshot {
    const normalized = scanResult.findings.map((f) => this.normalizeFindingPath(f));
    const byCategory = this.aggregateByCategory(normalized);
    const bySeverity = this.aggregateBySeverity(normalized);
    const findingIds = normalized.map((f) => securityFindingId(f));
    // Caller-supplied counts are a measurement unless explicitly marked otherwise;
    // no argument means no audit ran on this path (#2082).
    const supply: SupplyChainSnapshot = supplyChain
      ? { ...supplyChain, measured: supplyChain.measured ?? true }
      : { ...EMPTY_SUPPLY_CHAIN };

    const snapshot: SecurityTimelineSnapshot = {
      capturedAt: new Date().toISOString(),
      commitHash,
      securityScore: 0, // computed below
      totalFindings: normalized.length,
      bySeverity,
      byCategory,
      supplyChain: supply,
      suppressionCount: 0,
      findingIds,
    };

    snapshot.securityScore = this.computeSecurityScore(snapshot);

    const timeline = this.load();

    // Deduplication: if latest snapshot has same commitHash, replace it
    const lastIndex = timeline.snapshots.length - 1;
    if (lastIndex >= 0 && timeline.snapshots[lastIndex]!.commitHash === commitHash) {
      timeline.snapshots[lastIndex] = snapshot;
    } else {
      timeline.snapshots.push(snapshot);
    }

    this.save(timeline);
    return snapshot;
  }

  /**
   * Capture supply chain data by running the audit that matches the project's
   * lockfile (pnpm or npm). Network-bound — never call it from a read-only check.
   * Returns `measured: false` when no supported lockfile exists or the audit
   * fails / prints something unparseable; a failed audit is never recorded as zero.
   */
  captureSupplyChain(
    projectRoot?: string,
    run: AuditCommandRunner = defaultAuditRunner
  ): SupplyChainSnapshot {
    const cwd = projectRoot ?? this.rootDir;
    const match = AUDIT_COMMANDS.find((a) => existsSync(join(cwd, a.lockfile)));
    if (!match) return { ...EMPTY_SUPPLY_CHAIN };
    try {
      return SecurityTimelineManager.supplyChainFromAuditJson(run(match.command, cwd));
    } catch {
      return { ...EMPTY_SUPPLY_CHAIN };
    }
  }

  /**
   * Convert `pnpm audit --json` / `npm audit --json` output into a supply-chain
   * snapshot. Callers that already ran an audit pass its output here and hand the
   * result to {@link capture}. pnpm writes no `metadata.vulnerabilities.total`,
   * so the total is derived from the severity buckets when absent. Error payloads
   * (e.g. npm `ENOLOCK`) and unparseable output yield `measured: false`.
   */
  static supplyChainFromAuditJson(output: string): SupplyChainSnapshot {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      return { ...EMPTY_SUPPLY_CHAIN };
    }
    const vulns = (parsed as { metadata?: { vulnerabilities?: Record<string, unknown> } } | null)
      ?.metadata?.vulnerabilities;
    if (!vulns || typeof vulns !== 'object') return { ...EMPTY_SUPPLY_CHAIN };
    const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const critical = n(vulns.critical);
    const high = n(vulns.high);
    const moderate = n(vulns.moderate);
    const low = n(vulns.low);
    const info = n(vulns.info);
    const total =
      typeof vulns.total === 'number' ? n(vulns.total) : critical + high + moderate + low + info;
    return { critical, high, moderate, low, info, total, measured: true };
  }

  /**
   * Update finding lifecycles based on current findings.
   * New findings get a lifecycle entry with firstSeenAt.
   * Findings no longer present get resolvedAt set.
   */
  updateLifecycles(currentFindings: SecurityFinding[], commitHash: string): void {
    const timeline = this.load();
    const normalized = currentFindings.map((f) => this.normalizeFindingPath(f));
    const currentIds = new Set(normalized.map((f) => securityFindingId(f)));
    const now = new Date().toISOString();

    // Index existing lifecycles by findingId
    const lifecycleMap = new Map<string, FindingLifecycle>();
    for (const lc of timeline.findingLifecycles) {
      lifecycleMap.set(lc.findingId, lc);
    }

    // Add new findings and reopen resolved ones that reappeared
    for (const finding of normalized) {
      const id = securityFindingId(finding);
      this.upsertLifecycle(lifecycleMap, id, finding, now, commitHash);
    }

    // Mark resolved findings
    this.resolveAbsentFindings(lifecycleMap, currentIds, now, commitHash);

    timeline.findingLifecycles = Array.from(lifecycleMap.values());
    this.save(timeline);
  }

  /**
   * Compute time-to-fix statistics from finding lifecycles.
   */
  computeTimeToFix(options?: { category?: string; since?: string }): TimeToFixResult {
    const timeline = this.load();
    let lifecycles = timeline.findingLifecycles;

    if (options?.category) {
      lifecycles = lifecycles.filter((lc) => lc.category === options.category);
    }
    if (options?.since) {
      const sinceDate = new Date(options.since);
      lifecycles = lifecycles.filter((lc) => new Date(lc.firstSeenAt) >= sinceDate);
    }

    const resolved = lifecycles.filter((lc) => lc.resolvedAt !== null);
    const open = lifecycles.filter((lc) => lc.resolvedAt === null);

    const resolutionDays = resolved.map((lc) => {
      const first = new Date(lc.firstSeenAt).getTime();
      const res = new Date(lc.resolvedAt!).getTime();
      return (res - first) / (1000 * 60 * 60 * 24);
    });

    const overall = this.computeStats(resolutionDays);

    // By category
    const categoryGroups = new Map<string, number[]>();
    for (const lc of resolved) {
      const days =
        (new Date(lc.resolvedAt!).getTime() - new Date(lc.firstSeenAt).getTime()) /
        (1000 * 60 * 60 * 24);
      const group = categoryGroups.get(lc.category) ?? [];
      group.push(days);
      categoryGroups.set(lc.category, group);
    }

    const byCategory: Record<string, TimeToFixStats> = {};
    for (const [cat, days] of categoryGroups) {
      byCategory[cat] = this.computeStats(days);
    }

    // Oldest open finding
    let oldestOpenDays: number | null = null;
    if (open.length > 0) {
      const now = Date.now();
      const oldest = Math.min(...open.map((lc) => new Date(lc.firstSeenAt).getTime()));
      oldestOpenDays = (now - oldest) / (1000 * 60 * 60 * 24);
    }

    return {
      overall,
      byCategory,
      openFindings: open.length,
      oldestOpenDays,
    };
  }

  /**
   * Compute trends between snapshots over a window.
   */
  trends(options?: { last?: number; since?: string }): SecurityTrendResult {
    const timeline = this.load();
    let snapshots = timeline.snapshots;

    if (options?.since) {
      const sinceDate = new Date(options.since);
      snapshots = snapshots.filter((s) => new Date(s.capturedAt) >= sinceDate);
    }
    if (options?.last && snapshots.length > options.last) {
      snapshots = snapshots.slice(-options.last);
    }

    if (snapshots.length === 0) {
      return this.emptyTrendResult();
    }

    if (snapshots.length === 1) {
      const s = snapshots[0]!;
      return {
        score: this.buildTrendLine(s.securityScore, s.securityScore, true),
        totalFindings: this.buildTrendLine(s.totalFindings, s.totalFindings, false),
        bySeverity: {
          error: this.buildTrendLine(s.bySeverity.error, s.bySeverity.error, false),
          warning: this.buildTrendLine(s.bySeverity.warning, s.bySeverity.warning, false),
          info: this.buildTrendLine(s.bySeverity.info, s.bySeverity.info, false),
        },
        supplyChain: this.buildTrendLine(s.supplyChain.total, s.supplyChain.total, false),
        snapshotCount: 1,
        from: s.capturedAt,
        to: s.capturedAt,
        attribution: [],
      };
    }

    const first = snapshots[0]!;
    const last = snapshots[snapshots.length - 1]!;

    const attribution = this.computeAttribution(first, last);

    return {
      score: this.buildTrendLine(last.securityScore, first.securityScore, true),
      totalFindings: this.buildTrendLine(last.totalFindings, first.totalFindings, false),
      bySeverity: {
        error: this.buildTrendLine(last.bySeverity.error, first.bySeverity.error, false),
        warning: this.buildTrendLine(last.bySeverity.warning, first.bySeverity.warning, false),
        info: this.buildTrendLine(last.bySeverity.info, first.bySeverity.info, false),
      },
      supplyChain: this.buildTrendLine(last.supplyChain.total, first.supplyChain.total, false),
      snapshotCount: snapshots.length,
      from: first.capturedAt,
      to: last.capturedAt,
      attribution,
    };
  }

  /**
   * Compute composite security score from a snapshot.
   * score = max(0, 100 - weightedPenalty)
   * weightedPenalty = (errors × 3) + (warnings × 1) + (infos × 0.25)
   *                 + (supplyChain.critical × 5) + (supplyChain.high × 3) + (supplyChain.moderate × 1)
   * When the supply chain was not measured, the score is capped at
   * UNMEASURED_SUPPLY_CHAIN_SCORE_CEILING so the missing dimension is not
   * credited as clean (#2082).
   */
  computeSecurityScore(snapshot: SecurityTimelineSnapshot): number {
    const penalty =
      snapshot.bySeverity.error * 3 +
      snapshot.bySeverity.warning * 1 +
      snapshot.bySeverity.info * 0.25 +
      snapshot.supplyChain.critical * 5 +
      snapshot.supplyChain.high * 3 +
      snapshot.supplyChain.moderate * 1;

    const ceiling = isSupplyChainMeasured(snapshot.supplyChain)
      ? 100
      : UNMEASURED_SUPPLY_CHAIN_SCORE_CEILING;
    return Math.round(Math.max(0, Math.min(ceiling, 100 - penalty)));
  }

  // --- Private helpers ---

  /**
   * Convert a path to repo-relative form using forward slashes. Absolute paths under
   * rootDir are stripped; already-relative paths are normalized to forward slashes;
   * paths that escape rootDir (relative starts with `..`) are returned unchanged so we
   * never silently misattribute a finding outside the project.
   */
  private toRepoRelativePath(filePath: string): string {
    if (!filePath) return filePath;
    if (!isAbsolute(filePath)) return filePath.replaceAll('\\', '/');
    const rel = relative(this.rootDir, filePath).replaceAll('\\', '/');
    if (rel === '' || rel.startsWith('../') || rel === '..') return filePath;
    return rel;
  }

  private normalizeFindingPath(finding: SecurityFinding): SecurityFinding {
    const next = this.toRepoRelativePath(finding.file);
    return next === finding.file ? finding : { ...finding, file: next };
  }

  private upsertLifecycle(
    map: Map<string, FindingLifecycle>,
    id: string,
    finding: SecurityFinding,
    now: string,
    commitHash: string
  ): void {
    if (!map.has(id)) {
      map.set(id, {
        findingId: id,
        ruleId: finding.ruleId,
        category: finding.category,
        severity: finding.severity,
        file: finding.file,
        firstSeenAt: now,
        firstSeenCommit: commitHash,
        resolvedAt: null,
        resolvedCommit: null,
      });
    } else {
      const existing = map.get(id)!;
      if (existing.resolvedAt !== null) {
        existing.resolvedAt = null;
        existing.resolvedCommit = null;
      }
    }
  }

  private resolveAbsentFindings(
    map: Map<string, FindingLifecycle>,
    currentIds: Set<string>,
    now: string,
    commitHash: string
  ): void {
    for (const [id, lc] of map) {
      if (!currentIds.has(id) && lc.resolvedAt === null) {
        lc.resolvedAt = now;
        lc.resolvedCommit = commitHash;
      }
    }
  }

  private static readonly SEVERITY_COUNT_KEY: Record<string, keyof SecurityCategorySnapshot> = {
    error: 'errorCount',
    warning: 'warningCount',
    info: 'infoCount',
  };

  private aggregateByCategory(
    findings: SecurityFinding[]
  ): Record<string, SecurityCategorySnapshot> {
    const result: Record<string, SecurityCategorySnapshot> = {};

    for (const finding of findings) {
      if (!result[finding.category]) {
        result[finding.category] = {
          findingCount: 0,
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
        };
      }
      const cat = result[finding.category]!;
      cat.findingCount++;
      const key = SecurityTimelineManager.SEVERITY_COUNT_KEY[finding.severity] ?? 'infoCount';
      (cat[key] as number)++;
    }

    return result;
  }

  private aggregateBySeverity(findings: SecurityFinding[]): {
    error: number;
    warning: number;
    info: number;
  } {
    let error = 0;
    let warning = 0;
    let info = 0;
    for (const f of findings) {
      if (f.severity === 'error') error++;
      else if (f.severity === 'warning') warning++;
      else info++;
    }
    return { error, warning, info };
  }

  private buildTrendLine(current: number, previous: number, isScore: boolean): SecurityTrendLine {
    const delta = current - previous;
    let direction: Direction;
    if (Math.abs(delta) < 2) {
      direction = 'stable';
    } else if (isScore) {
      direction = delta > 0 ? 'improving' : 'declining';
    } else {
      direction = delta < 0 ? 'improving' : 'declining';
    }
    return { current, previous, delta, direction };
  }

  private computeAttribution(
    first: SecurityTimelineSnapshot,
    last: SecurityTimelineSnapshot
  ): TrendAttribution[] {
    const allCategories = new Set([
      ...Object.keys(first.byCategory),
      ...Object.keys(last.byCategory),
    ]);

    const results: TrendAttribution[] = [];
    for (const category of allCategories) {
      const attr = this.categoryAttribution(category, first.byCategory, last.byCategory);
      if (attr) results.push(attr);
    }
    return results;
  }

  private categoryAttribution(
    category: string,
    prev: Record<string, SecurityCategorySnapshot>,
    curr: Record<string, SecurityCategorySnapshot>
  ): TrendAttribution | null {
    const delta = (curr[category]?.findingCount ?? 0) - (prev[category]?.findingCount ?? 0);
    if (delta === 0) return null;
    const direction: Direction = delta < 0 ? 'improving' : 'declining';
    const sign = delta > 0 ? '+' : '';
    return { category, delta, direction, description: `${sign}${delta} ${category} findings` };
  }

  private computeStats(values: number[]): TimeToFixStats {
    if (values.length === 0) {
      return { mean: 0, median: 0, count: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
    return {
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      count: sorted.length,
    };
  }

  private emptyTrendResult(): SecurityTrendResult {
    const zero: SecurityTrendLine = { current: 0, previous: 0, delta: 0, direction: 'stable' };
    return {
      score: { ...zero },
      totalFindings: { ...zero },
      bySeverity: { error: { ...zero }, warning: { ...zero }, info: { ...zero } },
      supplyChain: { ...zero },
      snapshotCount: 0,
      from: '',
      to: '',
      attribution: [],
    };
  }
}
