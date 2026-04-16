import { Command } from 'commander';
import * as path from 'node:path';
import { Orchestrator, WorkflowLoader, launchTUI } from '@harness-engineering/orchestrator';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

export function createOrchestratorCommand(): Command {
  const orchestrator = new Command('orchestrator');

  orchestrator
    .command('run')
    .description('Run the orchestrator daemon')
    .option('-w, --workflow <path>', 'Path to WORKFLOW.md', 'WORKFLOW.md')
    .option('--headless', 'Run without TUI (server-only mode for use with web dashboard)')
    .action(async (opts) => {
      const workflowPath = path.resolve(process.cwd(), opts.workflow);
      const loader = new WorkflowLoader();

      const result = await loader.loadWorkflow(workflowPath);

      if (!result.ok) {
        logger.error(`Failed to load workflow: ${result.error.message}`);
        process.exit(ExitCode.ERROR);
      }

      const { config, promptTemplate } = result.value;
      const daemon = new Orchestrator(config, promptTemplate);

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
