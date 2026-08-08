import { Command } from 'commander';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { resolveConfig } from '../../config/loader';
import { resolveDocsPublishConnector } from '../../docs-publish';
import type { VerifyRenderResult } from '../../docs-publish';
import { OutputMode } from '../../output/formatter';
import { resolveOutputMode } from '../../utils/output';
import { logger } from '../../output/logger';
import { CLIError, ExitCode } from '../../utils/errors';

interface VerifyRenderOptions {
  configPath?: string | undefined;
  url?: string | undefined;
}

/** Core, testable verify-render op. Always returns `Ok`; the verdict is in the value. */
export async function runDocsPublishVerifyRender(
  options: VerifyRenderOptions
): Promise<Result<VerifyRenderResult, CLIError>> {
  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) return configResult;

  const connectorResult = resolveDocsPublishConnector(configResult.value);
  if (!connectorResult.ok) return connectorResult;

  if (!options.url) {
    return Err(new CLIError('--url is required', ExitCode.VALIDATION_FAILED));
  }

  return Ok(await connectorResult.value.verifyRender({ targetUrl: options.url }));
}

export function createVerifyRenderCommand(): Command {
  return new Command('verify-render')
    .description('Verify a page actually renders (the only authority on render correctness)')
    .option('--url <url>', 'Rendered URL (http(s) or file://) to assert against')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);

      const result = await runDocsPublishVerifyRender({
        configPath: globalOpts.config,
        url: opts.url,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) console.log(JSON.stringify({ error: result.error.message }));
        else logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }

      const value = result.value;
      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(value, null, 2));
      } else if (mode !== OutputMode.QUIET) {
        console.log(
          `Render ${value.ok ? 'OK' : 'FAILED'}: images=${value.imagesLoaded} ` +
            `mediaSingle=${value.mediaSingleCount} mediaGroup=${value.mediaGroupCount} ` +
            `cardErrors=${value.mediaCardErrors}`
        );
        if (value.degraded) console.log(`  degraded: ${value.degraded}`);
        for (const f of value.failures) console.log(`  - ${f}`);
      }
      process.exit(value.ok ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });
}
