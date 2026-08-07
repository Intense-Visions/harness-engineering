import { Command } from 'commander';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { resolveConfig } from '../../config/loader';
import { resolveDocsPublishConnector } from '../../docs-publish';
import type { AttachMediaInput, AttachMediaResult } from '../../docs-publish';
import { OutputMode } from '../../output/formatter';
import { resolveOutputMode } from '../../utils/output';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

interface AttachMediaOptions {
  configPath?: string | undefined;
  pageId?: string | undefined;
  mediaFile?: string | undefined;
  origin?: string | undefined;
}

/**
 * Core, testable attach-media op. Surfacing a manual step is NOT a failure — the
 * result is returned as `Ok` and the caller prints the instructions.
 */
export async function runDocsPublishAttachMedia(
  options: AttachMediaOptions
): Promise<Result<AttachMediaResult, CLIError>> {
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) return configResult;

  const connectorResult = resolveDocsPublishConnector(configResult.value);
  if (!connectorResult.ok) return connectorResult;

  if (!options.pageId) {
    return Err(new CLIError('--page-id is required', ExitCode.VALIDATION_FAILED));
  }
  if (!options.mediaFile) {
    return Err(new CLIError('--media-file is required', ExitCode.VALIDATION_FAILED));
  }

  const input: AttachMediaInput = { pageId: options.pageId, mediaFilePath: options.mediaFile };
  if (options.origin) input.origin = options.origin;

  return Ok(await connectorResult.value.attachMedia(input));
}

export function createAttachMediaCommand(): Command {
  return new Command('attach-media')
    .description('Attach media to a draft page (returns a typed manual step to surface)')
    .option('--page-id <id>', 'Draft page id the attachment belongs to')
    .option('--media-file <path>', 'Local path to the media file to upload')
    .option('--origin <url>', 'Provider origin (real cloud origin or localhost — never 127.0.0.1)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);

      const result = await runDocsPublishAttachMedia({
        configPath: globalOpts.config,
        pageId: opts.pageId,
        mediaFile: opts.mediaFile,
        origin: opts.origin,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) console.log(JSON.stringify({ error: result.error.message }));
        else logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result.value, null, 2));
      } else if (mode !== OutputMode.QUIET) {
        if (result.value.status === 'manual-step-required') {
          console.log('MANUAL STEP REQUIRED — attachment upload cannot be automated headless.\n');
          console.log(result.value.instructions);
          console.log(`\nVerify with: ${result.value.verifyWith}`);
        } else {
          console.log(`Unsupported: ${result.value.reason}`);
        }
      }
      // Surfacing a manual step is a successful run, not a failure.
      process.exit(ExitCode.SUCCESS);
    });
}
