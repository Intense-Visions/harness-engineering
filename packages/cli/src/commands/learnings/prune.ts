import { Command } from 'commander';
import * as path from 'path';
import { pruneLearnings } from '@harness-engineering/core';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

async function handlePrune(opts: { path: string; stream?: string }): Promise<void> {
  const projectPath = path.resolve(opts.path);
  const result = await pruneLearnings(projectPath, opts.stream);

  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(ExitCode.ERROR);
    return;
  }

  const { kept, archived, patterns } = result.value;

  if (archived === 0 && patterns.length === 0) {
    logger.info(`Nothing to prune. ${kept} learnings in file, all within retention window.`);
    process.exit(ExitCode.SUCCESS);
    return;
  }

  if (patterns.length > 0) {
    printPatternProposals(patterns);
  }

  if (archived > 0) {
    logger.success(`Pruned ${archived} entries. ${kept} most recent entries retained.`);
    logger.info('Archived entries written to .harness/learnings-archive/');
  } else {
    logger.info(`No entries archived. ${kept} entries retained.`);
  }

  process.exit(ExitCode.SUCCESS);
}

function printPatternProposals(patterns: Array<{ tag: string; count: number }>): void {
  console.log('\n--- Improvement Proposals ---\n');
  for (const pattern of patterns) {
    console.log(`  [${pattern.tag}] ${pattern.count} learnings with this theme.`);
    console.log(`  Proposal: These learnings suggest a recurring pattern in "${pattern.tag}".`);
    console.log(
      `  To add to roadmap: harness mcp manage_roadmap --action add --feature "<improvement>" --status planned\n`
    );
  }
  console.log(
    'Review the proposals above. If any warrant a process improvement, add them to the roadmap manually or via manage_roadmap.\n'
  );
}

export function createPruneCommand(): Command {
  return new Command('prune')
    .description(
      'Analyze global learnings for patterns, present improvement proposals, and archive old entries'
    )
    .option('--path <path>', 'Project root path', '.')
    .option('--stream <name>', 'Target a specific stream')
    .action(handlePrune);
}
