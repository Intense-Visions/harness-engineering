import { Command } from 'commander';
import * as path from 'node:path';
import {
  Orchestrator,
  WorkflowLoader,
  launchTUI,
  discoverCandidates,
} from '@harness-engineering/orchestrator';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

export function createOrchestratorCommand(): Command {
  const orchestrator = new Command('orchestrator');

  orchestrator
    .command('run')
    .description('Run the orchestrator daemon')
    .option('-w, --workflow <path>', 'Path to harness.orchestrator.md', 'harness.orchestrator.md')
    .option('--headless', 'Run without TUI (server-only mode for use with web dashboard)')
    .action(async (opts) => {
      const workflowPath = path.resolve(process.cwd(), opts.workflow);
      const loader = new WorkflowLoader();

      const result = await loader.loadWorkflow(workflowPath);

      if (!result.ok) {
        logger.error(`Failed to load workflow: ${result.error.message}`);
        process.exit(ExitCode.ERROR);
      }

      const { config, promptTemplate, localPromptTemplate, warnings } = result.value;
      // Spec B Phase 2 / S3: surface non-blocking routing warnings at startup.
      for (const w of warnings) logger.warn(w);

      // Wire live HuggingFace candidate discovery at the composition root (the
      // Orchestrator defaults to a no-op so tests never touch the network).
      // Phase 1 (local-backend-full-workflow): thread the backend-aware local
      // dispatch template through when the loader found one. `exactOptional-
      // PropertyTypes` is on repo-wide, so spread the key only when defined —
      // an absent local file leaves it out and dispatch falls back to the
      // default template (SC5).
      const daemon = new Orchestrator(config, promptTemplate, {
        discoverCandidates,
        ...(localPromptTemplate !== undefined ? { localPromptTemplate } : {}),
      });

      const shutdown = () => {
        daemon.stop();
        process.exit(ExitCode.SUCCESS);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      daemon.start();

      if (opts.headless) {
        logger.info(
          'Orchestrator running in headless mode (no TUI). Use the web dashboard or Ctrl+C to stop.'
        );
        // Keep the process alive until a signal is received
        await new Promise(() => {});
      } else {
        const { waitUntilExit } = launchTUI(daemon);
        await waitUntilExit();
      }

      process.exit(ExitCode.SUCCESS);
    });

  return orchestrator;
}
