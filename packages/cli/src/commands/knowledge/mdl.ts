import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildKnowledgeEntriesFromLearnings,
  buildMdlReport,
  loadRelevantLearnings,
  DEFAULT_MDL_CONFIG,
  type InclusionEvent,
  type KnowledgeEntry,
  type MdlReport,
  type RunOutcome,
} from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

interface MdlOptions {
  path: string;
  stream?: string;
  telemetry?: string;
}

/** Shape of an optional telemetry file: inclusion + outcome ledgers. */
interface TelemetryFile {
  inclusions: InclusionEvent[];
  outcomes: RunOutcome[];
}

interface ResolvedTelemetry {
  telemetry: TelemetryFile;
  hasTelemetry: boolean;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Load the learnings store and ground it in knowledge entries. Throws on IO error. */
async function loadEntries(projectPath: string, stream?: string): Promise<KnowledgeEntry[]> {
  const loaded = await loadRelevantLearnings(projectPath, undefined, stream);
  if (!loaded.ok) throw loaded.error;
  return buildKnowledgeEntriesFromLearnings(loaded.value);
}

/** Read the optional inclusion/outcome telemetry file. Absent file → empty (all-insufficient). */
function resolveTelemetry(file?: string): ResolvedTelemetry {
  if (!file) return { telemetry: { inclusions: [], outcomes: [] }, hasTelemetry: false };
  const resolved = path.resolve(file);
  // harness-ignore SEC-DES-001: reading an operator-provided telemetry file by explicit --telemetry path
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf-8')) as Partial<TelemetryFile>;
  const inclusions = Array.isArray(parsed.inclusions) ? parsed.inclusions : [];
  const outcomes = Array.isArray(parsed.outcomes) ? parsed.outcomes : [];
  return { telemetry: { inclusions, outcomes }, hasTelemetry: inclusions.length > 0 };
}

function renderReport(report: MdlReport, hasTelemetry: boolean): void {
  console.log('\nKnowledge store MDL ledger (report-only — recommendations, no deletion)\n');
  console.log(`  entries scored            ${report.entryCount}`);
  console.log(`  total description length  ${report.totalDescriptionLength} tokens`);
  console.log(`  total measured value      ${Math.round(report.totalMeasuredValue)} tokens`);
  console.log(`  net store MDL             ${Math.round(report.netStoreMdl)} tokens`);
  console.log(
    `  insufficient evidence     ${report.insufficientEvidenceCount} (retained by default)`
  );

  if (!hasTelemetry) {
    console.log(
      '\n  No inclusion/outcome telemetry supplied (--telemetry). Every entry is scored\n' +
        '  "insufficient-evidence" — the correct first-class verdict. Pruning requires\n' +
        '  measured worthlessness, never measurement absence.'
    );
  }

  renderCandidates(report);
  console.log('');
}

function renderCandidates(report: MdlReport): void {
  if (report.pruneCandidates.length > 0) {
    console.log('\n  Pending prune candidates (reversible tombstone plan):');
    for (const p of report.pruneCandidates) {
      console.log(`    ${p.entryId}  net ${Math.round(p.netMdl)} tokens — ${p.rationale}`);
    }
  }
  if (report.mergeCandidates.length > 0) {
    console.log('\n  Pending merge/consolidate candidates:');
    for (const m of report.mergeCandidates) {
      console.log(
        `    ${m.entryIds.join(' + ')}  saves ${m.savings} tokens ` +
          `(union ${m.unionDescriptionLength} < sum ${m.sumDescriptionLength}, overlap ${m.overlapScore.toFixed(2)})`
      );
    }
  }
  if (report.pruneCandidates.length === 0 && report.mergeCandidates.length === 0) {
    console.log('\n  No prune or merge candidates.');
  }
}

async function handleMdl(opts: MdlOptions, asJson: boolean): Promise<void> {
  let entries: KnowledgeEntry[];
  let resolved: ResolvedTelemetry;
  try {
    entries = await loadEntries(path.resolve(opts.path), opts.stream);
    resolved = resolveTelemetry(opts.telemetry);
  } catch (error) {
    logger.error(toMessage(error));
    process.exit(ExitCode.ERROR);
    return;
  }

  const report = buildMdlReport(
    entries,
    resolved.telemetry.inclusions,
    resolved.telemetry.outcomes,
    DEFAULT_MDL_CONFIG
  );

  if (asJson) console.log(JSON.stringify(report, null, 2));
  else renderReport(report, resolved.hasTelemetry);
  process.exit(ExitCode.SUCCESS);
}

export function createMdlCommand(): Command {
  return new Command('mdl')
    .description(
      'Score the knowledge store by Minimum Description Length — description cost vs ' +
        'measured compression value — and report reversible prune/merge recommendations (report-only)'
    )
    .option('--path <path>', 'Project root path', '.')
    .option('--stream <name>', 'Target a specific stream')
    .option(
      '--telemetry <file>',
      'JSON file with { inclusions: InclusionEvent[], outcomes: RunOutcome[] } linking entries to run outcomes'
    )
    .action(async (opts: MdlOptions, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();
      await handleMdl(opts, Boolean(globalOpts.json));
    });
}
