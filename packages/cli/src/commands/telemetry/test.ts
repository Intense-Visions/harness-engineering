import { Command } from 'commander';
import { resolveConsent } from '@harness-engineering/core';
import { POSTHOG_API_KEY } from '../../bin/command-telemetry';
import { logger } from '../../output/logger';

const POSTHOG_BATCH_URL = 'https://app.posthog.com/batch';

function buildTestEvent(
  distinctId: string,
  installId: string,
  identity: { project?: string; team?: string }
) {
  return {
    event: 'telemetry_test',
    distinct_id: distinctId,
    timestamp: new Date().toISOString(),
    properties: {
      installId,
      os: process.platform,
      nodeVersion: process.version,
      test: true,
      ...(identity.project ? { project: identity.project } : {}),
      ...(identity.team ? { team: identity.team } : {}),
    },
  };
}

function reportTestSuccess(
  status: number,
  distinctId: string,
  identity: { project?: string; team?: string }
): void {
  logger.success(`PostHog responded ${status} OK — telemetry is working`);
  logger.info(`  distinct_id: ${distinctId}`);
  if (identity.project) logger.info(`  project:     ${identity.project}`);
  if (identity.team) logger.info(`  team:        ${identity.team}`);
}

export function createTestCommand(): Command {
  return new Command('test')
    .description('Send a test event to PostHog and verify connectivity')
    .action(async () => {
      const cwd = process.cwd();
      const consent = resolveConsent(cwd, undefined);

      if (!consent.allowed) {
        logger.error('Telemetry is disabled. Run `harness telemetry status` for details.');
        process.exitCode = 1;
        return;
      }

      const { installId, identity } = consent;
      const distinctId = identity.alias ?? installId;
      const event = buildTestEvent(distinctId, installId, identity);
      const payload = JSON.stringify({ api_key: POSTHOG_API_KEY, batch: [event] });

      logger.info(`Sending test event as "${distinctId}"...`);

      try {
        const res = await fetch(POSTHOG_BATCH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });

        const body = await res.text();

        if (res.ok) {
          reportTestSuccess(res.status, distinctId, identity);
        } else {
          logger.error(`PostHog responded ${res.status}: ${body}`);
          process.exitCode = 1;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to reach PostHog: ${msg}`);
        process.exitCode = 1;
      }
    });
}
