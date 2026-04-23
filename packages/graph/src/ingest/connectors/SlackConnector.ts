import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode, withRetry } from './ConnectorUtils.js';
import { condenseContent } from './ContentCondenser.js';

interface SlackReaction {
  name: string;
  count: number;
}

interface SlackMessage {
  text: string;
  user: string;
  ts: string;
  reply_count?: number;
  thread_ts?: string;
  reactions?: SlackReaction[];
}

interface SlackResponse {
  ok: boolean;
  messages: SlackMessage[];
}

interface SlackRepliesResponse {
  ok: boolean;
  messages: SlackMessage[];
}

export class SlackConnector implements GraphConnector {
  readonly name = 'slack';
  readonly source = 'slack';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? withRetry((url, options) => fetch(url, options));
  }

  async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    const apiKeyEnv = config.apiKeyEnv ?? 'SLACK_API_KEY';
    const apiKey = process.env[apiKeyEnv];
    if (!apiKey) {
      return {
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: [`Missing API key: environment variable "${apiKeyEnv}" is not set`],
        durationMs: Date.now() - start,
      };
    }

    const channels = (config.channels ?? []) as string[];

    // S-1: Time filtering via lookbackDays
    const oldest = config.lookbackDays
      ? String(Math.floor((Date.now() - Number(config.lookbackDays) * 86400000) / 1000))
      : undefined;

    for (const channel of channels) {
      try {
        const result = await this.processChannel(store, channel, apiKey, oldest, config);
        nodesAdded += result.nodesAdded;
        edgesAdded += result.edgesAdded;
        errors.push(...result.errors);
      } catch (err) {
        errors.push(
          `Slack API error for channel ${channel}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return {
      nodesAdded,
      nodesUpdated: 0,
      edgesAdded,
      edgesUpdated: 0,
      errors,
      durationMs: Date.now() - start,
    };
  }

  private async processChannel(
    store: GraphStore,
    channel: string,
    apiKey: string,
    oldest: string | undefined,
    config: ConnectorConfig
  ): Promise<{ nodesAdded: number; edgesAdded: number; errors: string[] }> {
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    let url = `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}`;
    if (oldest) {
      url += `&oldest=${oldest}`;
    }
    const response = await this.httpClient(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        nodesAdded: 0,
        edgesAdded: 0,
        errors: [`Slack API request failed for channel ${channel}`],
      };
    }

    const data = (await response.json()) as SlackResponse;
    if (!data.ok) {
      return { nodesAdded: 0, edgesAdded: 0, errors: [`Slack API error for channel ${channel}`] };
    }

    const maxLen = (config.maxContentLength as number | undefined) ?? 2000;

    for (const message of data.messages) {
      const nodeId = `conversation:slack:${channel}:${message.ts}`;

      // Assemble content with thread replies
      let assembledText = message.text;
      let threadReplyCount: number | undefined;

      if (message.reply_count && message.reply_count > 0 && message.thread_ts) {
        const replies = await this.fetchThreadReplies(channel, message.thread_ts, apiKey);
        if (replies.length > 0) {
          // Skip first reply (it's the parent message)
          const threadReplies = replies.slice(1);
          threadReplyCount = threadReplies.length;
          if (threadReplies.length > 0) {
            const replyLines = threadReplies.map((r) => `${r.user} (${r.ts}): ${r.text}`);
            assembledText = `${message.text}\n${replyLines.join('\n')}`;
          }
        }
      }

      // Condense content
      const condensed = await condenseContent(assembledText, { maxLength: maxLen });

      const snippet =
        condensed.content.length > 100 ? condensed.content.slice(0, 100) : condensed.content;

      // Extract reactions
      const reactions = message.reactions
        ? message.reactions.reduce<Record<string, number>>(
            (acc, r) => ({ ...acc, [r.name]: r.count }),
            {}
          )
        : undefined;

      const metadata: Record<string, unknown> = {
        author: message.user,
        channel,
        timestamp: message.ts,
      };

      if (threadReplyCount !== undefined) {
        metadata.threadReplyCount = threadReplyCount;
      }
      if (reactions) {
        metadata.reactions = reactions;
      }
      if (condensed.method !== 'passthrough') {
        metadata.condensed = condensed.method;
        metadata.originalLength = condensed.originalLength;
      }

      store.addNode({
        id: nodeId,
        type: 'conversation',
        name: snippet,
        content: condensed.content,
        metadata,
      });
      nodesAdded++;

      edgesAdded += linkToCode(store, condensed.content, nodeId, 'references', {
        checkPaths: true,
      });
    }

    return { nodesAdded, edgesAdded, errors };
  }

  private async fetchThreadReplies(
    channel: string,
    threadTs: string,
    apiKey: string
  ): Promise<SlackMessage[]> {
    try {
      const url = `https://slack.com/api/conversations.replies?channel=${encodeURIComponent(channel)}&ts=${threadTs}`;
      const response = await this.httpClient(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) return [];
      const data = (await response.json()) as SlackRepliesResponse;
      return data.ok ? data.messages : [];
    } catch {
      return [];
    }
  }
}
