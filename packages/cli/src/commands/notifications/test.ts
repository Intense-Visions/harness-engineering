import { Command } from 'commander';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { loadNotificationsConfig } from '@harness-engineering/core';
import { SinkRegistry, SinkConfigError, wrapAsEnvelope } from '@harness-engineering/orchestrator';
import type { GatewayEvent } from '@harness-engineering/types';
import { ExitCode } from '../../utils/errors';
import { logger } from '../../output/logger';

interface TestCommandOpts {
  message?: string;
}

function makeTestEvent(message: string): GatewayEvent {
  return {
    id: `evt_${randomBytes(8).toString('hex')}`,
    type: 'notification.test',
    timestamp: new Date().toISOString(),
    data: { message, triggeredAt: new Date().toISOString() },
  };
}

/**
 * `harness notifications test <sink-id>` — fire a synthetic
 * `notification.test` event through the named sink. Acts as the
 * "external test consumer" phase-readiness gate (parent meta §611) and as
 * the operator's one-shot probe after first-config / env-var changes.
 */
export async function runNotificationsTest(
  sinkId: string,
  opts: TestCommandOpts,
  projectRoot: string = process.cwd()
): Promise<{ ok: boolean; error?: string; deliveredAt?: number }> {
  const cfgResult = loadNotificationsConfig(projectRoot);
  if (!cfgResult.ok) {
    return { ok: false, error: `Config error: ${cfgResult.error.message}` };
  }
  if (cfgResult.value.sinks.length === 0) {
    return {
      ok: false,
      error:
        'No notification sinks configured. Add a `notifications.sinks[]` entry to harness.config.json.',
    };
  }

  let registry: SinkRegistry;
  try {
    registry = SinkRegistry.fromConfig(cfgResult.value, { env: process.env });
  } catch (err) {
    if (err instanceof SinkConfigError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const entry = registry.get(sinkId);
  if (!entry) {
    const available = registry.ids().join(', ') || '(none)';
    return {
      ok: false,
      error: `No sink named '${sinkId}'. Available: ${available}`,
    };
  }

  const message =
    opts.message ?? 'Test notification from harness — if you see this, your sink is working.';
  const event = makeTestEvent(message);
  const wrap = entry.config.wrap_response;
  const payload = wrap ? wrapAsEnvelope(event) : event;
  const result = await entry.adapter.deliver({ payload, wrapped: wrap });
  await registry.dispose();
  if (result.ok) {
    return { ok: true, deliveredAt: result.deliveredAt };
  }
  return { ok: false, error: result.error };
}

export function createNotificationsTestSubcommand(): Command {
  return new Command('test')
    .description('Send a synthetic notification.test event through the named sink')
    .argument('<sink-id>', 'Sink id from harness.config.json `notifications.sinks[].id`')
    .option('--message <text>', 'Override the default test message')
    .action(async (sinkId: string, opts: TestCommandOpts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const projectRoot =
        typeof globalOpts['cwd'] === 'string' ? resolve(globalOpts['cwd']) : process.cwd();
      const result = await runNotificationsTest(sinkId, opts, projectRoot);
      if (globalOpts['json']) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.ok) {
        logger.success(`Delivered to sink '${sinkId}'`);
      } else {
        logger.error(result.error ?? 'unknown error');
      }
      process.exit(result.ok ? ExitCode.SUCCESS : ExitCode.ERROR);
    });
}
