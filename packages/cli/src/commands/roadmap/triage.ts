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
  runBrainstormForIssue,
  type RankableCandidate,
  type TriageVerdict,
  type BrainstormWiringDeps,
  type WiredBrainstormResult,
} from '@harness-engineering/orchestrator';
import type { AnalysisProvider } from '@harness-engineering/intelligence';
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

// ---------------------------------------------------------------------------
// Phase 2 (Task 5): the `--brainstorm` mode — docs only, no dispatch, default-off.
// ---------------------------------------------------------------------------

/** One brainstormed row: the item + its Phase-1 level + the wired brainstorm result. */
export interface BrainstormReportRow {
  externalId: string;
  name: string;
  status: string;
  /** The Phase-1 complexity level that scaled the brainstorm depth. */
  level: TriageVerdict['verdict']['level'];
  result: WiredBrainstormResult;
}

/**
 * Pure brainstorm-report core: for each actionable feature, run the Phase-1 probe (for the
 * complexity level) and then the autonomous brainstorm. Deps are injected so this is
 * unit-testable offline (no live model). Produces DOCUMENTS only — no dispatch, no execution.
 *
 * A completed brainstorm writes a proposal-shaped spec (when `docsRoot` is set) and re-scores;
 * a halt yields the fork + reason handoff. With no provider wired, the brainstorm halts on
 * every item (`error` reason: "no model wired") — the fail-safe, human-in-loop default.
 */
export async function runBrainstormReport(
  roadmap: Roadmap,
  deps: {
    provider?: AnalysisProvider | null;
    graphStore?: GraphStore | null;
    docsRoot?: string;
    config?: { boundedScopeMax?: number; dispatchConfidence?: 'low' | 'medium' | 'high' };
    /** Self-consistency / model options threaded to the SEL generator. */
    generatorOptions?: BrainstormWiringDeps['generatorOptions'];
    /** Test seam: inject a fork generator directly (bypasses the live provider). */
    generator?: BrainstormWiringDeps['generator'];
  } = {}
): Promise<BrainstormReportRow[]> {
  const features = roadmap.milestones.flatMap((m) => m.features).filter(isActionable);
  const rows: BrainstormReportRow[] = [];
  for (const feature of features) {
    const issue = featureToIssue(feature);
    // Phase-1 probe supplies the complexity level that scales the brainstorm depth.
    const verdict = await triageIssue(issue, {
      ...(deps.graphStore ? { graphStore: deps.graphStore } : {}),
      ...(deps.provider ? { provider: deps.provider } : {}),
      ...(deps.config ? { config: deps.config } : {}),
    });
    const level = verdict.verdict.level;

    const wiringDeps: BrainstormWiringDeps = {
      ...(deps.generator ? { generator: deps.generator } : {}),
      ...(deps.provider ? { provider: deps.provider } : {}),
      ...(deps.generatorOptions ? { generatorOptions: deps.generatorOptions } : {}),
      ...(deps.docsRoot ? { docsRoot: deps.docsRoot } : {}),
      // Re-score the enriched item on completion (SC4), reusing the same seams.
      rescore: {
        ...(deps.graphStore ? { graphStore: deps.graphStore } : {}),
        ...(deps.provider ? { provider: deps.provider } : {}),
        ...(deps.config ? { config: deps.config } : {}),
      },
    };
    const result = await runBrainstormForIssue(issue, level, wiringDeps);
    rows.push({
      externalId: verdict.externalId,
      name: feature.name,
      status: feature.status,
      level,
      result,
    });
  }
  return rows;
}

/** Render the brainstorm rows as a human-readable report (specs written + halt handoffs). */
export function renderBrainstormHuman(rows: BrainstormReportRow[]): string {
  if (rows.length === 0) return 'No actionable roadmap items to brainstorm.';
  const lines: string[] = [];
  lines.push(`Brainstormed ${rows.length} actionable item(s):\n`);
  for (const row of rows) {
    const o = row.result.outcome;
    if (o.kind === 'completed') {
      const where = row.result.specPath ? ` → ${row.result.specPath}` : ' (dry run — no docs root)';
      lines.push(`✓ SPEC DRAFTED  ${row.name} [${row.level}]${where}`);
      lines.push(`    ${o.spec.decisions.length} fork(s) resolved at high confidence`);
      if (row.result.rescore) {
        const rv = row.result.rescore;
        lines.push(
          `    re-score: ${rv.dispatchable ? 'DISPATCHABLE' : `held (${rv.holdReason})`} ` +
            `— ${rv.verdict.level}/${rv.verdict.confidence}`
        );
      }
    } else {
      lines.push(`✗ HALTED → HUMAN  ${row.name} [${row.level}]  (${o.reason})`);
      lines.push(`    fork: ${o.fork.question || o.fork.id}`);
      lines.push(`    ${o.detail}`);
    }
    lines.push('');
  }
  const completed = rows.filter((r) => r.result.outcome.kind === 'completed').length;
  lines.push(
    `${completed}/${rows.length} spec(s) drafted; ${rows.length - completed} halted to human.`
  );
  return lines.join('\n');
}

/** Shape the brainstorm rows for `--json` (stable, machine-readable). */
export function renderBrainstormJson(rows: BrainstormReportRow[]): string {
  return JSON.stringify(
    {
      count: rows.length,
      drafted: rows.filter((r) => r.result.outcome.kind === 'completed').length,
      items: rows.map((r) => {
        const o = r.result.outcome;
        return {
          externalId: r.externalId,
          name: r.name,
          status: r.status,
          level: r.level,
          outcome: o.kind,
          ...(o.kind === 'completed'
            ? {
                specPath: r.result.specPath ?? null,
                forks: o.spec.decisions.map((d) => ({
                  id: d.fork.id,
                  question: d.fork.question,
                  recommendation: d.recommendation,
                  confidence: d.confidence,
                })),
                rescore: r.result.rescore
                  ? {
                      dispatchable: r.result.rescore.dispatchable,
                      holdReason: r.result.rescore.holdReason ?? null,
                      level: r.result.rescore.verdict.level,
                      confidence: r.result.rescore.verdict.confidence,
                    }
                  : null,
              }
            : {
                halt: {
                  reason: o.reason,
                  fork: { id: o.fork.id, question: o.fork.question },
                  detail: o.detail,
                },
              }),
        };
      }),
    },
    null,
    2
  );
}

/**
 * Resolve a real SEL AnalysisProvider for the brainstorm. Mirrors acceptance-eval.ts: build
 * an AnthropicAnalysisProvider when ANTHROPIC_API_KEY is present; otherwise null so the
 * brainstorm halts every item to a human (fail-safe — never a silent pass without a model).
 */
async function resolveBrainstormProvider(model?: string): Promise<AnalysisProvider | null> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const intelligence = (await import('@harness-engineering/intelligence')) as Record<
      string,
      unknown
    >;
    const Provider = intelligence.AnthropicAnalysisProvider as
      | (new (opts: { apiKey: string; defaultModel?: string }) => AnalysisProvider)
      | undefined;
    if (typeof Provider !== 'function') return null;
    return new Provider(model !== undefined ? { apiKey, defaultModel: model } : { apiKey });
  } catch {
    return null;
  }
}

/**
 * `harness roadmap triage` — the read-only, gated triage report.
 */
export function createRoadmapTriageCommand(): Command {
  return new Command('triage')
    .description(
      'Read-only triage report: score every actionable roadmap item with the four-lever ' +
        'scoping probe and rank dispatchability. Gated behind roadmap.autoTriage.enabled ' +
        '(default off); never writes. Offline by default (holds to human without a live model). ' +
        'With --brainstorm, additionally run the autonomous brainstorm per candidate, emitting ' +
        'a drafted spec (docs only) or a halt handoff (fork + reason) — still no dispatch.'
    )
    .option(
      '--brainstorm',
      'Run the autonomous brainstorm per candidate: draft a spec (docs only) or halt to a ' +
        'human at the first fork it can not confidently recommend. No dispatch, no execution.'
    )
    .action(async (opts: { brainstorm?: boolean }, cmd: Command) => {
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

      // 4a. --brainstorm mode: draft specs (docs only) or halt to human. No dispatch.
      if (opts.brainstorm) {
        // Resolve a SEL provider (Anthropic via env). Absent ⇒ the brainstorm halts every
        // item to a human (fail-safe) — never a silent pass without a model.
        const provider = await resolveBrainstormProvider();
        const rows = await runBrainstormReport(parsed.value, {
          ...(graphStore ? { graphStore } : {}),
          ...(provider ? { provider } : {}),
          // Specs are written under docs/changes/<slug>/proposal.md (docs only, no dispatch).
          docsRoot: path.join(cwd, 'docs'),
        });
        if (globalOpts.json) {
          process.stdout.write(renderBrainstormJson(rows) + '\n');
        } else {
          logger.info(renderBrainstormHuman(rows));
        }
        return;
      }

      // 4b. Triage + rank (offline: no provider wired here — read-only report).
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
