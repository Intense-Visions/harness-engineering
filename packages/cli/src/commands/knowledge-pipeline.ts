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
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectDir = globalOpts.cwd ?? process.cwd();

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

        // Run pipeline
        const runner = new KnowledgePipelineRunner(store);
        const result = await runner.run({
          projectDir,
          fix: Boolean(opts.fix),
          ci: Boolean(opts.ci),
          ...(opts.domain ? { domain: opts.domain as string } : {}),
          graphDir,
        });

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
                },
                remediations: result.remediations,
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
            `  Extraction: ${result.extraction.codeSignals} code signals, ${result.extraction.diagrams} diagrams, ${result.extraction.linkerFacts} linker facts, ${result.extraction.businessKnowledge} business knowledge`
          );
          console.log(
            `  Gaps: ${result.gaps.domains.length} domains, ${result.gaps.totalEntries} total entries`
          );
          if (result.iterations > 1) {
            console.log(`  Convergence: ${result.iterations} iterations`);
          }
          if (result.remediations.length > 0) {
            console.log(`  Remediations: ${result.remediations.length} applied`);
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
