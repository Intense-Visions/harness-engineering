import { Command } from 'commander';
import * as fs from 'fs';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { resolveConfig } from '../../config/loader';
import { resolveDocsPublishConnector } from '../../docs-publish';
import type { DraftHandle, DraftInput } from '../../docs-publish';
import { OutputMode } from '../../output/formatter';
import { resolveOutputMode } from '../../utils/output';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

interface DraftOptions {
  configPath?: string | undefined;
  pageId?: string | undefined;
  spaceId?: string | undefined;
  title?: string | undefined;
  parentId?: string | undefined;
  bodyFile?: string | undefined;
  adfFile?: string | undefined;
}

/**
 * Core, testable draft op: resolve config → resolve connector → run the draft
 * (draft-only) → map the connector's `DocsPublishResult` to a `Result`.
 */
export async function runDocsPublishDraft(
  options: DraftOptions
): Promise<Result<DraftHandle, CLIError>> {
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) return configResult;

  const connectorResult = resolveDocsPublishConnector(configResult.value);
  if (!connectorResult.ok) return connectorResult;

  if (!options.spaceId) {
    return Err(new CLIError('--space-id is required', ExitCode.VALIDATION_FAILED));
  }
  if (!options.title) {
    return Err(new CLIError('--title is required', ExitCode.VALIDATION_FAILED));
  }

  const input: DraftInput = { spaceId: options.spaceId, title: options.title };
  if (options.pageId) input.pageId = options.pageId;
  if (options.parentId) input.parentId = options.parentId;
  // Guard file reads so a missing --body-file or malformed --adf-file JSON
  // surfaces a clean CLIError + exit code rather than an uncaught stack trace
  // (mirrors page-tree.ts).
  try {
    if (options.bodyFile) input.body = fs.readFileSync(options.bodyFile, 'utf-8');
    if (options.adfFile) input.adf = JSON.parse(fs.readFileSync(options.adfFile, 'utf-8'));
  } catch (err) {
    return Err(
      new CLIError(
        `failed to read draft body file(s): ${err instanceof Error ? err.message : String(err)}`,
        ExitCode.VALIDATION_FAILED
      )
    );
  }

  const result = await connectorResult.value.draft(input);
  if (!result.ok) {
    return Err(new CLIError(`draft failed: ${result.error}`, ExitCode.VALIDATION_FAILED));
  }
  return Ok(result.value);
}

export function createDraftCommand(): Command {
  return new Command('draft')
    .description('Create or update a page in DRAFT state (never publishes)')
    .option('--page-id <id>', 'Existing page id to update (omit to create a new draft)')
    .option('--space-id <id>', 'Target space id')
    .option('--title <title>', 'Page title')
    .option('--parent-id <id>', 'Parent page id for placement')
    .option('--body-file <path>', 'File containing the storage/body string')
    .option('--adf-file <path>', 'File containing the page body as ADF JSON')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);

      const result = await runDocsPublishDraft({
        configPath: globalOpts.config,
        pageId: opts.pageId,
        spaceId: opts.spaceId,
        title: opts.title,
        parentId: opts.parentId,
        bodyFile: opts.bodyFile,
        adfFile: opts.adfFile,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) console.log(JSON.stringify({ error: result.error.message }));
        else logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result.value, null, 2));
      } else if (mode !== OutputMode.QUIET) {
        console.log(`Draft ready: page ${result.value.pageId} (${result.value.draftStatus})`);
        if (result.value.tinyLink) console.log(`  tiny link: ${result.value.tinyLink}`);
      }
      process.exit(ExitCode.SUCCESS);
    });
}
