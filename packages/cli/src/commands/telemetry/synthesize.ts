import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import type {
  SkillInvocationRecord,
  UsageRecord,
  InsightsReport,
  EffectivenessSection,
  TelemetrySynthesisSection,
} from '@harness-engineering/types';
import { TELEMETRY_SYNTHESIS_SECTIONS } from '@harness-engineering/types';
import { logger } from '../../output/logger';

/** The section names a caller may `--skip`. */
const SKIPPABLE = new Set<string>(TELEMETRY_SYNTHESIS_SECTIONS);

/**
 * Reads and prices usage records exactly as `harness usage` does, so the
 * synthesized cost total matches that surface (no divergence).
 */
async function loadUsageRecords(cwd: string): Promise<UsageRecord[]> {
  const { readCostRecords, loadPricingData, calculateCost } =
    await import('@harness-engineering/core');
  const records = readCostRecords(cwd);
  if (records.length === 0) return records;
  const pricingData = await loadPricingData(cwd);
  for (const record of records) {
    if (record.model && record.costMicroUSD == null) {
      const cost = calculateCost(record, pricingData);
      if (cost != null) record.costMicroUSD = cost;
    }
  }
  return records;
}

/**
 * Builds the effectiveness projection from adoption records using the
 * intelligence scorers. Imported here (the CLI layer), never in core, to keep
 * the existing dependency direction — mirrors `adoption.ts`.
 */
function makeEffectivenessBuilder(
  scorers: typeof import('@harness-engineering/intelligence')
): (records: SkillInvocationRecord[]) => EffectivenessSection | null {
  return (records) => {
    if (records.length === 0) return null;
    const leastEffective = scorers
      .computeSkillEffectiveness(records)
      .reverse()
      .slice(0, 10)
      .map((s) => ({
        skill: s.skill,
        invocations: s.invocations,
        completed: s.completed,
        failed: s.failed,
        abandonedMidWorkflow: s.abandonedMidWorkflow,
        successRate: s.successRate,
      }));
    const failing = scorers
      .detectFailingSkills(records)
      .slice(0, 10)
      .map((s) => ({
        skill: s.skill,
        invocations: s.invocations,
        failed: s.failed,
        failureRate: s.failureRate,
      }));
    const abandoned = scorers
      .detectAbandonedSkills(records)
      .slice(0, 10)
      .map((s) => ({
        skill: s.skill,
        invocations: s.invocations,
        abandonedMidWorkflow: s.abandonedMidWorkflow,
        abandonmentRate: s.abandonmentRate,
      }));
    return { leastEffective, failing, abandoned };
  };
}

/** Reads `execution_outcome` nodes from the project graph, or null when absent. */
async function loadOutcomeNodes(
  cwd: string
): Promise<Array<{ verdict?: string; result?: string; timestamp?: string }> | null> {
  try {
    const { loadGraphStore } = await import('../../mcp/utils/graph-loader.js');
    const store = await loadGraphStore(cwd);
    if (!store) return null;
    const nodes = store.findNodes({ type: 'execution_outcome' });
    return nodes.map((n) => {
      const meta = n.metadata ?? {};
      const node: { verdict?: string; result?: string; timestamp?: string } = {};
      if (typeof meta.verdict === 'string') node.verdict = meta.verdict;
      if (typeof meta.result === 'string') node.result = meta.result;
      if (typeof meta.timestamp === 'string') node.timestamp = meta.timestamp;
      return node;
    });
  } catch {
    return null;
  }
}

/** Runs `composeInsights` defensively; a failure yields null (section absent). */
async function loadInsights(cwd: string, skip: boolean): Promise<InsightsReport | null> {
  if (skip) return null;
  try {
    const { composeInsights } = await import('@harness-engineering/core');
    return await composeInsights(cwd);
  } catch {
    return null;
  }
}

function parseWindow(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function createSynthesizeCommand(): Command {
  return new Command('synthesize')
    .description(
      'Compose adoption, effectiveness, usage, insights, and outcome telemetry into one local report'
    )
    .option('--json', 'Emit the machine-readable TelemetrySynthesis object instead of Markdown')
    .option('--out <path>', 'Write the report to a file instead of stdout')
    .option(
      '--skip <section>',
      'Omit a section (adoption|effectiveness|usage|insights|outcomes); repeatable',
      (value: string, previous: string[]) => [...previous, value],
      [] as string[]
    )
    .option('--window <days>', 'Bound adoption/usage/outcome sources to the trailing N days')
    .action(async (opts) => {
      const cwd = process.cwd();

      const skip = (opts.skip as string[]).filter((s) =>
        SKIPPABLE.has(s)
      ) as TelemetrySynthesisSection[];
      const skipSet = new Set<string>(skip);
      const windowDays = parseWindow(opts.window);

      const core = await import('@harness-engineering/core');
      const intelligence = await import('@harness-engineering/intelligence');
      const { composeSynthesis, renderSynthesisMarkdown, readAdoptionRecords } = core;

      const adoptionRecords = readAdoptionRecords(cwd);
      const usageRecords = skipSet.has('usage') ? [] : await loadUsageRecords(cwd);
      const insights = await loadInsights(cwd, skipSet.has('insights'));
      const outcomeNodes = skipSet.has('outcomes') ? null : await loadOutcomeNodes(cwd);

      const synthesis = composeSynthesis(
        {
          adoptionRecords,
          usageRecords,
          insights,
          buildEffectiveness: makeEffectivenessBuilder(intelligence),
          outcomeNodes,
        },
        { windowDays, skip }
      );

      const output = opts.json
        ? JSON.stringify(synthesis, null, 2)
        : renderSynthesisMarkdown(synthesis);

      if (opts.out) {
        const outPath = path.resolve(cwd, opts.out as string);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, output.endsWith('\n') ? output : output + '\n', 'utf-8');
        const relPath = path.relative(cwd, outPath).replaceAll('\\', '/');
        logger.info(`Telemetry synthesis written to ${relPath}`);
        return;
      }

      console.log(output);
    });
}
