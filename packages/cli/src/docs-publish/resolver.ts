import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { CLIError, ExitCode } from '../utils/errors.js';
import type { HarnessConfig } from '../config/schema.js';
import type { DocsPublishConnector } from './interface.js';
import { ConfluenceConnector } from './connectors/confluence.js';

/** Factory that builds a connector from its provider-specific config block. */
type ConnectorFactory = (config: Record<string, unknown>) => DocsPublishConnector;

/**
 * Name-keyed connector registry. Additional connectors (Notion/GDocs/Markdown)
 * slot in here without touching the pipeline — mirroring the graph
 * `SyncManager` registry + agent-backend resolver idioms.
 */
const CONNECTORS: Record<string, ConnectorFactory> = {
  confluence: (config) => new ConfluenceConnector(config),
};

/**
 * Resolve the configured docs-publish connector with graceful degradation:
 *   - absent `config.docsPublish`  → `Err` with an actionable "add a docsPublish
 *     block" message (never a crash, never a silent no-op),
 *   - unknown connector name       → `Err` naming the valid connector set,
 *   - otherwise                    → `Ok(connector)`.
 *
 * NEVER throws.
 */
export function resolveDocsPublishConnector(
  config: HarnessConfig
): Result<DocsPublishConnector, CLIError> {
  const block = config.docsPublish;
  if (!block) {
    return Err(
      new CLIError(
        'docsPublish is not configured — add a "docsPublish" block to harness.config.json, ' +
          'e.g. { "connector": "confluence", "config": { "baseUrl": "https://<your-domain>.atlassian.net" } }',
        ExitCode.VALIDATION_FAILED
      )
    );
  }

  const factory = CONNECTORS[block.connector];
  if (!factory) {
    return Err(
      new CLIError(
        `Unknown docs-publish connector "${block.connector}". Valid connectors: ${Object.keys(CONNECTORS).join(', ')}`,
        ExitCode.VALIDATION_FAILED
      )
    );
  }

  return Ok(factory(block.config ?? {}));
}
