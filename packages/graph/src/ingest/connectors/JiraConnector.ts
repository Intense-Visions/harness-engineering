import type { GraphStore } from '../../store/GraphStore.js';
import type { IngestResult } from '../../types.js';
import type { GraphConnector, ConnectorConfig } from './ConnectorInterface.js';

const CODE_NODE_TYPES = ['file', 'function', 'class', 'method', 'interface', 'variable'] as const;

type HttpClient = (
  url: string,
  options: RequestInit
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: string | null;
    status?: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string } | null;
    labels?: string[];
  };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
}

export class JiraConnector implements GraphConnector {
  readonly name = 'jira';
  readonly source = 'jira';
  private readonly httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    this.httpClient = httpClient ?? ((url, options) => fetch(url, options));
  }

  async ingest(store: GraphStore, config: ConnectorConfig): Promise<IngestResult> {
    const start = Date.now();
    const errors: string[] = [];
    let nodesAdded = 0;
    let edgesAdded = 0;

    const apiKeyEnv = config.apiKeyEnv ?? 'JIRA_API_KEY';
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

    const baseUrlEnv = config.baseUrlEnv ?? 'JIRA_BASE_URL';
    const baseUrl = process.env[baseUrlEnv];
    if (!baseUrl) {
      return {
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: [`Missing base URL: environment variable "${baseUrlEnv}" is not set`],
        durationMs: Date.now() - start,
      };
    }

    const project = config.project as string | undefined;
    const jql = project ? `project=${project}` : '';
    const url = `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}`;

    let data: JiraSearchResponse;
    try {
      const response = await this.httpClient(url, {
        headers: {
          Authorization: `Basic ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        return {
          nodesAdded: 0,
          nodesUpdated: 0,
          edgesAdded: 0,
          edgesUpdated: 0,
          errors: ['Jira API request failed'],
          durationMs: Date.now() - start,
        };
      }
      data = (await response.json()) as JiraSearchResponse;
    } catch (err) {
      return {
        nodesAdded: 0,
        nodesUpdated: 0,
        edgesAdded: 0,
        edgesUpdated: 0,
        errors: [`Jira API error: ${err instanceof Error ? err.message : String(err)}`],
        durationMs: Date.now() - start,
      };
    }

    for (const issue of data.issues) {
      const nodeId = `issue:jira:${issue.key}`;
      store.addNode({
        id: nodeId,
        type: 'issue',
        name: issue.fields.summary,
        metadata: {
          key: issue.key,
          status: issue.fields.status?.name,
          priority: issue.fields.priority?.name,
          assignee: issue.fields.assignee?.displayName,
          labels: issue.fields.labels ?? [],
        },
      });
      nodesAdded++;

      // Link to code nodes via word-boundary matching
      const searchText = [issue.fields.summary, issue.fields.description ?? ''].join(' ');
      edgesAdded += this.linkToCode(store, searchText, nodeId);
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
        if (node.name.length < 3) continue;
        const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const namePattern = new RegExp(`\\b${escaped}\\b`, 'i');
        if (namePattern.test(content)) {
          store.addEdge({
            from: sourceNodeId,
            to: node.id,
            type: 'applies_to',
          });
          count++;
        }
      }
    }
    return count;
  }
}
