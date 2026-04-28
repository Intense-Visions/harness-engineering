import { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import { logger } from '../output/logger';

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

        // Build pipeline options
        const pipelineOpts: Record<string, unknown> = {
          projectDir,
          fix: Boolean(opts.fix),
          ci: Boolean(opts.ci),
          ...(opts.domain ? { domain: opts.domain as string } : {}),
          graphDir,
          analyzeImages: Boolean(opts.analyzeImages),
        };

        // Parse image paths if provided
        if (opts.imagePaths) {
          pipelineOpts.imagePaths = (opts.imagePaths as string)
            .split(',')
            .map((p: string) => p.trim());
        }

        // Set up analysis provider for image analysis if requested
        if (opts.analyzeImages) {
          try {
            // Dynamic import — intelligence is an optional peer dependency
            const intelligence = (await import(
              '@harness-engineering/intelligence' as string
            )) as Record<string, unknown>;
            const Provider = intelligence.AnthropicAnalysisProvider as new (opts: {
              apiKey: string;
            }) => unknown;
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
              logger.error(
                'ANTHROPIC_API_KEY environment variable is required for --analyze-images'
              );
              process.exit(1);
            }
            pipelineOpts.analysisProvider = new Provider({ apiKey });
          } catch {
            logger.error(
              'Image analysis requires @harness-engineering/intelligence with ANTHROPIC_API_KEY set.'
            );
            process.exit(1);
          }
        }

        // Run pipeline
        const runner = new KnowledgePipelineRunner(store);
        const result = await runner.run(
          pipelineOpts as unknown as Parameters<typeof runner.run>[0]
        );

        // Output
        if (globalOpts.json) {
          console.log(
            JSON.stringify(
              {
                verdict: result.verdict,
                driftScore: result.driftScore,
                iterations: result.iterations,
                findings: result.findings,
                extraction: result.extraction,
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
                  domains: result.coverage.domains.length,
                },
                ...(result.materialization
                  ? {
                      materialization: {
                        created: result.materialization.created.length,
                        skipped: result.materialization.skipped.length,
                        files: result.materialization.created.map(
                          (d: { filePath: string }) => d.filePath
                        ),
                      },
                    }
                  : {}),
              },
              null,
              2
            )
          );
        } else {
          const verdictColor =
            result.verdict === 'pass'
              ? chalk.green('PASS')
              : result.verdict === 'warn'
                ? chalk.yellow('WARN')
                : chalk.red('FAIL');

          console.log('');
          console.log(`KNOWLEDGE PIPELINE -- Verdict: ${verdictColor}`);
          console.log('');
          console.log(`  Drift Score: ${result.driftScore.toFixed(2)}`);
          console.log(
            `  Findings: ${result.findings.new} new, ${result.findings.stale} stale, ${result.findings.drifted} drifted, ${result.findings.contradicting} contradicting`
          );
          console.log(
            `  Extraction: ${result.extraction.codeSignals} code signals, ${result.extraction.diagrams} diagrams, ${result.extraction.linkerFacts} linker facts, ${result.extraction.businessKnowledge} business knowledge, ${result.extraction.images} images`
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

          if (result.materialization) {
            const mat = result.materialization;
            console.log(
              `  Materialization: ${mat.created.length} docs created, ${mat.skipped.length} skipped`
            );
            for (const doc of mat.created) {
              console.log(`    ${chalk.green('+')} ${doc.filePath}`);
            }
          }

          // Contradiction report
          if (opts.checkContradictions || result.contradictions.contradictions.length > 0) {
            console.log('');
            console.log(
              `  Contradictions: ${result.contradictions.contradictions.length} detected across ${result.contradictions.totalChecked} knowledge nodes`
            );
            for (const c of result.contradictions.contradictions) {
              console.log(
                `    ${chalk.red('!')} ${c.description} [${c.conflictType}] (${c.severity})`
              );
            }
          }

          // Coverage report
          if (opts.coverage || result.coverage.domains.length > 0) {
            console.log('');
            console.log(
              `  Coverage: ${result.coverage.overallGrade} (${result.coverage.overallScore}/100)`
            );
            for (const d of result.coverage.domains) {
              console.log(
                `    ${d.domain}: ${d.grade} (${d.score}/100) — ${d.knowledgeEntries} knowledge, ${d.linkedEntities}/${d.codeEntities} code linked`
              );
            }
          }

          console.log('');
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
