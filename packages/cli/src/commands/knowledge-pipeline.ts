import { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import { resolveConfig } from '../config/loader';
import type { HarnessConfig } from '../config/schema';
import type { KnowledgePipelineResult } from '@harness-engineering/graph';
import { logger } from '../output/logger';

interface KnowledgePipelineCommandOptions {
  fix?: boolean;
  ci?: boolean;
  domain?: string;
  analyzeImages?: boolean;
  imagePaths?: string;
  driftCheck?: boolean;
  coverage?: boolean;
  checkContradictions?: boolean;
}

/**
 * Resolve inference options from harness.config.json (knowledge.*).
 * Mapping: knowledge.domainPatterns -> extraPatterns
 *          knowledge.domainBlocklist -> extraBlocklist
 * Absent / missing config: returns undefined; runner defaults to {}.
 */
function resolveInferenceOptions(
  cfgKnowledge: HarnessConfig['knowledge']
): Record<string, unknown> | undefined {
  const patterns = cfgKnowledge?.domainPatterns;
  const blocklist = cfgKnowledge?.domainBlocklist;
  const hasPatterns = (patterns?.length ?? 0) > 0;
  const hasBlocklist = (blocklist?.length ?? 0) > 0;
  if (!hasPatterns && !hasBlocklist) {
    return undefined;
  }
  return {
    ...(hasPatterns ? { extraPatterns: patterns } : {}),
    ...(hasBlocklist ? { extraBlocklist: blocklist } : {}),
  };
}

/** Build the runner option bag from CLI flags and resolved config. */
function buildPipelineOptions(
  opts: KnowledgePipelineCommandOptions,
  projectDir: string,
  graphDir: string,
  inferenceOptions: Record<string, unknown> | undefined,
  extractionExclude: readonly string[],
  docDirs: { docsDir?: string; adrDir?: string }
): Record<string, unknown> {
  const pipelineOpts: Record<string, unknown> = {
    projectDir,
    fix: Boolean(opts.fix),
    ci: Boolean(opts.ci),
    ...(opts.domain ? { domain: opts.domain } : {}),
    graphDir,
    analyzeImages: Boolean(opts.analyzeImages),
    ...(inferenceOptions ? { inferenceOptions } : {}),
    ...(extractionExclude.length > 0 ? { extractionExclude } : {}),
    // Configured documentation directories so phase-1 ingestion honors a
    // relocated docsDir / adrDir instead of the hardcoded defaults (#1330).
    ...(docDirs.docsDir ? { docsDir: docDirs.docsDir } : {}),
    ...(docDirs.adrDir ? { adrDir: docDirs.adrDir } : {}),
  };

  // Parse image paths if provided
  if (opts.imagePaths) {
    pipelineOpts.imagePaths = opts.imagePaths.split(',').map((p) => p.trim());
  }

  return pipelineOpts;
}

/**
 * Set up the analysis provider for image analysis. Exits the process with a
 * helpful message when the optional intelligence peer dependency or the
 * ANTHROPIC_API_KEY are unavailable.
 */
async function createAnalysisProvider(): Promise<unknown> {
  try {
    // Dynamic import — intelligence is an optional peer dependency
    const intelligence = (await import('@harness-engineering/intelligence' as string)) as Record<
      string,
      unknown
    >;
    const Provider = intelligence.AnthropicAnalysisProvider as new (opts: {
      apiKey: string;
    }) => unknown;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.error('ANTHROPIC_API_KEY environment variable is required for --analyze-images');
      process.exit(1);
    }
    return new Provider({ apiKey });
  } catch {
    logger.error(
      'Image analysis requires @harness-engineering/intelligence with ANTHROPIC_API_KEY set.'
    );
    process.exit(1);
  }
}

/** Emit the machine-readable JSON report. */
function printJsonResult(result: KnowledgePipelineResult): void {
  console.log(
    JSON.stringify(
      {
        verdict: result.verdict,
        baselineEmpty: result.baselineEmpty,
        driftScore: result.driftScore,
        iterations: result.iterations,
        findings: result.findings,
        extraction: result.extraction,
        errors: result.errors,
        gaps: {
          domains: result.gaps.domains.length,
          totalEntries: result.gaps.totalEntries,
          totalExtracted: result.gaps.totalExtracted,
          totalGaps: result.gaps.totalGaps,
        },
        remediations: result.remediations,
        contradictions: {
          count: result.contradictions.contradictions.length,
          sourcePairCounts: result.contradictions.sourcePairCounts,
        },
        coverage: {
          overallScore: result.coverage.overallScore,
          overallGrade: result.coverage.overallGrade,
          graphPresent: result.coverage.graphPresent,
          measuredDomainCount: result.coverage.measuredDomainCount,
          domains: result.coverage.domains.length,
        },
        ...(result.materialization
          ? {
              materialization: {
                created: result.materialization.created.length,
                skipped: result.materialization.skipped.length,
                files: result.materialization.created.map((d: { filePath: string }) => d.filePath),
              },
            }
          : {}),
      },
      null,
      2
    )
  );
}

/**
 * True when this looks like a first run: an empty baseline, or purely-new
 * findings with nothing stale/drifted/contradicting. Drives the drift-score
 * label so a ~1.0 score is not misread as "everything drifted" (#1110, #1335).
 */
function isFirstRun(result: KnowledgePipelineResult): boolean {
  const f = result.findings;
  if (result.baselineEmpty) return true;
  return f.new > 0 && f.stale === 0 && f.drifted === 0 && f.contradicting === 0;
}

/** Colorized verdict badge for the summary header. */
function verdictBadge(verdict: KnowledgePipelineResult['verdict']): string {
  switch (verdict) {
    case 'pass':
      return chalk.green('PASS');
    case 'warn':
      return chalk.yellow('WARN');
    case 'abstain':
      return chalk.magenta('ABSTAIN');
    default:
      return chalk.red('FAIL');
  }
}

/** Print the verdict header plus drift / findings / extraction / gaps summary. */
function printSummary(result: KnowledgePipelineResult): void {
  console.log('');
  console.log(`KNOWLEDGE PIPELINE -- Verdict: ${verdictBadge(result.verdict)}`);
  if (result.verdict === 'abstain') {
    // The verdict itself is the abstention; spell out why so a zero-baseline run
    // is never mistaken for a clean one (#1335).
    console.log(
      chalk.magenta(
        '  Inconclusive — empty baseline (no prior business knowledge). Every entry is new, so there is no denominator to grade health against. Re-run after an initial scan to establish a baseline.'
      )
    );
  }
  console.log('');
  // On a first run every finding is `new` (no prior graph state), which drives
  // the drift score toward 1.00. Label it so the headline is not misread as
  // "everything drifted" when the verdict beneath it abstains / warns (#1110, #1335).
  const driftLabel = isFirstRun(result) ? ' (first run — no prior graph state)' : '';
  console.log(`  Drift Score: ${result.driftScore.toFixed(2)}${driftLabel}`);
  console.log(
    `  Findings: ${result.findings.new} new, ${result.findings.stale} stale, ${result.findings.drifted} drifted, ${result.findings.contradicting} contradicting`
  );
  console.log(
    `  Extraction: ${result.extraction.codeSignals} code signals, ${result.extraction.diagrams} diagrams, ${result.extraction.linkerFacts} linker facts, ${result.extraction.businessKnowledge} business knowledge, ${result.extraction.decisions} decisions, ${result.extraction.images} images`
  );
  console.log(
    `  Gaps: ${result.gaps.domains.length} domains — ${result.gaps.totalEntries} documented / ${result.gaps.totalExtracted} extracted / ${result.gaps.totalGaps} undocumented`
  );
  if (result.iterations > 1) {
    console.log(`  Convergence: ${result.iterations} iterations`);
  }
  if (result.remediations.length > 0) {
    console.log(`  Remediations: ${result.remediations.length} applied`);
  }
}

/**
 * Surface ingestion errors — frontmatter / parse / read failures that would
 * otherwise be silently dropped. Routed to stderr so pipelines parsing the
 * success stream stay unaffected.
 */
function printIngestionErrors(result: KnowledgePipelineResult): void {
  if (result.errors.length === 0) {
    return;
  }
  console.warn('');
  console.warn(`  ${result.errors.length} ingestion warning(s):`);
  for (const err of result.errors) {
    console.warn(`    - ${err}`);
  }
}

/** Print the materialization summary and created doc paths. */
function printMaterialization(result: KnowledgePipelineResult): void {
  if (!result.materialization) {
    return;
  }
  const mat = result.materialization;
  console.log(
    `  Materialization: ${mat.created.length} docs created, ${mat.skipped.length} skipped`
  );
  for (const doc of mat.created) {
    console.log(`    ${chalk.green('+')} ${doc.filePath}`);
  }
}

/** Print the cross-source contradiction report. */
function printContradictions(
  result: KnowledgePipelineResult,
  opts: KnowledgePipelineCommandOptions
): void {
  if (!opts.checkContradictions && result.contradictions.contradictions.length === 0) {
    return;
  }
  console.log('');
  console.log(
    `  Contradictions: ${result.contradictions.contradictions.length} detected across ${result.contradictions.totalChecked} knowledge nodes`
  );
  for (const c of result.contradictions.contradictions) {
    console.log(`    ${chalk.red('!')} ${c.description} [${c.conflictType}] (${c.severity})`);
  }
}

/** Print the per-domain coverage report. */
function printCoverage(
  result: KnowledgePipelineResult,
  opts: KnowledgePipelineCommandOptions
): void {
  if (!opts.coverage && result.coverage.domains.length === 0) {
    return;
  }
  console.log('');

  const cov = result.coverage;

  // No graph (or an empty one): abstain loudly and point at the escalation the
  // SKILL already specifies, rather than emitting a confident failing grade on
  // no data (#1110).
  if (!cov.graphPresent) {
    console.log(`  Coverage: ${chalk.yellow('N/A')} — no graph found (gap-analysis mode)`);
    console.log(`    Run ${chalk.cyan('harness graph scan')} to enable coverage grading.`);
    return;
  }

  const overall =
    cov.overallGrade === 'N/A'
      ? `${chalk.yellow('N/A')} — no measurable domains (run ${chalk.cyan('harness graph scan')})`
      : `${cov.overallGrade} (${cov.overallScore}/100)`;
  console.log(`  Coverage: ${overall}`);

  for (const d of cov.domains) {
    if (!d.measured) {
      // No linkable-code denominator (0/0): report undetermined, not F.
      console.log(
        `    ${d.domain}: ${chalk.yellow('N/A')} — ${d.knowledgeEntries} knowledge, no code to link (run graph scan)`
      );
      continue;
    }
    console.log(
      `    ${d.domain}: ${d.grade} (${d.score}/100) — ${d.knowledgeEntries} knowledge, ${d.linkedEntities}/${d.codeEntities} code linked`
    );
  }
}

/** Render the full human-readable report. */
function printHumanResult(
  result: KnowledgePipelineResult,
  opts: KnowledgePipelineCommandOptions
): void {
  printSummary(result);
  printIngestionErrors(result);
  printMaterialization(result);
  printContradictions(result, opts);
  printCoverage(result, opts);
  console.log('');
}

export function createKnowledgePipelineCommand(): Command {
  return new Command('knowledge-pipeline')
    .description('Run knowledge extraction, drift detection, and gap analysis')
    .option('--fix', 'Enable convergence-based auto-remediation (default: detect-only)')
    .option('--ci', 'Non-interactive mode — apply safe fixes only, report everything else')
    .option('--domain <name>', 'Limit pipeline to a specific knowledge domain')
    .option('--drift-check', 'Exit 1 if unresolved drift exists (CI gate mode)')
    .option('--analyze-images', 'Enable vision model analysis of image files')
    .option('--image-paths <paths>', 'Comma-separated image file paths for analysis')
    .option('--coverage', 'Display per-domain coverage report')
    .option('--check-contradictions', 'Display cross-source contradiction report')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectDir = process.cwd();

      try {
        const graphDir = path.join(projectDir, '.harness', 'graph');
        const fs = await import('node:fs/promises');
        await fs.mkdir(graphDir, { recursive: true });

        const { GraphStore, KnowledgePipelineRunner } = await import('@harness-engineering/graph');

        // Load or create graph
        const store = new GraphStore();
        try {
          await store.load(graphDir);
        } catch {
          // Fresh graph
        }

        const cfgResult = resolveConfig();
        const cfg = cfgResult.ok ? cfgResult.value : undefined;
        const cfgKnowledge = cfg?.knowledge;
        const inferenceOptions = resolveInferenceOptions(cfgKnowledge);
        const extractionExclude = cfgKnowledge?.extractionExclude ?? [];
        // docsDir has a schema default of './docs'; adrDir is optional under
        // operationalPolicy (default docs/knowledge/decisions applied downstream).
        const docDirs = {
          ...(cfg?.docsDir ? { docsDir: cfg.docsDir } : {}),
          ...(cfg?.operationalPolicy?.adrDir ? { adrDir: cfg.operationalPolicy.adrDir } : {}),
        };

        // Build pipeline options
        const pipelineOpts = buildPipelineOptions(
          opts,
          projectDir,
          graphDir,
          inferenceOptions,
          extractionExclude,
          docDirs
        );

        // Set up analysis provider for image analysis if requested
        if (opts.analyzeImages) {
          pipelineOpts.analysisProvider = await createAnalysisProvider();
        }

        // Run pipeline
        const runner = new KnowledgePipelineRunner(store);
        const result = await runner.run(
          pipelineOpts as unknown as Parameters<typeof runner.run>[0]
        );

        // Output
        if (globalOpts.json) {
          printJsonResult(result);
        } else {
          printHumanResult(result, opts);
        }

        // CI gate
        const unresolvedDrift =
          result.findings.drifted + result.findings.stale + result.findings.contradicting;
        if (opts.driftCheck && unresolvedDrift > 0) {
          logger.error(
            `${unresolvedDrift} unresolved drift findings. Run /harness:knowledge-pipeline --fix to remediate.`
          );
          process.exit(1);
        }
      } catch (error) {
        logger.error(
          `Knowledge pipeline failed: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });
}
