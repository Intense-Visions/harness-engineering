import type {
  GatewayEvent,
  NotificationEnvelope,
  NotificationDeliveryResult,
  NotificationSeverity,
} from '@harness-engineering/types';
import type { NotificationSink, NotificationSinkDeliverInput } from './sink.js';

export interface SlackSinkOptions {
  id: string;
  webhookUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface SlackTextBlock {
  type: 'section';
  text: { type: 'mrkdwn'; text: string };
}

interface SlackActionsBlock {
  type: 'actions';
  elements: Array<{
    type: 'button';
    text: { type: 'plain_text'; text: string };
    url: string;
  }>;
}

type SlackBlock = SlackTextBlock | SlackActionsBlock;

interface SlackPayload {
  text: string;
  blocks?: SlackBlock[];
}

const SEVERITY_PREFIX: Record<NotificationSeverity, string> = {
  info: ':information_source:',
  success: ':white_check_mark:',
  warning: ':warning:',
  error: ':x:',
};

/**
 * Slack sink shipped with Hermes Phase 3. Uses incoming-webhook URLs only;
 * OAuth + bot tokens are intentionally out of scope (spec D3). Sends one
 * HTTP POST per delivery and never retries — retries are the operator's
 * call via the Phase 0 webhook fanout if they need durable delivery.
 */
export class SlackSink implements NotificationSink {
  readonly kind = 'slack';
  readonly id: string;
  private readonly webhookUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: SlackSinkOptions) {
    this.id = opts.id;
    this.webhookUrl = opts.webhookUrl;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 5_000;
  }

  async deliver(input: NotificationSinkDeliverInput): Promise<NotificationDeliveryResult> {
    const body = input.wrapped
      ? this.renderEnvelope(input.payload as NotificationEnvelope)
      : this.renderRawEvent(input.payload as GatewayEvent);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.ok) {
        return { ok: true, deliveredAt: Date.now() };
      }
      return { ok: false, error: `HTTP ${res.status}`, httpStatus: res.status };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: ctrl.signal.aborted ? 'timeout' : msg };
    } finally {
      clearTimeout(timer);
    }
  }

  private renderEnvelope(env: NotificationEnvelope): SlackPayload {
    const prefix = SEVERITY_PREFIX[env.severity] ?? '';
    const headline = `${prefix} ${env.title}`.trim();
    const blocks: SlackBlock[] = [
      { type: 'section', text: { type: 'mrkdwn', text: `*${headline}*\n${env.summary}` } },
    ];
    if (env.actions && env.actions.length > 0) {
      blocks.push({
        type: 'actions',
        elements: env.actions.map((a) => ({
          type: 'button',
          text: { type: 'plain_text', text: a.label },
          url: a.url,
        })),
      });
    }
    if (env.permalink) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `<${env.permalink}|View details>` },
      });
    }
    return { text: headline, blocks };
  }

  private renderRawEvent(event: GatewayEvent): SlackPayload {
    const dump = (() => {
      try {
        return JSON.stringify(event.data, null, 2);
      } catch {
        return String(event.data);
      }
    })();
    const text = `harness event: \`${event.type}\``;
    return {
      text,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${text}*\n\`\`\`\n${dump}\n\`\`\`` } },
      ],
    };
  }
}
