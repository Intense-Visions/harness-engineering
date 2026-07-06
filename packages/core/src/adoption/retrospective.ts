import type { SkillInvocationRecord } from '@harness-engineering/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Options controlling how a catalog retrospective is derived from records. */
export interface RetrospectiveOptions {
  /**
   * Reference "now" for recency math. When omitted, defaults to the latest
   * record's timestamp (so a static dataset is measured against its own end),
   * falling back to the real clock when there are no records.
   */
  now?: Date;
  /** Days of inactivity before an ever-invoked skill is flagged stale. Default 90. */
  inactiveDays?: number;
  /** How many rows each ranked section returns. Default 10. */
  topN?: number;
  /**
   * Full catalog skill names, used only for coverage context (how many
   * catalog skills ever emitted telemetry). When omitted, coverage counts
   * are null — the retrospective still renders without them.
   */
  catalogSkills?: string[];
}

/** Per-skill statistics used across the retrospective's ranked sections. */
export interface SkillRetroStat {
  skill: string;
  invocations: number;
  failures: number;
  /** Fraction of invocations with outcome 'failed' (0-1). */
  failureRate: number;
  /** Invocations classified as abandoned mid-workflow (see isAbandonedMidWorkflow). */
  abandonedMidWorkflow: number;
  /** ISO 8601 timestamp of the most recent invocation. */
  lastUsed: string;
  /** Whole days between lastUsed and the reference "now". */
  daysSinceLastUse: number;
}

/** Telemetry-coverage context: how much of the catalog emits any signal at all. */
export interface RetrospectiveCoverage {
  /** Total catalog skills, or null when the catalog was not supplied. */
  catalogSize: number | null;
  /** Catalog skills that appear at least once in telemetry, or null. */
  everInvoked: number | null;
  /** Catalog skills with zero telemetry, or null. */
  neverInvoked: number | null;
}

/** A complete catalog retrospective over a set of adoption records. */
export interface RetrospectiveReport {
  /** When the report was generated (ISO 8601). */
  generatedAt: string;
  /** Earliest record timestamp, or null when there are no records. */
  windowStart: string | null;
  /** Latest record timestamp, or null when there are no records. */
  windowEnd: string | null;
  /** Whole days spanned by the record window. */
  windowDays: number;
  /** Total records considered. */
  totalRecords: number;
  /** Count of distinct skills invoked. */
  distinctSkills: number;
  /** Inactivity threshold (days) used for the stale-skills section. */
  inactiveDaysThreshold: number;
  /** Row cap applied to each ranked section. */
  topN: number;
  /** Most-invoked skills, descending. */
  topInvoked: SkillRetroStat[];
  /** Skills with the most failures, descending (failures then rate). */
  topFailing: SkillRetroStat[];
  /** Skills with the most abandoned-mid-workflow runs, descending. */
  abandonedMidWorkflow: SkillRetroStat[];
  /** Ever-invoked skills quiet for at least inactiveDaysThreshold days. */
  staleSkills: SkillRetroStat[];
  /** Telemetry-coverage context across the catalog. */
  coverage: RetrospectiveCoverage;
}

/**
 * Classifies a record as "abandoned mid-workflow": either an explicit
 * `abandoned` outcome, or a non-completed run that had already reached at
 * least one phase before stopping (partial progress then gave up).
 */
export function isAbandonedMidWorkflow(record: SkillInvocationRecord): boolean {
  if (record.outcome === 'abandoned') return true;
  return record.outcome !== 'completed' && record.phasesReached.length > 0;
}

function resolveNowMs(records: SkillInvocationRecord[], now?: Date): number {
  if (now) return now.getTime();
  let latest = Number.NEGATIVE_INFINITY;
  for (const record of records) {
    const t = Date.parse(record.startedAt);
    if (!Number.isNaN(t) && t > latest) latest = t;
  }
  return latest === Number.NEGATIVE_INFINITY ? Date.now() : latest;
}

function buildStat(skill: string, records: SkillInvocationRecord[], nowMs: number): SkillRetroStat {
  const invocations = records.length;
  const failures = records.filter((r) => r.outcome === 'failed').length;
  const abandoned = records.filter(isAbandonedMidWorkflow).length;
  const timestamps = records.map((r) => r.startedAt).sort();
  const lastUsed = timestamps[timestamps.length - 1]!;
  const daysSinceLastUse = Math.floor((nowMs - Date.parse(lastUsed)) / DAY_MS);

  return {
    skill,
    invocations,
    failures,
    failureRate: failures / invocations,
    abandonedMidWorkflow: abandoned,
    lastUsed,
    daysSinceLastUse,
  };
}

function groupBySkill(records: SkillInvocationRecord[]): Map<string, SkillInvocationRecord[]> {
  const map = new Map<string, SkillInvocationRecord[]>();
  for (const record of records) {
    const bucket = map.get(record.skill);
    if (bucket) bucket.push(record);
    else map.set(record.skill, [record]);
  }
  return map;
}

function computeCoverage(
  invokedSkills: Set<string>,
  catalogSkills?: string[]
): RetrospectiveCoverage {
  if (!catalogSkills) {
    return { catalogSize: null, everInvoked: null, neverInvoked: null };
  }
  const catalog = new Set(catalogSkills);
  let everInvoked = 0;
  for (const skill of catalog) {
    if (invokedSkills.has(skill)) everInvoked++;
  }
  return {
    catalogSize: catalog.size,
    everInvoked,
    neverInvoked: catalog.size - everInvoked,
  };
}

/**
 * Derives a full catalog retrospective from a set of adoption records.
 * Pure: all inputs are explicit, so callers can supply a fixed `now` for
 * deterministic output.
 */
export function getCatalogRetrospectiveReport(
  records: SkillInvocationRecord[],
  options: RetrospectiveOptions = {}
): RetrospectiveReport {
  const inactiveDaysThreshold = options.inactiveDays ?? 90;
  const topN = options.topN ?? 10;
  const nowMs = resolveNowMs(records, options.now);
  const generatedAt = (options.now ?? new Date()).toISOString();

  const bySkill = groupBySkill(records);
  const stats = Array.from(bySkill.entries()).map(([skill, recs]) => buildStat(skill, recs, nowMs));

  const topInvoked = [...stats]
    .sort((a, b) => b.invocations - a.invocations || a.skill.localeCompare(b.skill))
    .slice(0, topN);

  const topFailing = stats
    .filter((s) => s.failures > 0)
    .sort(
      (a, b) =>
        b.failures - a.failures || b.failureRate - a.failureRate || a.skill.localeCompare(b.skill)
    )
    .slice(0, topN);

  const abandonedMidWorkflow = stats
    .filter((s) => s.abandonedMidWorkflow > 0)
    .sort(
      (a, b) => b.abandonedMidWorkflow - a.abandonedMidWorkflow || a.skill.localeCompare(b.skill)
    )
    .slice(0, topN);

  const staleSkills = stats
    .filter((s) => s.daysSinceLastUse >= inactiveDaysThreshold)
    .sort((a, b) => b.daysSinceLastUse - a.daysSinceLastUse || a.skill.localeCompare(b.skill));

  const timestamps = records.map((r) => r.startedAt).sort();
  const windowStart = timestamps[0] ?? null;
  const windowEnd = timestamps[timestamps.length - 1] ?? null;
  const windowDays =
    windowStart && windowEnd
      ? Math.max(0, Math.round((Date.parse(windowEnd) - Date.parse(windowStart)) / DAY_MS))
      : 0;

  return {
    generatedAt,
    windowStart,
    windowEnd,
    windowDays,
    totalRecords: records.length,
    distinctSkills: bySkill.size,
    inactiveDaysThreshold,
    topN,
    topInvoked,
    topFailing,
    abandonedMidWorkflow,
    staleSkills,
    coverage: computeCoverage(new Set(bySkill.keys()), options.catalogSkills),
  };
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function statRow(s: SkillRetroStat): string {
  return `| \`${s.skill}\` | ${s.invocations} | ${s.failures} (${formatRate(s.failureRate)}) | ${s.abandonedMidWorkflow} | ${s.lastUsed.slice(0, 10)} |`;
}

function renderStatSection(title: string, rows: SkillRetroStat[], emptyNote: string): string {
  if (rows.length === 0) return `### ${title}\n\n_${emptyNote}_\n`;
  const header =
    '| Skill | Invocations | Failures | Abandoned mid-workflow | Last used |\n' +
    '| ----- | ----------- | -------- | ---------------------- | --------- |';
  return `### ${title}\n\n${header}\n${rows.map(statRow).join('\n')}\n`;
}

function renderOverview(report: RetrospectiveReport): string {
  const lines = ['## Overview', '', `- **Generated:** ${report.generatedAt}`];
  if (report.windowStart && report.windowEnd) {
    lines.push(
      `- **Window:** ${report.windowStart.slice(0, 10)} → ${report.windowEnd.slice(0, 10)} (${report.windowDays} days)`
    );
  } else {
    lines.push('- **Window:** no records');
  }
  lines.push(`- **Records:** ${report.totalRecords} across ${report.distinctSkills} skill(s)`);

  const { catalogSize, everInvoked, neverInvoked } = report.coverage;
  if (catalogSize != null && everInvoked != null && neverInvoked != null) {
    lines.push(
      `- **Telemetry coverage:** ${everInvoked}/${catalogSize} catalog skills have emitted telemetry (${neverInvoked} never invoked)`
    );
  }
  return lines.join('\n');
}

function staleEmptyNote(report: RetrospectiveReport): string {
  const base = `No ever-invoked skill is inactive ≥${report.inactiveDaysThreshold} days.`;
  if (report.windowDays < report.inactiveDaysThreshold) {
    return `${base} Note: the record window (${report.windowDays} days) is shorter than the threshold, so this signal cannot fire yet.`;
  }
  return base;
}

/**
 * Renders a retrospective report as a Markdown document suitable for
 * `docs/retrospectives/<date>.md`.
 */
export function renderRetrospectiveMarkdown(report: RetrospectiveReport): string {
  const sections = [
    `# Catalog Retrospective — ${report.generatedAt.slice(0, 10)}`,
    renderOverview(report),
    renderStatSection('Top skills by invocations', report.topInvoked, 'No invocations recorded.'),
    renderStatSection('Top failing skills', report.topFailing, 'No failing skills recorded.'),
    renderStatSection(
      'Abandoned mid-workflow',
      report.abandonedMidWorkflow,
      'No abandoned-mid-workflow runs recorded.'
    ),
    renderStatSection(
      `Stale skills (inactive ≥${report.inactiveDaysThreshold} days)`,
      report.staleSkills,
      staleEmptyNote(report)
    ),
  ];

  return sections.join('\n\n').trimEnd() + '\n';
}
