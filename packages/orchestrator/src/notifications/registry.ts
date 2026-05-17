import type {
  NotificationsConfig,
  NotificationSinkConfig,
  NotificationSinkKind,
} from '@harness-engineering/types';
import type { NotificationSink } from './sink.js';
import { SlackSink } from './slack-sink.js';

export interface RegistryEntry {
  config: NotificationSinkConfig;
  adapter: NotificationSink;
}

export interface FromConfigOptions {
  env: NodeJS.ProcessEnv;
  /** Optional per-sink fetch override (testing). */
  fetchImpl?: typeof fetch;
}

/**
 * Surfaced when a sink config refers to an unknown kind, or its env-var
 * secret cannot be resolved. Carrying the sinkId helps the doctor + CLI
 * print operator-actionable messages.
 */
export class SinkConfigError extends Error {
  constructor(
    public readonly sinkId: string,
    message: string
  ) {
    super(`[sink:${sinkId}] ${message}`);
    this.name = 'SinkConfigError';
  }
}

/**
 * In-memory registry of configured notification sinks. Built once at
 * orchestrator startup from `harness.config.json` `notifications.sinks[]`.
 * Disposed on orchestrator stop.
 */
export class SinkRegistry {
  private readonly entries: RegistryEntry[];

  private constructor(entries: RegistryEntry[]) {
    this.entries = entries;
  }

  static fromConfig(config: NotificationsConfig, options: FromConfigOptions): SinkRegistry {
    const entries: RegistryEntry[] = [];
    for (const sinkConfig of config.sinks) {
      entries.push({
        config: sinkConfig,
        adapter: buildSink(sinkConfig, options),
      });
    }
    return new SinkRegistry(entries);
  }

  list(): readonly RegistryEntry[] {
    return this.entries;
  }

  get(id: string): RegistryEntry | null {
    return this.entries.find((e) => e.config.id === id) ?? null;
  }

  ids(): string[] {
    return this.entries.map((e) => e.config.id);
  }

  async dispose(): Promise<void> {
    for (const entry of this.entries) {
      if (entry.adapter.dispose) {
        await entry.adapter.dispose();
      }
    }
  }
}

function buildSink(config: NotificationSinkConfig, options: FromConfigOptions): NotificationSink {
  const kind: NotificationSinkKind = config.kind;
  switch (kind) {
    case 'slack':
      return buildSlackSink(config, options);
    default: {
      // Exhaustiveness — guarded by the Zod enum at parse time.
      const _exhaustive: never = kind;
      throw new SinkConfigError(config.id, `unknown sink kind '${String(_exhaustive)}'`);
    }
  }
}

function buildSlackSink(
  config: NotificationSinkConfig,
  options: FromConfigOptions
): NotificationSink {
  const rawConfig = config.config as { webhookUrlEnv?: unknown; webhookUrl?: unknown };
  const envKey = typeof rawConfig.webhookUrlEnv === 'string' ? rawConfig.webhookUrlEnv : null;
  const inlineUrl = typeof rawConfig.webhookUrl === 'string' ? rawConfig.webhookUrl : null;
  let url: string;
  if (envKey) {
    const v = options.env[envKey];
    if (!v) {
      throw new SinkConfigError(
        config.id,
        `Slack webhook env var '${envKey}' is not set in the environment`
      );
    }
    url = v;
  } else if (inlineUrl) {
    url = inlineUrl;
  } else {
    throw new SinkConfigError(
      config.id,
      `Slack sink requires 'config.webhookUrlEnv' (preferred) or 'config.webhookUrl'`
    );
  }
  if (!/^https:\/\/hooks\.slack\.com\//.test(url)) {
    throw new SinkConfigError(
      config.id,
      `Slack webhook URL must be an https://hooks.slack.com/ URL`
    );
  }
  const sinkOpts: ConstructorParameters<typeof SlackSink>[0] = {
    id: config.id,
    webhookUrl: url,
  };
  if (options.fetchImpl) sinkOpts.fetchImpl = options.fetchImpl;
  return new SlackSink(sinkOpts);
}
