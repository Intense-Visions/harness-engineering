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
import { resolveProject } from '../config/loader';
import { OutputFormatter, OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { runAudit as runAnatomyAudit } from '../mcp/tools/audit-anatomy';
import type { AuditAnatomyOutput } from '../mcp/tools/audit-anatomy';
import { runDesignCraft } from '../mcp/tools/design-craft';
import { runDetectDrift } from '../mcp/tools/detect-drift';
import { runAuditBrand } from '../mcp/tools/audit-brand';
import type { AnatomyFinding } from '../audit/component-anatomy/findings/finding';
import type { CraftFinding } from '../design-craft/findings/schema';
import type { DriftFinding } from '../drift/findings/finding';
import type { BrandFinding } from '../brand/findings/finding';

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
    brand: BrandFinding[];
  };
  summary: {
    totalFindings: number;
    bySeverity: Record<'error' | 'warn' | 'info', number>;
    byCode: Record<string, number>;
    verifiersRun: string[];
    verifiersFailed: Array<{ name: string; error: string }>;
    /**
     * Verifiers the project turned off via `design.audit.*.enabled: false`.
     * Distinct from both `verifiersRun` and `verifiersFailed`: a disabled
     * verifier did not run, so rendering it as `(0 findings)` would make an
     * acknowledged opt-out look like a clean result — the same conflation
     * #2070 is about.
     */
    verifiersDisabled: string[];
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
  const mode: Mode = options.mode ?? 'full';

  // Root the scan on the project that owns the config, not `process.cwd()`:
  // `-c` used to select the config file while the scan stayed on the current
  // directory, so pointing it at another project measured THIS tree. Same
  // split `check-arch` was fixed out of under #911 (9f322084c).
  const projectResult = resolveProject(options.configPath, options.cwd);
  if (!projectResult.ok) {
    return projectResult;
  }
  const { config, root: cwd } = projectResult.value;

  // Per-verifier opt-out, honouring the SAME config keys `harness validate`
  // already reads (`validate.ts:527/585/635`). This command read none of them:
  // `grep -n "enabled" check-design.ts` returned nothing before this change.
  // That mattered the moment the verifiers started abstaining, because the
  // documented escape from an abstention is to acknowledge the verifier does
  // not apply — and on this command that escape did not exist (#2070).
  const anatomyEnabled = config.design?.audit?.componentAnatomy?.enabled !== false;
  const driftEnabled = config.design?.audit?.driftDetection?.enabled !== false;
  const brandEnabled = config.design?.audit?.brandCompliance?.enabled !== false;

  const verifiersRun: string[] = [];
  const verifiersFailed: Array<{ name: string; error: string }> = [];
  const verifiersDisabled: string[] = [];
  if (!anatomyEnabled) verifiersDisabled.push('audit-anatomy');
  if (!driftEnabled) verifiersDisabled.push('detect-drift');
  if (!brandEnabled) verifiersDisabled.push('audit-brand');
  const anatomyFindings: AnatomyFinding[] = [];
  const craftFindings: CraftFinding[] = [];
  const driftFindings: DriftFinding[] = [];
  const brandFindings: BrandFinding[] = [];

  // VERIFIER 1: audit-component-anatomy
  if (anatomyEnabled) {
    try {
      const anatomyOut: AuditAnatomyOutput = await runAnatomyAudit({
        path: cwd,
        mode,
        ...(options.files !== undefined && { files: options.files }),
      });
      anatomyFindings.push(...anatomyOut.findings);
      verifiersRun.push('audit-anatomy');
    } catch (err) {
      // No logger.warn here, nor in the three siblings below. `logger.warn` is
      // `console.log`, i.e. STDOUT, so a warned abstention prefixed a non-JSON
      // line to `--json` output and every machine consumer got a parse error
      // instead of a payload. The abstention is not lost: `verifiersFailed` is
      // rendered in the text report and carried in `--json`, which is where it
      // belongs. Verifiers failing was near-unreachable before #2070; abstaining
      // honestly is what made this live.
      const message = err instanceof Error ? err.message : String(err);
      verifiersFailed.push({ name: 'audit-anatomy', error: message });
    }
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
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    verifiersFailed.push({ name: 'design-craft-critique', error: message });
  }

  // VERIFIER 3: detect-design-drift
  if (driftEnabled) {
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
    }
  }

  // VERIFIER 4: audit-brand-compliance
  if (brandEnabled) {
    try {
      const brandOut = await runAuditBrand({
        path: cwd,
        mode,
        ...(options.files !== undefined && { files: options.files }),
      });
      brandFindings.push(...brandOut.findings);
      verifiersRun.push('audit-brand');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      verifiersFailed.push({ name: 'audit-brand', error: message });
    }
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

  for (const f of brandFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  }

  const totalFindings =
    anatomyFindings.length + craftFindings.length + driftFindings.length + brandFindings.length;

  // Persist to graph
  const graphPersisted = await persistFindings(
    anatomyFindings,
    craftFindings,
    driftFindings,
    brandFindings
  );

  const durationMs = Date.now() - startedAt;

  const result: CheckDesignResult = {
    // valid is false if any error-severity finding OR any verifier failed
    valid: bySeverity.error === 0 && verifiersFailed.length === 0,
    findingsByVerifier: {
      anatomy: anatomyFindings,
      craft: craftFindings,
      drift: driftFindings,
      brand: brandFindings,
    },
    summary: {
      totalFindings,
      bySeverity,
      byCode,
      verifiersRun,
      verifiersFailed,
      verifiersDisabled,
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
  driftFindings: readonly DriftFinding[],
  brandFindings: readonly BrandFinding[]
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
    ...brandFindings.map(
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

  // A verifier that abstained must not be rendered as `(0 findings)`. That is
  // the #2070 symptom in the human report: "audit-anatomy (0 findings)" reads
  // as clean, and a reader who skims past the failure section below takes it
  // that way. Zero findings and zero reading are different claims.
  const abstained = new Set(value.summary.verifiersFailed.map((f) => f.name));
  const disabled = new Set(value.summary.verifiersDisabled);

  printVerifierSection(
    'audit-anatomy',
    value.findingsByVerifier.anatomy.length,
    abstained,
    disabled,
    () => printAnatomyFindings(value.findingsByVerifier.anatomy, mode === OutputMode.VERBOSE)
  );

  printVerifierSection(
    'design-craft critique',
    value.findingsByVerifier.craft.length,
    abstained,
    disabled,
    () => printCraftFindings(value.findingsByVerifier.craft, mode === OutputMode.VERBOSE),
    'design-craft-critique'
  );

  printVerifierSection(
    'detect-drift',
    value.findingsByVerifier.drift.length,
    abstained,
    disabled,
    () => printDriftFindings(value.findingsByVerifier.drift, mode === OutputMode.VERBOSE)
  );

  printVerifierSection(
    'audit-brand',
    value.findingsByVerifier.brand.length,
    abstained,
    disabled,
    () => printBrandFindings(value.findingsByVerifier.brand, mode === OutputMode.VERBOSE)
  );

  if (value.summary.verifiersFailed.length > 0) {
    console.log('\nVerifiers that did not run (this report is incomplete):');
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

/**
 * Print one verifier's section. `abstained` holds the names recorded in
 * `verifiersFailed`; `verifierKey` is the name used there when it differs from
 * the display label.
 */
function printVerifierSection(
  name: string,
  count: number,
  abstained: ReadonlySet<string>,
  disabled: ReadonlySet<string>,
  printer: () => void,
  verifierKey: string = name
): void {
  if (disabled.has(verifierKey)) {
    // An acknowledged opt-out, not a clean result.
    console.log(`\n${name} (disabled by config — did not run)`);
    return;
  }
  if (abstained.has(verifierKey)) {
    console.log(`\n${name} (did not run — see below)`);
    return;
  }
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

function printBrandFindings(findings: readonly BrandFinding[], verbose: boolean): void {
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
        'in the design-pipeline orchestrator.'
    )
    .option('-m, --mode <mode>', 'Audit mode: fast | full', 'full')
    .option(
      '-f, --files <files...>',
      'Optional scoping by explicit file path (globs are not expanded). ' +
        'Defaults to all project source files.'
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
