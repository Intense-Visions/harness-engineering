import { Command } from 'commander';
import * as path from 'node:path';
import {
  Orchestrator,
  WorkflowLoader,
  launchTUI,
  getDefaultConfig,
} from '@harness-engineering/orchestrator';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

export function createOrchestratorCommand(): Command {
  const orchestrator = new Command('orchestrator');

  orchestrator
    .command('run')
    .description('Run the orchestrator daemon')
    .option('-w, --workflow <path>', 'Path to WORKFLOW.md', 'WORKFLOW.md')
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

      daemon.start();

      const { waitUntilExit } = launchTUI(daemon);
      await waitUntilExit();

      process.exit(ExitCode.SUCCESS);
    });

  return orchestrator;
}
