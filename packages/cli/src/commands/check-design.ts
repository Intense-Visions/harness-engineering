// CONVENTION (informal, extract to Verifier<F> interface on the 3rd check-* command):
//
//   Verifier output:
//     { findings: F[],
//       summary: { ..., bySeverity, byCode, durationMs },
//       ... }
//
// Both runAnatomyAudit and runDesignCraft already return this shape. When
// check-craft or check-arch (or similar) lands as the 3rd composer command,
// extract a Verifier<F> interface and have all three implement it. Until
// then this file deliberately uses the shape conventionally — premature
// abstraction with only 2 data points would constrain the wrong axis.
//
// See: docs/changes/design-pipeline/check-design-verifier/proposal.md
//      decision Q1 (Verifier-shape convention).

import { Command } from 'commander';
import type { Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import { DesignConstraintAdapter, GraphStore } from '@harness-engineering/graph';
import type { CraftFindingRecord } from '@harness-engineering/graph';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { runAudit as runAnatomyAudit } from '../mcp/tools/audit-anatomy';
import type { AuditAnatomyOutput } from '../mcp/tools/audit-anatomy';
import { runDesignCraft } from '../mcp/tools/design-craft';
import { runDetectDrift } from '../mcp/tools/detect-drift';
import type { AnatomyFinding } from '../audit/component-anatomy/findings/finding';
import type { CraftFinding } from '../design-craft/findings/schema';
import type { DriftFinding } from '../drift/findings/finding';

type Mode = 'fast' | 'full';

interface CheckDesignOptions {
  cwd?: string;
  configPath?: string;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  files?: string[];
  mode?: Mode;
}

interface CheckDesignResult {
  valid: boolean;
  findingsByVerifier: {
    anatomy: AnatomyFinding[];
    craft: CraftFinding[];
    drift: DriftFinding[];
  };
  summary: {
    totalFindings: number;
    bySeverity: Record<'error' | 'warn' | 'info', number>;
    byCode: Record<string, number>;
    verifiersRun: string[];
    verifiersFailed: Array<{ name: string; error: string }>;
    durationMs: number;
  };
  graphPersisted: {
    constraintsAdded: number;
    edgesAdded: number;
  };
}

/**
 * Run the check-design verifier — single-pass design check composing
 * audit-component-anatomy and design-craft critique. Mirrors check-docs
 * structure exactly. Designed to be composed by the (future) #5
 * design-pipeline orchestrator inside its convergence fix loop.
 */
export async function runCheckDesign(
  options: CheckDesignOptions
): Promise<Result<CheckDesignResult, CLIError>> {
  const startedAt = Date.now();
  const cwd = options.cwd ?? process.cwd();
  const mode: Mode = options.mode ?? 'full';

  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return configResult;
  }

  const verifiersRun: string[] = [];
  const verifiersFailed: Array<{ name: string; error: string }> = [];
  const anatomyFindings: AnatomyFinding[] = [];
  const craftFindings: CraftFinding[] = [];
  const driftFindings: DriftFinding[] = [];

  // VERIFIER 1: audit-component-anatomy
  try {
    const anatomyOut: AuditAnatomyOutput = await runAnatomyAudit({
      path: cwd,
      mode,
      ...(options.files !== undefined && { files: options.files }),
    });
    anatomyFindings.push(...anatomyOut.findings);
    verifiersRun.push('audit-anatomy');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    verifiersFailed.push({ name: 'audit-anatomy', error: message });
    logger.warn(`audit-anatomy verifier failed: ${message}`);
  }

  // VERIFIER 2: design-craft critique
  try {
    const craftResult = await runDesignCraft({
      path: cwd,
      mode: mode === 'fast' ? 'fast' : 'fast', // deep mode not in MVP per design-craft spec
      phases: ['critique'],
      ...(options.files !== undefined && { files: options.files }),
    });
    if (craftResult.ok) {
      craftFindings.push(...craftResult.value.findings);
      verifiersRun.push('design-craft-critique');
    } else {
      verifiersFailed.push({
        name: 'design-craft-critique',
        error: craftResult.error.message,
      });
      logger.warn(`design-craft verifier failed: ${craftResult.error.message}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    verifiersFailed.push({ name: 'design-craft-critique', error: message });
    logger.warn(`design-craft verifier failed: ${message}`);
  }

  // VERIFIER 3: detect-design-drift
  try {
    const driftOut = await runDetectDrift({
      path: cwd,
      mode,
      ...(options.files !== undefined && { files: options.files }),
    });
    driftFindings.push(...driftOut.findings);
    verifiersRun.push('detect-drift');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    verifiersFailed.push({ name: 'detect-drift', error: message });
    logger.warn(`detect-drift verifier failed: ${message}`);
  }

  // Aggregate summary
  const bySeverity: Record<'error' | 'warn' | 'info', number> = {
    error: 0,
    warn: 0,
    info: 0,
  };
  const byCode: Record<string, number> = {};

  for (const f of anatomyFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }

  // CraftFinding uses tier as primary axis; map to severity for aggregation:
  //   tier=foundational → error, tier=polish → warn, tier=aspirational → info
  // Per ADR 0019: severity is a derived field for legacy reporters.
  for (const f of craftFindings) {
    const sev = craftTierToSeverity(f.tier);
    bySeverity[sev] = (bySeverity[sev] ?? 0) + 1;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }

  for (const f of driftFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }

  const totalFindings = anatomyFindings.length + craftFindings.length + driftFindings.length;

  // Persist to graph
  const graphPersisted = await persistFindings(anatomyFindings, craftFindings, driftFindings);

  const durationMs = Date.now() - startedAt;

  const result: CheckDesignResult = {
    // valid is false if any error-severity finding OR any verifier failed
    valid: bySeverity.error === 0 && verifiersFailed.length === 0,
    findingsByVerifier: {
      anatomy: anatomyFindings,
      craft: craftFindings,
      drift: driftFindings,
    },
    summary: {
      totalFindings,
      bySeverity,
      byCode,
      verifiersRun,
      verifiersFailed,
      durationMs,
    },
    graphPersisted,
  };

  return Ok(result);
}

function craftTierToSeverity(
  tier: 'foundational' | 'polish' | 'aspirational'
): 'error' | 'warn' | 'info' {
  switch (tier) {
    case 'foundational':
      return 'error';
    case 'polish':
      return 'warn';
    case 'aspirational':
      return 'info';
  }
}

/**
 * Convert findings to CraftFindingRecord shape and persist via the graph
 * adapter. Idempotent — re-running on the same findings produces no
 * duplicate edges (the adapter dedupes by from\0to\0type key).
 *
 * Uses an in-memory GraphStore for this run. The check-design MVP does
 * NOT persist to .harness/graph/ on disk — that's a separate concern
 * for #5 orchestrator (which owns convergence-loop state lifetime).
 * Re-runs of check-design alone get fresh state; the recordFindings call
 * is exercised to validate the contract and ensure the audits' findings
 * can be persisted.
 */
async function persistFindings(
  anatomyFindings: readonly AnatomyFinding[],
  craftFindings: readonly CraftFinding[],
  driftFindings: readonly DriftFinding[]
): Promise<CheckDesignResult['graphPersisted']> {
  const store = new GraphStore();
  const adapter = new DesignConstraintAdapter(store);

  const records: CraftFindingRecord[] = [
    ...anatomyFindings.map(
      (f): CraftFindingRecord => ({
        code: f.code,
        file: f.file,
        ...(f.line !== null && f.line !== undefined && { line: f.line }),
        message: f.message,
        severity: f.severity,
        evidence: f.evidence?.snippet,
      })
    ),
    ...craftFindings.map(
      (f): CraftFindingRecord => ({
        code: f.code,
        file: f.target.file,
        ...(f.target.line !== undefined && { line: f.target.line }),
        message: f.message,
        severity: craftTierToSeverity(f.tier),
      })
    ),
    ...driftFindings.map(
      (f): CraftFindingRecord => ({
        code: f.code,
        file: f.file,
        ...(f.line !== null && f.line !== undefined && { line: f.line }),
        message: f.message,
        severity: f.severity,
        evidence: f.evidence?.snippet,
      })
    ),
  ];

  return adapter.recordFindings(records);
}

// ─────────────────────────────────────────────────────────
// Output formatting
// ─────────────────────────────────────────────────────────

function printCheckDesignResult(
  value: CheckDesignResult,
  mode: OutputModeType,
  formatter: OutputFormatter
): void {
  const summaryLine = `${value.summary.totalFindings} finding${value.summary.totalFindings === 1 ? '' : 's'}`;
  console.log(formatter.formatSummary('check-design', summaryLine, value.valid));

  if (mode === OutputMode.QUIET) return;

  printVerifierSection('audit-anatomy', value.findingsByVerifier.anatomy.length, () =>
    printAnatomyFindings(value.findingsByVerifier.anatomy, mode === OutputMode.VERBOSE)
  );

  printVerifierSection('design-craft critique', value.findingsByVerifier.craft.length, () =>
    printCraftFindings(value.findingsByVerifier.craft, mode === OutputMode.VERBOSE)
  );

  printVerifierSection('detect-drift', value.findingsByVerifier.drift.length, () =>
    printDriftFindings(value.findingsByVerifier.drift, mode === OutputMode.VERBOSE)
  );

  if (value.summary.verifiersFailed.length > 0) {
    console.log('\nVerifiers that failed:');
    for (const failed of value.summary.verifiersFailed) {
      console.log(`  - ${failed.name}: ${failed.error}`);
    }
  }

  console.log(
    `\n${value.summary.bySeverity.error} error, ${value.summary.bySeverity.warn} warn, ${value.summary.bySeverity.info} info`
  );
  console.log(
    `Graph: +${value.graphPersisted.constraintsAdded} constraint(s), +${value.graphPersisted.edgesAdded} edge(s)`
  );
}

function printVerifierSection(name: string, count: number, printer: () => void): void {
  console.log(`\n${name} (${count} finding${count === 1 ? '' : 's'})`);
  if (count > 0) printer();
}

function printAnatomyFindings(findings: readonly AnatomyFinding[], verbose: boolean): void {
  const byFile = groupByFile(findings, (f) => f.file);
  for (const [file, fs] of byFile) {
    console.log(`  ${file}`);
    for (const f of fs) {
      const line = f.line !== null && f.line !== undefined ? `:${f.line}` : '';
      console.log(`    ${f.code} [${f.severity}]    line${line}: ${f.message}`);
      if (verbose) {
        console.log(`                         fix: ${f.fix.description}`);
      }
    }
  }
}

function printCraftFindings(findings: readonly CraftFinding[], verbose: boolean): void {
  const byFile = groupByFile(findings, (f) => f.target.file);
  for (const [file, fs] of byFile) {
    console.log(`  ${file}`);
    for (const f of fs) {
      const line = f.target.line !== undefined ? `:${f.target.line}` : '';
      const sev = craftTierToSeverity(f.tier);
      console.log(
        `    ${f.code} [${sev} / tier:${f.tier} / impact:${f.impact} / conf:${f.confidence}]    line${line}: ${f.message}`
      );
      if (verbose && f.after !== undefined) {
        console.log(`                         after: ${f.after}`);
      }
    }
  }
}

function printDriftFindings(findings: readonly DriftFinding[], verbose: boolean): void {
  const byFile = groupByFile(findings, (f) => f.file);
  for (const [file, fs] of byFile) {
    console.log(`  ${file}`);
    for (const f of fs) {
      const line = f.line !== null && f.line !== undefined ? `:${f.line}` : '';
      console.log(`    ${f.code} [${f.severity}]    line${line}: ${f.message}`);
      if (verbose) {
        console.log(`                         fix: ${f.fix.description}`);
      }
    }
  }
}

function groupByFile<T>(items: readonly T[], getFile: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const f = getFile(item);
    const list = map.get(f) ?? [];
    list.push(item);
    map.set(f, list);
  }
  return map;
}

// ─────────────────────────────────────────────────────────
// Commander wiring
// ─────────────────────────────────────────────────────────

export function createCheckDesignCommand(): Command {
  const command = new Command('check-design')
    .description(
      'Run the design verifier suite (component-anatomy + design-craft critique). ' +
        'Mirrors `harness check-docs`. Single-pass; the convergence fix loop lives ' +
        'in the design-pipeline orchestrator (sub-project #5).'
    )
    .option('-m, --mode <mode>', 'Audit mode: fast | full', 'full')
    .option(
      '-f, --files <files...>',
      'Optional file/glob scoping. Defaults to all project source files.'
    )
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(mode);

      const result = await runCheckDesign({
        configPath: globalOpts.config,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
        ...(opts.files !== undefined && { files: opts.files }),
        ...(opts.mode !== undefined && { mode: opts.mode as Mode }),
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result.value, null, 2));
      } else {
        printCheckDesignResult(result.value, mode, formatter);
      }

      // Exit codes per spec:
      //   0 = no error-severity findings AND all verifiers ran
      //   1 = one or more error-severity findings
      //   2 = at least one verifier failed (degraded run)
      const hasErrors = result.value.summary.bySeverity.error > 0;
      const degraded = result.value.summary.verifiersFailed.length > 0;
      process.exit(
        hasErrors ? ExitCode.VALIDATION_FAILED : degraded ? ExitCode.ERROR : ExitCode.SUCCESS
      );
    });

  return command;
}
