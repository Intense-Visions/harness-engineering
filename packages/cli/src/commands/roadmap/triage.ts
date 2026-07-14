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
import { parseRoadmap, resolveRoadmapStoreForFile, eventSourcing } from '@harness-engineering/core';
import type { GraphStore } from '@harness-engineering/graph';
import type { Roadmap, RoadmapFeature } from '@harness-engineering/types';
import {
  triageIssue,
  rankTriageCandidates,
  runBrainstormForIssue,
  markApprovedForDispatch,
  precedentLookupFromStored,
  type RankableCandidate,
  type TriageVerdict,
  type BrainstormWiringDeps,
} from '@harness-engineering/orchestrator';
import type {
  AnalysisProvider,
  RatchetStage,
  PrecedentLookup,
  RatchetOutcome,
} from '@harness-engineering/intelligence';
import { loadGraphStore } from '../../mcp/utils/graph-loader';
import { resolveConfig } from '../../config/loader';
import { logger } from '../../output/logger';
import { resolveTriageProvider, type TriageProviderConfig } from './triage-provider.js';
import { deriveReadyCandidates, buildApprovalPlan } from './triage-approve.js';
// The shared feature/issue leaf (extracted to break the triage ↔ triage-approve import
// cycle). Re-exported so existing `import { ... } from './triage.js'` callers keep working.
import { featureToIssue, isActionable, type BrainstormReportRow } from './triage-feature.js';
export { featureToIssue, isActionable, type BrainstormReportRow } from './triage-feature.js';

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
 * Roadmap Auto-Triage — Phase 4 (SC5): build the REAL precedent lever from the Phase-0
 * TriageRecord store. Loads the accreting outcome records (a read — never a write, keeping
 * the report path read-only) and bridges them into the pure `aggregatePrecedent` via
 * `precedentLookupFromStored`. A read failure OR an empty/cold-start store degrades to
 * `undefined` here (no lever) — the probe treats an absent OR `unknown`-returning lever
 * identically (`precedent: no store / unknown ⇒ never blocks`), so behavior is BYTE-IDENTICAL
 * to today until real outcomes accrue. It can only ADD a block once a shape has enough graded
 * mispredicts to cross the (conservative, default-off) precedent block bar.
 */
export async function buildPrecedentLookup(cwd: string): Promise<PrecedentLookup | undefined> {
  const loaded = await eventSourcing.loadTriageRecords(cwd);
  // A failed store read cannot manufacture precedent; degrade to no-lever (cold-start
  // equivalent) rather than throwing out of the read-only report.
  if (!loaded.ok) return undefined;
  // Map core's StoredTriageRecord → the minimal { shapeKey, outcome:{matched} } the
  // aggregation reads. Only outcome-bearing records contribute a base-rate.
  return precedentLookupFromStored(
    loaded.value.map((r) => ({
      shapeKey: r.shapeKey,
      ...(r.outcome ? { outcome: { matched: r.outcome.matched } } : {}),
    }))
  );
}

/**
 * Roadmap Auto-Triage — Phase 4 (FIX 2 / SC6): build the PER-SHAPE graded-outcome history
 * from the Phase-0 TriageRecord store. Returns a `historyForShape(shapeKey)` lookup that the
 * approval gate uses to resolve the evidence-derived effective stage per shape. Only records
 * with a populated `outcome` (graded) contribute — one `{ matched }` per graded outcome,
 * grouped by the record's `shapeKey`. A failed store read OR an empty/cold-start store ⇒
 * every shape resolves to an EMPTY history ⇒ `resolveStage([])` = stage 1, byte-identical to
 * the Phase-3 static default. The ratchet can only advance a shape once enough graded matches
 * for THAT shape accrue.
 */
export async function buildShapeHistory(
  cwd: string
): Promise<(shapeKey: string) => readonly RatchetOutcome[]> {
  const loaded = await eventSourcing.loadTriageRecords(cwd);
  // A failed read cannot manufacture advancement evidence; degrade to no-history (cold-start).
  const byShape = new Map<string, RatchetOutcome[]>();
  if (loaded.ok) {
    // NOTE: loadTriageRecords projects LAST-WRITER-WINS per externalId, so this history is one
    // graded outcome PER ITEM (the item's latest outcome), grouped by shape — the same
    // granularity the precedent lever aggregates. (Full per-attempt history is a Phase-4
    // calibration follow-up; the conservative min-sample/window in resolveStage still holds.)
    for (const rec of loaded.value) {
      if (!rec.outcome) continue; // only graded records count toward advancement
      const list = byShape.get(rec.shapeKey) ?? [];
      list.push({ matched: rec.outcome.matched });
      byShape.set(rec.shapeKey, list);
    }
  }
  return (shapeKey: string): readonly RatchetOutcome[] => byShape.get(shapeKey) ?? [];
}

/**
 * Pure report core: triage every actionable feature in `roadmap` and rank the verdicts.
 * The probe deps are injected so this is unit-testable offline (no live model, graph optional).
 */
export async function runTriageReport(
  roadmap: Roadmap,
  deps: {
    graphStore?: GraphStore | null;
    /** The real precedent lever (SC5). Absent ⇒ cold-start `unknown` for every shape. */
    precedent?: PrecedentLookup;
    config?: { boundedScopeMax?: number; dispatchConfidence?: 'low' | 'medium' | 'high' };
  } = {}
): Promise<TriageReportRow[]> {
  const features = roadmap.milestones.flatMap((m) => m.features).filter(isActionable);
  const rows: TriageReportRow[] = [];
  for (const feature of features) {
    const verdict = await triageIssue(featureToIssue(feature), {
      ...(deps.graphStore ? { graphStore: deps.graphStore } : {}),
      ...(deps.precedent ? { precedent: deps.precedent } : {}),
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
    /** The real precedent lever (SC5). Absent ⇒ cold-start `unknown` for every shape. */
    precedent?: PrecedentLookup;
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
      ...(deps.precedent ? { precedent: deps.precedent } : {}),
      ...(deps.config ? { config: deps.config } : {}),
    });
    const level = verdict.verdict.level;

    const wiringDeps: BrainstormWiringDeps = {
      ...(deps.generator ? { generator: deps.generator } : {}),
      ...(deps.provider ? { provider: deps.provider } : {}),
      ...(deps.generatorOptions ? { generatorOptions: deps.generatorOptions } : {}),
      ...(deps.docsRoot ? { docsRoot: deps.docsRoot } : {}),
      // Re-score the enriched item on completion (SC4), reusing the same seams — the
      // precedent lever included so the RE-SCORE (the prediction the marker records) is
      // graded against real base-rates too (SC5).
      rescore: {
        ...(deps.graphStore ? { graphStore: deps.graphStore } : {}),
        ...(deps.provider ? { provider: deps.provider } : {}),
        ...(deps.precedent ? { precedent: deps.precedent } : {}),
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
 * Resolve the SEL AnalysisProvider for the brainstorm from config, preferring the FREE LOCAL
 * backend (`agent.backends.local`/`pi` → OpenAI-compatible endpoint) — the feature premise —
 * and reaching a paid cloud model ONLY via an explicit `intelligence.provider` opt-in. When no
 * provider can be resolved this returns `null` so the brainstorm halts every item to a human
 * (fail-safe — never a silent pass without a model). See `triage-provider.ts` for the order.
 *
 * The provider resolution proper lives in `resolveTriageProvider`; this thin wrapper reads the
 * resolved config once and hands it in (so a failed config read degrades to `null`, not a throw).
 */
function resolveBrainstormProvider(configPath?: string, model?: string): AnalysisProvider | null {
  const configResult = resolveConfig(configPath);
  if (!configResult.ok) return null;
  return resolveTriageProvider(configResult.value as TriageProviderConfig, model);
}

// ---------------------------------------------------------------------------
// Phase 3 (Task 4): `triage approve` — the batched human go/no-go (ratchet stage 1).
// ---------------------------------------------------------------------------

/** Options for the approve action (parsed from flags). */
interface ApproveOpts {
  approve?: string;
  approveAll?: boolean;
  config?: string;
  json?: boolean;
}

/**
 * Run the batched go/no-go: brainstorm to find READY candidates, partition by the human's
 * explicit approval through the stage-1 gate, and MARK the approved subset for the EXISTING
 * orchestrator pickup. Nothing here dispatches — the orchestrator loop picks up the now-eligible
 * items on its next tick. Returns a machine-readable summary (also used by `--json`).
 *
 * Default-off and stage-1-only: disabled ⇒ inert; any ratchet stage but 1 refuses to mark.
 */
export async function runApproveCommand(
  cwd: string,
  opts: ApproveOpts
): Promise<{
  marked: string[];
  held: Array<{ externalId: string; reason: string }>;
  note?: string;
}> {
  // 1. Gate on enabled + read the ratchet stage (Phase 3 pins stage 1).
  const configResult = resolveConfig(opts.config);
  const cfg = configResult.ok ? configResult.value : undefined;
  const autoTriage = cfg?.roadmap?.autoTriage;
  if (!autoTriage || autoTriage.enabled !== true) {
    return { marked: [], held: [], note: 'disabled' };
  }
  const stage = (autoTriage.ratchetStage ?? 1) as RatchetStage;

  // 2. Parse the roadmap aggregate (read side).
  const roadmapPath = path.join(cwd, 'docs', 'roadmap.md');
  if (!fs.existsSync(roadmapPath)) {
    return { marked: [], held: [], note: 'no-roadmap' };
  }
  const parsed = parseRoadmap(fs.readFileSync(roadmapPath, 'utf-8'));
  if (!parsed.ok) return { marked: [], held: [], note: 'roadmap-parse-error' };

  // 3. Brainstorm to surface READY candidates (spec drafted + re-score dispatchable). The
  //    provider is the FREE LOCAL backend (or explicit opt-in); absent ⇒ every item halts.
  const graphStore = await loadGraphStore(cwd);
  const provider = resolveBrainstormProvider(opts.config);
  // The real precedent lever (SC5) so the approve-flow RE-SCORE — the verdict the marker
  // records as the pre-dispatch prediction — reads real base-rates. Cold-start/empty store ⇒
  // `undefined` ⇒ `unknown` ⇒ no behavior change vs today.
  const precedent = await buildPrecedentLookup(cwd);
  const rows = await runBrainstormReport(parsed.value, {
    ...(graphStore ? { graphStore } : {}),
    ...(provider ? { provider } : {}),
    ...(precedent ? { precedent } : {}),
    docsRoot: path.join(cwd, 'docs'),
  });
  const ready = deriveReadyCandidates(rows, parsed.value);

  // 4. Partition by the human's explicit approval through the pure go/no-go gate. The gate now
  //    resolves the effective autonomy stage PER-SHAPE from recorded evidence (SC6): the config
  //    `stage` is only a CEILING. Build the per-shape graded-outcome history from the SAME store
  //    the retrospective writes; cold-start/empty ⇒ every shape resolves stage 1 (identical to
  //    the Phase-3 static default). A failed store read ⇒ empty history ⇒ cold-start (never a
  //    silent advance).
  const approvedIds = new Set(
    (opts.approve ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
  const historyForShape = await buildShapeHistory(cwd);
  const plan = buildApprovalPlan(ready, {
    approvedIds,
    ...(opts.approveAll ? { approveAll: true } : {}),
    stage,
    historyForShape,
  });

  // 5. MARK the approved subset — makes them eligible for the EXISTING orchestrator pickup.
  //    No new dispatch path: the marker only attaches the spec + records the prediction.
  const store = resolveRoadmapStoreForFile({ roadmapPath });
  const recordPrediction = (payload: eventSourcing.TriagePredictedInput) =>
    eventSourcing.recordTriagePrediction(cwd, payload);
  // NOTE: `selfAssignee` is intentionally omitted, so the marker's assignee gate is
  // inactive here. It is redundant at this call site because `deriveReadyCandidates`
  // already pre-filters to actionable (planned/backlog, unclaimed) features — a
  // non-self-assigned item never reaches `plan.toMark`. The gate stays available on
  // the marker for other call-sites that DO have an identity to enforce.
  const result = await markApprovedForDispatch(plan.toMark, {
    store,
    config: { enabled: true, ratchetStage: stage },
    recordPrediction,
  });
  if (!result.ok) {
    return { marked: [], held: plan.held, note: `mark-failed: ${result.error.message}` };
  }
  return { marked: result.value.marked, held: plan.held };
}

/** Render the approve result for the human. */
function renderApproveHuman(res: Awaited<ReturnType<typeof runApproveCommand>>): string {
  if (res.note === 'disabled') {
    return (
      'Roadmap auto-triage is disabled (roadmap.autoTriage.enabled is not true). ' +
      'Enable it to use `triage approve`. No changes made.'
    );
  }
  if (res.note === 'no-roadmap') return 'No roadmap aggregate at docs/roadmap.md. No changes made.';
  if (res.note === 'roadmap-parse-error') return 'Failed to parse roadmap. No changes made.';
  const lines: string[] = [];
  if (res.marked.length > 0) {
    lines.push(`Marked ${res.marked.length} item(s) eligible for orchestrator pickup:`);
    for (const id of res.marked) lines.push(`  ✓ ${id}`);
  } else {
    lines.push('No items marked.');
  }
  if (res.held.length > 0) {
    lines.push(`\nHeld to human (${res.held.length}):`);
    for (const h of res.held) lines.push(`  ✗ ${h.externalId} — ${h.reason}`);
  }
  if (res.note && res.note.startsWith('mark-failed')) lines.push(`\nERROR: ${res.note}`);
  lines.push(
    '\nApproved items are NOT dispatched here — the existing orchestrator pickup loop ' +
      'dispatches them through its normal gating on its next tick.'
  );
  return lines.join('\n');
}

/** `harness roadmap triage approve` — batched human go/no-go over ready candidates. */
export function createTriageApproveCommand(): Command {
  return new Command('approve')
    .description(
      'Batched human go/no-go (autonomy ratchet stage 1): review READY candidates (Phase-2 ' +
        'spec-bearing, re-score dispatchable) and approve a subset. Approved + auto-executable ' +
        'items are MARKED eligible for the EXISTING orchestrator pickup — nothing is dispatched ' +
        'here, and nothing is marked without an explicit approval. Gated behind ' +
        'roadmap.autoTriage.enabled (default off).'
    )
    .option(
      '--approve <ids>',
      'Comma-separated externalIds to approve (the explicit human go). Omit to mark nothing.'
    )
    .option('--approve-all', 'Approve every READY candidate (still subject to the category gate).')
    .action(async (opts: { approve?: string; approveAll?: boolean }, cmd: Command) => {
      const cwd = process.cwd();
      const globalOpts = cmd.optsWithGlobals() as { config?: string; json?: boolean };
      const res = await runApproveCommand(cwd, {
        ...opts,
        ...(globalOpts.config !== undefined ? { config: globalOpts.config } : {}),
      });
      if (globalOpts.json) {
        process.stdout.write(JSON.stringify(res, null, 2) + '\n');
      } else {
        logger.info(renderApproveHuman(res));
      }
    });
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

      // 3b. Build the REAL precedent lever from the accreting outcome store (SC5). This is a
      //     READ (the report path stays read-only); a cold-start/empty store degrades to
      //     `undefined` ⇒ every shape reads `unknown` ⇒ byte-identical to today. It can only
      //     ADD a hold once graded mispredicts cross the conservative precedent block bar.
      const precedent = await buildPrecedentLookup(cwd);

      // 4a. --brainstorm mode: draft specs (docs only) or halt to human. No dispatch.
      if (opts.brainstorm) {
        // Resolve the SEL provider from config — the FREE LOCAL backend by default, cloud only
        // via an explicit intelligence.provider opt-in. Absent ⇒ the brainstorm halts every
        // item to a human (fail-safe) — never a silent pass without a model.
        const provider = resolveBrainstormProvider(globalOpts.config);
        const rows = await runBrainstormReport(parsed.value, {
          ...(graphStore ? { graphStore } : {}),
          ...(provider ? { provider } : {}),
          ...(precedent ? { precedent } : {}),
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
        ...(precedent ? { precedent } : {}),
      });

      // 5. Render. JSON goes straight to stdout (no logger prefix) so it stays parseable.
      if (globalOpts.json) {
        process.stdout.write(renderJson(rows) + '\n');
      } else {
        logger.info(renderHuman(rows));
      }
    })
    .addCommand(createTriageApproveCommand());
}
