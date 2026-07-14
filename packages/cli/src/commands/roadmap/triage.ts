// packages/cli/src/commands/roadmap/triage.ts
//
// Roadmap Auto-Triage — Phase 1, Task 6: the read-only triage report.
//
// `harness roadmap triage` parses the roadmap aggregate, runs the pure four-lever scoping
// probe over every ACTIONABLE item, ranks the results by the pilot score (impact secondary
// sort), and renders a human table or `--json`. It is GATED behind `roadmap.autoTriage.enabled`
// (default false): when off, the report is inert and nothing runs (SC8 / SC-S1). It NEVER
// writes to roadmap.md or code — read-only.
//
// Offline by default: no AnalysisProvider is wired here, so the semantic-read + open-decisions
// levers degrade to `unknown` and the report holds everything to human (fail-safe). A live SEL
// model is wired later (Phase 2/3) — the read-only report degrades gracefully without one.

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseRoadmap } from '@harness-engineering/core';
import type { GraphStore } from '@harness-engineering/graph';
import type { Roadmap, RoadmapFeature, Issue } from '@harness-engineering/types';
import {
  triageIssue,
  rankTriageCandidates,
  type RankableCandidate,
  type TriageVerdict,
} from '@harness-engineering/orchestrator';
import { loadGraphStore } from '../../mcp/utils/graph-loader';
import { resolveConfig } from '../../config/loader';
import { logger } from '../../output/logger';

/** A triaged row: the verdict plus the pilot-ranking inputs derived from the feature. */
export interface TriageReportRow extends RankableCandidate {
  name: string;
  status: string;
  verdict: TriageVerdict;
}

/** Confidence enum → numeric for the pilot score. */
const CONFIDENCE_SCORE: Record<'low' | 'medium' | 'high', number> = { low: 1, medium: 2, high: 3 };

/** Complexity level → effort proxy (trivial cheapest). */
const EFFORT_BY_LEVEL: Record<string, number> = { trivial: 1, simple: 2, moderate: 3, complex: 4 };

/** Priority → impact proxy (roadmap has no explicit impact field; P0 highest, none = neutral). */
const IMPACT_BY_PRIORITY: Record<string, number> = { P0: 4, P1: 3, P2: 2, P3: 1 };

/**
 * A feature is ACTIONABLE for triage when it is `planned` or `backlog` (the same eligible
 * lifecycle roadmap-pilot selects from). in-progress/done/blocked/needs-human are excluded —
 * they are not awaiting a triage decision.
 */
export function isActionable(feature: RoadmapFeature): boolean {
  return feature.status === 'planned' || feature.status === 'backlog';
}

/** Map a `RoadmapFeature` onto the unified `Issue` model the probe wiring consumes. */
export function featureToIssue(feature: RoadmapFeature): Issue {
  return {
    id: feature.name,
    identifier: feature.name,
    title: feature.name,
    description: feature.summary,
    priority: null,
    state: feature.status,
    branchName: null,
    url: null,
    labels: [],
    blockedBy: feature.blockedBy.map((b) => ({ id: b, identifier: b, state: null })),
    spec: feature.spec,
    plans: feature.plans,
    createdAt: null,
    updatedAt: feature.updatedAt ?? null,
    externalId: feature.externalId ?? null,
    assignee: feature.assignee ?? null,
  };
}

/** Derive the pilot-ranking inputs (impact/confidence/effort) from a feature + its verdict. */
function rankingInputs(
  feature: RoadmapFeature,
  verdict: TriageVerdict
): Pick<RankableCandidate, 'impact' | 'confidence' | 'effort'> {
  return {
    impact: feature.priority ? (IMPACT_BY_PRIORITY[feature.priority] ?? 2) : 2,
    confidence: CONFIDENCE_SCORE[verdict.verdict.confidence],
    effort: EFFORT_BY_LEVEL[verdict.verdict.level] ?? 3,
  };
}

/**
 * Pure report core: triage every actionable feature in `roadmap` and rank the verdicts.
 * The probe deps are injected so this is unit-testable offline (no live model, graph optional).
 */
export async function runTriageReport(
  roadmap: Roadmap,
  deps: {
    graphStore?: GraphStore | null;
    config?: { boundedScopeMax?: number; dispatchConfidence?: 'low' | 'medium' | 'high' };
  } = {}
): Promise<TriageReportRow[]> {
  const features = roadmap.milestones.flatMap((m) => m.features).filter(isActionable);
  const rows: TriageReportRow[] = [];
  for (const feature of features) {
    const verdict = await triageIssue(featureToIssue(feature), {
      ...(deps.graphStore ? { graphStore: deps.graphStore } : {}),
      ...(deps.config ? { config: deps.config } : {}),
    });
    rows.push({
      externalId: verdict.externalId,
      name: feature.name,
      status: feature.status,
      ...rankingInputs(feature, verdict),
      verdict,
    });
  }
  return rankTriageCandidates(rows);
}

/** Render the ranked rows as a human-readable report. */
export function renderHuman(rows: TriageReportRow[]): string {
  if (rows.length === 0) return 'No actionable roadmap items to triage.';
  const lines: string[] = [];
  lines.push(`Triaged ${rows.length} actionable item(s):\n`);
  for (const row of rows) {
    const v = row.verdict;
    const badge = v.dispatchable ? '✓ DISPATCHABLE' : `✗ HELD (${v.holdReason})`;
    lines.push(`${badge}  ${row.name}`);
    lines.push(
      `    level=${v.verdict.level} confidence=${v.verdict.confidence} ` +
        `impact=${row.impact} effort=${row.effort}`
    );
    lines.push(`    ${v.rationale}`);
    lines.push('');
  }
  const dispatchable = rows.filter((r) => r.verdict.dispatchable).length;
  lines.push(
    `${dispatchable}/${rows.length} dispatchable; ${rows.length - dispatchable} to human.`
  );
  return lines.join('\n');
}

/** Shape the ranked rows for `--json` (stable, machine-readable). */
export function renderJson(rows: TriageReportRow[]): string {
  return JSON.stringify(
    {
      count: rows.length,
      dispatchable: rows.filter((r) => r.verdict.dispatchable).length,
      items: rows.map((r) => ({
        externalId: r.externalId,
        name: r.name,
        status: r.status,
        dispatchable: r.verdict.dispatchable,
        holdReason: r.verdict.holdReason ?? null,
        level: r.verdict.verdict.level,
        confidence: r.verdict.verdict.confidence,
        impact: r.impact,
        effort: r.effort,
        pilotInputs: { impact: r.impact, confidence: r.confidence, effort: r.effort },
        levers: r.verdict.levers,
        rationale: r.verdict.rationale,
      })),
    },
    null,
    2
  );
}

/**
 * `harness roadmap triage` — the read-only, gated triage report.
 */
export function createRoadmapTriageCommand(): Command {
  return new Command('triage')
    .description(
      'Read-only triage report: score every actionable roadmap item with the four-lever ' +
        'scoping probe and rank dispatchability. Gated behind roadmap.autoTriage.enabled ' +
        '(default off); never writes. Offline by default (holds to human without a live model).'
    )
    .action(async (_opts: Record<string, never>, cmd: Command) => {
      const cwd = process.cwd();

      // Read the global `-c, --config` and `--json` options (both declared on the root
      // program). Redeclaring them on the subcommand routes the value to the root and leaves
      // the subcommand's copy undefined (commander global-option semantics), so we read the
      // resolved globals instead.
      const globalOpts = cmd.optsWithGlobals() as { config?: string; json?: boolean };

      // 1. Gate on roadmap.autoTriage.enabled (default OFF ⇒ inert, SC8/SC-S1).
      const configResult = resolveConfig(globalOpts.config);
      const enabled = configResult.ok && configResult.value.roadmap?.autoTriage?.enabled === true;
      if (!enabled) {
        logger.info(
          'Roadmap auto-triage is disabled (roadmap.autoTriage.enabled is not true). ' +
            'Enable it in harness.config.json to run the read-only triage report. No changes made.'
        );
        return;
      }

      // 2. Read + parse the roadmap aggregate (read-only).
      const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
      if (!fs.existsSync(roadmapPath)) {
        logger.error(
          `No roadmap aggregate at ${roadmapPath}. If your roadmap is sharded, run ` +
            '`harness roadmap regen` first, then re-run triage.'
        );
        process.exitCode = 1;
        return;
      }
      const parsed = parseRoadmap(fs.readFileSync(roadmapPath, 'utf-8'));
      if (!parsed.ok) {
        logger.error(`Failed to parse roadmap: ${parsed.error.message}`);
        process.exitCode = 1;
        return;
      }

      // 3. Load the knowledge graph (optional; absent ⇒ scope degrades ⇒ all held to human).
      const graphStore = await loadGraphStore(cwd);

      // 4. Triage + rank (offline: no provider wired here — read-only report).
      const rows = await runTriageReport(parsed.value, {
        ...(graphStore ? { graphStore } : {}),
      });

      // 5. Render. JSON goes straight to stdout (no logger prefix) so it stays parseable.
      if (globalOpts.json) {
        process.stdout.write(renderJson(rows) + '\n');
      } else {
        logger.info(renderHuman(rows));
      }
    });
}
