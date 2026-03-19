import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig, HttpClient } from './ConnectorInterface.js';
import { linkToCode, sanitizeExternalText } from './ConnectorUtils.js';

interface SlackMessage {
  text: string;
  user: string;
  ts: string;
}

interface SlackResponse {
  ok: boolean;
  messages: SlackMessage[];
}

export class SlackConnector implements GraphConnector {
  readonly name = 'slack';
  readonly source = 'slack';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? ((url, options) => fetch(url, options));
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
          errors.push(`Slack API request failed for channel ${channel}`);
          continue;
        }

        const data = (await response.json()) as SlackResponse;
        if (!data.ok) {
          errors.push(`Slack API error for channel ${channel}`);
          continue;
        }

        for (const message of data.messages) {
          const nodeId = `conversation:slack:${channel}:${message.ts}`;
          const sanitizedText = sanitizeExternalText(message.text);
          const snippet = sanitizedText.length > 100 ? sanitizedText.slice(0, 100) : sanitizedText;

          store.addNode({
            id: nodeId,
            type: 'conversation',
            name: snippet,
            metadata: {
              author: message.user,
              channel,
              timestamp: message.ts,
            },
          });
          nodesAdded++;

          // Link to code nodes via shared utility (with path matching)
          edgesAdded += linkToCode(store, sanitizedText, nodeId, 'references', {
            checkPaths: true,
          });
        }
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
}
