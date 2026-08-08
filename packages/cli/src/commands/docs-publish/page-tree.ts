import { Command } from 'commander';
import * as fs from 'fs';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { resolveConfig } from '../../config/loader';
import { resolveDocsPublishConnector } from '../../docs-publish';
import type { PageTreeInput, PageTreeNode, PageTreeResult } from '../../docs-publish';
import { OutputMode } from '../../output/formatter';
import { resolveOutputMode } from '../../utils/output';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

interface PageTreeOptions {
  configPath?: string | undefined;
  spaceId?: string | undefined;
  parentId?: string | undefined;
  childrenFile?: string | undefined;
}

/** Core, testable page-tree op: create/order draft children under a draft parent. */
export async function runDocsPublishPageTree(
  options: PageTreeOptions
): Promise<Result<PageTreeResult, CLIError>> {
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) return configResult;

  const connectorResult = resolveDocsPublishConnector(configResult.value);
  if (!connectorResult.ok) return connectorResult;

  if (!options.spaceId) {
    return Err(new CLIError('--space-id is required', ExitCode.VALIDATION_FAILED));
  }
  if (!options.parentId) {
    return Err(new CLIError('--parent-id is required', ExitCode.VALIDATION_FAILED));
  }
  if (!options.childrenFile) {
    return Err(
      new CLIError('--children-file (JSON array of nodes) is required', ExitCode.VALIDATION_FAILED)
    );
  }

  let children: PageTreeNode[];
  try {
    children = JSON.parse(fs.readFileSync(options.childrenFile, 'utf-8')) as PageTreeNode[];
  } catch (err) {
    return Err(
      new CLIError(
        `failed to read --children-file: ${err instanceof Error ? err.message : String(err)}`,
        ExitCode.VALIDATION_FAILED
      )
    );
  }

  const input: PageTreeInput = { spaceId: options.spaceId, parentId: options.parentId, children };
  const result = await connectorResult.value.pageTree(input);
  if (!result.ok) {
    return Err(new CLIError(`page-tree failed: ${result.error}`, ExitCode.VALIDATION_FAILED));
  }
  return Ok(result.value);
}

export function createPageTreeCommand(): Command {
  return new Command('page-tree')
    .description('Create/order draft child pages under a draft parent')
    .option('--space-id <id>', 'Target space id')
    .option('--parent-id <id>', 'Draft parent page id')
    .option('--children-file <path>', 'JSON file: array of child nodes (title, adf/body, ordering)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);

      const result = await runDocsPublishPageTree({
        configPath: globalOpts.config,
        spaceId: opts.spaceId,
        parentId: opts.parentId,
        childrenFile: opts.childrenFile,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) console.log(JSON.stringify({ error: result.error.message }));
        else logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result.value, null, 2));
      } else if (mode !== OutputMode.QUIET) {
        console.log(
          `Page tree ready under ${result.value.parentId}: ${result.value.childPageIds.length} child page(s)`
        );
      }
      process.exit(ExitCode.SUCCESS);
    });
}
