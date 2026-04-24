import { Command } from 'commander';
import * as path from 'node:path';
import chalk from 'chalk';
import { logger } from '../output/logger';

export function createKnowledgePipelineCommand(): Command {
  return new Command('knowledge-pipeline')
    .description('Run knowledge extraction, drift detection, and gap analysis')
    .option('--drift-check', 'Exit 1 if unresolved drift exists (CI gate mode)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectDir = globalOpts.cwd ?? process.cwd();

      try {
        const graphDir = path.join(projectDir, '.harness', 'graph');
        const fs = await import('node:fs/promises');

        // Ensure graph directory exists
        await fs.mkdir(graphDir, { recursive: true });

        const {
          GraphStore,
          DiagramParser,
          StructuralDriftDetector,
          KnowledgeStagingAggregator,
          createExtractionRunner,
        } = await import('@harness-engineering/graph');

        // Load or create graph
        const store = new GraphStore();
        try {
          await store.load(graphDir);
        } catch {
          // Fresh graph
        }

        // ── Phase 1: EXTRACT ──

        // Run code signal extractors
        const extractedDir = path.join(projectDir, '.harness', 'knowledge', 'extracted');
        await fs.mkdir(extractedDir, { recursive: true });
        const runner = createExtractionRunner();
        const extractionResult = await runner.run(projectDir, store, extractedDir);

        // Run diagram parsers
        const diagramParser = new DiagramParser(store);
        const diagramResult = await diagramParser.ingest(projectDir);

        // ── Phase 2: RECONCILE ──

        // Build current snapshot from graph business_* nodes
        const businessNodes = store
          .findNodes({ type: 'business_concept' })
          .concat(store.findNodes({ type: 'business_rule' }))
          .concat(store.findNodes({ type: 'business_process' }))
          .concat(store.findNodes({ type: 'business_term' }))
          .concat(store.findNodes({ type: 'business_metric' }))
          .concat(store.findNodes({ type: 'business_fact' }));

        // Build snapshots using simple content hashing
        const currentSnapshot = {
          entries: businessNodes.map((n) => ({
            id: n.id,
            type: n.type,
            contentHash: n.hash ?? n.id,
            source: (n.metadata?.source as string) ?? 'unknown',
            name: n.name,
          })),
          timestamp: new Date().toISOString(),
        };

        // Fresh snapshot = nodes added during this extraction
        const freshNodes = store
          .findNodes({ type: 'business_concept' })
          .concat(store.findNodes({ type: 'business_rule' }))
          .concat(store.findNodes({ type: 'business_process' }))
          .concat(store.findNodes({ type: 'business_term' }))
          .concat(store.findNodes({ type: 'business_metric' }))
          .concat(store.findNodes({ type: 'business_fact' }));

        const freshSnapshot = {
          entries: freshNodes.map((n) => ({
            id: n.id,
            type: n.type,
            contentHash: n.hash ?? n.id,
            source: (n.metadata?.source as string) ?? 'unknown',
            name: n.name,
          })),
          timestamp: new Date().toISOString(),
        };

        // Run drift detection
        const detector = new StructuralDriftDetector();
        const driftResult = detector.detect(currentSnapshot, freshSnapshot);

        // ── Phase 3: DETECT ──

        // Generate gap report
        const aggregator = new KnowledgeStagingAggregator(projectDir);
        const knowledgeDir = path.join(projectDir, 'docs', 'knowledge');
        const gapReport = await aggregator.generateGapReport(knowledgeDir);
        await aggregator.writeGapReport(gapReport);

        // ── Report ──

        const totalFindings = driftResult.findings.length;
        const unresolvedDrift =
          driftResult.summary.drifted +
          driftResult.summary.stale +
          driftResult.summary.contradicting;

        const verdict =
          unresolvedDrift === 0 && driftResult.summary.new === 0
            ? 'pass'
            : unresolvedDrift === 0
              ? 'warn'
              : 'fail';

        if (globalOpts.json) {
          console.log(
            JSON.stringify(
              {
                verdict,
                driftScore: driftResult.driftScore,
                findings: driftResult.summary,
                extraction: {
                  codeSignals: extractionResult.nodesAdded,
                  diagrams: diagramResult.nodesAdded,
                },
                gaps: {
                  domains: gapReport.domains.length,
                  totalEntries: gapReport.totalEntries,
                },
              },
              null,
              2
            )
          );
        } else {
          console.log('');
          console.log(
            `KNOWLEDGE PIPELINE -- Verdict: ${verdict === 'pass' ? chalk.green('PASS') : verdict === 'warn' ? chalk.yellow('WARN') : chalk.red('FAIL')}`
          );
          console.log('');
          console.log(
            `  Drift Score: ${driftResult.driftScore.toFixed(2)} (${totalFindings} findings / ${currentSnapshot.entries.length + freshSnapshot.entries.length} entries)`
          );
          console.log(
            `  Findings: ${driftResult.summary.new} new, ${driftResult.summary.stale} stale, ${driftResult.summary.drifted} drifted, ${driftResult.summary.contradicting} contradicting`
          );
          console.log(
            `  Extraction: ${extractionResult.nodesAdded} code signals, ${diagramResult.nodesAdded} diagram entities`
          );
          console.log(
            `  Gaps: ${gapReport.domains.length} domains, ${gapReport.totalEntries} total entries`
          );
          console.log('');
        }

        // CI gate
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
