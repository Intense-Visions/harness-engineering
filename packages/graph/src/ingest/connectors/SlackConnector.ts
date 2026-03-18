import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig } from './ConnectorInterface.js';

const CODE_NODE_TYPES = ['file', 'function', 'class', 'method', 'interface', 'variable'] as const;

type HttpClient = (
  url: string,
  options: RequestInit
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

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

    for (const channel of channels) {
      try {
        const url = `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel)}`;
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
          const snippet = message.text.length > 100 ? message.text.slice(0, 100) : message.text;

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

          // Link to code nodes via word-boundary matching and path matching
          edgesAdded += this.linkToCode(store, message.text, nodeId);
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

  private linkToCode(store: GraphStore, content: string, sourceNodeId: string): number {
    let count = 0;
    for (const nodeType of CODE_NODE_TYPES) {
      const codeNodes = store.findNodes({ type: nodeType });
      for (const node of codeNodes) {
        let nameMatches = false;
        if (node.name.length >= 3) {
          const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const namePattern = new RegExp(`\\b${escaped}\\b`, 'i');
          nameMatches = namePattern.test(content);
        }

        let pathMatches = false;
        if (node.path && node.path.includes('/')) {
          pathMatches = content.includes(node.path);
        }

        if (nameMatches || pathMatches) {
          store.addEdge({
            from: sourceNodeId,
            to: node.id,
            type: 'references',
          });
          count++;
        }
      }
    }
    return count;
  }
}
